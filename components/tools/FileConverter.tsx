"use client";

import { useMemo, useRef, useState } from "react";
import { FileText, FileType2, Image as ImageIcon, Film, Music2, UploadCloud, Download, X, ArrowRight, Sparkles, Printer } from "lucide-react";
import JSZip from "jszip";
import { useTr } from "@/lib/i18n";
import { downloadBlob, formatBytes } from "@/lib/ffmpegLoader";
import { safeFilename } from "@/lib/filename";
import * as E from "@/lib/convert/engines";
import { ProgressBar } from "./ProgressBar";
import "./tool-page.css";
import "./convert.css";

type ModeId = "doc" | "pdf" | "image" | "video" | "audio_conv";
type Fmt = { id: string; label: string; needsQuality?: boolean }

const MODES: { id: ModeId; icon: typeof FileText; vi: string; en: string; hintVi: string; hintEn: string; accept: string; multiple: boolean; formats: Fmt[] }[] = [
  { id: "doc", icon: FileType2, vi: "Word (.docx)", en: "Word (.docx)", hintVi: "Chọn tệp Word", hintEn: "Choose a Word file", accept: ".docx", multiple: false,
    formats: [{ id: "pdf", label: "PDF" }, { id: "html", label: "HTML" }, { id: "txt", label: "TXT" }] },
  { id: "pdf", icon: FileText, vi: "PDF", en: "PDF", hintVi: "Chọn tệp PDF", hintEn: "Choose a PDF file", accept: ".pdf,application/pdf", multiple: false,
    formats: [{ id: "docx", label: "Word" }, { id: "png", label: "PNG" }, { id: "jpg", label: "JPG" }, { id: "txt", label: "TXT" }] },
  { id: "image", icon: ImageIcon, vi: "Hình ảnh", en: "Images", hintVi: "Chọn một hoặc nhiều ảnh", hintEn: "Choose one or more images", accept: "image/*", multiple: true,
    formats: [{ id: "pdf", label: "PDF" }, { id: "png", label: "PNG" }, { id: "jpg", label: "JPG", needsQuality: true }, { id: "webp", label: "WebP", needsQuality: true }] },
  { id: "video", icon: Film, vi: "Video", en: "Video", hintVi: "Chọn file video", hintEn: "Choose a video file", accept: "video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v", multiple: false,
    formats: [{ id: "mp4", label: "MP4" }, { id: "webm", label: "WebM" }, { id: "gif", label: "GIF" }] },
  { id: "audio_conv", icon: Music2, vi: "Âm thanh", en: "Audio", hintVi: "Chọn file âm thanh hoặc video để trích âm", hintEn: "Choose an audio or video file to extract audio", accept: "audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.mp4,.mkv,.webm", multiple: false,
    formats: [{ id: "mp3", label: "MP3" }, { id: "wav", label: "WAV" }, { id: "m4a", label: "M4A" }, { id: "aac", label: "AAC" }] },
];

// Titles & subtitles per mode when used as a standalone tool
const MODE_META: Record<ModeId, { titleVi: string; titleEn: string; subVi: string; subEn: string }> = {
  doc: {
    titleVi: "Chuyển Đổi Word / PDF",
    titleEn: "Word / PDF Converter",
    subVi: "Đổi Word sang PDF, HTML hoặc TXT. Các tệp được xử lý an toàn 100% qua Server và xoá ngay sau khi chuyển.",
    subEn: "Convert Word to PDF, HTML, or TXT. Files are processed securely on the server and deleted immediately.",
  },
  pdf: {
    titleVi: "Chuyển Đổi PDF",
    titleEn: "PDF Converter",
    subVi: "Đổi PDF sang Word, ảnh PNG/JPG hoặc văn bản thuần tuý. Xử lý 100% qua Server và xoá ngay.",
    subEn: "Convert PDF to Word, images, or plain text. Processed securely on the server and deleted immediately.",
  },
  image: {
    titleVi: "Chuyển Đổi Định Dạng Hình Ảnh",
    titleEn: "Image Format Converter",
    subVi: "Đổi ảnh sang PDF, PNG, JPG hoặc WebP ngay trên trình duyệt. Hỗ trợ xử lý hàng loạt nhiều ảnh cùng lúc.",
    subEn: "Convert images to PDF, PNG, JPG, or WebP in the browser. Supports batch processing multiple images at once.",
  },
  video: {
    titleVi: "Chuyển Đổi Định Dạng Video",
    titleEn: "Video Format Converter",
    subVi: "Đổi video sang MP4, WebM hoặc GIF ngay trên trình duyệt, không cần cài phần mềm. Video dài sẽ xử lý lâu hơn.",
    subEn: "Convert video to MP4, WebM, or GIF directly in the browser. Longer videos take more time to process.",
  },
  audio_conv: {
    titleVi: "Chuyển Đổi Định Dạng Âm Thanh",
    titleEn: "Audio Format Converter",
    subVi: "Đổi âm thanh sang MP3, WAV, M4A hoặc AAC ngay trên trình duyệt. Có thể dùng để trích âm từ video.",
    subEn: "Convert audio to MP3, WAV, M4A, or AAC in the browser. Also works for extracting audio from video files.",
  },
};

// Map audio_conv and video to the "media" ffmpeg engine type
function getEngineMode(modeId: ModeId): "doc" | "pdf" | "image" | "media" {
  if (modeId === "video" || modeId === "audio_conv") return "media";
  return modeId;
}

export function FileConverter({ initialTab }: { initialTab?: ModeId }) {
  const tr = useTr();
  const inputRef = useRef<HTMLInputElement>(null);
  const [modeId, setModeId] = useState<ModeId>(initialTab ?? "doc");
  const [fmtId, setFmtId] = useState(() => {
    const startMode = MODES.find((m) => m.id === (initialTab ?? "doc"))!;
    return startMode.formats[0].id;
  });
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState(90);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number | null; label: string } | null>(null);
  const [results, setResults] = useState<E.Out[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [drag, setDrag] = useState(false);

  // When used as standalone tool (initialTab set), show only that mode — no tab bar
  const isSingleMode = !!initialTab;

  const mode = MODES.find((m) => m.id === modeId)!;
  const fmt = mode.formats.find((f) => f.id === fmtId) ?? mode.formats[0];
  const meta = MODE_META[modeId];
  const engineMode = getEngineMode(modeId);

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
      if (modeId === "video") return /^video\//.test(f.type) || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name);
      // audio_conv: accepts audio and video (for audio extraction)
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
    const onP: E.Progress = (f, label) => setProgress({
      pct: f === null ? null : f * 100,
      label: label === "load" ? tr("Đang nạp bộ xử lý FFmpeg...", "Loading the FFmpeg engine...") : tr("Đang chuyển đổi...", "Converting..."),
    });
    try {
      onP(0);
      let out: E.Out[] = [];
      if (modeId === "doc") {
        if (fmt.id === "pdf") {
          const fd = new FormData();
          fd.append("file", files[0]);
          fd.append("targetFormat", "pdf");
          const res = await fetch("/api/convert", { method: "POST", body: fd });
          if (!res.ok) throw new Error((await res.json()).error || "Lỗi Server");
          const blob = await res.blob();
          out = [{ name: files[0].name.replace(/\.[^.]+$/, ".pdf"), blob }];
          setNote(tr("Chuyển đổi thành công. Dữ liệu đã được bảo vệ và xóa khỏi Server.", "Conversion successful. Data is protected and deleted from Server."));
        } else out = fmt.id === "html" ? await E.docxToHtml(files[0]) : await E.docxToText(files[0]);
      } else if (modeId === "pdf") {
        if (fmt.id === "docx") {
          const fd = new FormData();
          fd.append("file", files[0]);
          fd.append("targetFormat", "docx");
          const res = await fetch("/api/convert", { method: "POST", body: fd });
          if (!res.ok) throw new Error((await res.json()).error || "Lỗi Server");
          const blob = await res.blob();
          out = [{ name: files[0].name.replace(/\.[^.]+$/, ".docx"), blob }];
          setNote(tr("Lưu ý: Tính năng PDF sang Word có thể không giữ được định dạng hoàn hảo như ban đầu do giới hạn công nghệ.", "Note: PDF to Word feature may not preserve perfect formatting due to technology limits."));
        } else {
          out = fmt.id === "txt" ? await E.pdfToText(files[0], onP) : await E.pdfToImages(files[0], fmt.id as "png" | "jpg", scale, onP);
        }
      } else if (modeId === "image") {
        out = fmt.id === "pdf" ? await E.imagesToPdf(files, onP) : await E.imagesToFormat(files, fmt.id as "png" | "jpg" | "webp", quality / 100, onP);
      } else {
        // video or audio_conv → use media engine
        out = await E.convertMedia(files[0], fmt.id as E.MediaFmt, onP);
      }
      setResults(out);
    } catch (e) {
      const msg = (e as Error)?.message || "";
      setError(
        tr("Không chuyển đổi được tệp này. ", "Couldn't convert this file. ") +
        (engineMode === "media"
          ? tr("Định dạng nguồn có thể chưa được hỗ trợ.", "The source format may not be supported.")
          : tr("Tệp có thể bị hỏng hoặc có mật khẩu.", "The file may be damaged or password-protected.")) +
        (msg && msg !== "ffmpeg" ? ` (${msg.slice(0, 120)})` : "")
      );
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

  const srcExt =
    modeId === "doc" ? "DOCX" :
    modeId === "pdf" ? "PDF" :
    modeId === "image" ? tr("Ảnh", "Image") :
    modeId === "video" ? tr("Video", "Video") :
    tr("Âm thanh", "Audio");

  const TitleIcon = modeId === "image" ? ImageIcon : modeId === "video" ? Film : modeId === "audio_conv" ? Music2 : FileType2;
  // In general office mode (no initialTab), always show Word/PDF meta regardless of active tab
  const displayMeta = isSingleMode ? meta : MODE_META["doc"];

  return (
    <div className="tool-page cv-page">
      <h1><TitleIcon size={22} /> {tr(displayMeta.titleVi, displayMeta.titleEn)}</h1>
      <p className="tool-subtitle">{tr(displayMeta.subVi, displayMeta.subEn)}</p>

      {/* Only show mode tabs when NOT in single-mode (i.e., opened from the "Văn phòng" general menu) */}
      {/* In general mode: only Word & PDF — image/video/audio have their own dedicated tools */}
      {!isSingleMode && (
        <div className="cv-modes" role="tablist" aria-label={tr("Loại tệp gốc", "Source type")}>
          {MODES.filter((m) => m.id === "doc" || m.id === "pdf").map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={modeId === m.id} className={modeId === m.id ? "is-active" : ""} onClick={() => pick(m.id)} disabled={busy}>
              <m.icon size={20} /><span>{tr(m.vi, m.en)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="tool-card">
        <div
          className={`tool-dropzone${drag ? " is-dragover" : ""}`}
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
        {modeId === "doc" && fmt.id === "pdf" && (
          <p className="cv-note">{tr("Word → PDF được xử lý thông qua Server bằng LibreOffice giúp giữ nguyên 100% bố cục và font chữ. File được tự động xóa ngay sau khi chuyển đổi.", "Word → PDF is processed via Server using LibreOffice to preserve 100% layout and fonts. Files are auto-deleted immediately after conversion.")}</p>
        )}
        {modeId === "video" && (
          <p className="cv-note">{tr("Video dài hoặc nặng sẽ chuyển chậm vì chạy trên trình duyệt. GIF chỉ nên dùng cho clip ngắn dưới 15 giây.", "Long or heavy videos convert slowly because it runs in the browser. Use GIF only for short clips under 15 seconds.")}</p>
        )}
        {modeId === "audio_conv" && (
          <p className="cv-note">{tr("Nếu chọn file video, phần âm thanh sẽ được trích xuất và chuyển sang định dạng đã chọn.", "If you select a video file, the audio track will be extracted and converted to the chosen format.")}</p>
        )}

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
