"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Music, UploadCloud, X, Scissors } from "lucide-react";
import { formatBytes, formatDuration, downloadBlob } from "@/lib/ffmpegLoader";
import { audioBufferToWav, audioBufferToMp3, getAudioContextCtor } from "@/lib/audioEncode";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import "./tool-page.css";

export function AudioCutter() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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
      const arrBuf = await f.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrBuf);
      setBuffer(decoded);
      setDuration(decoded.duration);
      setStart(0);
      setEnd(decoded.duration);
      setStatus("");
    } catch (err) {
      setError("Không thể giải mã tệp âm thanh này.");
      setFile(null);
    }
  }

  async function handleCut() {
    if (!buffer) return;
    if (end <= start) {
      setError("Thời điểm kết thúc phải sau thời điểm bắt đầu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ctx = ctxRef.current!;
      const sampleRate = buffer.sampleRate;
      const startSample = Math.floor(start * sampleRate);
      const endSample = Math.floor(end * sampleRate);
      const frameCount = endSample - startSample;
      const trimmed = ctx.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        trimmed.copyToChannel(buffer.getChannelData(c).subarray(startSample, endSample), c);
      }

      setStatus(format === "mp3" ? "Đang mã hoá MP3..." : "Đang xuất WAV...");
      const blob = format === "mp3" ? await audioBufferToMp3(trimmed) : audioBufferToWav(trimmed);
      downloadBlob(blob, `cat_${file!.name.replace(/\.[^.]+$/, "")}.${format}`);
      setStatus(`Hoàn tất! Đã tải xuống đoạn dài ${formatDuration(end - start)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi cắt nhạc.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setBuffer(null);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="tool-page">
      <h1><Music size={22} /> Cắt &amp; Biên Tập Nhạc</h1>
      <p className="tool-subtitle">
        Cắt đoạn nhạc mong muốn và xuất MP3/WAV — xử lý hoàn toàn bằng Web Audio API ngay trên trình duyệt của bạn.
      </p>

      {!file ? (
        <div className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] ?? null); }}>
          <UploadCloud size={30} />
          <div className="tool-drop-title">Kéo thả tệp nhạc vào đây hoặc bấm để chọn</div>
          <div className="tool-drop-hint">Hỗ trợ MP3, WAV, M4A, OGG...</div>
          <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </div>
      ) : (
        <div className="tool-card">
          {buffer && (
            <audio ref={audioRef} src={fileUrl ?? undefined} controls style={{ width: "100%", marginBottom: 14 }} />
          )}
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">{formatBytes(file.size)} · {formatDuration(duration)}</span>
            <button className="tool-icon-btn" onClick={reset} title="Bỏ chọn"><X size={16} /></button>
          </div>

          {buffer && (
            <>
              <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 4px" }}>
                Kéo thanh trượt chỉ để chọn nhanh — để cắt chính xác, hãy tạm dừng nhạc ở đúng vị trí rồi bấm &quot;Đặt tại đây&quot;, hoặc gõ thẳng số giây.
              </p>
              <div className="tool-row">
                <div className="tool-field">
                  <label>Bắt đầu ({formatDuration(start)})</label>
                  <input type="range" min={0} max={duration} step={0.01} value={start}
                    onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.1))} />
                  <div className="tool-precise-row">
                    <input type="number" min={0} max={Math.max(0, end - 0.1)} step={0.1}
                      value={Number(start.toFixed(2))}
                      onChange={(e) => setStart(Math.max(0, Math.min(Number(e.target.value) || 0, end - 0.1)))} />
                    <span className="tool-precise-unit">giây</span>
                    <button type="button" className="tool-btn tool-btn-secondary tool-mark-btn"
                      onClick={() => { if (audioRef.current) setStart(Math.min(audioRef.current.currentTime, end - 0.1)); }}>
                      Đặt tại đây
                    </button>
                  </div>
                </div>
                <div className="tool-field">
                  <label>Kết thúc ({formatDuration(end)})</label>
                  <input type="range" min={0} max={duration} step={0.01} value={end}
                    onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.1))} />
                  <div className="tool-precise-row">
                    <input type="number" min={start + 0.1} max={duration} step={0.1}
                      value={Number(end.toFixed(2))}
                      onChange={(e) => setEnd(Math.max(start + 0.1, Math.min(Number(e.target.value) || 0, duration)))} />
                    <span className="tool-precise-unit">giây</span>
                    <button type="button" className="tool-btn tool-btn-secondary tool-mark-btn"
                      onClick={() => { if (audioRef.current) setEnd(Math.max(audioRef.current.currentTime, start + 0.1)); }}>
                      Đặt tại đây
                    </button>
                  </div>
                </div>
              </div>

              <div className="tool-row">
                <div className="tool-field">
                  <label>Định dạng đầu ra</label>
                  <select value={format} onChange={(e) => setFormat(e.target.value as "mp3" | "wav")}>
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                  </select>
                </div>
              </div>

              <div className="tool-row">
                <button className="tool-btn" onClick={handleCut} disabled={busy}>
                  <Scissors size={15} /> {busy ? "Đang xử lý..." : "Cắt và tải xuống"}
                </button>
              </div>
            </>
          )}

          {status && !error && <div className="tool-status-ok">{status}</div>}
          {error && <div className="tool-status-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
