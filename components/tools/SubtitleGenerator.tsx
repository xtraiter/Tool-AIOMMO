"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, UploadCloud } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { toVtt, type Segment } from "@/lib/asr/format";
import { Transcriber } from "./asr/Transcriber";
import "./tool-page.css";

export function SubtitleGenerator() {
  const tr = useTr();
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState("");
  const [vtt, setVtt] = useState("");

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (!segments.length) { setVtt(""); return; }
    const u = URL.createObjectURL(new Blob([toVtt(segments)], { type: "text/vtt" }));
    setVtt(u);
    return () => URL.revokeObjectURL(u);
  }, [segments]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (!/^(video|audio)\//.test(f.type) && !/\.(mp4|mov|mkv|webm|mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name)) {
      setError(tr("Hãy chọn tệp video hoặc âm thanh.", "Choose a video or audio file."));
      return;
    }
    setError("");
    setSegments([]);
    if (url) URL.revokeObjectURL(url);
    setFile(f);
    setUrl(URL.createObjectURL(f));
  };

  const onSegments = useCallback((s: Segment[]) => setSegments(s), []);
  const onSeek = useCallback((t: number) => {
    const m = mediaRef.current;
    if (m) { m.currentTime = t; m.play().catch(() => {}); }
  }, []);
  const isVideo = useMemo(() => !!file && (file.type.startsWith("video/") || /\.(mp4|mov|mkv|webm)$/i.test(file.name)), [file]);

  return (
    <div className="tool-page">
      <h1><Captions size={22} /> {tr("AI Tự Động Tạo Phụ Đề", "AI Auto Subtitles")}</h1>
      <p className="tool-subtitle">
        {tr(
          "Chọn video hoặc file âm thanh, AI nghe và tạo phụ đề có mốc thời gian. Sửa chữ sai rồi tải SRT/VTT. Chạy ngay trên máy bạn, không tải file lên đâu cả.",
          "Choose a video or audio file and the AI listens and writes timed subtitles. Fix any wrong words, then download SRT/VTT. Runs on your device — nothing is uploaded."
        )}
      </p>

      {!file ? (
        <div className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null); }}>
          <UploadCloud size={30} />
          <div className="tool-drop-title">{tr("Kéo thả video/âm thanh vào đây hoặc bấm để chọn", "Drop a video/audio file here or click to choose")}</div>
          <div className="tool-drop-hint">MP4, MOV, WebM, MP3, WAV, M4A...</div>
        </div>
      ) : (
        <div className="tool-card">
          {isVideo ? (
            <video ref={mediaRef} src={url} controls playsInline className="tool-video-preview">
              {vtt && <track key={vtt} kind="subtitles" src={vtt} srcLang="vi" label={tr("Phụ đề AI", "AI subtitles")} default />}
            </video>
          ) : (
            <audio ref={mediaRef as unknown as React.RefObject<HTMLAudioElement>} src={url} controls style={{ width: "100%" }} />
          )}
          <div className="tool-file-row"><span>{file.name}</span>
            <button type="button" className="tool-btn tool-btn-secondary" style={{ marginLeft: "auto", padding: "6px 12px" }} onClick={() => { setFile(null); setSegments([]); }}>{tr("Đổi tệp", "Change file")}</button>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="video/*,audio/*" hidden onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {error && <div className="tool-status-error">{error}</div>}

      <Transcriber source={file} name={file ? file.name.replace(/\.[^.]+$/, "") : ""} onSegments={onSegments} onSeek={onSeek} />
    </div>
  );
}
