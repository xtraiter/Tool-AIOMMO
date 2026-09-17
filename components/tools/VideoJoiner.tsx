"use client";

import { useRef, useState } from "react";
import { Combine, UploadCloud, GripVertical, Trash2 } from "lucide-react";
import { fetchFile } from "@ffmpeg/util";
import { loadSharedFfmpeg, formatBytes, downloadBlob } from "@/lib/ffmpegLoader";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import "./tool-page.css";

function probeVideoSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth || 1280, height: v.videoHeight || 720 });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => resolve({ width: 1280, height: 720 });
  });
}

export function VideoJoiner() {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.type.startsWith("video/"));
    setFiles((prev) => [...prev, ...arr]);
    setError("");
    setStatus("");
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveFile(from: number, to: number) {
    setFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function handleJoin() {
    if (files.length < 2) {
      setError("Cần ít nhất 2 video để ghép.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      setStatus("Đang phân tích độ phân giải video đầu tiên...");
      const { width, height } = await probeVideoSize(files[0]);
      const w = width % 2 === 0 ? width : width - 1;
      const h = height % 2 === 0 ? height : height - 1;

      setStatus("Đang nạp bộ xử lý FFmpeg...");
      const ffmpeg = await loadSharedFfmpeg();
      const offProgress = ffmpeg.on("progress", ({ progress: p }) => {
        setProgress(Math.min(100, Math.round(p * 100)));
      });

      const names: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setStatus(`Đang ghi tệp ${i + 1}/${files.length} vào bộ nhớ xử lý...`);
        const ext = (files[i].name.split(".").pop() || "mp4").toLowerCase();
        const name = `clip${i}.${ext}`;
        await ffmpeg.writeFile(name, await fetchFile(files[i]));
        names.push(name);
      }

      const inputArgs = names.flatMap((n) => ["-i", n]);
      const filterParts: string[] = [];
      const concatInputs: string[] = [];
      names.forEach((_, i) => {
        filterParts.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`);
        filterParts.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
        concatInputs.push(`[v${i}][a${i}]`);
      });
      const filterComplex = `${filterParts.join(";")};${concatInputs.join("")}concat=n=${names.length}:v=1:a=1[outv][outa]`;

      setStatus("Đang ghép video...");
      const exitCode = await ffmpeg.exec([
        ...inputArgs,
        "-filter_complex", filterComplex,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac",
        "out.mp4"
      ]);
      if (exitCode !== 0) {
        throw new Error("FFmpeg ghép video thất bại. Hãy thử với các video có định dạng phổ biến hơn (MP4/H.264).");
      }

      const data = await ffmpeg.readFile("out.mp4");
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      downloadBlob(blob, "ghep_video.mp4");
      setStatus(`Hoàn tất! Đã ghép ${names.length} video và tải xuống.`);

      for (const n of names) await ffmpeg.deleteFile(n).catch(() => {});
      await ffmpeg.deleteFile("out.mp4").catch(() => {});
      offProgress?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi ghép video.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-page">
      <h1><Combine size={22} /> Ghép Video</h1>
      <p className="tool-subtitle">
        Ghép nhiều video thành một, xử lý trực tiếp trên trình duyệt bằng FFmpeg WebAssembly. Kéo để sắp xếp lại thứ tự trước khi ghép.
      </p>

      <div className="tool-dropzone" onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <UploadCloud size={30} />
        <div className="tool-drop-title">Kéo thả nhiều video vào đây hoặc bấm để chọn</div>
        <div className="tool-drop-hint">Có thể chọn nhiều file cùng lúc</div>
        <input ref={inputRef} type="file" accept="video/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="tool-card">
          <div className="tool-clip-list">
            {files.map((f, idx) => (
              <div key={`${f.name}-${idx}`} className="tool-clip-item"
                draggable
                onDragStart={() => { dragIndex.current = idx; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIndex.current !== null) { moveFile(dragIndex.current, idx); dragIndex.current = null; } }}>
                <GripVertical size={14} style={{ cursor: "grab", color: "var(--muted)" }} />
                <span className="tool-clip-index">{idx + 1}</span>
                <span className="tool-clip-name">{f.name}</span>
                <span className="tool-file-meta">{formatBytes(f.size)}</span>
                <button className="tool-icon-btn" onClick={() => removeFile(idx)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <div className="tool-row">
            <button className="tool-btn" onClick={handleJoin} disabled={busy || files.length < 2}>
              <Combine size={15} /> {busy ? `Đang ghép (${progress}%)` : `Ghép ${files.length} video`}
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
