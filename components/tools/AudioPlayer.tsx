"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { fmtTime } from "@/lib/timeFormat";
import "./audio-player.css";

const RATES = [0.75, 1, 1.25, 1.5, 2];

/** Compact player with play/pause, seek bar, speed and volume. Always stops when unmounted. */
export function AudioPlayer({ src, duration: knownDuration }: { src: string; duration?: number }) {
  const tr = useTr();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(knownDuration ?? 0);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const scrubbing = useRef(false);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => { if (!scrubbing.current) setTime(a.currentTime); };
    const onMeta = () => {
      if (Number.isFinite(a.duration)) { setDur(a.duration); return; }
      // MediaRecorder files report an infinite length until the end has been read once.
      a.currentTime = 1e101;
      const fix = () => { a.removeEventListener("timeupdate", fix); if (Number.isFinite(a.duration)) setDur(a.duration); a.currentTime = 0; };
      a.addEventListener("timeupdate", fix);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setTime(0); a.currentTime = 0; };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", () => Number.isFinite(a.duration) && setDur(a.duration));
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
    };
  }, [src]);

  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate, src]);
  useEffect(() => { if (ref.current) { ref.current.volume = volume; ref.current.muted = muted; } }, [volume, muted, src]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };
  const seekTo = (t: number) => { const a = ref.current; if (a) { a.currentTime = t; setTime(t); } };
  const total = dur || knownDuration || 0;

  return (
    <div className="ap" role="group" aria-label={tr("Trình phát âm thanh", "Audio player")}>
      <audio ref={ref} src={src} preload="metadata" />
      <button type="button" className="ap-play" onClick={toggle} aria-label={playing ? tr("Tạm dừng", "Pause") : tr("Phát", "Play")}>
        {playing ? <Pause size={22} /> : <Play size={22} />}
      </button>
      <div className="ap-main">
        <input
          type="range" min={0} max={total || 1} step={0.01} value={Math.min(time, total || 1)}
          onPointerDown={() => { scrubbing.current = true; }}
          onPointerUp={() => { scrubbing.current = false; }}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label={tr("Tua", "Seek")}
          style={{ ["--p" as string]: `${total ? (time / total) * 100 : 0}%` }}
        />
        <div className="ap-row">
          <span className="ap-time">{fmtTime(time, 1)} <em>/ {fmtTime(total, 1)}</em></span>
          <div className="ap-tools">
            <button type="button" onClick={() => seekTo(0)} aria-label={tr("Về đầu", "Restart")}><RotateCcw size={15} /></button>
            <button type="button" className="ap-rate" onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])} aria-label={tr("Tốc độ phát", "Playback speed")}>{rate}x</button>
            <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? tr("Bật tiếng", "Unmute") : tr("Tắt tiếng", "Mute")}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
            <input className="ap-vol" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} aria-label={tr("Âm lượng", "Volume")} />
          </div>
        </div>
      </div>
    </div>
  );
}
