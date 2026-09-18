"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, UploadCloud, X, Zap, Target } from "lucide-react";
import { fetchFile } from "@ffmpeg/util";
import { loadSharedFfmpeg, formatBytes, formatDuration, downloadBlob } from "@/lib/ffmpegLoader";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import { makeFilmstrip } from "@/lib/mediaThumbs";
import { useTrimPlayer } from "@/lib/useTrimPlayer";
import { safeFilename } from "@/lib/filename";
import { ProgressBar } from "./ProgressBar";
import { TrimBar } from "./TrimBar";
import "./tool-page.css";

export function VideoCutter() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [precise, setPrecise] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [loop, setLoop] = useState(true);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Memoized so re-renders (dragging handles, progress updates...) never recreate the blob URL.
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const player = useTrimPlayer(videoRef, { start, end }, loop);

  // Filmstrip of video frames behind the trim handles.
  useEffect(() => {
    if (!fileUrl || duration <= 0) return;
    let cancelled = false;
    setThumbs([]);
    makeFilmstrip(fileUrl, duration, Math.min(24, Math.max(8, Math.ceil(duration / 2))), 64, () => cancelled)
      .then((frames) => { if (!cancelled) setThumbs(frames); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fileUrl, duration]);

  function handleFile(f: File | null) {
    if (!f) return;
    setError("");
    setStatus("");
    setDuration(0);
    setFile(f);
  }

  function onLoadedMetadata() {
    const d = videoRef.current?.duration || 0;
    if (!Number.isFinite(d) || d <= 0) return;
    setDuration(d);
    setStart(0);
    setEnd(d);
  }

  async function handleCut() {
    if (!file) return;
    if (end <= start) {
      setError("Thời điểm kết thúc phải sau thời điểm bắt đầu.");
      return;
    }
    videoRef.current?.pause();
    setBusy(true);
    setError("");
    setProgress(0);
    setStatus("Đang nạp bộ xử lý FFmpeg...");
    let offProgress: (() => void) | undefined;
    try {
      const ffmpeg = await loadSharedFfmpeg();
      const handler = ({ progress: p }: { progress: number }) => setProgress(Math.min(100, Math.max(0, Math.round(p * 100))));
      ffmpeg.on("progress", handler);
      offProgress = () => ffmpeg.off("progress", handler);

      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const inName = `in.${ext}`;
      const outName = `out.${ext === "mov" ? "mp4" : ext}`;

      setStatus("Đang ghi tệp vào bộ nhớ xử lý...");
      await ffmpeg.writeFile(inName, await fetchFile(file));

      setStatus(removeMode ? "Đang xóa đoạn đã chọn và nối lại..." : precise ? "Đang cắt chính xác (mã hoá lại)..." : "Đang cắt nhanh...");
      // "Remove" keeps [0,start] + [end,duration] and joins them; that always needs a re-encode.
      const buildRemoveArgs = (withAudio: boolean) => {
        const before = start > 0.05;
        const after = end < duration - 0.05;
        let graph = "";
        const v: string[] = [];
        const a: string[] = [];
        if (before) {
          graph += `[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[v0];`;
          v.push("[v0]");
          if (withAudio) { graph += `[0:a]atrim=start=0:end=${start},asetpts=PTS-STARTPTS[a0];`; a.push("[a0]"); }
        }
        if (after) {
          graph += `[0:v]trim=start=${end},setpts=PTS-STARTPTS[v1];`;
          v.push("[v1]");
          if (withAudio) { graph += `[0:a]atrim=start=${end},asetpts=PTS-STARTPTS[a1];`; a.push("[a1]"); }
        }
        const parts = v.map((label, i) => label + (withAudio ? a[i] : "")).join("");
        graph += `${parts}concat=n=${v.length}:v=1:a=${withAudio ? 1 : 0}[vout]${withAudio ? "[aout]" : ""}`;
        return ["-i", inName, "-filter_complex", graph, "-map", "[vout]", ...(withAudio ? ["-map", "[aout]", "-c:a", "aac"] : []), "-c:v", "libx264", "-preset", "veryfast", "-threads", "1", "-pix_fmt", "yuv420p", outName];
      };
      if (removeMode && start <= 0.05 && end >= duration - 0.05) throw new Error("Bạn đang chọn toàn bộ video để xóa. Hãy thu hẹp vùng chọn.");
      const args = removeMode
        ? buildRemoveArgs(true)
        : precise
        ? ["-i", inName, "-ss", String(start), "-to", String(end), "-c:v", "libx264", "-preset", "veryfast", "-threads", "1", "-c:a", "aac", outName]
        : ["-ss", String(start), "-to", String(end), "-i", inName, "-c", "copy", outName];

      let exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0 && removeMode) exitCode = await ffmpeg.exec(buildRemoveArgs(false)); // source has no audio track
      if (exitCode !== 0) throw new Error("FFmpeg xử lý thất bại. Hãy thử chế độ cắt chính xác.");

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      const base = file.name.replace(/\.[^.]+$/, "");
      downloadBlob(blob, safeFilename(`${base} (cắt)`, outName.split(".").pop() || "mp4"));
      setStatus(`Hoàn tất! Đã tải xuống video dài ${formatDuration(removeMode ? duration - (end - start) : end - start)}.`);

      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(outName).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi cắt video.");
    } finally {
      offProgress?.();
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setThumbs([]);
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="tool-page">
      <h1><Scissors size={22} /> Cắt Video</h1>
      <p className="tool-subtitle">
        Kéo hai đầu vàng để chọn đoạn cần giữ, xem trước ngay, tinh chỉnh từng 0,1 giây. Xử lý hoàn toàn trên thiết bị của bạn, không tải file lên máy chủ.
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
          <video
            ref={videoRef}
            src={fileUrl ?? undefined}
            playsInline
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onClick={player.toggle}
            className="tool-video-preview vc-video"
          />
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">{formatBytes(file.size)} · {formatDuration(duration)}</span>
            <button className="tool-icon-btn" onClick={reset} title="Bỏ chọn" disabled={busy}><X size={16} /></button>
          </div>

          <div className="cut-keep" role="radiogroup" aria-label="Kiểu cắt">
            <button type="button" role="radio" aria-checked={!removeMode} className={!removeMode ? "is-active" : ""} onClick={() => setRemoveMode(false)} disabled={busy}>Giữ đoạn đã chọn</button>
            <button type="button" role="radio" aria-checked={removeMode} className={removeMode ? "is-active is-remove" : ""} onClick={() => setRemoveMode(true)} disabled={busy}>Xóa đoạn đã chọn</button>
          </div>

          <TrimBar
            duration={duration}
            start={start}
            end={end}
            onChange={(s, e) => { setStart(s); setEnd(e); }}
            current={player.current}
            onSeek={player.seek}
            playing={player.playing}
            onTogglePlay={player.toggle}
            loop={loop}
            onLoopChange={setLoop}
            thumbs={thumbs}
            mode={removeMode ? "remove" : "keep"}
            disabled={duration <= 0 || busy}
          />

          {!removeMode && (
          <div className="cut-mode" role="radiogroup" aria-label="Chế độ cắt">
            <button type="button" role="radio" aria-checked={!precise} className={!precise ? "is-active" : ""} onClick={() => setPrecise(false)} disabled={busy}>
              <Zap size={16} />
              <span><strong>Cắt nhanh</strong><small>Giữ nguyên chất lượng, xong trong vài giây. Có thể lệch vài khung hình.</small></span>
            </button>
            <button type="button" role="radio" aria-checked={precise} className={precise ? "is-active" : ""} onClick={() => setPrecise(true)} disabled={busy}>
              <Target size={16} />
              <span><strong>Cắt chính xác</strong><small>Đúng từng khung hình. Mã hoá lại nên chậm hơn.</small></span>
            </button>
          </div>
          )}

          <div className="tool-row">
            <button className="tool-btn" onClick={handleCut} disabled={busy || duration <= 0}>
              <Scissors size={15} /> {busy ? `Đang xử lý (${progress}%)` : "Cắt và tải xuống"}
            </button>
          </div>

          {busy && <ProgressBar percent={progress} label={status} />}
          {status && !error && !busy && <div className="tool-status-ok">{status}</div>}
          {error && <div className="tool-status-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
