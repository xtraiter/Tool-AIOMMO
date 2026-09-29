// Output formats for the video background remover. Frames arrive as PNGs
// (f_00001.png...) already composited (transparent or on the chosen
// background); FFmpeg.wasm turns them into the final file.

export type VideoFormatId = "webm" | "mov" | "webp" | "gif" | "apng" | "mp4" | "zip";

export interface VideoFormat {
  id: VideoFormatId;
  label: string;
  labelEn: string;
  ext: string;
  mime: string;
  /** Keeps a transparent background. */
  alpha: boolean;
  /** Can carry the original soundtrack. */
  audio: boolean;
  /** Result can be previewed in the page (<video> or <img>). */
  preview: "video" | "image" | null;
  hint: string;
  hintEn: string;
}

export const VIDEO_FORMATS: VideoFormat[] = [
  {
    id: "webm", label: "WebM (nền trong suốt)", labelEn: "WebM (transparent)", ext: "webm", mime: "video/webm",
    alpha: true, audio: true, preview: "video",
    hint: "Nhẹ, nền trong suốt, dùng cho web và phần mềm dựng trên máy tính. Safari/iPhone không hiển thị được phần trong suốt.",
    hintEn: "Small, transparent, for the web and desktop editors. Safari/iPhone can't show the transparency.",
  },
  {
    id: "mov", label: "MOV ProRes 4444 (nền trong suốt)", labelEn: "MOV ProRes 4444 (transparent)", ext: "mov", mime: "video/quicktime",
    alpha: true, audio: true, preview: null,
    hint: "Chuẩn nền trong suốt cho Premiere, After Effects, Final Cut, DaVinci, CapCut máy tính. File rất nặng.",
    hintEn: "Standard transparent format for Premiere, After Effects, Final Cut, DaVinci, CapCut desktop. Very large files.",
  },
  {
    id: "webp", label: "WebP động", labelEn: "Animated WebP", ext: "webp", mime: "image/webp",
    alpha: true, audio: false, preview: "image",
    hint: "Ảnh động nền trong suốt, viền mịn, nhẹ hơn GIF nhiều. Dùng làm sticker, chèn web.",
    hintEn: "Transparent animation with smooth edges, far smaller than GIF. Great for stickers and the web.",
  },
  {
    id: "gif", label: "GIF", labelEn: "GIF", ext: "gif", mime: "image/gif",
    alpha: true, audio: false, preview: "image",
    hint: "Mở được ở mọi nơi, nhưng chỉ 256 màu và viền trong suốt bị răng cưa. Nên chọn ≤ 480px, ≤ 15 khung/giây.",
    hintEn: "Works everywhere, but only 256 colours and jagged transparent edges. Best at ≤ 480px, ≤ 15 fps.",
  },
  {
    id: "apng", label: "APNG (PNG động)", labelEn: "APNG (animated PNG)", ext: "png", mime: "image/apng",
    alpha: true, audio: false, preview: "image",
    hint: "Ảnh động chất lượng cao nhất, nền trong suốt mịn, nhưng file lớn.",
    hintEn: "Highest-quality animation with smooth transparency, but large files.",
  },
  {
    id: "mp4", label: "MP4 (nền màu / ảnh / phông xanh)", labelEn: "MP4 (colour / image / green screen)", ext: "mp4", mime: "video/mp4",
    alpha: false, audio: true, preview: "video",
    hint: "MP4 không có nền trong suốt. Chọn phông xanh để ghép lại bằng tính năng Chroma Key trong CapCut điện thoại.",
    hintEn: "MP4 has no transparency. Pick green screen to key it out later with CapCut mobile's Chroma Key.",
  },
  {
    id: "zip", label: "ZIP ảnh PNG từng khung", labelEn: "ZIP of PNG frames", ext: "zip", mime: "application/zip",
    alpha: true, audio: false, preview: null,
    hint: "Từng khung hình PNG nền trong suốt, cho phần mềm dựng chuyên nghiệp.",
    hintEn: "Every frame as a transparent PNG, for professional editing software.",
  },
];

export function formatById(id: VideoFormatId) {
  return VIDEO_FORMATS.find((f) => f.id === id)!;
}

/**
 * FFmpeg arguments that encode `f_%05d.png` at `fps` into `out.<ext>`.
 * With `audio`, the trimmed soundtrack of `input` is muxed in (if it has one).
 */
export function encodeArgs(
  format: VideoFormat,
  opts: { fps: number; transparent: boolean; audio: boolean; inputName: string; start: number; duration: number }
): string[] {
  // "-threads 1" everywhere: the multi-threaded FFmpeg.wasm core deadlocks when
  // decoders/encoders/filters spin up their own thread pools (same as the other tools).
  const out = ["-threads", "1", `out.${format.ext}`];
  const frames = ["-threads", "1", "-framerate", String(opts.fps), "-i", "f_%05d.png"];
  const withAudio = opts.audio && format.audio;
  const audioIn = withAudio ? ["-threads", "1", "-ss", opts.start.toFixed(3), "-t", opts.duration.toFixed(3), "-i", opts.inputName] : [];
  const maps = withAudio ? ["-map", "0:v:0", "-map", "1:a:0?", "-shortest"] : [];

  switch (format.id) {
    case "webm":
      // VP8 + alpha: FFmpeg.wasm's VP9 encoder is unusably slow (or errors) on
      // alpha frames, while VP8 alpha is fast and plays in Chrome/Edge/Firefox.
      return [...frames, ...audioIn, ...maps,
        "-c:v", "libvpx", "-pix_fmt", "yuva420p", "-crf", "10", "-b:v", "2M",
        "-deadline", "good", "-cpu-used", "5", "-auto-alt-ref", "0",
        ...(withAudio ? ["-c:a", "libopus", "-b:a", "128k"] : []), ...out];
    case "mov":
      return [...frames, ...audioIn, ...maps,
        "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", "-vendor", "apl0",
        ...(withAudio ? ["-c:a", "aac", "-b:a", "192k"] : []), ...out];
    case "mp4":
      return [...frames, ...audioIn, ...maps,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        ...(withAudio ? ["-c:a", "aac", "-b:a", "160k"] : []), ...out];
    case "webp":
      return [...frames, "-c:v", "libwebp_anim", "-pix_fmt", opts.transparent ? "yuva420p" : "yuv420p",
        "-lossless", "0", "-quality", "80", "-loop", "0", ...out];
    case "gif":
      return [...frames, "-filter_complex_threads", "1", "-filter_complex",
        opts.transparent
          ? "[0:v]split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=alpha_threshold=128:dither=bayer:bayer_scale=3"
          : "[0:v]split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
        "-loop", "0", ...out];
    case "apng":
      return [...frames, "-c:v", "apng", "-pix_fmt", "rgba", "-plays", "0", "-f", "apng", ...out];
    case "zip":
      throw new Error("ZIP is packed with JSZip, not FFmpeg.");
  }
}

export const frameName = (i: number) => `f_${String(i + 1).padStart(5, "0")}.png`;
