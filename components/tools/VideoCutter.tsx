"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, UploadCloud, Download, X } from "lucide-react";
import { fetchFile } from "@ffmpeg/util";
import { loadSharedFfmpeg, formatBytes, formatDuration, downloadBlob } from "@/lib/ffmpegLoader";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import "./tool-page.css";

export function VideoCutter() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [precise, setPrecise] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Memoized so re-renders (dragging the trim slider, progress updates...)
  // don't create a fresh blob URL every time — that was forcing the <video>
  // to reload/reset on every interaction.
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => { if (fileUrl) URL.revokeObjectURL(fileUrl); };
  }, [fileUrl]);

  function handleFile(f: File | null) {
    if (!f) return;
    setError("");
    setFile(f);
    setStatus("");
    const url = URL.createObjectURL(f);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      const d = probe.duration || 0;
      setDuration(d);
      setStart(0);
      setEnd(d);
      URL.revokeObjectURL(url);
    };
  }

  async function handleCut() {
    if (!file) return;
    if (end <= start) {
      setError("Thời điểm kết thúc phải sau thời điểm bắt đầu.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress(0);
    setStatus("Đang nạp bộ xử lý FFmpeg...");
    try {
      const ffmpeg = await loadSharedFfmpeg();
      const offProgress = ffmpeg.on("progress", ({ progress: p }) => {
        setProgress(Math.min(100, Math.round(p * 100)));
      });

      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const inName = `in.${ext}`;
      const outName = `out.${ext === "mov" ? "mp4" : ext}`;

      setStatus("Đang ghi tệp vào bộ nhớ xử lý...");
      await ffmpeg.writeFile(inName, await fetchFile(file));

      setStatus("Đang cắt video...");
      const args = precise
        ? ["-i", inName, "-ss", String(start), "-to", String(end), "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", outName]
        : ["-ss", String(start), "-to", String(end), "-i", inName, "-c", "copy", outName];

      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error("FFmpeg xử lý thất bại. Hãy thử bật chế độ cắt chính xác.");
      }

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      downloadBlob(blob, `cat_${file.name.replace(/\.[^.]+$/, "")}.mp4`);
      setStatus(`Hoàn tất! Đã tải xuống video dài ${formatDuration(end - start)}.`);

      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(outName).catch(() => {});
      offProgress?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi cắt video.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="tool-page">
      <h1><Scissors size={22} /> Cắt Video</h1>
      <p className="tool-subtitle">
        Chọn đoạn cần giữ lại, video được xử lý hoàn toàn trên trình duyệt của bạn bằng FFmpeg WebAssembly — không tải file lên máy chủ nào.
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
          <video ref={videoRef} src={fileUrl ?? undefined} controls className="tool-video-preview" />
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">{formatBytes(file.size)} · {formatDuration(duration)}</span>
            <button className="tool-icon-btn" onClick={reset} title="Bỏ chọn"><X size={16} /></button>
          </div>

          <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 4px" }}>
            Kéo thanh trượt chỉ để chọn nhanh — để cắt chính xác, hãy tạm dừng video ở đúng vị trí rồi bấm &quot;Đặt tại đây&quot;, hoặc gõ thẳng số giây.
          </p>
          <div className="tool-row">
            <div className="tool-field">
              <label>Bắt đầu ({formatDuration(start)})</label>
              <div className="tool-slider-row">
                <input type="range" min={0} max={duration} step={0.01} value={start}
                  onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.1))} />
              </div>
              <div className="tool-precise-row">
                <input type="number" min={0} max={Math.max(0, end - 0.1)} step={0.1}
                  value={Number(start.toFixed(2))}
                  onChange={(e) => setStart(Math.max(0, Math.min(Number(e.target.value) || 0, end - 0.1)))} />
                <span className="tool-precise-unit">giây</span>
                <button type="button" className="tool-btn tool-btn-secondary tool-mark-btn"
                  onClick={() => { if (videoRef.current) setStart(Math.min(videoRef.current.currentTime, end - 0.1)); }}>
                  Đặt tại đây
                </button>
              </div>
            </div>
            <div className="tool-field">
              <label>Kết thúc ({formatDuration(end)})</label>
              <div className="tool-slider-row">
                <input type="range" min={0} max={duration} step={0.01} value={end}
                  onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.1))} />
              </div>
              <div className="tool-precise-row">
                <input type="number" min={start + 0.1} max={duration} step={0.1}
                  value={Number(end.toFixed(2))}
                  onChange={(e) => setEnd(Math.max(start + 0.1, Math.min(Number(e.target.value) || 0, duration)))} />
                <span className="tool-precise-unit">giây</span>
                <button type="button" className="tool-btn tool-btn-secondary tool-mark-btn"
                  onClick={() => { if (videoRef.current) setEnd(Math.max(videoRef.current.currentTime, start + 0.1)); }}>
                  Đặt tại đây
                </button>
              </div>
            </div>
          </div>

          <div className="tool-row" style={{ alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} />
              Cắt chính xác (mã hoá lại, chậm hơn nhưng đúng từng khung hình)
            </label>
          </div>

          <div className="tool-row">
            <button className="tool-btn" onClick={handleCut} disabled={busy}>
              <Scissors size={15} /> {busy ? `Đang xử lý (${progress}%)` : "Cắt và tải xuống"}
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
