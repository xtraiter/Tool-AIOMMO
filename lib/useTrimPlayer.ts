"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives a <video>/<audio> element for the trimmer: exposes the current time (smoothly, via rAF while
 * playing), and plays only the selected range, optionally looping it.
 */
export function useTrimPlayer(
  mediaRef: React.RefObject<HTMLMediaElement | null>,
  range: { start: number; end: number },
  loop: boolean
) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rangeRef = useRef(range);
  const loopRef = useRef(loop);
  rangeRef.current = range;
  loopRef.current = loop;

  const seek = useCallback((t: number) => {
    const el = mediaRef.current;
    if (!el) return;
    const time = Math.max(0, t);
    el.currentTime = time;
    setCurrent(time);
  }, [mediaRef]);

  const toggle = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (!el.paused) { el.pause(); return; }
    const { start, end } = rangeRef.current;
    if (el.currentTime < start - 0.02 || el.currentTime >= end - 0.05) el.currentTime = start;
    el.play().catch(() => {});
  }, [mediaRef]);

  // The <video>/<audio> usually mounts after the hook (it only renders once a file is chosen), so track the element itself.
  const [el, setEl] = useState<HTMLMediaElement | null>(null);
  useEffect(() => { if (mediaRef.current !== el) setEl(mediaRef.current); });

  useEffect(() => {
    if (!el) return;
    let raf = 0;
    const tick = () => {
      const { start, end } = rangeRef.current;
      let t = el.currentTime;
      if (!el.paused && t >= end) {
        if (loopRef.current) { el.currentTime = start; t = start; }
        else { el.pause(); el.currentTime = end; t = end; }
      }
      setCurrent(t);
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); setCurrent(el.currentTime); };
    const onSeek = () => setCurrent(el.currentTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("seeked", onSeek);
    el.addEventListener("timeupdate", onSeek);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("seeked", onSeek);
      el.removeEventListener("timeupdate", onSeek);
    };
  }, [el]);

  return { current, playing, seek, toggle };
}
