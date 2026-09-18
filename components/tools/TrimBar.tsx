"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Repeat, ZoomIn, ZoomOut, Maximize2, Crosshair } from "lucide-react";
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

export function TrimBar({
  duration, start, end, onChange, current, onSeek, playing, onTogglePlay, loop, onLoopChange, thumbs, peaks, mode = "keep", disabled,
}: Props) {
  const tr = useTr();
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [active, setActive] = useState<"start" | "end">("start");
  const pendingCenter = useRef<number | null>(null);
  const drag = useRef<{ which: "start" | "end" | "head"; offset: number } | null>(null);
  const tap = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const pinch = useRef<{ pointers: Map<number, number>; startDist: number; startZoom: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(Math.max(200, el.clientWidth - 32)));
    ro.observe(el);
    setViewW(Math.max(200, el.clientWidth - 32));
    return () => ro.disconnect();
  }, []);

  const trackW = viewW * zoom;
  const pps = duration > 0 ? trackW / duration : 1;

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return clamp((clientX - rect.left) / pps, 0, duration);
    },
    [pps, duration]
  );

  const applyZoom = useCallback((next: number) => {
    const el = scrollRef.current;
    const z = clamp(next, 1, 80);
    if (el && duration > 0) pendingCenter.current = (el.scrollLeft + el.clientWidth / 2 - 16) / pps;
    setZoom(z);
  }, [pps, duration]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pendingCenter.current !== null) {
      el.scrollLeft = pendingCenter.current * pps + 16 - el.clientWidth / 2;
      pendingCenter.current = null;
    }
  }, [zoom, pps]);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing || zoom <= 1) return;
    const x = current * pps + 16;
    if (x < el.scrollLeft + 30 || x > el.scrollLeft + el.clientWidth - 30) el.scrollLeft = x - el.clientWidth / 2;
  }, [current, playing, pps, zoom]);

  const setStart = (t: number) => { const s = clamp(t, 0, end - MIN_GAP); onChange(s, end); return s; };
  const setEnd = (t: number) => { const e = clamp(t, start + MIN_GAP, duration); onChange(start, e); return e; };

  // ---- handle / playhead dragging (pointer capture keeps the drag alive off-element, mouse or touch) ----
  const beginDrag = (which: "start" | "end" | "head", e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (which !== "head") setActive(which);
    const base = which === "start" ? start : which === "end" ? end : current;
    drag.current = { which, offset: timeAt(e.clientX) - base };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const t = timeAt(e.clientX) - d.offset;
    if (d.which === "start") onSeek(setStart(t));
    else if (d.which === "end") onSeek(setEnd(t));
    else onSeek(clamp(t, 0, duration));
  };
  const endDrag = () => { drag.current = null; };

  const onKey = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = (e.key === "ArrowLeft" ? -1 : 1) * step;
      const t = which === "start" ? setStart(start + delta) : setEnd(end + delta);
      onSeek(t);
    }
  };

  // ---- tap on the track = seek; two fingers = pinch zoom ----
  const onTrackDown = (e: React.PointerEvent) => {
    if (disabled) return;
    if (e.pointerType === "touch") {
      const p = pinch.current ?? { pointers: new Map(), startDist: 0, startZoom: zoom };
      p.pointers.set(e.pointerId, e.clientX);
      if (p.pointers.size === 2) {
        const [a, b] = [...p.pointers.values()];
        p.startDist = Math.abs(a - b) || 1;
        p.startZoom = zoom;
        tap.current = null;
      }
      pinch.current = p;
    }
    tap.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
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
    if (tap.current && Math.abs(e.clientX - tap.current.x) > 8) tap.current = null;
  };
  const onTrackUp = (e: React.PointerEvent) => {
    const p = pinch.current;
    if (p) { p.pointers.delete(e.pointerId); if (p.pointers.size === 0) pinch.current = null; }
    const tp = tap.current;
    tap.current = null;
    if (tp && tp.id === e.pointerId && performance.now() - tp.t < 500 && Math.abs(e.clientX - tp.x) < 8) {
      onSeek(timeAt(e.clientX));
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      applyZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8));
    }
  };

  const ticks = useMemo(() => {
    const step = STEPS.find((s) => s * pps >= 64) ?? STEPS[STEPS.length - 1];
    const out: { t: number; label: string }[] = [];
    for (let t = 0; t <= duration + 1e-6; t += step) out.push({ t, label: fmtTime(t, step < 1 ? 1 : 0) });
    return out;
  }, [pps, duration]);

  const wave = useMemo(() => {
    if (!peaks || peaks.length === 0) return "";
    let d = "";
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1.5, peaks[i] * 46);
      d += `M${i} ${50 - h}V${50 + h}`;
    }
    return d;
  }, [peaks]);

  return (
    <div className={`trim${disabled ? " is-disabled" : ""}${mode === "remove" ? " is-remove" : ""}`}>
      <div className="trim-transport">
        <button type="button" className="trim-play" onClick={onTogglePlay} disabled={disabled} aria-label={playing ? tr("Tạm dừng", "Pause") : tr("Phát đoạn đã chọn", "Play selection")}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
          <span>{playing ? tr("Tạm dừng", "Pause") : mode === "remove" ? tr("Nghe đoạn sẽ xóa", "Preview removed part") : tr("Phát đoạn chọn", "Play selection")}</span>
        </button>
        <button type="button" className={`trim-loop${loop ? " is-on" : ""}`} onClick={() => onLoopChange(!loop)} aria-pressed={loop} title={tr("Lặp lại đoạn đã chọn", "Loop the selection")}>
          <Repeat size={16} /> <span>{tr("Lặp", "Loop")}</span>
        </button>
        <span className="trim-clock" aria-live="off">
          {fmtTime(current, 1)} <em>/ {fmtTime(duration, 1)}</em>
        </span>
      </div>

      <div className="trim-scroll" ref={scrollRef} onWheel={onWheel}>
        <div
          className="trim-track"
          ref={trackRef}
          style={{ width: trackW }}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerCancel={onTrackUp}
        >
          <div className="trim-ruler">
            {ticks.map((k) => (
              <span key={k.t} style={{ left: k.t * pps }}>{k.label}</span>
            ))}
          </div>

          <div className="trim-strip">
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

            <div
              className="trim-handle is-start"
              role="slider"
              tabIndex={0}
              aria-label={tr("Điểm bắt đầu", "Start point")}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={start}
              aria-valuetext={fmtTime(start, 2)}
              style={{ left: start * pps }}
              onPointerDown={(e) => beginDrag("start", e)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKey("start")}
            ><i /></div>
            <div
              className="trim-handle is-end"
              role="slider"
              tabIndex={0}
              aria-label={tr("Điểm kết thúc", "End point")}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={end}
              aria-valuetext={fmtTime(end, 2)}
              style={{ left: end * pps }}
              onPointerDown={(e) => beginDrag("end", e)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKey("end")}
            ><i /></div>
          </div>

          <div
            className="trim-head"
            style={{ left: current * pps }}
            onPointerDown={(e) => beginDrag("head", e)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <b />
          </div>
        </div>
      </div>

      <div className="trim-zoom">
        <button type="button" onClick={() => applyZoom(zoom / 1.6)} disabled={zoom <= 1} aria-label={tr("Thu nhỏ", "Zoom out")}><ZoomOut size={16} /></button>
        <input type="range" min={0} max={100} value={Math.round((Math.log(zoom) / Math.log(80)) * 100)} onChange={(e) => applyZoom(Math.pow(80, Number(e.target.value) / 100))} aria-label={tr("Phóng to thanh thời gian", "Zoom the timeline")} />
        <button type="button" onClick={() => applyZoom(zoom * 1.6)} disabled={zoom >= 80} aria-label={tr("Phóng to", "Zoom in")}><ZoomIn size={16} /></button>
        <button type="button" onClick={() => applyZoom(1)} aria-label={tr("Vừa khung", "Fit to view")}><Maximize2 size={15} /></button>
        <span className="trim-zoom-hint">{tr("Chụm 2 ngón hoặc Ctrl + lăn chuột để phóng to", "Pinch with two fingers or Ctrl + scroll to zoom")}</span>
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
            <Crosshair size={14} /> {active === "start" ? tr("Đặt bắt đầu tại vị trí đang xem", "Set start at playhead") : tr("Đặt kết thúc tại vị trí đang xem", "Set end at playhead")}
          </button>
          <button type="button" className="trim-sethere" onClick={() => onChange(0, duration)}>{tr("Chọn toàn bộ", "Select all")}</button>
        </div>
      </div>
    </div>
  );
}
