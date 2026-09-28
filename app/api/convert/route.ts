import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, rm, writeFile, readdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { rateLimited } from "@/lib/rateLimit";

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

    // Chạy libreoffice headless
    // Ví dụ: libreoffice --headless --convert-to pdf input.docx --outdir /tmp/dir
    await execPromise("libreoffice", [
      "--headless", 
      "--nologo",
      "--nofirststartwizard",
      "--convert-to", targetFormat,
      inputPath,
      "--outdir", tempDir
    ], { 
      cwd: tempDir, 
      timeout: 60000 // 60s timeout
    });

    // Lấy file kết quả
    const files = await readdir(tempDir);
    const resultFile = files.find(f => f !== safeName && f.endsWith("." + targetFormat));

    if (!resultFile) {
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
    return NextResponse.json({ error: "Chuyển đổi thất bại: " + (error.message || "Unknown error") }, { status: 500 });
  }
}
