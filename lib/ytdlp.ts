import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Locate yt-dlp on Linux and Windows. */
async function getYtDlpPath(): Promise<string> {
  const candidates = [
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "yt-dlp",
    "yt-dlp.exe",
  ];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"]);
      return candidate;
    } catch {
      // try next
    }
  }

  throw new Error(
    "Không tìm thấy yt-dlp trên hệ thống. " +
    "Trên Linux: sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp. " +
    "Trên Windows: winget install yt-dlp"
  );
}

let _ytDlpPath: string | null = null;

/**
 * Runs yt-dlp without a shell. `url` is passed after `--` so it can never be
 * parsed as an option or interpreted by a shell.
 */
export async function ytDlp(options: string[], url: string): Promise<{ stdout: string; stderr: string }> {
  if (!_ytDlpPath) {
    _ytDlpPath = await getYtDlpPath();
  }
  return execFileAsync(_ytDlpPath, [...options, "--", url], { timeout: 60000, maxBuffer: 20 * 1024 * 1024 });
}
