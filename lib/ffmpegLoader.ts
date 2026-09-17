import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let sharedFfmpeg: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

export async function loadSharedFfmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (sharedFfmpeg) return sharedFfmpeg;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) {
      ffmpeg.on("log", ({ message }) => onLog(message));
    }
    // The multi-threaded core needs SharedArrayBuffer, which only exists when
    // the page is cross-origin isolated (COOP/COEP headers, set in
    // next.config.mjs). Fall back to the single-threaded core otherwise —
    // it's slower but has no such requirement.
    const useMultiThread = typeof window !== "undefined" && window.crossOriginIsolated;
    const baseUrl = useMultiThread ? "/ffmpeg-mt" : "/ffmpeg";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseUrl}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, "application/wasm"),
      ...(useMultiThread
        ? { workerURL: await toBlobURL(`${baseUrl}/ffmpeg-core.worker.js`, "text/javascript") }
        : {})
    });
    sharedFfmpeg = ffmpeg;
    return ffmpeg;
  })();

  return loadingPromise;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
