"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu, Check, Sparkles, X, Copy, Download, Captions, Languages } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { downloadBlob, formatBytes } from "@/lib/ffmpegLoader";
import { safeFilename } from "@/lib/filename";
import { detectDevice, type DeviceInfo } from "@/lib/separation/device";
import { ASR_TIERS, LANGUAGES, type AsrTierId } from "@/lib/asr/models";
import { AsrClient, decodeTo16kMono } from "@/lib/asr/client";
import { clock, toSrt, toTxt, toVtt, type Segment } from "@/lib/asr/format";
import { ProgressBar } from "../ProgressBar";
import "./asr.css";

type Props = {
  /** The audio (or video) to transcribe. */
  source: Blob | null;
  /** Base name for downloaded files. */
  name: string;
  /** Called whenever the (possibly edited) segments change, e.g. to show live captions on a video. */
  onSegments?: (segments: Segment[]) => void;
  /** Called when a segment row is clicked. */
  onSeek?: (t: number) => void;
};

const cacheKey = (id: string) => `asr-cached-${id}`;
const flagged = (id: string) => { try { return localStorage.getItem(cacheKey(id)) === "1"; } catch { return false; } };

export function Transcriber({ source, name, onSegments, onSeek }: Props) {
  const tr = useTr();
  const clientRef = useRef<AsrClient | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [tierId, setTierId] = useState<AsrTierId>("balanced");
  const [lang, setLang] = useState("vi");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number | null; label: string } | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const cancelled = useRef(false);

  const tier = ASR_TIERS.find((t) => t.id === tierId)!;
  const canGpu = !!device?.webgpu;

  useEffect(() => {
    (async () => {
      const d = await detectDevice();
      setDevice(d);
      setTierId(d.mobile || (d.memoryGB !== null && d.memoryGB <= 2) ? "light" : d.webgpu && d.cores >= 8 && (d.memoryGB === null || d.memoryGB >= 8) ? "high" : "balanced");
      setSaved(Object.fromEntries(ASR_TIERS.map((t) => [t.id, flagged(t.id)])));
    })();
    return () => { clientRef.current?.dispose(); clientRef.current = null; };
  }, []);

  useEffect(() => { onSegments?.(segments); }, [segments, onSegments]);
  // A new recording/file invalidates the previous transcript.
  useEffect(() => { setSegments([]); setError(""); setNote(""); }, [source]);

  const run = async () => {
    if (!source) return;
    setBusy(true);
    setError("");
    setNote("");
    setSegments([]);
    cancelled.current = false;
    const client = (clientRef.current ??= new AsrClient());
    try {
      setProgress({ pct: null, label: tr("Đang đọc âm thanh...", "Reading the audio...") });
      const audio = await decodeTo16kMono(source, (s) => s === "ffmpeg" && setProgress({ pct: null, label: tr("Đang tách âm thanh từ video...", "Extracting audio from the video...") }));
      if (audio.length < 16000 * 0.5) throw new Error(tr("Âm thanh quá ngắn hoặc trống.", "The audio is too short or empty."));
      const duration = audio.length / 16000;

      setProgress({ pct: 0, label: tr("Đang chuẩn bị mô hình...", "Preparing the model...") });
      const useGpu = canGpu && tier.device === "webgpu";
      await client.load(tier, useGpu, {
        onDownload: (l, t) => setProgress({ pct: t ? (l / t) * 100 : null, label: saved[tier.id] ? tr("Đang nạp mô hình từ bộ nhớ máy...", "Loading the model from local storage...") : tr(`Đang tải ${tier.modelName}: ${formatBytes(l)} / ${formatBytes(t)}`, `Downloading ${tier.modelName}: ${formatBytes(l)} / ${formatBytes(t)}`) }),
        onNote: (n) => n === "webgpu-failed" && setNote(tr("WebGPU không chạy được trên máy này, đã chuyển sang CPU (chậm hơn).", "WebGPU couldn't start on this device, switched to CPU (slower).")),
      });
      try { localStorage.setItem(cacheKey(tier.id), "1"); } catch { /* private mode */ }
      setSaved((s) => ({ ...s, [tier.id]: true }));
      if (cancelled.current) return;

      const started = Date.now();
      const langName = LANGUAGES.find((l) => l.code === lang)?.name ?? "";
      const res = await client.transcribe(audio, langName, {
        onProgress: (f, segs) => {
          setSegments(segs);
          const elapsed = (Date.now() - started) / 1000;
          const eta = f > 0.03 ? Math.round((elapsed / f) * (1 - f)) : null;
          setProgress({ pct: f * 100, label: tr(`Đang chuyển thành văn bản (${clock(f * duration)} / ${clock(duration)})${eta !== null ? ` · còn ~${eta}s` : ""}`, `Transcribing (${clock(f * duration)} / ${clock(duration)})${eta !== null ? ` · ~${eta}s left` : ""}`) });
        },
      });
      setSegments(res.segments);
      if (res.type === "done" && res.segments.length === 0) setError(tr("Không nhận ra lời nói nào. Hãy thử mô hình cao hơn hoặc kiểm tra lại ngôn ngữ.", "No speech was recognised. Try a higher model or check the language."));
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!cancelled.current) setError(tr("Không chuyển được thành văn bản. ", "Couldn't transcribe. ") + (tier.needsWebGpu ? tr("Hãy thử mức Cân bằng. ", "Try the Balanced level. ") : tr("Hãy thử lại. ", "Please try again. ")) + (msg ? `(${msg.slice(0, 160)})` : ""));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const cancel = () => { cancelled.current = true; clientRef.current?.cancel(); };

  const edit = (i: number, text: string) => setSegments((all) => all.map((s, k) => (k === i ? { ...s, text } : s)));
  const drop = (i: number) => setSegments((all) => all.filter((_, k) => k !== i));

  const save = (kind: "srt" | "vtt" | "txt") => {
    const body = kind === "srt" ? toSrt(segments) : kind === "vtt" ? toVtt(segments) : toTxt(segments);
    const type = kind === "txt" ? "text/plain;charset=utf-8" : kind === "srt" ? "application/x-subrip;charset=utf-8" : "text/vtt;charset=utf-8";
    downloadBlob(new Blob(["﻿", body], { type }), safeFilename(name || tr("Phụ đề", "Subtitles"), kind));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(toTxt(segments)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="asr">
      <div className="tool-card asr-card">
        <h2><Cpu size={16} /> {tr("Chuyển giọng nói thành văn bản (AI)", "Speech to text (AI)")}</h2>
        <div className="asr-tiers" role="radiogroup" aria-label={tr("Chọn mô hình", "Choose a model")}>
          {ASR_TIERS.map((t) => {
            const blocked = t.needsWebGpu && device !== null && !device.webgpu;
            return (
              <button key={t.id} type="button" role="radio" aria-checked={tierId === t.id} className={`asr-tier${tierId === t.id ? " is-on" : ""}`} onClick={() => setTierId(t.id)} disabled={busy}>
                <strong>{tr(t.name, t.nameEn)} {tierId === t.id && <Check size={14} />}</strong>
                <em>{t.modelName} · {formatBytes(t.sizeBytes)}</em>
                <small>{tr(t.tagline, t.taglineEn)}</small>
                <span className={`asr-badge${saved[t.id] ? " is-ok" : blocked ? " is-warn" : ""}`}>
                  {saved[t.id] ? tr("Đã lưu trong máy", "Saved on device") : blocked ? tr("Không có WebGPU – sẽ chạy CPU, rất chậm", "No WebGPU – will run on CPU, very slow") : tr("Tải lần đầu", "Downloads on first use")}
                </span>
              </button>
            );
          })}
        </div>
        <div className="asr-row">
          <label className="asr-lang">
            <span><Languages size={14} /> {tr("Ngôn ngữ trong âm thanh", "Spoken language")}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy}>
              {LANGUAGES.map((l) => <option key={l.code || "auto"} value={l.code}>{tr(l.label, l.labelEn)}</option>)}
            </select>
          </label>
          {!busy ? (
            <button type="button" className="tool-btn asr-go" onClick={run} disabled={!source}><Sparkles size={18} /> {tr("Chuyển thành văn bản", "Transcribe")}</button>
          ) : (
            <button type="button" className="tool-btn tool-btn-danger asr-go" onClick={cancel}><X size={16} /> {tr("Dừng", "Stop")}</button>
          )}
        </div>
        {!source && <p className="asr-hint">{tr("Hãy chọn hoặc ghi âm trước.", "Choose or record audio first.")}</p>}
        {progress && <ProgressBar percent={progress.pct} label={progress.label} />}
        {note && <p className="asr-hint">{note}</p>}
        {error && <div className="tool-status-error">{error}</div>}
      </div>

      {segments.length > 0 && (
        <div className="tool-card asr-card">
          <div className="asr-res-head">
            <h2><Captions size={16} /> {tr("Kết quả", "Result")} <span>{segments.length}</span></h2>
            <div className="asr-res-actions">
              <button type="button" className="tool-btn tool-btn-secondary asr-sm" onClick={copy}><Copy size={14} /> {copied ? tr("Đã chép", "Copied") : tr("Chép", "Copy")}</button>
              <button type="button" className="tool-btn tool-btn-secondary asr-sm" onClick={() => save("txt")} disabled={busy}><Download size={14} /> TXT</button>
              <button type="button" className="tool-btn tool-btn-secondary asr-sm" onClick={() => save("srt")} disabled={busy}><Download size={14} /> SRT</button>
              <button type="button" className="tool-btn tool-btn-secondary asr-sm" onClick={() => save("vtt")} disabled={busy}><Download size={14} /> VTT</button>
            </div>
          </div>
          <ul className="asr-segs">
            {segments.map((s, i) => (
              <li key={i}>
                <button type="button" className="asr-time" onClick={() => onSeek?.(s.start)} title={tr("Nhảy tới đoạn này", "Jump to this line")}>{clock(s.start)}</button>
                <input value={s.text} onChange={(e) => edit(i, e.target.value)} disabled={busy} aria-label={tr("Nội dung đoạn", "Line text")} />
                <button type="button" className="asr-x" onClick={() => drop(i)} disabled={busy} aria-label={tr("Xóa đoạn", "Delete line")}><X size={14} /></button>
              </li>
            ))}
          </ul>
          <p className="asr-hint">{tr("Bạn có thể sửa chữ sai trực tiếp trước khi tải về.", "You can fix any wrong words here before downloading.")}</p>
        </div>
      )}
    </div>
  );
}
