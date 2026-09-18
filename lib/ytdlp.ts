import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

/**
 * Tìm đường dẫn đúng tới yt-dlp trên cả Linux và Windows
 */
async function getYtDlpPath(): Promise<string> {
  const candidates = [
    "/usr/local/bin/yt-dlp",   // Linux server (Ubuntu)
    "/usr/bin/yt-dlp",          // Linux fallback
    "yt-dlp",                   // PATH fallback (Windows dev)
    "yt-dlp.exe",               // Windows explicit
  ];

  for (const candidate of candidates) {
    try {
      await execAsync(`"${candidate}" --version`);
      return candidate;
    } catch {
      // thử cái tiếp theo
    }
  }

  throw new Error(
    "Không tìm thấy yt-dlp trên hệ thống. " +
    "Trên Linux: sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp. " +
    "Trên Windows: winget install yt-dlp"
  );
}

let _ytDlpPath: string | null = null;

export async function ytDlp(args: string): Promise<{ stdout: string; stderr: string }> {
  if (!_ytDlpPath) {
    _ytDlpPath = await getYtDlpPath();
  }
  return execAsync(`"${_ytDlpPath}" ${args}`, { timeout: 60000 });
}
