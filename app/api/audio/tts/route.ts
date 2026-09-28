import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { rateLimited } from "@/lib/rateLimit";

function execPromise(command: string, args: string[], options: { cwd?: string, timeout?: number } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${stderr || error.message}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export async function POST(req: Request) {
  if (rateLimited(req as any, "tts", 10)) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }

  let tempDir: string | undefined;

  try {
    const body = await req.json();
    const { text, voiceId, resourceId, speed } = body;

    if (!text) {
      return NextResponse.json({ error: "Văn bản không được để trống" }, { status: 400 });
    }

    const safeVoiceId = voiceId || "BV075_streaming";
    const safeResourceId = resourceId || "7102355709945188865";
    const safeSpeed = speed ? String(speed) : "1.0";

    tempDir = await mkdtemp(path.join(tmpdir(), "aio-tts-"));
    const textPath = path.join(tempDir, "input.txt");
    const outPath = path.join(tempDir, "output.mp3");
    
    await writeFile(textPath, text, "utf8");

    const pythonScript = path.join(process.cwd(), "lib", "python", "capcut_tts.py");

    await execPromise("python3", [
      pythonScript,
      textPath,
      outPath,
      safeVoiceId,
      safeResourceId,
      safeSpeed
    ], { 
      cwd: tempDir, 
      timeout: 180000 // 3 phút timeout
    });

    const audioBuffer = await readFile(outPath);

    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="voice.mp3"',
      },
    });

  } catch (error: any) {
    console.error("[API/tts] Error:", error);
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    return NextResponse.json({ error: "Không tạo được giọng nói: " + (error.message || "Unknown error") }, { status: 500 });
  }
}
