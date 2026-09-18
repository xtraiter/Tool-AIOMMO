"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, UploadCloud, X, Zap } from "lucide-react";
import { formatBytes, formatDuration, downloadBlob } from "@/lib/ffmpegLoader";
import { audioBufferToWav, audioBufferToMp3, getAudioContextCtor } from "@/lib/audioEncode";
import { ProgressBar } from "./ProgressBar";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import "./tool-page.css";

const PRESETS = [100, 150, 200, 300, 500];

export function VolumeAmplifier() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState(0);
  const [percent, setPercent] = useState(200);
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => { if (fileUrl) URL.revokeObjectURL(fileUrl); };
  }, [fileUrl]);

  async function handleFile(f: File | null) {
    if (!f) return;
    setError("");
    setStatus("Đang giải mã âm thanh...");
    setFile(f);
    try {
      const ctx = ctxRef.current ?? new (getAudioContextCtor())();
      ctxRef.current = ctx;
      const decoded = await ctx.decodeAudioData(await f.arrayBuffer());
      setBuffer(decoded);
      setDuration(decoded.duration);
      setStatus("");
    } catch {
      setError("Không thể giải mã tệp âm thanh này.");
      setFile(null);
    }
  }

  async function handleAmplify() {
    if (!buffer) return;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const gain = percent / 100;
      const ctx = ctxRef.current!;
      const boosted = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const src = buffer.getChannelData(c);
        const dst = boosted.getChannelData(c);
        for (let i = 0; i < src.length; i++) {
          dst[i] = Math.max(-1, Math.min(1, src[i] * gain));
        }
      }

      setStatus(format === "mp3" ? "Đang mã hoá MP3..." : "Đang xuất WAV...");
      setProgress(format === "mp3" ? 1 : 50);
      const blob = format === "mp3" ? await audioBufferToMp3(boosted, 192, setProgress) : audioBufferToWav(boosted);
      downloadBlob(blob, `tang_am_luong_${percent}pc_${file!.name.replace(/\.[^.]+$/, "")}.${format}`);
      setStatus(`Hoàn tất! Đã tăng âm lượng lên ${percent}%.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi xử lý âm lượng.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setBuffer(null);
    setDuration(0);
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="tool-page">
      <h1><Volume2 size={22} /> Tăng Âm Lượng 500%</h1>
      <p className="tool-subtitle">
        Khuếch đại âm lượng file nhạc/audio quá nhỏ, xử lý bằng Web Audio API ngay trên trình duyệt. Lưu ý: tăng quá cao có thể gây rè/vỡ tiếng.
      </p>

      {!file ? (
        <div className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] ?? null); }}>
          <UploadCloud size={30} />
          <div className="tool-drop-title">Kéo thả tệp âm thanh vào đây hoặc bấm để chọn</div>
          <div className="tool-drop-hint">Hỗ trợ MP3, WAV, M4A, OGG...</div>
          <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </div>
      ) : (
        <div className="tool-card">
          {buffer && <audio src={fileUrl ?? undefined} controls style={{ width: "100%", marginBottom: 14 }} />}
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">{formatBytes(file.size)} · {formatDuration(duration)}</span>
            <button className="tool-icon-btn" onClick={reset} title="Bỏ chọn"><X size={16} /></button>
          </div>

          {buffer && (
            <>
              <div className="tool-row" style={{ gap: 8 }}>
                {PRESETS.map((p) => (
                  <button key={p} className={`tool-btn ${percent === p ? "" : "tool-btn-secondary"}`} style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => setPercent(p)}>
                    {p}%
                  </button>
                ))}
              </div>

              <div className="tool-row">
                <div className="tool-field">
                  <label>Mức âm lượng tuỳ chỉnh ({percent}%)</label>
                  <input type="range" min={100} max={800} step={10} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
                </div>
                <div className="tool-field" style={{ maxWidth: 140 }}>
                  <label>Định dạng ra</label>
                  <select value={format} onChange={(e) => setFormat(e.target.value as "mp3" | "wav")}>
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                  </select>
                </div>
              </div>

              <div className="tool-row">
                <button className="tool-btn" onClick={handleAmplify} disabled={busy}>
                  <Zap size={15} /> {busy ? "Đang xử lý..." : `Tăng lên ${percent}% và tải xuống`}
                </button>
              </div>
            </>
          )}

          {busy && <ProgressBar percent={progress} label={status || "Đang xử lý..."} />}
          {status && !error && !busy && <div className="tool-status-ok">{status}</div>}
          {error && <div className="tool-status-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
