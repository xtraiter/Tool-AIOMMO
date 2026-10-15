import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { ffmpegLocation, ytDlpPath } from "@/lib/serverTools";

const execFileAsync = promisify(execFile);

/**
 * Flags shared by every call. IPv4 + socket timeout avoid hangs on hosts with
 * broken IPv6; pointing at this Node binary lets yt-dlp solve YouTube's JS
 * challenges even when PM2's PATH lacks node; skipping format checks avoids
 * test-downloading fragments.
 */
function baseArgs() {
  const ffmpeg = ffmpegLocation();
  return [
    "--force-ipv4", "--socket-timeout", "20", "--js-runtimes", `node:${process.execPath}`, "--no-check-formats",
    ...(ffmpeg ? ["--ffmpeg-location", ffmpeg] : []),
    // Optional Netscape cookies file — Douyin, Facebook and Instagram often need one.
    ...(process.env.YTDLP_COOKIES_FILE ? ["--cookies", process.env.YTDLP_COOKIES_FILE] : []),
  ];
}

export type DownloadProgress = { percent: number; stage: "download" | "convert" };

/**
 * Like ytDlpDownload but streams yt-dlp's stdout so callers get a live percentage.
 * `expectedStreams` is how many separate downloads a merge is expected to need (video + audio = 2).
 */
export async function ytDlpDownloadWithProgress(
  options: string[],
  url: string,
  expectedStreams: number,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const bin = await ytDlpPath();
  const args = [
    ...baseArgs(),
    "--newline", "--progress-template", "download:PROG %(progress._percent_str)s",
    ...options, "--", url,
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    const timer = setTimeout(() => child.kill(), 300_000);
    signal?.addEventListener("abort", () => child.kill());
    let streams = 0;
    let total = Math.max(1, expectedStreams);
    let last = 0;
    let errText = "";
    let buf = "";
    const handle = (line: string) => {
      if (line.includes("[download] Destination:")) {
        streams++;
        if (streams > total) total = streams;
      }
      const m = /PROG\s+([\d.]+)%/.exec(line);
      if (m) {
        const overall = ((Math.max(1, streams) - 1 + parseFloat(m[1]) / 100) / total) * 90;
        last = Math.max(last, Math.min(90, overall));
        onProgress({ percent: last, stage: "download" });
      } else if (/^\[(ExtractAudio|Merger|VideoRemuxer|VideoConvertor|FFmpeg)/.test(line)) {
        last = Math.max(last, 92);
        onProgress({ percent: last, stage: "convert" });
      }
      if (line.includes("ERROR")) errText = line;
    };
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
    });
    child.stderr.on("data", (d) => { for (const l of d.toString().split("\n")) if (l.includes("ERROR")) errText = l; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(errText ? errText.replace(/^ERROR:\s*/, "").slice(0, 200) : "yt-dlp không lấy được dữ liệu từ link này."));
    });
  });
}

async function run(options: string[], url: string, timeout: number) {
  const bin = await ytDlpPath();
  try {
    return await execFileAsync(bin, [...baseArgs(), ...options, "--", url], { timeout, maxBuffer: 20 * 1024 * 1024 });
  } catch (err: any) {
    const detail = String(err?.stderr || "").split("\n").filter((l) => l.includes("ERROR")).pop();
    throw new Error(detail ? detail.replace(/^ERROR:\s*/, "").slice(0, 200) : "yt-dlp không lấy được dữ liệu từ link này.");
  }
}

/**
 * Runs yt-dlp without a shell. `url` is passed after `--` so it can never be
 * parsed as an option or interpreted by a shell.
 */
export function ytDlp(options: string[], url: string) {
  return run(options, url, 90_000);
}

/** Same, but with a longer timeout for actually downloading media to disk. */
export function ytDlpDownload(options: string[], url: string) {
  return run(options, url, 300_000);
}
