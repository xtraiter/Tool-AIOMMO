import { NextRequest, NextResponse } from "next/server";
import { access, mkdtemp, rm, writeFile, readdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { rateLimited } from "@/lib/rateLimit";
import { libreOfficePath, VENV_PYTHON } from "@/lib/serverTools";

function execPromise(command: string, args: string[], options: { cwd?: string, timeout?: number } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// LibreOffice can't run two conversions at once on the same user profile: the
// second call silently produces no file. Run them one after another.
const g = globalThis as unknown as { __libreofficeQueue?: Promise<unknown> };

function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const next = (g.__libreofficeQueue ?? Promise.resolve()).then(task, task);
  g.__libreofficeQueue = next.catch(() => {});
  return next;
}

// PDF → Word uses pdf2docx (real paragraphs & tables) from the project venv;
// LibreOffice's PDF import is the fallback (text boxes, but always available).
const PDF_TO_DOCX_SCRIPT = path.join(/*turbopackIgnore: true*/ process.cwd(), "lib", "python", "pdf_to_docx.py");

class EncryptedPdfError extends Error {}

async function pdfToDocxWithPdf2docx(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    await access(VENV_PYTHON);
  } catch {
    return false;
  }
  try {
    await execPromise(VENV_PYTHON, [PDF_TO_DOCX_SCRIPT, inputPath, outputPath], { timeout: 120000 });
    return true;
  } catch (error: any) {
    await rm(outputPath, { force: true }).catch(() => {});
    if (error?.code === 2) throw new EncryptedPdfError("Tệp PDF có mật khẩu, vui lòng bỏ mật khẩu rồi thử lại.");
    console.error("[API/convert] pdf2docx failed, falling back to LibreOffice:", String(error?.stderr || error?.message || error).slice(0, 500));
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (rateLimited(req, "convert-file", 10)) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }

  let tempDir: string | undefined;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const targetFormat = formData.get("targetFormat") as string;

    if (!file || !targetFormat) {
      return NextResponse.json({ error: "Thiếu file hoặc định dạng đích." }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File quá lớn. Vui lòng chọn file dưới 50MB." }, { status: 400 });
    }

    // Lọc các định dạng an toàn cho LibreOffice (DOCX, PDF)
    const allowedTargets = ["pdf", "docx"];
    if (!allowedTargets.includes(targetFormat)) {
      return NextResponse.json({ error: "Định dạng không hỗ trợ chuyển đổi qua Server." }, { status: 400 });
    }

    tempDir = await mkdtemp(path.join(tmpdir(), "aio-convert-"));
    const originalName = file.name || "document.docx";
    const ext = path.extname(originalName) || ".docx";
    // Tên file an toàn để tránh lỗi shell
    const safeName = "input" + ext;
    const inputPath = path.join(tempDir, safeName);
    
    // Lưu file vào tmp
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, buffer);

    // PDF → Word: pdf2docx trước; nếu không được thì dùng LibreOffice.
    // LibreOffice mở PDF bằng Draw (không có bộ xuất Word) → phải ép mở bằng Writer.
    const isPdfToWord = ext.toLowerCase() === ".pdf" && targetFormat === "docx";
    const workDir = tempDir;
    const converted = isPdfToWord
      && await runSerialized(() => pdfToDocxWithPdf2docx(inputPath, path.join(workDir, "output.docx")));
    const { stdout, stderr } = converted ? { stdout: "", stderr: "" } : await runSerialized(async () => execPromise(await libreOfficePath(), [
      "--headless",
      "--nologo",
      "--nofirststartwizard",
      ...(isPdfToWord ? ["--infilter=writer_pdf_import"] : []),
      "--convert-to", isPdfToWord ? "docx:MS Word 2007 XML" : targetFormat,
      inputPath,
      "--outdir", workDir
    ], {
      cwd: workDir,
      timeout: 120000 // 120s timeout
    }));

    // Lấy file kết quả
    const files = await readdir(tempDir);
    const resultFile = files.find(f => f !== safeName && f.endsWith("." + targetFormat));

    if (!resultFile) {
      console.error("[API/convert] LibreOffice produced no file:", (stderr || stdout).trim().slice(0, 500));
      throw new Error("Không tìm thấy file kết quả sau khi convert.");
    }

    const resultPath = path.join(tempDir, resultFile);
    const resultBuffer = await readFile(resultPath);

    // Xóa ngay lập tức
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;

    const originalNameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
    const finalName = `${originalNameWithoutExt}.${targetFormat}`;

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        "Content-Type": targetFormat === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(finalName)}`,
      }
    });

  } catch (error: any) {
    console.error("[API/convert] Error:", error);
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    if (error instanceof EncryptedPdfError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Chuyển đổi thất bại: " + (error.message || "Unknown error") }, { status: 500 });
  }
}
