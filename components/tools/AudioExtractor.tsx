"use client";

import { useRef, useState } from "react";
import { AudioLines, UploadCloud, X } from "lucide-react";
import { fetchFile } from "@ffmpeg/util";
import { loadSharedFfmpeg, formatBytes, downloadBlob } from "@/lib/ffmpegLoader";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import "./tool-page.css";

const FORMATS = [
  { id: "mp3", label: "MP3", codec: ["-c:a", "libmp3lame", "-q:a", "2"], mime: "audio/mpeg" },
  { id: "wav", label: "WAV", codec: ["-c:a", "pcm_s16le"], mime: "audio/wav" },
  { id: "m4a", label: "M4A (AAC)", codec: ["-c:a", "aac", "-b:a", "192k"], mime: "audio/mp4" }
];

export function AudioExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState("mp3");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setError("");
    setStatus("");
  }

  async function handleExtract() {
    if (!file) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      setStatus("Đang nạp bộ xử lý FFmpeg...");
      const ffmpeg = await loadSharedFfmpeg();
      const offProgress = ffmpeg.on("progress", ({ progress: p }) => {
        setProgress(Math.min(100, Math.round(p * 100)));
      });

      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const inName = `in.${ext}`;
      const chosen = FORMATS.find((f) => f.id === format)!;
      const outName = `out.${chosen.id}`;

      setStatus("Đang ghi tệp vào bộ nhớ xử lý...");
      await ffmpeg.writeFile(inName, await fetchFile(file));

      setStatus("Đang tách âm thanh...");
      const exitCode = await ffmpeg.exec(["-i", inName, "-vn", ...chosen.codec, outName]);
      if (exitCode !== 0) {
        throw new Error("FFmpeg tách âm thanh thất bại.");
      }

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: chosen.mime });
      downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}.${chosen.id}`);
      setStatus(`Hoàn tất! Đã tải xuống tệp ${chosen.label}.`);

      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(outName).catch(() => {});
      offProgress?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi tách âm thanh.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="tool-page">
      <h1><AudioLines size={22} /> Tách Nhạc Từ Video</h1>
      <p className="tool-subtitle">
        Trích xuất âm thanh từ video sang MP3/WAV/M4A, xử lý ngay trên trình duyệt bằng FFmpeg WebAssembly.
      </p>

      {!file ? (
        <div className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] ?? null); }}>
          <UploadCloud size={30} />
          <div className="tool-drop-title">Kéo thả video vào đây hoặc bấm để chọn</div>
          <div className="tool-drop-hint">Hỗ trợ MP4, MOV, WEBM, MKV...</div>
          <input ref={inputRef} type="file" accept="video/*" hidden onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </div>
      ) : (
        <div className="tool-card">
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">{formatBytes(file.size)}</span>
            <button className="tool-icon-btn" onClick={reset} title="Bỏ chọn"><X size={16} /></button>
          </div>

          <div className="tool-row">
            <div className="tool-field">
              <label>Định dạng đầu ra</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div className="tool-row">
            <button className="tool-btn" onClick={handleExtract} disabled={busy}>
              <AudioLines size={15} /> {busy ? `Đang xử lý (${progress}%)` : "Tách và tải xuống"}
            </button>
          </div>

          {busy && (
            <div className="tool-progress-track"><div className="tool-progress-fill" style={{ width: `${progress}%` }} /></div>
          )}
          {status && !error && <div className="tool-status-ok">{status}</div>}
          {error && <div className="tool-status-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
