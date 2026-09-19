"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Plus, Film, Image as ImageIcon, Music, Type } from "lucide-react";
import { fmtTime } from "@/lib/timeFormat";
import { LANE_ORDER, end, type Clip, type Lane, type Media, type Project } from "./model";

export type TimelineHandle = {
  /** Moves the fixed playhead to time t by scrolling the timeline underneath it. */
  setTime: (t: number) => void;
};

export type TimelineApi = {
  begin: () => void;
  finish: () => void;
  moveFree: (id: string, start: number) => void;
  reorderMain: (id: string, index: number) => void;
  trimLeft: (id: string, t: number) => void;
  trimRight: (id: string, t: number) => void;
};

type Props = {
  project: Project;
  media: Map<string, Media>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  pps: number;
  onScrubTo: (t: number) => void;
  api: TimelineApi;
  timeRef: React.MutableRefObject<number>;
  onAdd: () => void;
  emptyHint: string;
  addLabel: string;
};

const LANE_H: Record<Lane, number> = { overlay: 44, text: 36, main: 64, audio: 44 };
const LANE_ICON = { overlay: ImageIcon, text: Type, main: Film, audio: Music } as const;
const SNAP_PX = 8;

const tickStep = (pps: number) => [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s * pps >= 70) ?? 600;

function Waveform({ peaks, from, to, duration }: { peaks: number[]; from: number; to: number; duration: number }) {
  const d = useMemo(() => {
    if (!peaks.length || duration <= 0) return "";
    const a = Math.max(0, Math.floor((from / duration) * peaks.length));
    const b = Math.min(peaks.length, Math.ceil((to / duration) * peaks.length));
    const step = Math.max(1, Math.floor((b - a) / 300));
    let path = "";
    for (let i = a; i < b; i += step) path += `M${i - a} ${50 - Math.max(2, peaks[i] * 44)}V${50 + Math.max(2, peaks[i] * 44)}`;
    return path;
  }, [peaks, from, to, duration]);
  if (!d) return null;
  const n = Math.max(1, Math.ceil(((to - from) / duration) * peaks.length));
  return (
    <svg className="te-wave" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden>
      <path d={d} />
    </svg>
  );
}

type ClipViewProps = {
  clip: Clip;
  media?: Media;
  selected: boolean;
  pps: number;
  pad: number;
  visFrom: number;
  visTo: number;
  offsetPx: number;
  onPointerDown: (e: React.PointerEvent, clip: Clip, mode: "body" | "left" | "right") => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
};

const ClipView = memo(function ClipView({ clip, media, selected, pps, pad, visFrom, visTo, offsetPx, onPointerDown, onPointerMove, onPointerUp }: ClipViewProps) {
  const left = pad + clip.start * pps;
  const width = Math.max(4, clip.dur * pps);
  const h = LANE_H[clip.lane];

  // Filmstrip tiles are only rendered for the part of the clip that is on screen.
  const tiles: React.ReactNode[] = [];
  if (media && (clip.kind === "video" || clip.kind === "image")) {
    const tileW = Math.round(h * 1.6);
    const first = Math.max(0, Math.floor(((visFrom - clip.start) * pps) / tileW));
    const last = Math.min(Math.ceil(width / tileW), Math.ceil(((visTo - clip.start) * pps) / tileW));
    for (let i = first; i < last; i++) {
      let src = media.url;
      if (clip.kind === "video") {
        if (!media.thumbs.length) continue;
        const srcT = clip.srcIn + ((i * tileW) / pps) * clip.speed;
        src = media.thumbs[Math.min(media.thumbs.length - 1, Math.max(0, Math.floor((srcT / Math.max(0.01, media.duration)) * media.thumbs.length)))];
      }
      // eslint-disable-next-line @next/next/no-img-element
      tiles.push(<img key={i} src={src} alt="" draggable={false} style={{ left: i * tileW, width: tileW }} />);
    }
  }

  const Icon = LANE_ICON[clip.lane];
  return (
    <div
      className={`te-clip te-clip--${clip.lane}${selected ? " is-selected" : ""}`}
      style={{ left, width, height: h, transform: offsetPx ? `translateX(${offsetPx}px)` : undefined, zIndex: selected ? 5 : 1 }}
      data-clip={clip.id}
      onPointerDown={(e) => onPointerDown(e, clip, "body")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {tiles.length > 0 && <div className="te-tiles">{tiles}</div>}
      {media && clip.kind === "audio" && (
        <Waveform peaks={media.peaks} from={clip.srcIn} to={clip.srcIn + clip.dur * clip.speed} duration={media.duration} />
      )}
      <span className="te-clip-label">
        <Icon size={12} />
        {clip.kind === "text" ? clip.text || "…" : clip.name}
        {clip.speed !== 1 && <em>{clip.speed}x</em>}
      </span>
      <span className="te-clip-dur">{fmtTime(clip.dur, 1)}</span>
      {selected && (
        <>
          <div className="te-handle is-left" onPointerDown={(e) => onPointerDown(e, clip, "left")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}><i /></div>
          <div className="te-handle is-right" onPointerDown={(e) => onPointerDown(e, clip, "right")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}><i /></div>
        </>
      )}
    </div>
  );
});

export const TimelineView = memo(forwardRef<TimelineHandle, Props>(function TimelineView(
  { project, media, selectedId, onSelect, pps, onScrubTo, api, timeRef, onAdd, emptyHint, addLabel },
  ref
) {
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const lastSet = useRef(-100);
  const [viewW, setViewW] = useState(360);
  const [scrollX, setScrollX] = useState(0);
  const [dragOffset, setDragOffset] = useState<{ id: string; px: number } | null>(null);
  const drag = useRef<null | {
    id: string; mode: "body" | "left" | "right"; startX: number; origStart: number; origDur: number; lane: Lane; moved: boolean; pointerId: number; touch: boolean; wasSelected: boolean;
  }>(null);
  const proj = useRef(project);
  proj.current = project;
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const pad = viewW / 2;
  const padRef = useRef(pad);
  padRef.current = pad;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth || 360));
    ro.observe(el);
    setViewW(el.clientWidth || 360);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    setTime(t: number) {
      const el = scroller.current;
      if (!el) return;
      const x = t * ppsRef.current;
      lastSet.current = x;
      el.scrollLeft = x;
    },
  }));

  // Keep the same moment under the playhead when zoom or layout changes.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    lastSet.current = timeRef.current * pps;
    el.scrollLeft = timeRef.current * pps;
  }, [pps, viewW, timeRef]);

  const raf = useRef(0);
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setScrollX(el.scrollLeft); });
    if (Math.abs(el.scrollLeft - lastSet.current) < 1.6) return; // our own programmatic scroll
    onScrubTo(el.scrollLeft / ppsRef.current);
  }, [onScrubTo]);

  const duration = useMemo(() => project.clips.reduce((m, c) => Math.max(m, end(c)), 0), [project]);
  const contentW = pad * 2 + duration * pps;
  const visFrom = Math.max(0, (scrollX - 400) / pps);
  const visTo = (scrollX + viewW + 400) / pps;

  const timeAtX = (clientX: number) => {
    const r = inner.current!.getBoundingClientRect();
    return (clientX - r.left - padRef.current) / ppsRef.current;
  };

  const snap = (t: number, excludeId: string | null) => {
    const th = SNAP_PX / ppsRef.current;
    let best = t;
    let bestD = th;
    const cands = [0, timeRef.current];
    for (const c of proj.current.clips) if (c.id !== excludeId) cands.push(c.start, end(c));
    for (const c of cands) { const d = Math.abs(c - t); if (d < bestD) { bestD = d; best = c; } }
    return best;
  };

  const onPointerDown = useCallback((e: React.PointerEvent, clip: Clip, mode: "body" | "left" | "right") => {
    if (mode !== "body") e.stopPropagation();
    const touch = e.pointerType !== "mouse";
    const wasSelected = clip.id === selectedIdRef.current;
    if (!touch) onSelect(clip.id);
    // Touch: an unselected clip only selects on tap so a swipe keeps scrolling the timeline.
    if (touch && !wasSelected && mode === "body") { drag.current = { id: clip.id, mode, startX: e.clientX, origStart: clip.start, origDur: clip.dur, lane: clip.lane, moved: false, pointerId: e.pointerId, touch, wasSelected }; return; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: clip.id, mode, startX: e.clientX, origStart: clip.start, origDur: clip.dur, lane: clip.lane, moved: false, pointerId: e.pointerId, touch, wasSelected };
  }, [onSelect]);

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.touch && !d.wasSelected && d.mode === "body") { return; }
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 3) return;
    if (!d.moved) { d.moved = true; api.begin(); }
    const P = ppsRef.current;
    const clip = proj.current.clips.find((c) => c.id === d.id);
    if (!clip) return;

    if (d.mode === "left") { api.trimLeft(d.id, snap(timeAtX(e.clientX), d.id)); return; }
    if (d.mode === "right") { api.trimRight(d.id, snap(timeAtX(e.clientX), d.id)); return; }

    if (d.lane === "main") {
      const center = d.origStart + d.origDur / 2 + dx / P;
      const others = proj.current.clips.filter((c) => c.lane === "main" && c.id !== d.id).sort((a, b) => a.start - b.start);
      const index = others.filter((c) => c.start + c.dur / 2 < center).length;
      api.reorderMain(d.id, index);
      const now = proj.current.clips.find((c) => c.id === d.id)!;
      setDragOffset({ id: d.id, px: (center - (now.start + now.dur / 2)) * P });
    } else {
      let s = d.origStart + dx / P;
      const a = snap(s, d.id);
      const b = snap(s + d.origDur, d.id) - d.origDur;
      s = Math.abs(a - s) <= Math.abs(b - s) ? a : b;
      api.moveFree(d.id, s);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragOffset(null);
    if (d.moved) { api.finish(); return; }
    if (e.type === "pointerup") onSelect(d.id); // plain tap
  }, [api, onSelect]);

  // Click on the ruler / empty lane space seeks (desktop); dragging empty space with the mouse scrolls.
  const bgDrag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onBgDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("[data-clip]")) return;
    bgDrag.current = { x: e.clientX, left: scroller.current!.scrollLeft, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBgMove = (e: React.PointerEvent) => {
    const b = bgDrag.current;
    if (!b) return;
    if (Math.abs(e.clientX - b.x) > 3) b.moved = true;
    scroller.current!.scrollLeft = b.left - (e.clientX - b.x);
  };
  const onBgUp = (e: React.PointerEvent) => {
    const b = bgDrag.current;
    bgDrag.current = null;
    if (b && !b.moved && (e.target as HTMLElement).closest("[data-clip]") === null) {
      const t = Math.max(0, timeAtX(e.clientX));
      onSelect(null);
      onScrubTo(t);
      lastSet.current = t * ppsRef.current;
      scroller.current!.scrollLeft = t * ppsRef.current;
    }
  };

  const step = tickStep(pps);
  const ticks: number[] = [];
  for (let t = Math.floor(visFrom / step) * step; t <= Math.min(duration + step, visTo); t += step) if (t >= 0) ticks.push(t);

  const mainEnd = project.clips.filter((c) => c.lane === "main").reduce((m, c) => Math.max(m, end(c)), 0);

  return (
    <div className="te-tl">
      <div className="te-tl-scroll" ref={scroller} onScroll={onScroll}>
        <div
          className="te-tl-inner"
          ref={inner}
          style={{ width: contentW }}
          onPointerDown={onBgDown}
          onPointerMove={onBgMove}
          onPointerUp={onBgUp}
          onPointerCancel={onBgUp}
        >
          <div className="te-ruler">
            {ticks.map((t) => (
              <span key={t} style={{ left: pad + t * pps }}>{fmtTime(t, step < 1 ? 1 : 0)}</span>
            ))}
          </div>
          {LANE_ORDER.map((lane) => (
            <div key={lane} className={`te-lane te-lane--${lane}`} style={{ height: LANE_H[lane] }}>
              {project.clips.filter((c) => c.lane === lane).map((c) => (
                <ClipView
                  key={c.id}
                  clip={c}
                  media={c.mediaId ? media.get(c.mediaId) : undefined}
                  selected={c.id === selectedId}
                  pps={pps}
                  pad={pad}
                  visFrom={visFrom}
                  visTo={visTo}
                  offsetPx={dragOffset?.id === c.id ? dragOffset.px : 0}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                />
              ))}
              {lane === "main" && (
                <button type="button" className="te-add" style={{ left: pad + mainEnd * pps + 10 }} onClick={onAdd} aria-label={addLabel}>
                  <Plus size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="te-playhead" aria-hidden><b /></div>
      {project.clips.length === 0 && <div className="te-tl-empty">{emptyHint}</div>}
    </div>
  );
}));
