"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Music, UploadCloud, X, Scissors } from "lucide-react";
import { formatBytes, formatDuration, downloadBlob } from "@/lib/ffmpegLoader";
import { audioBufferToWav, audioBufferToMp3, getAudioContextCtor } from "@/lib/audioEncode";
import { computePeaks } from "@/lib/mediaThumbs";
import { useTrimPlayer } from "@/lib/useTrimPlayer";
import { safeFilename } from "@/lib/filename";
import { ProgressBar } from "./ProgressBar";
import { TrimBar } from "./TrimBar";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import { useTr } from "@/lib/i18n";
import "./tool-page.css";

const BITRATES = [320, 256, 192, 128];

export function AudioCutter() {
  const tr = useTr();
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [removeMode, setRemoveMode] = useState(false);
  const [loop, setLoop] = useState(true);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const [bitrate, setBitrate] = useState(192);
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const player = useTrimPlayer(audioRef, { start, end }, loop);

  async function handleFile(f: File | null) {
    if (!f) return;
    setError("");
    setStatus(tr("Đang giải mã âm thanh...", "Decoding audio..."));
    setFile(f);
    try {
      const ctx = ctxRef.current ?? new (getAudioContextCtor())();
      ctxRef.current = ctx;
      const decoded = await ctx.decodeAudioData(await f.arrayBuffer());
      setBuffer(decoded);
      setPeaks(computePeaks(decoded, 1200));
      setDuration(decoded.duration);
      setStart(0);
      setEnd(decoded.duration);
      setStatus("");
    } catch {
      setError(tr("Không thể giải mã tệp âm thanh này.", "This audio file could not be decoded."));
      setFile(null);
      setStatus("");
    }
  }

  async function handleCut() {
    if (!buffer) return;
    if (end <= start) {
      setError(tr("Thời điểm kết thúc phải sau thời điểm bắt đầu.", "The end time must be after the start time."));
      return;
    }
    if (removeMode && start <= 0.02 && end >= duration - 0.02) {
      setError(tr("Bạn đang chọn toàn bộ bài để xóa. Hãy thu hẹp vùng chọn.", "You selected the whole track to remove. Narrow the selection."));
      return;
    }
    audioRef.current?.pause();
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const ctx = ctxRef.current!;
      const sr = buffer.sampleRate;
      const a = Math.floor(start * sr);
      const b = Math.min(buffer.length, Math.floor(end * sr));
      // Keep: [a,b). Remove: [0,a) + [b,length).
      const segments: [number, number][] = removeMode ? [[0, a], [b, buffer.length]] : [[a, b]];
      const frames = segments.reduce((n, [x, y]) => n + Math.max(0, y - x), 0);
      const out = ctx.createBuffer(buffer.numberOfChannels, frames, sr);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const src = buffer.getChannelData(c);
        const dst = out.getChannelData(c);
        let off = 0;
        for (const [x, y] of segments) {
          if (y <= x) continue;
          dst.set(src.subarray(x, y), off);
          off += y - x;
        }
        // Fades (linear) so the cut does not click.
        const fi = Math.min(frames, Math.floor(fadeIn * sr));
        const fo = Math.min(frames, Math.floor(fadeOut * sr));
        for (let i = 0; i < fi; i++) dst[i] *= i / fi;
        for (let i = 0; i < fo; i++) dst[frames - 1 - i] *= i / fo;
      }

      setStatus(format === "mp3" ? tr("Đang mã hoá MP3...", "Encoding MP3...") : tr("Đang xuất WAV...", "Exporting WAV..."));
      setProgress(format === "mp3" ? 1 : 50);
      const blob = format === "mp3" ? await audioBufferToMp3(out, bitrate, setProgress) : audioBufferToWav(out);
      const base = file!.name.replace(/\.[^.]+$/, "");
      downloadBlob(blob, safeFilename(`${base} (${tr("cắt", "cut")})`, format));
      setStatus(tr(`Hoàn tất! Đã tải xuống đoạn nhạc dài ${formatDuration(out.duration)}.`, `Done! Downloaded a ${formatDuration(out.duration)} clip.`));
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Có lỗi xảy ra khi cắt nhạc.", "Something went wrong while cutting the audio."));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setBuffer(null);
    setPeaks([]);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setFadeIn(0);
    setFadeOut(0);
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const resultLength = removeMode ? duration - (end - start) : end - start;

  return (
    <div className="tool-page">
      <h1><Music size={22} /> {tr("Cắt & Biên Tập Nhạc", "Cut & Edit Audio")}</h1>
      <p className="tool-subtitle">
        {tr("Nhìn sóng âm, kéo hai đầu vàng để chọn đoạn, nghe thử ngay, tinh chỉnh từng 0,1 giây. Xử lý hoàn toàn trên thiết bị của bạn.", "See the waveform, drag the two gold handles to pick a part, listen instantly and fine-tune by 0.1 s. Everything runs on your device.")}
      </p>

      {!file ? (
        <div className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] ?? null); }}>
          <UploadCloud size={30} />
          <div className="tool-drop-title">{tr("Kéo thả tệp nhạc vào đây hoặc bấm để chọn", "Drop an audio file here or click to choose")}</div>
          <div className="tool-drop-hint">{tr("Hỗ trợ MP3, WAV, M4A, OGG...", "Supports MP3, WAV, M4A, OGG...")}</div>
          <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </div>
      ) : (
        <div className="tool-card">
          <audio ref={audioRef} src={fileUrl ?? undefined} preload="metadata" />
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">{formatBytes(file.size)} · {formatDuration(duration)}</span>
            <button className="tool-icon-btn" onClick={reset} title={tr("Bỏ chọn", "Remove file")} disabled={busy}><X size={16} /></button>
          </div>

          {buffer && (
            <>
              <div className="cut-keep" role="radiogroup" aria-label={tr("Kiểu cắt", "Cut type")}>
                <button type="button" role="radio" aria-checked={!removeMode} className={!removeMode ? "is-active" : ""} onClick={() => setRemoveMode(false)} disabled={busy}>{tr("Giữ đoạn đã chọn", "Keep selection")}</button>
                <button type="button" role="radio" aria-checked={removeMode} className={removeMode ? "is-active is-remove" : ""} onClick={() => setRemoveMode(true)} disabled={busy}>{tr("Xóa đoạn đã chọn", "Remove selection")}</button>
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
                peaks={peaks}
                mode={removeMode ? "remove" : "keep"}
                disabled={busy}
              />

              <div className="tool-row">
                <div className="tool-field">
                  <label>{tr("Mờ dần vào", "Fade in")}: {fadeIn.toFixed(1)} {tr("giây", "s")}</label>
                  <input type="range" min={0} max={10} step={0.5} value={fadeIn} onChange={(e) => setFadeIn(Number(e.target.value))} disabled={busy} style={{ accentColor: "var(--accent)" }} />
                </div>
                <div className="tool-field">
                  <label>{tr("Mờ dần ra", "Fade out")}: {fadeOut.toFixed(1)} {tr("giây", "s")}</label>
                  <input type="range" min={0} max={10} step={0.5} value={fadeOut} onChange={(e) => setFadeOut(Number(e.target.value))} disabled={busy} style={{ accentColor: "var(--accent)" }} />
                </div>
              </div>

              <div className="tool-row">
                <div className="tool-field">
                  <label>{tr("Định dạng đầu ra", "Output format")}</label>
                  <select value={format} onChange={(e) => setFormat(e.target.value as "mp3" | "wav")} disabled={busy}>
                    <option value="mp3">MP3</option>
                    <option value="wav">{tr("WAV (không nén)", "WAV (uncompressed)")}</option>
                  </select>
                </div>
                {format === "mp3" && (
                  <div className="tool-field">
                    <label>{tr("Chất lượng MP3", "MP3 quality")}</label>
                    <select value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))} disabled={busy}>
                      {BITRATES.map((b) => <option key={b} value={b}>{b} kbps</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="tool-row">
                <button className="tool-btn" onClick={handleCut} disabled={busy}>
                  <Scissors size={15} /> {busy ? tr("Đang xử lý...", "Processing...") : tr(`Cắt và tải xuống (${formatDuration(resultLength)})`, `Cut and download (${formatDuration(resultLength)})`)}
                </button>
              </div>
            </>
          )}

          {busy && <ProgressBar percent={progress} label={status || tr("Đang xử lý...", "Processing...")} />}
          {status && !error && !busy && <div className="tool-status-ok">{status}</div>}
          {error && <div className="tool-status-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
