"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Repeat, ZoomIn, ZoomOut, Maximize2, Crosshair, SkipBack, SkipForward } from "lucide-react";
import { fmtTime, parseTime, clamp } from "@/lib/timeFormat";
import { useTr } from "@/lib/i18n";
import "./trim-bar.css";

type Props = {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  current: number;
  onSeek: (t: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  loop: boolean;
  onLoopChange: (v: boolean) => void;
  /** Video frames (filmstrip) shown behind the selection. */
  thumbs?: string[];
  /** Audio waveform peaks (0..1) shown behind the selection. */
  peaks?: number[];
  /** "remove" = the selection is what gets cut away (shown in red, outside stays bright). */
  mode?: "keep" | "remove";
  disabled?: boolean;
};

const MIN_GAP = 0.1;
const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
/** Zoom 1 = the whole file fills half the view, so it stays fully visible wherever the playhead is. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 160;

function TimeChip({
  label, value, active, onFocusChip, onCommit,
}: {
  label: string; value: number; active: boolean; onFocusChip: () => void; onCommit: (t: number) => void;
}) {
  const [text, setText] = useState(fmtTime(value, 2));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(fmtTime(value, 2)); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const t = parseTime(text);
    if (t !== null) onCommit(t); else setText(fmtTime(value, 2));
  };
  return (
    <div className={`trim-chip${active ? " is-active" : ""}`} onPointerDown={onFocusChip}>
      <span className="trim-card-label">{label}</span>
      <input
        className="trim-time-input"
        inputMode="decimal"
        value={text}
        onFocus={(e) => { onFocusChip(); setEditing(true); e.currentTarget.select(); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        aria-label={label}
      />
    </div>
  );
}

/**
 * Range trimmer with a fixed centre playhead (like the timeline editor / CapCut): the track scrolls
 * underneath it, so the red line always sits exactly on the current frame and zooming never jumps.
 */
export function TrimBar({
  duration, start, end, onChange, current, onSeek, playing, onTogglePlay, loop, onLoopChange, thumbs, peaks, mode = "keep", disabled,
}: Props) {
  const tr = useTr();
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(320);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [scrollX, setScrollX] = useState(0);
  const [active, setActive] = useState<"start" | "end">("start");
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  /** scrollLeft we set ourselves, so the resulting scroll event isn't mistaken for the user scrubbing. */
  const lastSet = useRef(-1);
  /** While a handle drag or a seek animation runs, the track must not follow `current`. */
  const hold = useRef(false);
  const anim = useRef(0);
  const drag = useRef<{ which: "start" | "end"; offset: number } | null>(null);
  const pan = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const pinch = useRef<{ pointers: Map<number, number>; startDist: number; startZoom: number } | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth || 320));
    ro.observe(el);
    setViewW(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);

  const pad = viewW / 2;
  const pps = duration > 0 ? (Math.max(80, pad - 24) / duration) * zoom : 1;
  const ppsRef = useRef(pps);
  ppsRef.current = pps;

  const setScroll = useCallback((x: number) => {
    const el = scrollRef.current;
    if (!el) return;
    lastSet.current = x;
    el.scrollLeft = x;
  }, []);

  // The track follows the playhead (playback, seeking, zooming, resizing) — no auto-zoom, no paging.
  useLayoutEffect(() => {
    if (hold.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = current * pps;
    if (Math.abs(el.scrollLeft - x) >= 0.5) setScroll(x);
  }, [current, pps, viewW, setScroll]);

  /** Smoothly brings time `t` under the playhead (used after a tap or a handle drag). */
  const glideTo = useCallback((t: number) => {
    const el = scrollRef.current;
    if (!el) return;
    cancelAnimationFrame(anim.current);
    const from = el.scrollLeft;
    const to = t * ppsRef.current;
    if (Math.abs(to - from) < 1) { hold.current = false; setScroll(to); return; }
    hold.current = true;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 220);
      setScroll(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) anim.current = requestAnimationFrame(step);
      else hold.current = false;
    };
    anim.current = requestAnimationFrame(step);
  }, [setScroll]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const raf = useRef(0);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setScrollX(el.scrollLeft); });
    if (hold.current || Math.abs(el.scrollLeft - lastSet.current) < 1.6) return; // our own scroll
    lastSet.current = el.scrollLeft;
    if (playingRef.current) onTogglePlay(); // scrubbing pauses, like any editor
    onSeek(clamp(el.scrollLeft / ppsRef.current, 0, duration));
  };

  const applyZoom = useCallback((next: number) => setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM)), []);

  // Ctrl/⌘ + wheel zooms around the playhead; a plain vertical wheel scrubs. Needs a non-passive listener.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), MIN_ZOOM, MAX_ZOOM));
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const timeAt = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp((clientX - rect.left - pad) / ppsRef.current, 0, duration);
  }, [pad, duration]);

  const setStart = (t: number) => { const s = clamp(t, 0, end - MIN_GAP); onChange(s, end); return s; };
  const setEnd = (t: number) => { const e = clamp(t, start + MIN_GAP, duration); onChange(start, e); return e; };

  // ---- start/end handles: the track stays still while dragging, then glides the handle under the playhead ----
  const beginDrag = (which: "start" | "end", e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (playingRef.current) onTogglePlay();
    cancelAnimationFrame(anim.current);
    hold.current = true;
    setActive(which);
    setDragging(which);
    drag.current = { which, offset: timeAt(e.clientX) - (which === "start" ? start : end) };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const t = timeAt(e.clientX) - d.offset;
    onSeek(d.which === "start" ? setStart(t) : setEnd(t));
  };
  const endDrag = () => {
    if (!drag.current) return;
    const t = drag.current.which === "start" ? start : end;
    drag.current = null;
    setDragging(null);
    glideTo(t);
  };

  const onKey = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      const delta = (e.key === "ArrowLeft" ? -1 : 1) * step;
      onSeek(which === "start" ? setStart(start + delta) : setEnd(end + delta));
    }
  };

  // Shortcuts on the focused timeline: Space play/pause, ←/→ step, I/O set in/out (Premiere-style), Home/End.
  const onTimelineKey = (e: React.KeyboardEvent) => {
    if (disabled || e.target !== e.currentTarget) return;
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); onTogglePlay(); }
    else if (k === "arrowleft" || k === "arrowright") { e.preventDefault(); onSeek(clamp(current + (k === "arrowleft" ? -1 : 1) * (e.shiftKey ? 1 : 0.1), 0, duration)); }
    else if (k === "i") { e.preventDefault(); setActive("start"); setStart(current); }
    else if (k === "o") { e.preventDefault(); setActive("end"); setEnd(current); }
    else if (k === "home") { e.preventDefault(); onSeek(start); }
    else if (k === "end") { e.preventDefault(); onSeek(end); }
    else if (k === "+" || k === "=") { e.preventDefault(); applyZoom(zoom * 1.5); }
    else if (k === "-") { e.preventDefault(); applyZoom(zoom / 1.5); }
  };

  // ---- track: mouse drag pans (scrubs), a tap seeks there, two fingers pinch-zoom ----
  const onTrackDown = (e: React.PointerEvent) => {
    if (disabled) return;
    if (e.pointerType === "touch") {
      const p = pinch.current ?? { pointers: new Map(), startDist: 0, startZoom: zoom };
      p.pointers.set(e.pointerId, e.clientX);
      if (p.pointers.size === 2) {
        const [a, b] = [...p.pointers.values()];
        p.startDist = Math.abs(a - b) || 1;
        p.startZoom = zoom;
        pan.current = null;
      }
      pinch.current = p;
    }
    if (!pinch.current || pinch.current.pointers.size < 2) {
      pan.current = { x: e.clientX, left: scrollRef.current!.scrollLeft, moved: false, id: e.pointerId };
      if (e.pointerType === "mouse") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onTrackMove = (e: React.PointerEvent) => {
    const p = pinch.current;
    if (p && p.pointers.has(e.pointerId)) {
      p.pointers.set(e.pointerId, e.clientX);
      if (p.pointers.size === 2 && p.startDist > 0) {
        const [a, b] = [...p.pointers.values()];
        applyZoom(p.startZoom * (Math.abs(a - b) / p.startDist));
      }
    }
    const pn = pan.current;
    if (!pn || pn.id !== e.pointerId) return;
    if (Math.abs(e.clientX - pn.x) > 4) pn.moved = true;
    // Touch pans natively (touch-action: pan-x); the mouse pans here.
    if (pn.moved && e.pointerType === "mouse") scrollRef.current!.scrollLeft = pn.left - (e.clientX - pn.x);
  };
  const onTrackUp = (e: React.PointerEvent) => {
    const p = pinch.current;
    if (p) { p.pointers.delete(e.pointerId); if (p.pointers.size === 0) pinch.current = null; }
    const pn = pan.current;
    pan.current = null;
    if (pn && pn.id === e.pointerId && !pn.moved && e.type === "pointerup") {
      const t = timeAt(e.clientX);
      onSeek(t);
      glideTo(t);
    }
  };

  const contentW = viewW + duration * pps;
  const visFrom = Math.max(0, (scrollX - pad - 200) / pps);
  const visTo = (scrollX + pad + 200) / pps;

  const { major, minor } = useMemo(() => {
    const m = STEPS.find((s) => s * pps >= 56) ?? STEPS[STEPS.length - 1];
    return { major: m, minor: m / (m >= 1 && m % 5 === 0 ? 5 : m >= 1 && m % 2 === 0 ? 4 : 5) };
  }, [pps]);
  const ticks: number[] = [];
  for (let t = Math.floor(visFrom / major) * major; t <= Math.min(duration, visTo) + 1e-6; t += major) if (t >= 0) ticks.push(t);

  const wave = useMemo(() => {
    if (!peaks || peaks.length === 0) return "";
    let d = "";
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1.5, peaks[i] * 46);
      d += `M${i} ${50 - h}V${50 + h}`;
    }
    return d;
  }, [peaks]);

  const x0 = pad;
  const dragT = dragging === "start" ? start : dragging === "end" ? end : null;

  return (
    <div className={`trim${disabled ? " is-disabled" : ""}${mode === "remove" ? " is-remove" : ""}`}>
      <div className="trim-transport">
        <button type="button" className="trim-iconbtn" onClick={() => onSeek(start)} disabled={disabled} aria-label={tr("Về điểm bắt đầu", "Go to start point")} title={tr("Về điểm bắt đầu (Home)", "Go to start point (Home)")}>
          <SkipBack size={17} />
        </button>
        <button type="button" className="trim-play" onClick={onTogglePlay} disabled={disabled} aria-label={playing ? tr("Tạm dừng", "Pause") : tr("Phát đoạn đã chọn", "Play selection")}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
          <span>{playing ? tr("Tạm dừng", "Pause") : mode === "remove" ? tr("Nghe đoạn sẽ xóa", "Preview removed part") : tr("Phát đoạn chọn", "Play selection")}</span>
        </button>
        <button type="button" className="trim-iconbtn" onClick={() => onSeek(end)} disabled={disabled} aria-label={tr("Tới điểm kết thúc", "Go to end point")} title={tr("Tới điểm kết thúc (End)", "Go to end point (End)")}>
          <SkipForward size={17} />
        </button>
        <button type="button" className={`trim-loop${loop ? " is-on" : ""}`} onClick={() => onLoopChange(!loop)} aria-pressed={loop} title={tr("Lặp lại đoạn đã chọn", "Loop the selection")}>
          <Repeat size={16} /> <span>{tr("Lặp", "Loop")}</span>
        </button>
        <span className="trim-clock" aria-live="off">
          {fmtTime(current, 2)} <em>/ {fmtTime(duration, 2)}</em>
        </span>
      </div>

      <div className="trim-view">
        <div
          className="trim-scroll"
          ref={scrollRef}
          onScroll={onScroll}
          tabIndex={0}
          onKeyDown={onTimelineKey}
          aria-label={tr("Dòng thời gian — Space: phát/dừng, ←/→: tua, I/O: đặt đầu/cuối", "Timeline — Space: play/pause, ←/→: step, I/O: set in/out")}
        >
          <div
            className="trim-track"
            ref={trackRef}
            style={{ width: contentW }}
            onPointerDown={onTrackDown}
            onPointerMove={onTrackMove}
            onPointerUp={onTrackUp}
            onPointerCancel={onTrackUp}
          >
            <div
              className="trim-ruler"
              style={{
                left: x0,
                width: duration * pps,
                backgroundSize: `${minor * pps}px 5px`,
              }}
            >
              {ticks.map((t) => (
                <span key={t} style={{ left: t * pps }}>{fmtTime(t, major < 1 ? 1 : 0)}</span>
              ))}
            </div>

            <div className="trim-strip" style={{ left: x0, width: duration * pps }}>
              {thumbs && thumbs.length > 0 && (
                <div className="trim-thumbs">
                  {thumbs.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" draggable={false} />
                  ))}
                </div>
              )}
              {wave && (
                <svg className="trim-wave" viewBox={`0 0 ${peaks!.length} 100`} preserveAspectRatio="none" aria-hidden>
                  <path d={wave} />
                </svg>
              )}
              <div className="trim-dim" style={{ left: 0, width: start * pps }} />
              <div className="trim-dim" style={{ left: end * pps, width: Math.max(0, (duration - end) * pps) }} />
              <div className="trim-frame" style={{ left: start * pps, width: Math.max(2, (end - start) * pps) }} />

              {(["start", "end"] as const).map((which) => {
                const t = which === "start" ? start : end;
                return (
                  <div
                    key={which}
                    className={`trim-handle is-${which}${active === which ? " is-active" : ""}`}
                    role="slider"
                    tabIndex={0}
                    aria-label={which === "start" ? tr("Điểm bắt đầu", "Start point") : tr("Điểm kết thúc", "End point")}
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={t}
                    aria-valuetext={fmtTime(t, 2)}
                    style={{ left: t * pps }}
                    onPointerDown={(e) => beginDrag(which, e)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onFocus={() => setActive(which)}
                    onKeyDown={onKey(which)}
                  ><i /></div>
                );
              })}
              {dragT !== null && (
                <div className="trim-drag-tip" style={{ left: dragT * pps }}>{fmtTime(dragT, 2)}</div>
              )}
            </div>
          </div>
        </div>
        <div className={`trim-playhead${dragging ? " is-faded" : ""}`} aria-hidden>
          <span className="trim-playhead-time">{fmtTime(current, 2)}</span>
        </div>
      </div>

      <div className="trim-zoom">
        <button type="button" onClick={() => applyZoom(zoom / 1.6)} disabled={zoom <= MIN_ZOOM} aria-label={tr("Thu nhỏ", "Zoom out")}><ZoomOut size={16} /></button>
        <input type="range" min={0} max={100} value={Math.round((Math.log(zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)) * 100)} onChange={(e) => applyZoom(MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, Number(e.target.value) / 100))} aria-label={tr("Phóng to thanh thời gian", "Zoom the timeline")} />
        <button type="button" onClick={() => applyZoom(zoom * 1.6)} disabled={zoom >= MAX_ZOOM} aria-label={tr("Phóng to", "Zoom in")}><ZoomIn size={16} /></button>
        <button type="button" onClick={() => applyZoom(MIN_ZOOM)} aria-label={tr("Vừa khung", "Fit to view")} title={tr("Vừa khung", "Fit to view")}><Maximize2 size={15} /></button>
        <span className="trim-zoom-hint">{tr("Kéo hoặc lăn chuột để tua · Ctrl + lăn để phóng to · Space phát · I/O đặt đầu/cuối", "Drag or scroll to scrub · Ctrl + scroll to zoom · Space play · I/O set in/out")}</span>
      </div>

      <div className="trim-panel">
        <div className="trim-chips">
          <TimeChip label={tr("Bắt đầu", "Start")} value={start} active={active === "start"} onFocusChip={() => setActive("start")} onCommit={(t) => onSeek(setStart(t))} />
          <TimeChip label={tr("Kết thúc", "End")} value={end} active={active === "end"} onFocusChip={() => setActive("end")} onCommit={(t) => onSeek(setEnd(t))} />
        </div>
        <p className="trim-target">
          {tr("Đang chỉnh", "Adjusting")}: <strong>{active === "start" ? tr("điểm bắt đầu", "start point") : tr("điểm kết thúc", "end point")}</strong>
          <span>{mode === "remove" ? tr("Đoạn bị xóa", "Removed part") : tr("Đoạn giữ lại", "Kept part")}: <b>{fmtTime(end - start, 2)}</b></span>
        </p>
        <div className="trim-nudge">
          {[-1, -0.1, 0.1, 1].map((d) => (
            <button key={d} type="button" onClick={() => onSeek(active === "start" ? setStart(start + d) : setEnd(end + d))} aria-label={`${d < 0 ? tr("Lùi", "Back") : tr("Tiến", "Forward")} ${Math.abs(d)} ${tr("giây", "s")}`}>
              {d > 0 ? "+" : "−"}{Math.abs(d)}s
            </button>
          ))}
        </div>
        <div className="trim-actions">
          <button type="button" className="trim-sethere" onClick={() => (active === "start" ? setStart(current) : setEnd(current))}>
            <Crosshair size={14} /> {active === "start" ? tr("Đặt bắt đầu tại vạch đỏ (I)", "Set start at playhead (I)") : tr("Đặt kết thúc tại vạch đỏ (O)", "Set end at playhead (O)")}
          </button>
          <button type="button" className="trim-sethere" onClick={() => onChange(0, duration)}>{tr("Chọn toàn bộ", "Select all")}</button>
        </div>
      </div>
    </div>
  );
}
