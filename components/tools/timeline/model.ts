/**
 * Data model and pure editing operations for the timeline editor.
 * Everything here is UI-free so it can be unit-tested and shared by the preview, timeline and exporter.
 */

export type Lane = "overlay" | "text" | "main" | "audio";
export type ClipKind = "video" | "image" | "audio" | "text";
export type RatioId = "16:9" | "9:16" | "1:1" | "4:5" | "4:3" | "3:4";

/** Lanes from top to bottom as drawn on screen. */
export const LANE_ORDER: Lane[] = ["overlay", "text", "main", "audio"];

export const RATIOS: { id: RatioId; w: number; h: number }[] = [
  { id: "16:9", w: 16, h: 9 },
  { id: "9:16", w: 9, h: 16 },
  { id: "1:1", w: 1, h: 1 },
  { id: "4:5", w: 4, h: 5 },
  { id: "4:3", w: 4, h: 3 },
  { id: "3:4", w: 3, h: 4 },
];

export type Media = {
  id: string;
  kind: "video" | "image" | "audio";
  name: string;
  file: File;
  url: string;
  duration: number; // seconds (0 for images)
  w: number;
  h: number;
  thumbs: string[]; // video filmstrip frames (data URLs)
  peaks: number[]; // audio waveform 0..1
};

export type TextStyle = {
  color: string;
  size: number; // % of canvas height
  bold: boolean;
  italic: boolean;
  stroke: boolean;
  box: boolean;
  shadow: boolean;
};

export type Clip = {
  id: string;
  lane: Lane;
  kind: ClipKind;
  mediaId?: string;
  name: string;
  start: number; // position on the timeline, seconds
  dur: number; // length on the timeline, seconds
  srcIn: number; // where in the source file the clip starts (video/audio)
  speed: number; // 0.25 .. 4
  volume: number; // 0 .. 1
  opacity: number; // 0 .. 1
  scale: number; // 1 = contain-fit to the canvas
  x: number; // centre, 0..1 of canvas width
  y: number; // centre, 0..1 of canvas height
  text?: string;
  style?: TextStyle;
};

export type Project = { clips: Clip[]; ratio: RatioId };

export const MIN_DUR = 0.2;
export const DEFAULT_IMAGE_DUR = 3;
export const DEFAULT_TEXT_DUR = 3;

export const DEFAULT_TEXT_STYLE: TextStyle = { color: "#ffffff", size: 7, bold: true, italic: false, stroke: true, box: false, shadow: false };

export const uid = () => Math.random().toString(36).slice(2, 10);
export const end = (c: Clip) => c.start + c.dur;
export const hasAudio = (c: Clip) => c.kind === "video" || c.kind === "audio";
export const isVisual = (c: Clip) => c.kind !== "audio";

export function canvasSize(ratio: RatioId, longEdge: number) {
  const r = RATIOS.find((x) => x.id === ratio)!;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return r.w >= r.h
    ? { w: even(longEdge), h: even((longEdge * r.h) / r.w) }
    : { w: even((longEdge * r.w) / r.h), h: even(longEdge) };
}

export function projectDuration(p: Project) {
  return p.clips.reduce((m, c) => Math.max(m, end(c)), 0);
}

const inLane = (p: Project, lane: Lane) => p.clips.filter((c) => c.lane === lane).sort((a, b) => a.start - b.start);

/** Main lane is magnetic: clips are butted end to end in start order. */
export function reflowMain(clips: Clip[]): Clip[] {
  const main = clips.filter((c) => c.lane === "main").sort((a, b) => a.start - b.start);
  let t = 0;
  const placed = new Map<string, number>();
  for (const c of main) { placed.set(c.id, t); t += c.dur; }
  return clips.map((c) => (placed.has(c.id) ? { ...c, start: placed.get(c.id)! } : c));
}

/** Earliest free start >= `at` in a lane for a clip of length `dur`. */
export function findFreeStart(p: Project, lane: Lane, dur: number, at: number, ignoreId?: string) {
  let s = Math.max(0, at);
  for (const c of inLane(p, lane)) {
    if (c.id === ignoreId) continue;
    if (s < end(c) - 1e-6 && s + dur > c.start + 1e-6) s = end(c);
  }
  return s;
}

/** Nearest non-overlapping start to `proposed` in a free lane; falls back to `original` if it cannot fit. */
export function resolveFreeMove(p: Project, lane: Lane, id: string, dur: number, proposed: number, original: number) {
  let s = Math.max(0, proposed);
  const others = inLane(p, lane).filter((c) => c.id !== id);
  for (let i = 0; i < 6; i++) {
    const hit = others.find((c) => s < end(c) - 1e-6 && s + dur > c.start + 1e-6);
    if (!hit) return s;
    const before = hit.start - dur;
    const after = end(hit);
    const pick = before >= 0 && Math.abs(before - s) <= Math.abs(after - s) ? before : after;
    s = pick;
  }
  return others.some((c) => s < end(c) - 1e-6 && s + dur > c.start + 1e-6) ? original : s;
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, "lane" | "kind" | "name" | "start" | "dur">): Clip {
  return {
    id: uid(),
    srcIn: 0,
    speed: 1,
    volume: 1,
    opacity: 1,
    scale: 1,
    x: 0.5,
    y: 0.5,
    ...partial,
  };
}

/** Adds a clip to its lane: main appends (or inserts at `at`), other lanes take the first free slot at/after `at`. */
export function addClip(p: Project, clip: Clip, at?: number): Project {
  if (clip.lane === "main") {
    let insertAt = Infinity;
    if (at !== undefined && p.clips.some((c) => c.lane === "main")) {
      // insert before the first main clip whose midpoint is after the playhead
      const next = inLane(p, "main").find((c) => c.start + c.dur / 2 > at);
      if (next) insertAt = next.start - 0.001;
    }
    const tail = inLane(p, "main").reduce((m, c) => Math.max(m, end(c)), 0);
    const placed = { ...clip, start: insertAt === Infinity ? tail : insertAt };
    return { ...p, clips: reflowMain([...p.clips, placed]) };
  }
  const start = findFreeStart(p, clip.lane, clip.dur, at ?? clip.start);
  return { ...p, clips: [...p.clips, { ...clip, start }] };
}

export function removeClip(p: Project, id: string): Project {
  return { ...p, clips: reflowMain(p.clips.filter((c) => c.id !== id)) };
}

export function updateClip(p: Project, id: string, patch: Partial<Clip>): Project {
  return { ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/** Splits at timeline time `t`; returns the new project and the id of the right-hand piece (or null if t is not inside). */
export function splitClip(p: Project, id: string, t: number): { project: Project; rightId: string | null } {
  const c = p.clips.find((x) => x.id === id);
  if (!c || t <= c.start + 0.1 || t >= end(c) - 0.1) return { project: p, rightId: null };
  const leftDur = t - c.start;
  const right: Clip = { ...c, id: uid(), start: t, dur: end(c) - t, srcIn: hasAudio(c) ? c.srcIn + leftDur * c.speed : c.srcIn };
  const left: Clip = { ...c, dur: leftDur };
  const clips = p.clips.map((x) => (x.id === id ? left : x)).concat(right);
  return { project: { ...p, clips: c.lane === "main" ? reflowMain(clips) : clips }, rightId: right.id };
}

export function duplicateClip(p: Project, id: string): { project: Project; newId: string | null } {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return { project: p, newId: null };
  const copy: Clip = { ...c, id: uid() };
  if (c.lane === "main") return { project: addClip(p, copy, c.start + c.dur / 2 + 0.01), newId: copy.id };
  const start = findFreeStart(p, c.lane, c.dur, end(c));
  return { project: { ...p, clips: [...p.clips, { ...copy, start }] }, newId: copy.id };
}

/** Moves a clip in a free lane (overlay/text/audio). */
export function moveFree(p: Project, id: string, proposedStart: number): Project {
  const c = p.clips.find((x) => x.id === id);
  if (!c || c.lane === "main") return p;
  return updateClip(p, id, { start: resolveFreeMove(p, c.lane, id, c.dur, proposedStart, c.start) });
}

/** Re-orders a main-lane clip to `index` (0-based among main clips). */
export function reorderMain(p: Project, id: string, index: number): Project {
  const main = inLane(p, "main");
  const from = main.findIndex((c) => c.id === id);
  if (from < 0) return p;
  const to = Math.max(0, Math.min(main.length - 1, index));
  if (from === to) return p;
  const next = [...main];
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m);
  let t = 0;
  const pos = new Map<string, number>();
  for (const c of next) { pos.set(c.id, t); t += c.dur; }
  return { ...p, clips: p.clips.map((c) => (pos.has(c.id) ? { ...c, start: pos.get(c.id)! } : c)) };
}

/** Longest allowed timeline length of a clip given its source and speed (Infinity for images/text). */
export function maxDur(c: Clip, media?: Media) {
  if (!hasAudio(c) || !media || media.duration <= 0) return Infinity;
  return (media.duration - c.srcIn) / c.speed;
}

/** Drag the left edge to timeline time `t`. */
export function trimLeft(p: Project, id: string, t: number): Project {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return p;
  const e = end(c);
  let newStart = Math.min(t, e - MIN_DUR);
  if (c.lane === "main") {
    // ripple: the clip keeps its slot, only its content shrinks/grows
    const delta = newStart - c.start;
    let srcIn = c.srcIn;
    let dur = c.dur - delta;
    if (hasAudio(c)) {
      srcIn = c.srcIn + delta * c.speed;
      if (srcIn < 0) { dur += srcIn / c.speed; srcIn = 0; }
    }
    dur = Math.max(MIN_DUR, dur);
    return { ...p, clips: reflowMain(p.clips.map((x) => (x.id === id ? { ...x, srcIn, dur } : x))) };
  }
  const prev = inLane(p, c.lane).filter((x) => x.id !== id && end(x) <= c.start + 1e-6).pop();
  newStart = Math.max(prev ? end(prev) : 0, newStart);
  const delta = newStart - c.start;
  let srcIn = c.srcIn;
  let dur = c.dur - delta;
  if (hasAudio(c)) {
    srcIn = c.srcIn + delta * c.speed;
    if (srcIn < 0) { newStart -= srcIn / c.speed; dur += srcIn / c.speed; srcIn = 0; }
  }
  return updateClip(p, id, { start: newStart, dur: Math.max(MIN_DUR, dur), srcIn });
}

/** Drag the right edge to timeline time `t`. */
export function trimRight(p: Project, id: string, t: number, media?: Media): Project {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return p;
  let dur = Math.max(MIN_DUR, t - c.start);
  dur = Math.min(dur, maxDur(c, media));
  if (c.lane !== "main") {
    const next = inLane(p, c.lane).find((x) => x.id !== id && x.start >= c.start + c.dur - 1e-6);
    if (next) dur = Math.min(dur, next.start - c.start);
  }
  dur = Math.max(MIN_DUR, dur);
  const clips = p.clips.map((x) => (x.id === id ? { ...x, dur } : x));
  return { ...p, clips: c.lane === "main" ? reflowMain(clips) : clips };
}

export function setSpeed(p: Project, id: string, speed: number, media?: Media): Project {
  const c = p.clips.find((x) => x.id === id);
  if (!c || !hasAudio(c)) return p;
  const srcDur = c.dur * c.speed;
  let dur = Math.max(MIN_DUR, srcDur / speed);
  if (c.lane !== "main") {
    const next = inLane(p, c.lane).find((x) => x.id !== id && x.start >= c.start + c.dur - 1e-6);
    if (next) dur = Math.min(dur, next.start - c.start);
  }
  dur = Math.min(dur, media && media.duration > 0 ? (media.duration - c.srcIn) / speed : Infinity);
  const clips = p.clips.map((x) => (x.id === id ? { ...x, speed, dur } : x));
  return { ...p, clips: c.lane === "main" ? reflowMain(clips) : clips };
}

export function setDuration(p: Project, id: string, dur: number): Project {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return p;
  return trimRight(p, id, c.start + dur);
}

/** Pick the clip under the playhead on the given lane (used by split-at-playhead when nothing is selected). */
export function clipAt(p: Project, t: number, lanes: Lane[] = ["main"]) {
  return p.clips.find((c) => lanes.includes(c.lane) && t > c.start && t < end(c));
}
