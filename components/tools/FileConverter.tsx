"use client";

import { useMemo, useRef, useState } from "react";
import { FileText, FileType2, Image as ImageIcon, Film, UploadCloud, Download, X, ArrowRight, Sparkles, Printer } from "lucide-react";
import JSZip from "jszip";
import { useTr } from "@/lib/i18n";
import { downloadBlob, formatBytes } from "@/lib/ffmpegLoader";
import { safeFilename } from "@/lib/filename";
import * as E from "@/lib/convert/engines";
import { ProgressBar } from "./ProgressBar";
import "./tool-page.css";
import "./convert.css";

type ModeId = "doc" | "pdf" | "image" | "media";
type Fmt = { id: string; label: string; needsQuality?: boolean };

const MODES: { id: ModeId; icon: typeof FileText; vi: string; en: string; hintVi: string; hintEn: string; accept: string; multiple: boolean; formats: Fmt[] }[] = [
  { id: "doc", icon: FileType2, vi: "Word (.docx)", en: "Word (.docx)", hintVi: "Chọn tệp Word", hintEn: "Choose a Word file", accept: ".docx", multiple: false,
    formats: [{ id: "pdf", label: "PDF" }, { id: "html", label: "HTML" }, { id: "txt", label: "TXT" }] },
  { id: "pdf", icon: FileText, vi: "PDF", en: "PDF", hintVi: "Chọn tệp PDF", hintEn: "Choose a PDF file", accept: ".pdf,application/pdf", multiple: false,
    formats: [{ id: "png", label: "PNG" }, { id: "jpg", label: "JPG" }, { id: "txt", label: "TXT" }] },
  { id: "image", icon: ImageIcon, vi: "Hình ảnh", en: "Images", hintVi: "Chọn một hoặc nhiều ảnh", hintEn: "Choose one or more images", accept: "image/*", multiple: true,
    formats: [{ id: "pdf", label: "PDF" }, { id: "png", label: "PNG" }, { id: "jpg", label: "JPG", needsQuality: true }, { id: "webp", label: "WebP", needsQuality: true }] },
  { id: "media", icon: Film, vi: "Video / Âm thanh", en: "Video / Audio", hintVi: "Chọn video hoặc file âm thanh", hintEn: "Choose a video or audio file", accept: "video/*,audio/*", multiple: false,
    formats: [{ id: "mp4", label: "MP4" }, { id: "webm", label: "WebM" }, { id: "gif", label: "GIF" }, { id: "mp3", label: "MP3" }, { id: "wav", label: "WAV" }, { id: "m4a", label: "M4A" }] },
];

export function FileConverter() {
  const tr = useTr();
  const inputRef = useRef<HTMLInputElement>(null);
  const [modeId, setModeId] = useState<ModeId>("doc");
  const [fmtId, setFmtId] = useState("pdf");
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState(90);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number | null; label: string } | null>(null);
  const [results, setResults] = useState<E.Out[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [drag, setDrag] = useState(false);

  const mode = MODES.find((m) => m.id === modeId)!;
  const fmt = mode.formats.find((f) => f.id === fmtId) ?? mode.formats[0];

  const pick = (id: ModeId) => {
    const m = MODES.find((x) => x.id === id)!;
    setModeId(id);
    setFmtId(m.formats[0].id);
    setFiles([]);
    setResults([]);
    setError("");
    setNote("");
  };

  const accept = (list: FileList | File[] | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const ok = arr.filter((f) => {
      if (modeId === "doc") return /\.docx$/i.test(f.name);
      if (modeId === "pdf") return /\.pdf$/i.test(f.name) || f.type === "application/pdf";
      if (modeId === "image") return f.type.startsWith("image/") || /\.(jpe?g|png|webp|bmp|gif|avif)$/i.test(f.name);
      return /^(video|audio)\//.test(f.type) || /\.(mp4|mov|mkv|webm|avi|mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(f.name);
    });
    if (!ok.length) { setError(tr("Tệp này không đúng loại đang chọn.", "That file doesn't match the selected type.")); return; }
    setError("");
    setResults([]);
    setNote("");
    setFiles(mode.multiple ? ok : ok.slice(0, 1));
  };

  const total = useMemo(() => files.reduce((a, f) => a + f.size, 0), [files]);

  const run = async () => {
    if (!files.length) return;
    setBusy(true);
    setError("");
    setNote("");
    setResults([]);
    const onP: E.Progress = (f, label) => setProgress({ pct: f === null ? null : f * 100, label: label === "load" ? tr("Đang nạp bộ xử lý FFmpeg...", "Loading the FFmpeg engine...") : tr("Đang chuyển đổi...", "Converting...") });
    try {
      onP(0);
      let out: E.Out[] = [];
      if (modeId === "doc") {
        if (fmt.id === "pdf") {
          await E.docxToPdfPrint(files[0]);
          setNote(tr("Hộp thoại in đã mở: hãy chọn máy in \"Lưu dưới dạng PDF\" (Save as PDF) rồi bấm Lưu.", "The print dialog opened: choose the \"Save as PDF\" printer and press Save."));
        } else out = fmt.id === "html" ? await E.docxToHtml(files[0]) : await E.docxToText(files[0]);
      } else if (modeId === "pdf") {
        out = fmt.id === "txt" ? await E.pdfToText(files[0], onP) : await E.pdfToImages(files[0], fmt.id as "png" | "jpg", scale, onP);
      } else if (modeId === "image") {
        out = fmt.id === "pdf" ? await E.imagesToPdf(files, onP) : await E.imagesToFormat(files, fmt.id as "png" | "jpg" | "webp", quality / 100, onP);
      } else {
        out = await E.convertMedia(files[0], fmt.id as E.MediaFmt, onP);
      }
      setResults(out);
    } catch (e) {
      const msg = (e as Error)?.message || "";
      setError(tr("Không chuyển đổi được tệp này. ", "Couldn't convert this file. ") + (modeId === "media" ? tr("Định dạng nguồn có thể chưa được hỗ trợ.", "The source format may not be supported.") : tr("Tệp có thể bị hỏng hoặc có mật khẩu.", "The file may be damaged or password-protected.")) + (msg && msg !== "ffmpeg" ? ` (${msg.slice(0, 120)})` : ""));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const saveOne = (o: E.Out) => {
    const dot = o.name.lastIndexOf(".");
    downloadBlob(o.blob, safeFilename(o.name.slice(0, dot), o.name.slice(dot + 1)));
  };
  const saveAll = async () => {
    const zip = new JSZip();
    for (const o of results) zip.file(o.name, o.blob);
    downloadBlob(await zip.generateAsync({ type: "blob" }), safeFilename(files[0] ? files[0].name.replace(/\.[^.]+$/, "") : "converted", "zip"));
  };

  const srcExt = mode.id === "doc" ? "DOCX" : mode.id === "pdf" ? "PDF" : mode.id === "image" ? tr("Ảnh", "Image") : tr("Video/Âm thanh", "Video/Audio");

  return (
    <div className="tool-page cv-page">
      <h1><FileType2 size={22} /> {tr("Chuyển Đổi Định Dạng Tệp", "File Format Converter")}</h1>
      <p className="tool-subtitle">{tr("Đổi Word sang PDF, PDF sang ảnh hoặc văn bản, ảnh sang PDF, đổi định dạng ảnh, video và âm thanh. Xử lý ngay trên máy bạn, không tải tệp lên đâu cả.", "Convert Word to PDF, PDF to images or text, images to PDF, and image, video or audio formats. Processed on your device — nothing is uploaded.")}</p>

      <div className="cv-modes" role="tablist" aria-label={tr("Loại tệp gốc", "Source type")}>
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={modeId === m.id} className={modeId === m.id ? "is-active" : ""} onClick={() => pick(m.id)} disabled={busy}>
            <m.icon size={20} /><span>{tr(m.vi, m.en)}</span>
          </button>
        ))}
      </div>

      <div className="tool-card">
        <div
          className={`tool-dropzone${drag ? " is-over" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files); }}
        >
          <UploadCloud size={28} />
          <div className="tool-drop-title">{tr(mode.hintVi, mode.hintEn)}</div>
          <div className="tool-drop-hint">{tr("Kéo thả vào đây hoặc bấm để chọn", "Drop here or click to choose")}</div>
        </div>
        <input ref={inputRef} type="file" accept={mode.accept} multiple={mode.multiple} hidden onChange={(e) => { accept(e.target.files); e.target.value = ""; }} />

        {files.length > 0 && (
          <ul className="cv-files">
            {files.map((f, i) => (
              <li key={i}><span>{f.name}</span><em>{formatBytes(f.size)}</em>
                <button type="button" onClick={() => setFiles((all) => all.filter((_, k) => k !== i))} disabled={busy} aria-label={tr("Bỏ tệp", "Remove file")}><X size={14} /></button></li>
            ))}
          </ul>
        )}

        <div className="cv-target">
          <span className="cv-src">{srcExt}</span><ArrowRight size={16} />
          <div className="cv-fmts" role="radiogroup" aria-label={tr("Định dạng đích", "Target format")}>
            {mode.formats.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={fmt.id === f.id} className={fmt.id === f.id ? "is-active" : ""} onClick={() => setFmtId(f.id)} disabled={busy}>{f.label}</button>
            ))}
          </div>
        </div>

        {modeId === "image" && fmt.needsQuality && (
          <label className="cv-slider"><span>{tr("Chất lượng", "Quality")} <b>{quality}%</b></span><input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} disabled={busy} /></label>
        )}
        {modeId === "pdf" && fmt.id !== "txt" && (
          <label className="cv-slider"><span>{tr("Độ nét ảnh", "Image sharpness")} <b>{scale}x</b></span><input type="range" min={1} max={4} step={0.5} value={scale} onChange={(e) => setScale(Number(e.target.value))} disabled={busy} /></label>
        )}
        {modeId === "doc" && fmt.id === "pdf" && <p className="cv-note">{tr("Word → PDF dùng chức năng in của trình duyệt để giữ chữ có thể chọn/tìm kiếm. Bố cục phức tạp (hộp văn bản, WordArt) có thể khác bản gốc.", "Word → PDF uses your browser's print feature to keep text selectable and searchable. Complex layouts (text boxes, WordArt) may differ from the original.")}</p>}
        {modeId === "media" && <p className="cv-note">{tr("Video dài hoặc nặng sẽ chuyển chậm vì chạy trên trình duyệt. GIF chỉ nên dùng cho clip ngắn.", "Long or heavy videos convert slowly because it runs in the browser. Use GIF for short clips only.")}</p>}

        {progress && <ProgressBar percent={progress.pct} label={progress.label} />}
        {error && <div className="tool-status-error">{error}</div>}
        {note && <div className="tool-status-ok">{note}</div>}

        <button type="button" className="tool-btn cv-go" onClick={run} disabled={busy || !files.length}>
          {modeId === "doc" && fmt.id === "pdf" ? <Printer size={18} /> : <Sparkles size={18} />} {tr("Chuyển đổi", "Convert")}{total ? ` (${formatBytes(total)})` : ""}
        </button>
      </div>

      {results.length > 0 && (
        <div className="tool-card">
          <div className="cv-res-head">
            <h2>{tr("Kết quả", "Results")} <span>{results.length}</span></h2>
            {results.length > 1 && <button type="button" className="tool-btn tool-btn-secondary cv-sm" onClick={saveAll}><Download size={14} /> {tr("Tải tất cả (ZIP)", "Download all (ZIP)")}</button>}
          </div>
          <ul className="cv-files">
            {results.map((o, i) => (
              <li key={i}><span>{o.name}</span><em>{formatBytes(o.blob.size)}</em>
                <button type="button" className="cv-dl" onClick={() => saveOne(o)} aria-label={tr("Tải xuống", "Download")}><Download size={15} /></button></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
