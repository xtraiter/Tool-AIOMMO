export type Out = { name: string; blob: Blob };
export type Progress = (fraction: number | null, label?: string) => void;

const baseName = (f: File) => f.name.replace(/\.[^.]+$/, "");

async function canvasBlob(c: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), mime, quality));
}

/** Decodes any browser-readable image onto a canvas (white behind transparency when `flatten`). */
async function imageToCanvas(file: Blob, flatten: boolean): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  if (flatten) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return c;
}

// ---------------------------------------------------------------------------------------- images
export async function imagesToFormat(files: File[], fmt: "png" | "jpg" | "webp", quality: number, onP: Progress): Promise<Out[]> {
  const out: Out[] = [];
  for (let i = 0; i < files.length; i++) {
    onP(i / files.length);
    const c = await imageToCanvas(files[i], fmt === "jpg");
    const mime = fmt === "png" ? "image/png" : fmt === "jpg" ? "image/jpeg" : "image/webp";
    out.push({ name: `${baseName(files[i])}.${fmt}`, blob: await canvasBlob(c, mime, fmt === "png" ? undefined : quality) });
  }
  onP(1);
  return out;
}

export async function imagesToPdf(files: File[], onP: Progress): Promise<Out[]> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    onP(i / files.length);
    const f = files[i];
    const isJpg = /jpe?g$/i.test(f.type) || /\.jpe?g$/i.test(f.name);
    const isPng = /png$/i.test(f.type) || /\.png$/i.test(f.name);
    let bytes: Uint8Array;
    let img;
    if (isJpg) { bytes = new Uint8Array(await f.arrayBuffer()); img = await pdf.embedJpg(bytes); }
    else if (isPng) { bytes = new Uint8Array(await f.arrayBuffer()); img = await pdf.embedPng(bytes); }
    else { const b = await canvasBlob(await imageToCanvas(f, false), "image/png"); img = await pdf.embedPng(new Uint8Array(await b.arrayBuffer())); }
    const k = Math.min(1, 1600 / Math.max(img.width, img.height)) * 0.75; // px -> pt, capped so pages stay a sane size
    const page = pdf.addPage([img.width * k, img.height * k]);
    page.drawImage(img, { x: 0, y: 0, width: img.width * k, height: img.height * k });
  }
  onP(1);
  const data = await pdf.save();
  return [{ name: `${files.length === 1 ? baseName(files[0]) : "images"}.pdf`, blob: new Blob([data as BlobPart], { type: "application/pdf" }) }];
}

// ---------------------------------------------------------------------------------------- PDF
async function openPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

export async function pdfToImages(file: File, fmt: "png" | "jpg", scale: number, onP: Progress): Promise<Out[]> {
  const doc = await openPdf(file);
  const out: Out[] = [];
  const pad = String(doc.numPages).length;
  for (let n = 1; n <= doc.numPages; n++) {
    onP((n - 1) / doc.numPages);
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas: c } as never).promise;
    out.push({ name: `${baseName(file)}-${String(n).padStart(pad, "0")}.${fmt}`, blob: await canvasBlob(c, fmt === "png" ? "image/png" : "image/jpeg", 0.92) });
  }
  onP(1);
  return out;
}

export async function pdfToText(file: File, onP: Progress): Promise<Out[]> {
  const doc = await openPdf(file);
  const parts: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onP((n - 1) / doc.numPages);
    const tc = await (await doc.getPage(n)).getTextContent();
    let line = "", lastY: number | null = null;
    const lines: string[] = [];
    for (const it of tc.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = it.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) { lines.push(line); line = ""; }
      line += it.str;
      if (it.hasEOL) { lines.push(line); line = ""; }
      lastY = y ?? lastY;
    }
    if (line) lines.push(line);
    parts.push(lines.join("\n").trim());
  }
  onP(1);
  return [{ name: `${baseName(file)}.txt`, blob: new Blob(["﻿", parts.join("\n\n")], { type: "text/plain;charset=utf-8" }) }];
}

// ---------------------------------------------------------------------------------------- Word
const DOC_CSS = `
@page { size: A4; margin: 20mm; }
body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5; color: #000; max-width: 100%; }
h1,h2,h3,h4 { font-family: Arial, Helvetica, sans-serif; line-height: 1.25; margin: 1.1em 0 .5em; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; margin: .6em 0; }
td, th { border: 1px solid #444; padding: 4px 7px; vertical-align: top; }
p { margin: 0 0 .6em; } ul, ol { margin: 0 0 .6em 1.4em; }
`;

async function docxHtml(file: File): Promise<string> {
  const mammoth = (await import("mammoth/mammoth.browser")).default as { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
  return (await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value;
}

export async function docxToHtml(file: File): Promise<Out[]> {
  const body = await docxHtml(file);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName(file)}</title><style>${DOC_CSS}</style></head><body>${body}</body></html>`;
  return [{ name: `${baseName(file)}.html`, blob: new Blob([html], { type: "text/html;charset=utf-8" }) }];
}

export async function docxToText(file: File): Promise<Out[]> {
  const body = await docxHtml(file);
  const el = document.createElement("div");
  el.innerHTML = body.replace(/<\/(p|h[1-6]|li|tr)>/gi, "</$1>\n");
  return [{ name: `${baseName(file)}.txt`, blob: new Blob(["﻿", (el.textContent || "").trim()], { type: "text/plain;charset=utf-8" }) }];
}

/** Opens the browser's print sheet on the rendered document: choosing "Save as PDF" gives a real, selectable-text PDF. */
export async function docxToPdfPrint(file: File): Promise<void> {
  const body = await docxHtml(file);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${baseName(file).replace(/</g, "")}</title><style>${DOC_CSS}</style></head><body>${body}</body></html>`);
  doc.close();
  await new Promise((r) => setTimeout(r, 400)); // let images inside the document decode
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => iframe.remove(), 60_000);
}

// ---------------------------------------------------------------------------------------- audio / video
export type MediaFmt = "mp4" | "webm" | "mov" | "mkv" | "avi" | "gif" | "webp" | "mp3" | "wav" | "m4a" | "aac";

/** Video-only options. `height` limits the short side (0 = keep); `aspect` centre-crops ("9:16"...). */
export type VideoQuality = "copy" | "high" | "medium" | "low";
export type VideoOpts = { height: number; aspect: string; quality: VideoQuality };

const AUDIO_ONLY: MediaFmt[] = ["mp3", "wav", "m4a", "aac"];
export const isAudioFmt = (fmt: MediaFmt) => AUDIO_ONLY.includes(fmt);

const MIME: Record<MediaFmt, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo",
  gif: "image/gif", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
};

// "-threads 1": the multi-threaded FFmpeg.wasm core deadlocks when codecs start their own thread pools.
const AUDIO_ARGS: Record<string, string[]> = {
  mp3: ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"],
  wav: ["-vn", "-c:a", "pcm_s16le"],
  m4a: ["-vn", "-c:a", "aac", "-b:a", "192k"],
  aac: ["-vn", "-c:a", "aac", "-b:a", "192k", "-f", "adts"],
};

const X264_CRF = { copy: 18, high: 18, medium: 23, low: 28 };

/** Scale (short side, never upscaled) + centre crop, as one -vf chain; null when nothing to do. */
function videoFilter(o: VideoOpts, extra: string[] = []) {
  const parts: string[] = [];
  if (o.aspect && o.aspect !== "original") {
    const [w, h] = o.aspect.split(":").map(Number);
    const a = (w / h).toFixed(6);
    parts.push(`crop='min(iw,ih*${a})':'min(ih,iw/${a})'`);
  }
  if (o.height > 0) {
    const s = o.height;
    parts.push(`scale='if(gte(iw,ih),-2,min(${s},iw))':'if(gte(iw,ih),min(${s},ih),-2)'`);
  }
  parts.push(...extra);
  if (parts.length) parts.push("scale=trunc(iw/2)*2:trunc(ih/2)*2"); // even sizes for yuv420p encoders
  return parts.length ? parts.join(",") : null;
}

export function encodeArgs(fmt: MediaFmt, o: VideoOpts): string[] {
  const q = o.quality;
  const vf = (extra: string[] = []) => {
    const f = videoFilter(o, extra);
    return f ? ["-vf", f] : [];
  };
  const x264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(X264_CRF[q]), "-pix_fmt", "yuv420p", "-threads", "1"];
  switch (fmt) {
    case "mp4": return [...vf(), ...x264, "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"];
    case "mov": return [...vf(), ...x264, "-c:a", "aac", "-b:a", "160k", "-f", "mov"];
    case "mkv": return [...vf(), ...x264, "-c:a", "aac", "-b:a", "160k"];
    case "webm": {
      const [crf, rate] = q === "low" ? ["20", "800k"] : q === "medium" ? ["12", "1500k"] : ["8", "3M"];
      return [...vf(), "-c:v", "libvpx", "-crf", crf, "-b:v", rate, "-deadline", "good", "-cpu-used", "5", "-threads", "1", "-c:a", "libvorbis"];
    }
    case "avi": {
      const qv = q === "low" ? "8" : q === "medium" ? "5" : "3";
      return [...vf(), "-c:v", "mpeg4", "-q:v", qv, "-vtag", "xvid", "-threads", "1", "-c:a", "libmp3lame", "-b:a", "192k"];
    }
    case "gif": {
      // Two-pass palette for clean colours; default to 480px when no size was chosen.
      const sized = o.height > 0 ? o : { ...o, height: 480 };
      const chain = videoFilter(sized, ["fps=12"]) ?? "fps=12";
      return ["-an", "-filter_complex", `[0:v]${chain},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`, "-filter_complex_threads", "1", "-loop", "0", "-threads", "1"];
    }
    case "webp": {
      const sized = o.height > 0 ? o : { ...o, height: 480 };
      const quality = q === "low" ? "55" : q === "medium" ? "70" : "85";
      return ["-an", "-vf", videoFilter(sized, ["fps=15"]) ?? "fps=15", "-c:v", "libwebp_anim", "-quality", quality, "-loop", "0", "-threads", "1"];
    }
    default:
      return AUDIO_ARGS[fmt];
  }
}

const REMUXABLE: MediaFmt[] = ["mp4", "mov", "mkv"];

export async function convertMedia(file: File, fmt: MediaFmt, onP: Progress, opts: VideoOpts = { height: 0, aspect: "original", quality: "medium" }): Promise<Out[]> {
  const { loadSharedFfmpeg } = await import("@/lib/ffmpegLoader");
  const { FFFSType } = await import("@ffmpeg/ffmpeg");
  onP(null, "load");
  const ff = await loadSharedFfmpeg();
  // Read the source straight from disk (WORKERFS) instead of copying it into
  // FFmpeg's memory — large videos would otherwise exhaust it.
  const srcDir = "/cv_src";
  const inName = `${srcDir}/${file.name}`;
  const outName = `cv_out.${fmt}`;
  const onProg = ({ progress }: { progress: number }) => onP(Math.min(0.99, Math.max(0, Number.isFinite(progress) ? progress : 0)));
  ff.on("progress", onProg);
  await ff.createDir(srcDir).catch(() => {});
  await ff.mount(FFFSType.WORKERFS, { files: [file] }, srcDir);
  try {
    let code = 1;
    // "Giữ gốc": change the container only (no re-encode) — seconds instead of minutes.
    const remux = opts.quality === "copy" && REMUXABLE.includes(fmt) && opts.height === 0 && (!opts.aspect || opts.aspect === "original");
    if (remux) {
      code = await ff.exec(["-i", inName, "-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy", ...(fmt === "mp4" ? ["-movflags", "+faststart"] : []), outName]);
    }
    if (code !== 0) {
      await ff.deleteFile(outName).catch(() => {}); // a half-written remux would make FFmpeg prompt to overwrite
      code = await ff.exec(["-i", inName, ...encodeArgs(fmt, opts), outName]);
    }
    if (code !== 0) throw new Error("ffmpeg");
    const data = (await ff.readFile(outName)) as Uint8Array;
    onP(1);
    return [{ name: `${baseName(file)}.${fmt}`, blob: new Blob([data as BlobPart], { type: MIME[fmt] }) }];
  } finally {
    ff.off("progress", onProg);
    await ff.deleteFile(outName).catch(() => {});
    await ff.unmount(srcDir).catch(() => {});
  }
}
