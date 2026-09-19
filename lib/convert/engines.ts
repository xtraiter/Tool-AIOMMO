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
export type MediaFmt = "mp4" | "webm" | "mp3" | "wav" | "m4a" | "gif";

const MEDIA_ARGS: Record<MediaFmt, string[]> = {
  mp4: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"],
  webm: ["-c:v", "libvpx", "-b:v", "1500k", "-crf", "12", "-threads", "1", "-c:a", "libvorbis"],
  mp3: ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"],
  wav: ["-vn", "-c:a", "pcm_s16le"],
  m4a: ["-vn", "-c:a", "aac", "-b:a", "192k"],
  gif: ["-an", "-vf", "fps=12,scale=480:-1:flags=lanczos", "-loop", "0"],
};

export async function convertMedia(file: File, fmt: MediaFmt, onP: Progress): Promise<Out[]> {
  const { loadSharedFfmpeg } = await import("@/lib/ffmpegLoader");
  const { fetchFile } = await import("@ffmpeg/util");
  onP(null, "load");
  const ff = await loadSharedFfmpeg();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const inName = `cv_in.${ext}`, outName = `cv_out.${fmt}`;
  const onProg = ({ progress }: { progress: number }) => onP(Math.min(0.99, Math.max(0, Number.isFinite(progress) ? progress : 0)));
  ff.on("progress", onProg);
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const code = await ff.exec(["-i", inName, ...MEDIA_ARGS[fmt], outName]);
    if (code !== 0) throw new Error("ffmpeg");
    const data = (await ff.readFile(outName)) as Uint8Array;
    const mime = fmt === "mp4" ? "video/mp4" : fmt === "webm" ? "video/webm" : fmt === "gif" ? "image/gif" : fmt === "mp3" ? "audio/mpeg" : fmt === "wav" ? "audio/wav" : "audio/mp4";
    onP(1);
    return [{ name: `${baseName(file)}.${fmt}`, blob: new Blob([data as BlobPart], { type: mime }) }];
  } finally {
    ff.off("progress", onProg);
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}
