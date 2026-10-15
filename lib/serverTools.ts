import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Server-side binaries live inside the project (installed by
// scripts/setup-tools.sh) so a server reinstall doesn't break the site.
// System-wide installs are only a fallback.
const ROOT = /*turbopackIgnore: true*/ process.cwd();
const VENV_BIN = path.join(/*turbopackIgnore: true*/ ROOT, ".venv", "bin");
const TOOLS_BIN = path.join(/*turbopackIgnore: true*/ ROOT, "tools", "bin");

export const VENV_PYTHON = path.join(/*turbopackIgnore: true*/ VENV_BIN, "python");

const cache = new Map<string, string>();

async function firstWorking(name: string, candidates: string[], versionArg: string): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  for (const candidate of candidates) {
    if (candidate.includes("/") && !existsSync(candidate)) continue;
    try {
      await execFileAsync(candidate, [versionArg], { timeout: 60_000 });
      cache.set(name, candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(`Không tìm thấy ${name} trên máy chủ. Chạy: bash scripts/setup-tools.sh`);
}

const env = (key: string) => (process.env[key] ? [process.env[key]!] : []);

export function ytDlpPath() {
  return firstWorking("yt-dlp", [
    ...env("YTDLP_PATH"),
    path.join(/*turbopackIgnore: true*/ VENV_BIN, "yt-dlp"),
    path.join(/*turbopackIgnore: true*/ TOOLS_BIN, "yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "yt-dlp",
    "yt-dlp.exe",
  ], "--version");
}

/** Directory (or binary) for yt-dlp's --ffmpeg-location; null means "let yt-dlp search PATH". */
export function ffmpegLocation(): string | null {
  if (process.env.FFMPEG_LOCATION) return process.env.FFMPEG_LOCATION;
  return existsSync(path.join(/*turbopackIgnore: true*/ TOOLS_BIN, "ffmpeg")) ? TOOLS_BIN : null;
}

export function pythonPath() {
  return firstWorking("python", [VENV_PYTHON, "python3", "python"], "--version");
}

export function libreOfficePath() {
  return firstWorking("LibreOffice", [
    ...env("LIBREOFFICE_PATH"),
    path.join(/*turbopackIgnore: true*/ TOOLS_BIN, "libreoffice"), // wrapper around the extracted AppImage
    "libreoffice",
    "soffice",
  ], "--version");
}
