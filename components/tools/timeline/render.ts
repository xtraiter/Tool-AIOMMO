import { end, hasAudio, type Clip, type Media, type Project } from "./model";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type Pool = {
  videos: Map<string, HTMLVideoElement>;
  images: Map<string, HTMLImageElement>;
};

const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type TextLayout = { lines: string[]; fontPx: number; lineH: number; w: number; h: number; pad: number; font: string };

/** Word-wraps a text clip to 90% of the canvas width and measures it. Shared by preview and PNG export. */
export function layoutText(ctx: Ctx, clip: Clip, W: number, H: number): TextLayout {
  const style = clip.style!;
  const fontPx = Math.max(10, Math.round((H * style.size) / 100 * clip.scale));
  const font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "500"} ${fontPx}px ${FONT}`;
  ctx.font = font;
  const maxW = W * 0.9;
  const lines: string[] = [];
  for (const para of (clip.text || " ").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line || " ");
  }
  const lineH = Math.round(fontPx * 1.25);
  const pad = style.box ? Math.round(fontPx * 0.35) : 0;
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2;
  return { lines, fontPx, lineH, w, h: lines.length * lineH + pad * 2, pad, font };
}

export function drawText(ctx: Ctx, clip: Clip, W: number, H: number) {
  const style = clip.style!;
  const L = layoutText(ctx, clip, W, H);
  const cx = clip.x * W;
  const cy = clip.y * H;
  ctx.save();
  ctx.globalAlpha = clip.opacity;
  ctx.font = L.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (style.box) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    const r = L.pad * 0.6;
    const x = cx - L.w / 2, y = cy - L.h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + L.w, y, x + L.w, y + L.h, r);
    ctx.arcTo(x + L.w, y + L.h, x, y + L.h, r);
    ctx.arcTo(x, y + L.h, x, y, r);
    ctx.arcTo(x, y, x + L.w, y, r);
    ctx.closePath();
    ctx.fill();
  }
  L.lines.forEach((line, i) => {
    const ly = cy - L.h / 2 + L.pad + L.lineH * i + L.lineH / 2;
    if (style.shadow) { ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = L.fontPx * 0.15; ctx.shadowOffsetX = ctx.shadowOffsetY = Math.max(1, L.fontPx * 0.06); }
    if (style.stroke) {
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, L.fontPx * 0.14);
      ctx.strokeStyle = "#000000";
      ctx.strokeText(line, cx, ly);
    }
    ctx.shadowColor = "transparent";
    ctx.fillStyle = style.color;
    ctx.fillText(line, cx, ly);
  });
  ctx.restore();
}

/** Box (canvas pixels, centre based) that a visual clip occupies; used for drawing, hit-testing and selection handles. */
export function clipBox(ctx: Ctx, clip: Clip, media: Media | undefined, W: number, H: number) {
  if (clip.kind === "text") {
    const L = layoutText(ctx, clip, W, H);
    return { cx: clip.x * W, cy: clip.y * H, w: L.w, h: L.h };
  }
  const mw = media?.w || W;
  const mh = media?.h || H;
  const fit = Math.min(W / mw, H / mh) * clip.scale;
  return { cx: clip.x * W, cy: clip.y * H, w: mw * fit, h: mh * fit };
}

export function drawFrame(
  ctx: Ctx,
  W: number,
  H: number,
  t: number,
  project: Project,
  mediaById: Map<string, Media>,
  pool: Pool,
  selectedId: string | null,
  showHandles = true
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const order = ["main", "overlay", "text"] as const;
  for (const lane of order) {
    for (const c of project.clips) {
      if (c.lane !== lane || t < c.start || t >= end(c)) continue;
      if (c.kind === "text") { drawText(ctx, c, W, H); continue; }
      const media = c.mediaId ? mediaById.get(c.mediaId) : undefined;
      const src: CanvasImageSource | undefined = c.kind === "video" ? pool.videos.get(c.id) : media ? pool.images.get(media.id) : undefined;
      if (!src) continue;
      const ready = c.kind === "video" ? (src as HTMLVideoElement).readyState >= 2 : (src as HTMLImageElement).complete;
      if (!ready) continue;
      const b = clipBox(ctx, c, media, W, H);
      ctx.globalAlpha = c.opacity;
      ctx.drawImage(src, b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h);
      ctx.globalAlpha = 1;
    }
  }
  if (showHandles && selectedId) {
    const c = project.clips.find((x) => x.id === selectedId);
    if (c && c.kind !== "audio" && t >= c.start && t < end(c)) {
      const b = clipBox(ctx, c, c.mediaId ? mediaById.get(c.mediaId) : undefined, W, H);
      const s = Math.max(W, H) / 640;
      ctx.save();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2 * s;
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.strokeRect(b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h);
      ctx.setLineDash([]);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(b.cx + b.w / 2, b.cy + b.h / 2, 9 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export { hasAudio };
