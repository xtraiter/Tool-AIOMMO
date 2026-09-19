import { computePeaks, makeFilmstrip } from "@/lib/mediaThumbs";
import { getAudioContextCtor } from "@/lib/audioEncode";
import { uid, type Media } from "./model";

export function mediaKind(file: File): Media["kind"] | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "mkv", "m4v", "avi"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext)) return "image";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"].includes(ext)) return "audio";
  return null;
}

function probeVideo(url: string): Promise<{ duration: number; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve({ duration: v.duration, w: v.videoWidth, h: v.videoHeight });
    v.onerror = () => reject(new Error("video"));
    v.src = url;
  });
}

function probeImage(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

/** Reads a file into a Media entry (duration, size, waveform). Video filmstrips are generated afterwards by `addFilmstrip`. */
export async function importFile(file: File): Promise<Media | null> {
  const kind = mediaKind(file);
  if (!kind) return null;
  const url = URL.createObjectURL(file);
  try {
    const base = { id: uid(), kind, name: file.name, file, url, thumbs: [] as string[], peaks: [] as number[] };
    if (kind === "video") {
      const m = await probeVideo(url);
      if (!Number.isFinite(m.duration) || m.duration <= 0) throw new Error("duration");
      return { ...base, duration: m.duration, w: m.w, h: m.h };
    }
    if (kind === "image") {
      const m = await probeImage(url);
      return { ...base, duration: 0, w: m.w, h: m.h };
    }
    const ctx = new (getAudioContextCtor())();
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      return { ...base, duration: buf.duration, w: 0, h: 0, peaks: computePeaks(buf, 1000) };
    } finally {
      ctx.close().catch(() => {});
    }
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export async function addFilmstrip(media: Media, isCancelled: () => boolean) {
  if (media.kind !== "video") return;
  const count = Math.min(30, Math.max(8, Math.ceil(media.duration / 2)));
  media.thumbs = await makeFilmstrip(media.url, media.duration, count, 64, isCancelled).catch(() => []);
}
