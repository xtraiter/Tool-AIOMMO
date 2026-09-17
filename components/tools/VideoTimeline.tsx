"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Layers3, UploadCloud, Music, Type, Plus, X, Play, Pause,
  ZoomIn, ZoomOut, Film, Download, Image as ImageIcon, Eye, EyeOff,
  GripVertical, Monitor
} from "lucide-react";
import { fetchFile } from "@ffmpeg/util";
import { loadSharedFfmpeg, formatBytes, formatDuration, downloadBlob } from "@/lib/ffmpegLoader";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import "./tool-page.css";
import "./video-timeline.css";

type LayerType = "video" | "image" | "audio" | "text";

// A file imported once, reusable across any number of timeline clips (CapCut-style media bin).
type MediaItem = {
  id: string;
  kind: "video" | "image" | "audio";
  name: string;
  file: File;
  objectUrl: string;
  sourceDuration?: number; // video/audio
};

// One placed instance on the timeline. Multiple clips can reference the same MediaItem.
type Clip = {
  id: string;
  mediaId?: string; // video/image/audio clips only
  type: LayerType;
  name: string;
  start: number; // project-time seconds
  duration: number;
  trimIn?: number; // video/audio only
  trimOut?: number; // video/audio only
  x: number; // 0..1, relative center (video/image/text)
  y: number; // 0..1
  scale: number; // video/image, 1 = contain-fit baseline
  opacity: number; // 0..1, video/image/text
  volume: number; // 0..150, video/audio
  text?: string;
  color?: string;
  // Text styling — field names/shape mirror the company's own text caption
  // editor (AIO_MMO's VideoShortStickman "Tạo video tự động" tool), adapted
  // to our % font-size scale since our canvas size is user-chosen.
  fontFamily?: string;
  fontSize?: number; // % of canvas height
  bold?: boolean;
  italic?: boolean;
  strokeColor?: string; // undefined = no outline
  strokeWidth?: number; // px
  bgColor?: string; // undefined = no background box, e.g. "rgba(0,0,0,0.6)"
  shadowColor?: string; // undefined = no drop shadow
};

// A track holds an ordered, non-overlapping run of clips. Track array order = z-order
// (index 0 = back, last = front) for visual layers; audio tracks just contribute to the mix.
type Track = {
  id: string;
  visible: boolean;
  clips: Clip[];
};

const TEXT_FONT_FAMILIES = ["Inter", "Arial", "Roboto", "Times New Roman", "Courier New", "Georgia", "Comic Sans MS"];

const TEXT_STYLE_PRESETS: { label: string; patch: Partial<Clip> }[] = [
  { label: "Mặc định", patch: { color: "#ffffff", strokeColor: undefined, bgColor: undefined, shadowColor: undefined } },
  { label: "Outline Đen", patch: { color: "#ffffff", strokeColor: "#000000", strokeWidth: 6, bgColor: undefined, shadowColor: undefined } },
  { label: "Outline Vàng", patch: { color: "#ffeb3b", strokeColor: "#000000", strokeWidth: 6, bgColor: undefined, shadowColor: undefined } },
  { label: "Hộp Đen", patch: { color: "#ffffff", strokeColor: undefined, bgColor: "rgba(0,0,0,0.6)", shadowColor: undefined } },
  { label: "Hộp Vàng", patch: { color: "#000000", strokeColor: undefined, bgColor: "#ffeb3b", shadowColor: undefined } },
  { label: "Đổ Bóng", patch: { color: "#ffffff", strokeColor: undefined, bgColor: undefined, shadowColor: "rgba(0,0,0,0.8)" } }
];

const MIN_LEN = 0.3;
const DEFAULT_IMAGE_DURATION = 3;
const DEFAULT_TEXT_DURATION = 3;
const SNAP_PX = 8;

const LAYER_META: Record<LayerType, { label: string; icon: any; color: string }> = {
  video: { label: "Video", icon: Film, color: "#ec4899" },
  image: { label: "Ảnh", icon: ImageIcon, color: "#f59e0b" },
  audio: { label: "Âm thanh", icon: Music, color: "#22c55e" },
  text: { label: "Chữ", icon: Type, color: "#a78bfa" }
};

const ASPECT_RATIOS = [
  { id: "16:9", rw: 16, rh: 9, label: "Ngang 16:9", sub: "YouTube, TV" },
  { id: "9:16", rw: 9, rh: 16, label: "Dọc 9:16", sub: "Shorts, Reels, TikTok" },
  { id: "1:1", rw: 1, rh: 1, label: "Vuông 1:1", sub: "Instagram bài đăng" },
  { id: "4:5", rw: 4, rh: 5, label: "Dọc 4:5", sub: "Instagram feed" },
  { id: "4:3", rw: 4, rh: 3, label: "Ngang 4:3", sub: "Cổ điển" },
  { id: "3:4", rw: 3, rh: 4, label: "Dọc 3:4", sub: "Cổ điển" }
];

const RESOLUTIONS = [
  { id: "1080p", label: "Full HD", sub: "1080p · khuyên dùng", long: 1920 },
  { id: "720p", label: "HD", sub: "720p · nhẹ, xuất nhanh", long: 1280 }
];

function computeDims(rw: number, rh: number, longEdge: number) {
  if (rw >= rh) {
    const w = longEdge;
    const h = Math.round((longEdge * rh) / rw);
    return { w, h };
  }
  const h = longEdge;
  const w = Math.round((longEdge * rw) / rh);
  return { w, h };
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function escapeDrawtext(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
}

// Converts a CSS color (#hex, rgb(...), rgba(...)) into FFmpeg drawtext's
// "0xRRGGBB@alpha" color spec, multiplying in the clip's own opacity.
function toFFmpegColor(cssColor: string, extraAlpha = 1) {
  let r = 0, g = 0, b = 0, a = 1;
  const rgbaMatch = cssColor.match(/rgba?\(([^)]+)\)/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map((s) => parseFloat(s.trim()));
    [r, g, b] = parts;
    if (parts.length > 3) a = parts[3];
  } else if (cssColor.startsWith("#")) {
    const hex = cssColor.slice(1);
    r = parseInt(hex.slice(0, 2), 16) || 0;
    g = parseInt(hex.slice(2, 4), 16) || 0;
    b = parseInt(hex.slice(4, 6), 16) || 0;
  }
  const hexColor = "0x" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
  return `${hexColor}@${(a * extraAlpha).toFixed(2)}`;
}

function probeVideoMeta(file: File): Promise<{ duration: number; w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () => {
      resolve({ duration: v.duration || 0, w: v.videoWidth || 1280, h: v.videoHeight || 720 });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => resolve({ duration: 0, w: 1280, h: 720 });
  });
}

function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.src = url;
    a.onloadedmetadata = () => { resolve(a.duration || 0); URL.revokeObjectURL(url); };
    a.onerror = () => resolve(0);
  });
}

// ============================================================
// Aspect ratio / resolution preset picker
// ============================================================
function PresetPicker({ onConfirm }: { onConfirm: (w: number, h: number) => void }) {
  const [aspectId, setAspectId] = useState("9:16");
  const [resolutionId, setResolutionId] = useState("1080p");
  const [useCustom, setUseCustom] = useState(false);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1920);

  const aspect = ASPECT_RATIOS.find((a) => a.id === aspectId) ?? ASPECT_RATIOS[0];
  const resolution = RESOLUTIONS.find((r) => r.id === resolutionId) ?? RESOLUTIONS[0];
  const computed = computeDims(aspect.rw, aspect.rh, resolution.long);
  const chosen = useCustom ? { w: customW, h: customH } : computed;

  return (
    <div className="tool-page">
      <h1><Monitor size={22} /> Trình Dựng Video Timeline</h1>
      <p className="tool-subtitle">Chọn tỷ lệ khung hình và độ phân giải riêng cho dự án trước khi vào giao diện chỉnh sửa.</p>

      <div className="vt-panel-title" style={{ marginTop: 12 }}>1. Tỷ lệ khung hình</div>
      <div className="vt-preset-grid">
        {ASPECT_RATIOS.map((a) => {
          const maxSide = 34;
          const ratio = a.rw / a.rh;
          const boxW = ratio >= 1 ? maxSide : maxSide * ratio;
          const boxH = ratio >= 1 ? maxSide / ratio : maxSide;
          return (
            <div key={a.id} className={`vt-preset-card ${!useCustom && aspectId === a.id ? "is-selected" : ""}`}
              onClick={() => { setAspectId(a.id); setUseCustom(false); }}>
              <div className="vt-preset-shape" style={{ width: boxW, height: boxH }} />
              <div>
                <div className="vt-preset-label">{a.label}</div>
                <div className="vt-preset-dims">{a.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="vt-panel-title" style={{ marginTop: 14 }}>2. Độ phân giải</div>
      <div className="vt-preset-grid">
        {RESOLUTIONS.map((r) => {
          const dims = computeDims(aspect.rw, aspect.rh, r.long);
          return (
            <div key={r.id} className={`vt-preset-card ${!useCustom && resolutionId === r.id ? "is-selected" : ""}`}
              onClick={() => { setResolutionId(r.id); setUseCustom(false); }}>
              <div>
                <div className="vt-preset-label">{r.label} · {dims.w}×{dims.h}</div>
                <div className="vt-preset-dims">{r.sub}</div>
              </div>
            </div>
          );
        })}
        <div className={`vt-preset-card ${useCustom ? "is-selected" : ""}`} onClick={() => setUseCustom(true)}>
          <div>
            <div className="vt-preset-label">Tuỳ chỉnh</div>
            <div className="vt-preset-dims">Tự nhập kích thước</div>
          </div>
        </div>
      </div>

      {useCustom && (
        <div className="vt-custom-dims">
          <div className="tool-field" style={{ maxWidth: 110 }}>
            <label>Rộng (px)</label>
            <input type="number" min={64} max={4096} value={customW} onChange={(e) => setCustomW(Number(e.target.value) || 1080)} />
          </div>
          <span style={{ marginTop: 18 }}>×</span>
          <div className="tool-field" style={{ maxWidth: 110 }}>
            <label>Cao (px)</label>
            <input type="number" min={64} max={4096} value={customH} onChange={(e) => setCustomH(Number(e.target.value) || 1920)} />
          </div>
        </div>
      )}

      <div className="tool-row">
        <button className="tool-btn" onClick={() => onConfirm(chosen.w % 2 === 0 ? chosen.w : chosen.w - 1, chosen.h % 2 === 0 ? chosen.h : chosen.h - 1)}>
          Bắt đầu chỉnh sửa ({chosen.w}×{chosen.h})
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main editor
// ============================================================
export function VideoTimeline() {
  const [stage, setStage] = useState<"preset" | "editor">("preset");
  const [canvasSize, setCanvasSize] = useState({ w: 1080, h: 1920 });
  const [mediaLibrary, setMediaLibrary] = useState<MediaItem[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomPct, setZoomPct] = useState(50);
  const [scrollWidth, setScrollWidth] = useState(800);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number | "new" | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [snapGuide, setSnapGuide] = useState<number | null>(null);

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imgElsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const draggingClipIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<null | {
    type: "move-time" | "trim-left" | "trim-right" | "drag-position" | "scrub" | "reorder-track";
    id: string;
    startX: number;
    startY?: number;
    orig: any;
  }>(null);

  const totalDuration = tracks.reduce((max, t) => t.clips.reduce((m2, c) => Math.max(m2, c.start + c.duration), max), 0);

  // Zoom is a 0-100% slider mapped between "whole timeline fits, no scrolling"
  // and a fixed max detail level — scaled to the longest clip's reach, so
  // zooming out always shows everything at once instead of needing to drag
  // a horizontal scrollbar to see the end of the project.
  const LABEL_GUTTER = 90;
  const MAX_PX_PER_SEC = 200;
  const laneWidth = Math.max(200, scrollWidth - LABEL_GUTTER - 24);
  const fitPxPerSec = totalDuration > 0 ? Math.min(MAX_PX_PER_SEC, Math.max(8, laneWidth / totalDuration)) : 60;
  const pxPerSec = fitPxPerSec + (MAX_PX_PER_SEC - fitPxPerSec) * (zoomPct / 100);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setScrollWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Flattening helpers --------------------------------------------------
  function flatClipsOrdered(): { clip: Clip; track: Track }[] {
    const out: { clip: Clip; track: Track }[] = [];
    for (const track of tracks) for (const clip of track.clips) out.push({ clip, track });
    return out;
  }

  function getActiveClipsAt(time: number) {
    return flatClipsOrdered().filter(({ clip, track }) => track.visible && time >= clip.start && time < clip.start + clip.duration);
  }

  function findClipTrack(clipId: string): { track: Track; trackIndex: number } | null {
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].clips.some((c) => c.id === clipId)) return { track: tracks[i], trackIndex: i };
    }
    return null;
  }

  // --- Media library --------------------------------------------------------
  function kindFromMime(file: File): "video" | "image" | "audio" | null {
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    return null;
  }

  async function importFiles(list: FileList | null) {
    if (!list) return [];
    const files = Array.from(list);
    const added: MediaItem[] = [];
    for (const file of files) {
      const kind = kindFromMime(file);
      if (!kind) continue;
      const objectUrl = URL.createObjectURL(file);
      let sourceDuration: number | undefined;
      if (kind === "video") sourceDuration = (await probeVideoMeta(file)).duration;
      else if (kind === "audio") sourceDuration = await probeAudioDuration(file);
      added.push({ id: uid(), kind, name: file.name, file, objectUrl, sourceDuration });
    }
    if (added.length) setMediaLibrary((prev) => [...prev, ...added]);
    return added;
  }

  // --- Clip creation & placement --------------------------------------------
  function makeClipFromMedia(media: MediaItem, start: number): Clip {
    const duration = media.kind === "image" ? DEFAULT_IMAGE_DURATION : (media.sourceDuration || 1);
    return {
      id: uid(), mediaId: media.id, type: media.kind, name: media.name, start, duration,
      trimIn: media.kind === "image" ? undefined : 0,
      trimOut: media.kind === "image" ? undefined : (media.sourceDuration || duration),
      x: 0.5, y: 0.5, scale: 1, opacity: 1, volume: 100
    };
  }

  function makeTextClip(start: number): Clip {
    return {
      id: uid(), type: "text", name: "Chữ mới", start, duration: DEFAULT_TEXT_DURATION,
      x: 0.5, y: 0.85, scale: 1, opacity: 1, volume: 100,
      text: "Chữ mới", color: "#ffffff",
      fontFamily: "Inter", fontSize: 5, bold: true, italic: false,
      strokeColor: undefined, strokeWidth: 6, bgColor: "rgba(0,0,0,0.6)", shadowColor: undefined
    };
  }

  function clipOverlapsTrack(track: Track, start: number, duration: number, excludeId?: string) {
    const end = start + duration;
    return track.clips.some((c) => c.id !== excludeId && start < c.start + c.duration && end > c.start);
  }

  // Inserts a clip into an existing track (by index) or appends a brand new
  // track. Rejects (no-op, returns false) if it would overlap a sibling clip.
  function placeClip(newClip: Clip, trackIndex: number | "new"): boolean {
    let ok = true;
    setTracks((prev) => {
      if (trackIndex === "new") {
        return [...prev, { id: uid(), visible: true, clips: [newClip] }];
      }
      const track = prev[trackIndex];
      if (!track) { ok = false; return prev; }
      if (clipOverlapsTrack(track, newClip.start, newClip.duration)) { ok = false; return prev; }
      const next = [...prev];
      next[trackIndex] = { ...track, clips: [...track.clips, newClip].sort((a, b) => a.start - b.start) };
      return next;
    });
    return ok;
  }

  function quickAddMedia(media: MediaItem) {
    const clip = makeClipFromMedia(media, currentTime);
    const lastIndex = tracks.length - 1;
    if (lastIndex >= 0 && placeClip(clip, lastIndex)) { setSelectedClipId(clip.id); return; }
    placeClip(clip, "new");
    setSelectedClipId(clip.id);
  }

  function quickAddText() {
    const clip = makeTextClip(currentTime);
    placeClip(clip, "new");
    setSelectedClipId(clip.id);
  }

  function removeClip(id: string) {
    setTracks((prev) => prev.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) })).filter((t) => t.clips.length > 0));
    videoElsRef.current.get(id)?.pause(); videoElsRef.current.delete(id);
    audioElsRef.current.get(id)?.pause(); audioElsRef.current.delete(id);
    imgElsRef.current.delete(id);
    setSelectedClipId((prev) => (prev === id ? null : prev));
  }

  function updateClip(id: string, patch: Partial<Clip>) {
    setTracks((prev) => prev.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })));
  }

  function toggleTrackVisible(trackId: string) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, visible: !t.visible } : t)));
  }

  // --- Drop targeting (media-bin drag, OS-file drag) ------------------------
  function resolveTrackIndexAt(clientX: number, clientY: number): number | "new" {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const trackEl = el?.closest?.("[data-track-index]") as HTMLElement | null;
    if (!trackEl) return "new";
    const attr = trackEl.dataset.trackIndex;
    if (attr === "new") return "new";
    const idx = Number(attr);
    return Number.isFinite(idx) ? idx : "new";
  }

  function computeDropTime(clientX: number, clientY: number): number {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const laneEl = el?.closest?.(".vt-track-lane") as HTMLElement | null;
    const refEl = laneEl ?? rulerRef.current;
    if (!refEl) return 0;
    const rect = refEl.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / pxPerSec);
  }

  async function onTimelineDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTrackIndex(null);
    const trackIndex = resolveTrackIndexAt(e.clientX, e.clientY);
    const dropTime = computeDropTime(e.clientX, e.clientY);

    const mediaId = e.dataTransfer.getData("text/plain");
    const existingMedia = mediaLibrary.find((m) => m.id === mediaId);
    if (existingMedia) {
      const snapped = computeSnappedTime(dropTime, "");
      const clip = makeClipFromMedia(existingMedia, snapped);
      const ok = placeClip(clip, trackIndex);
      if (ok) setSelectedClipId(clip.id);
      else setError("Vị trí này đã có clip khác — hãy thả vào khoảng trống.");
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const added = await importFiles(e.dataTransfer.files);
      let t = dropTime;
      for (const media of added) {
        const clip = makeClipFromMedia(media, t);
        const ok = placeClip(clip, trackIndex);
        if (ok) t += clip.duration;
      }
    }
  }

  function onTimelineDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTrackIndex(resolveTrackIndexAt(e.clientX, e.clientY));
  }

  async function handlePageDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await importFiles(e.dataTransfer.files);
    }
  }

  // --- Media elements for preview -------------------------------------------
  // HTMLMediaElement.volume only accepts 0..1, but clips allow up to 200% —
  // clamp for the live preview (the FFmpeg export still applies the full
  // boosted volume via its own `volume=` filter).
  function applyVolume(el: HTMLMediaElement, clip: Clip) {
    el.muted = clip.volume <= 0;
    el.volume = Math.max(0, Math.min(1, clip.volume / 100));
  }

  function getVideoEl(clip: Clip): HTMLVideoElement {
    let el = videoElsRef.current.get(clip.id);
    if (!el) {
      const media = mediaLibrary.find((m) => m.id === clip.mediaId);
      el = document.createElement("video");
      el.src = media?.objectUrl ?? "";
      el.playsInline = true;
      el.preload = "auto";
      videoElsRef.current.set(clip.id, el);
    }
    applyVolume(el, clip);
    return el;
  }

  function getAudioEl(clip: Clip): HTMLAudioElement {
    let el = audioElsRef.current.get(clip.id);
    if (!el) {
      const media = mediaLibrary.find((m) => m.id === clip.mediaId);
      el = new Audio(media?.objectUrl ?? "");
      el.preload = "auto";
      audioElsRef.current.set(clip.id, el);
    }
    applyVolume(el, clip);
    return el;
  }

  function getImgEl(clip: Clip): HTMLImageElement {
    let el = imgElsRef.current.get(clip.id);
    if (!el) {
      const media = mediaLibrary.find((m) => m.id === clip.mediaId);
      el = new Image();
      el.src = media?.objectUrl ?? "";
      imgElsRef.current.set(clip.id, el);
    }
    return el;
  }

  // --- Canvas drawing & hit-testing --------------------------------------
  function computeMediaBox(srcW: number, srcH: number, clip: Clip) {
    const cw = canvasSize.w;
    const ch = canvasSize.h;
    const baseScale = Math.min(cw / srcW, ch / srcH);
    const dw = srcW * baseScale * clip.scale;
    const dh = srcH * baseScale * clip.scale;
    const cx = clip.x * cw;
    const cy = clip.y * ch;
    return { x0: cx - dw / 2, y0: cy - dh / 2, dw, dh, cx, cy };
  }

  function getTextBox(ctx: CanvasRenderingContext2D, clip: Clip) {
    const fontSize = Math.round(canvasSize.h * ((clip.fontSize ?? 5) / 100));
    const weight = clip.bold !== false ? "bold " : "";
    const style = clip.italic ? "italic " : "";
    ctx.font = `${style}${weight}${fontSize}px "${clip.fontFamily || "Inter"}", sans-serif`;
    const metrics = ctx.measureText(clip.text || "");
    const padX = 18;
    const boxW = metrics.width + padX * 2;
    const boxH = fontSize * 1.5;
    const cx = clip.x * canvasSize.w;
    const cy = clip.y * canvasSize.h;
    return { fontSize, boxW, boxH, x0: cx - boxW / 2, y0: cy - boxH / 2, x1: cx + boxW / 2, y1: cy + boxH / 2, cx, cy };
  }

  function drawFrame(time: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvasSize.w;
    canvas.height = canvasSize.h;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    for (const { clip, track } of flatClipsOrdered()) {
      if (!track.visible) continue;
      if (time < clip.start || time >= clip.start + clip.duration) continue;
      ctx.globalAlpha = clip.opacity;
      if (clip.type === "video") {
        const el = getVideoEl(clip);
        const w = el.videoWidth || canvasSize.w;
        const h = el.videoHeight || canvasSize.h;
        const box = computeMediaBox(w, h, clip);
        ctx.drawImage(el, box.x0, box.y0, box.dw, box.dh);
        if (draggingClipIdRef.current === clip.id) {
          ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2;
          ctx.strokeRect(box.x0, box.y0, box.dw, box.dh);
        }
      } else if (clip.type === "image") {
        const el = getImgEl(clip);
        const w = el.naturalWidth || canvasSize.w;
        const h = el.naturalHeight || canvasSize.h;
        const box = computeMediaBox(w, h, clip);
        ctx.drawImage(el, box.x0, box.y0, box.dw, box.dh);
        if (draggingClipIdRef.current === clip.id) {
          ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2;
          ctx.strokeRect(box.x0, box.y0, box.dw, box.dh);
        }
      } else if (clip.type === "text" && clip.text?.trim()) {
        const box = getTextBox(ctx, clip);
        if (clip.bgColor) {
          ctx.fillStyle = clip.bgColor;
          ctx.fillRect(box.x0, box.y0, box.boxW, box.boxH);
        }
        if (draggingClipIdRef.current === clip.id) {
          ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2;
          ctx.strokeRect(box.x0, box.y0, box.boxW, box.boxH);
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (clip.shadowColor) {
          ctx.shadowColor = clip.shadowColor;
          ctx.shadowBlur = box.fontSize * 0.2;
          ctx.shadowOffsetX = box.fontSize * 0.08;
          ctx.shadowOffsetY = box.fontSize * 0.08;
        }
        if (clip.strokeColor) {
          ctx.lineWidth = clip.strokeWidth ?? 6;
          ctx.strokeStyle = clip.strokeColor;
          ctx.lineJoin = "round";
          ctx.strokeText(clip.text, box.cx, box.cy);
        }
        ctx.fillStyle = clip.color || "#fff";
        ctx.fillText(clip.text, box.cx, box.cy);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
      ctx.globalAlpha = 1;
    }
  }

  function hitTestClip(time: number, canvasX: number, canvasY: number): Clip | null {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    const active = getActiveClipsAt(time).filter(({ clip }) => clip.type !== "audio");
    for (let i = active.length - 1; i >= 0; i--) {
      const clip = active[i].clip;
      if (clip.type === "text") {
        const box = getTextBox(ctx, clip);
        if (canvasX >= box.x0 && canvasX <= box.x1 && canvasY >= box.y0 && canvasY <= box.y1) return clip;
      } else {
        const el = clip.type === "video" ? getVideoEl(clip) : getImgEl(clip);
        const w = (clip.type === "video" ? (el as HTMLVideoElement).videoWidth : (el as HTMLImageElement).naturalWidth) || canvasSize.w;
        const h = (clip.type === "video" ? (el as HTMLVideoElement).videoHeight : (el as HTMLImageElement).naturalHeight) || canvasSize.h;
        const box = computeMediaBox(w, h, clip);
        if (canvasX >= box.x0 && canvasX <= box.x0 + box.dw && canvasY >= box.y0 && canvasY <= box.y0 + box.dh) return clip;
      }
    }
    return null;
  }

  // Redraw when paused / clips / time change (scrub mode).
  useEffect(() => {
    if (isPlaying) return;
    const active = getActiveClipsAt(currentTime).filter(({ clip }) => clip.type === "video");
    active.forEach(({ clip }) => {
      const el = getVideoEl(clip);
      const localTime = (clip.trimIn ?? 0) + (currentTime - clip.start);
      if (Math.abs(el.currentTime - localTime) > 0.05) {
        const onSeeked = () => { drawFrame(currentTime); el.removeEventListener("seeked", onSeeked); };
        el.addEventListener("seeked", onSeeked);
        try { el.currentTime = localTime; } catch { /* ignore */ }
      }
    });
    drawFrame(currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, tracks, canvasSize, isPlaying]);

  // Playback loop (wall-clock driven so overlapping video/audio clips can play independently).
  useEffect(() => {
    if (!isPlaying) {
      videoElsRef.current.forEach((v) => v.pause());
      audioElsRef.current.forEach((a) => a.pause());
      return;
    }
    const wallStart = performance.now() - currentTime * 1000;

    function tick(ts: number) {
      const t = (ts - wallStart) / 1000;
      if (t >= totalDuration) {
        videoElsRef.current.forEach((v) => v.pause());
        audioElsRef.current.forEach((a) => a.pause());
        setIsPlaying(false);
        setCurrentTime(0);
        drawFrame(0);
        return;
      }
      setCurrentTime(t);
      for (const { clip, track } of flatClipsOrdered()) {
        if (clip.type !== "video" && clip.type !== "audio") continue;
        const active = track.visible && t >= clip.start && t < clip.start + clip.duration;
        const el = clip.type === "video" ? getVideoEl(clip) : getAudioEl(clip);
        if (active) {
          if (el.paused) {
            try { el.currentTime = (clip.trimIn ?? 0) + (t - clip.start); } catch { /* ignore */ }
            void el.play().catch(() => {});
          }
        } else if (!el.paused) {
          el.pause();
        }
      }
      drawFrame(t);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const hasClips = tracks.some((t) => t.clips.length > 0);

  function togglePlay() {
    if (!hasClips) return;
    if (!isPlaying && currentTime >= totalDuration - 0.05) setCurrentTime(0);
    setIsPlaying((p) => !p);
  }

  // Spacebar play/pause, like every video editor — ignored while typing in a
  // text field (clip name/content, number inputs...) so it doesn't hijack typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      togglePlay();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasClips, isPlaying, currentTime, totalDuration]);

  // --- Interaction: ruler / timeline scrubbing ---------------------------
  function onRulerMouseDown(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(totalDuration, (e.clientX - rect.left) / pxPerSec));
    setIsPlaying(false);
    setCurrentTime(t);
  }

  function startTimeDrag(type: "move-time" | "trim-left" | "trim-right", clip: Clip, track: Track, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedClipId(clip.id);
    const sorted = [...track.clips].sort((a, b) => a.start - b.start);
    const idx = sorted.findIndex((c) => c.id === clip.id);
    const prev = sorted[idx - 1];
    const next = sorted[idx + 1];
    dragStateRef.current = {
      type, id: clip.id, startX: e.clientX,
      orig: {
        start: clip.start, duration: clip.duration, trimIn: clip.trimIn, trimOut: clip.trimOut,
        minStart: prev ? prev.start + prev.duration : 0,
        maxEnd: next ? next.start : Infinity
      }
    };
  }

  function startTrackReorder(track: Track, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button")) return; // let the eye-toggle button work normally
    e.preventDefault();
    setDraggingTrackId(track.id);
    dragStateRef.current = { type: "reorder-track", id: track.id, startX: e.clientX, startY: e.clientY, orig: {} };
  }

  function onCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = ((e.clientX - rect.left) / rect.width) * canvasSize.w;
    const canvasY = ((e.clientY - rect.top) / rect.height) * canvasSize.h;
    const hit = hitTestClip(currentTime, canvasX, canvasY);
    if (!hit) return;
    e.preventDefault();
    setSelectedClipId(hit.id);
    draggingClipIdRef.current = hit.id;
    dragStateRef.current = { type: "drag-position", id: hit.id, startX: e.clientX, startY: e.clientY, orig: { x: hit.x, y: hit.y } };
    drawFrame(currentTime);
  }

  // Magnet/snap: within a small pixel threshold of another clip's edge, the
  // playhead, or t=0, snap exactly onto it instead of leaving a near-miss gap.
  function computeSnappedTime(rawTime: number, excludeClipId: string): number {
    const candidates: number[] = [0, currentTime];
    for (const t of tracks) for (const c of t.clips) {
      if (c.id === excludeClipId) continue;
      candidates.push(c.start, c.start + c.duration);
    }
    const thresholdSec = SNAP_PX / pxPerSec;
    let best: number | null = null;
    let bestDist = thresholdSec;
    for (const cand of candidates) {
      const d = Math.abs(cand - rawTime);
      if (d <= bestDist) { bestDist = d; best = cand; }
    }
    return best ?? rawTime;
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragStateRef.current;
      if (!drag) return;
      e.preventDefault();

      if (drag.type === "drag-position") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dxRel = (e.clientX - drag.startX) / rect.width;
        const dyRel = (e.clientY - (drag.startY ?? e.clientY)) / rect.height;
        const newX = Math.max(0, Math.min(1, drag.orig.x + dxRel));
        const newY = Math.max(0, Math.min(1, drag.orig.y + dyRel));
        updateClip(drag.id, { x: newX, y: newY });
        return;
      }

      if (drag.type === "scrub") {
        const dxSec = (e.clientX - drag.startX) / pxPerSec;
        const newTime = Math.max(0, Math.min(totalDuration, drag.orig.time + dxSec));
        setCurrentTime(newTime);
        return;
      }

      if (drag.type === "reorder-track") {
        const idx = resolveTrackIndexAt(e.clientX, e.clientY);
        setTracks((prev) => {
          const fromIdx = prev.findIndex((t) => t.id === drag.id);
          if (fromIdx === -1) return prev;
          const toIdx = idx === "new" ? prev.length - 1 : idx;
          if (toIdx === fromIdx || toIdx < 0 || toIdx >= prev.length) return prev;
          const next = [...prev];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          return next;
        });
        return;
      }

      const dx = (e.clientX - drag.startX) / pxPerSec;

      if (drag.type === "move-time") {
        const rawStart = Math.max(0, drag.orig.start + dx);
        const clampedStart = Math.max(drag.orig.minStart, Math.min(drag.orig.maxEnd - drag.orig.duration, rawStart));
        const clampedEnd = clampedStart + drag.orig.duration;
        const snappedStart = computeSnappedTime(clampedStart, drag.id);
        const snappedEnd = computeSnappedTime(clampedEnd, drag.id);

        let finalStart = clampedStart;
        let guide: number | null = null;
        if (snappedStart !== clampedStart) {
          finalStart = snappedStart;
          guide = snappedStart;
        } else if (snappedEnd !== clampedEnd) {
          finalStart = snappedEnd - drag.orig.duration;
          guide = snappedEnd;
        }
        finalStart = Math.max(drag.orig.minStart, Math.min(drag.orig.maxEnd - drag.orig.duration, finalStart));
        setSnapGuide(guide);
        updateClip(drag.id, { start: finalStart });
        return;
      }

      setTracks((prev) => prev.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== drag.id) return c;
          if (drag.type === "trim-left") {
            const rawStart = drag.orig.start + dx;
            const snapped = computeSnappedTime(rawStart, drag.id);
            setSnapGuide(snapped !== rawStart ? snapped : null);
            if (c.type === "video" || c.type === "audio") {
              const wantTrimIn = drag.orig.trimIn + (snapped - drag.orig.start);
              const newTrimIn = Math.max(0, Math.min(wantTrimIn, drag.orig.trimOut - MIN_LEN));
              const appliedDx = newTrimIn - drag.orig.trimIn;
              const newStart = Math.max(drag.orig.minStart, drag.orig.start + appliedDx);
              return { ...c, trimIn: newTrimIn, start: newStart, duration: drag.orig.trimOut - newTrimIn };
            }
            const newStart = Math.max(drag.orig.minStart, Math.min(snapped, drag.orig.start + drag.orig.duration - MIN_LEN));
            const newDuration = drag.orig.start + drag.orig.duration - newStart;
            return { ...c, duration: newDuration, start: newStart };
          }
          if (drag.type === "trim-right") {
            const rawEnd = drag.orig.start + drag.orig.duration + dx;
            const snappedEnd = computeSnappedTime(rawEnd, drag.id);
            setSnapGuide(snappedEnd !== rawEnd ? snappedEnd : null);
            const cappedEnd = Math.min(drag.orig.maxEnd, snappedEnd);
            if (c.type === "video" || c.type === "audio") {
              const media = mediaLibrary.find((m) => m.id === c.mediaId);
              const sourceMax = media?.sourceDuration ?? drag.orig.trimOut;
              const wantTrimOut = drag.orig.trimOut + (cappedEnd - (drag.orig.start + drag.orig.duration));
              const newTrimOut = Math.min(sourceMax, Math.max(wantTrimOut, drag.orig.trimIn + MIN_LEN));
              return { ...c, trimOut: newTrimOut, duration: newTrimOut - drag.orig.trimIn };
            }
            const newDuration = Math.max(MIN_LEN, cappedEnd - drag.orig.start);
            return { ...c, duration: newDuration };
          }
          return c;
        })
      })));
    }

    function onUp() {
      if (dragStateRef.current?.type === "drag-position") {
        draggingClipIdRef.current = null;
      }
      dragStateRef.current = null;
      setDraggingTrackId(null);
      setSnapGuide(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerSec, totalDuration]);

  // --- Export -------------------------------------------------------------
  async function handleExport() {
    if (!hasClips) {
      setError("Hãy thêm ít nhất 1 clip video/ảnh vào dự án.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const w = canvasSize.w;
      const h = canvasSize.h;
      const orderedClips = flatClipsOrdered().filter(({ track }) => track.visible).map(({ clip }) => clip);

      setStatus("Đang nạp bộ xử lý FFmpeg...");
      const ffmpeg = await loadSharedFfmpeg();
      const offProgress = ffmpeg.on("progress", ({ progress: p }) => setProgress(Math.min(100, Math.round(p * 100))));
      const logLines: string[] = [];
      const offLog = ffmpeg.on("log", ({ message }) => {
        logLines.push(message);
        if (logLines.length > 60) logLines.shift();
      });

      const fileNames: Record<string, string> = {};
      let fi = 0;
      for (const clip of orderedClips) {
        const media = clip.mediaId ? mediaLibrary.find((m) => m.id === clip.mediaId) : undefined;
        if (!media) continue;
        const ext = media.file.name.split(".").pop() || (clip.type === "image" ? "jpg" : clip.type === "audio" ? "mp3" : "mp4");
        const name = `f${fi++}.${ext}`;
        setStatus(`Đang ghi ${clip.name}...`);
        await ffmpeg.writeFile(name, await fetchFile(media.file));
        fileNames[clip.id] = name;
      }

      const inputArgs: string[] = [];
      const inputIndexByClip: Record<string, number> = {};
      let idx = 0;
      orderedClips.forEach((clip) => {
        if (!fileNames[clip.id]) return;
        if (clip.type === "image") {
          inputArgs.push("-loop", "1", "-t", String(clip.duration), "-i", fileNames[clip.id]);
        } else {
          inputArgs.push("-ss", String(clip.trimIn ?? 0), "-to", String(clip.trimOut ?? clip.duration), "-i", fileNames[clip.id]);
        }
        inputIndexByClip[clip.id] = idx++;
      });
      const bgIndex = idx;
      inputArgs.push("-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:d=${Math.max(totalDuration, 0.5)}:r=30`);

      // Builds the full -filter_complex + output args. `includeAudio=false` is
      // used as a fallback retry when a source clip turns out to have no audio
      // stream at all (a silent screen-recording, etc.) — FFmpeg fails outright
      // if the filter graph references a `:a` stream that doesn't exist.
      function buildArgs(includeAudio: boolean) {
        let filterComplex = `[${bgIndex}:v]format=yuv420p[base0]`;
        let lastLabel = "base0";
        let chainIdx = 0;

        orderedClips.forEach((clip) => {
          if (clip.type === "audio") return;
          if (clip.type === "text") {
            if (!clip.text?.trim()) return;
            const fontSize = Math.max(16, Math.round(h * ((clip.fontSize ?? 5) / 100)));
            const xExpr = `(w*${clip.x.toFixed(4)})-text_w/2`;
            const yExpr = `(h*${clip.y.toFixed(4)})-text_h/2`;
            const nextLabel = `c${chainIdx++}`;
            const boxPart = clip.bgColor
              ? `:box=1:boxcolor=${toFFmpegColor(clip.bgColor, clip.opacity)}:boxborderw=12`
              : ":box=0";
            const outlinePart = clip.strokeColor
              ? `:borderw=${clip.strokeWidth ?? 6}:bordercolor=${toFFmpegColor(clip.strokeColor, clip.opacity)}`
              : "";
            const shadowPart = clip.shadowColor
              ? `:shadowx=${Math.max(1, Math.round(fontSize * 0.08))}:shadowy=${Math.max(1, Math.round(fontSize * 0.08))}:shadowcolor=${toFFmpegColor(clip.shadowColor, clip.opacity)}`
              : "";
            filterComplex += `;[${lastLabel}]drawtext=text='${escapeDrawtext(clip.text)}':fontcolor=${toFFmpegColor(clip.color || "#ffffff", clip.opacity)}:fontsize=${fontSize}${boxPart}${outlinePart}${shadowPart}:x=${xExpr}:y=${yExpr}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${nextLabel}]`;
            lastLabel = nextLabel;
            return;
          }
          const inIdx = inputIndexByClip[clip.id];
          if (inIdx === undefined) return;
          // video/image visual clip -> fit within (canvas * scale) box, matching the
          // canvas preview's contain-fit-then-scale math exactly (see computeMediaBox).
          const scaledLabel = `s${chainIdx}`;
          const fitW = Math.max(2, Math.round(w * clip.scale));
          const fitH = Math.max(2, Math.round(h * clip.scale));
          filterComplex += `;[${inIdx}:v]scale=w=${fitW}:h=${fitH}:force_original_aspect_ratio=decrease,format=yuva420p,colorchannelmixer=aa=${clip.opacity.toFixed(2)}[${scaledLabel}]`;
          const nextLabel = `c${chainIdx++}`;
          const xExpr = `(${w}*${clip.x.toFixed(4)})-overlay_w/2`;
          const yExpr = `(${h}*${clip.y.toFixed(4)})-overlay_h/2`;
          filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=x=${xExpr}:y=${yExpr}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${nextLabel}]`;
          lastLabel = nextLabel;
        });

        const args = [...inputArgs, "-filter_complex", null as any];

        // Audio: mix every video/audio clip that has volume > 0, delayed to its timeline start.
        let audioOutLabel: string | null = null;
        if (includeAudio) {
          const audioLabels: string[] = [];
          let aIdx = 0;
          orderedClips.forEach((clip) => {
            if (clip.type !== "video" && clip.type !== "audio") return;
            if (clip.volume <= 0) return;
            const inIdx = inputIndexByClip[clip.id];
            if (inIdx === undefined) return;
            const label = `a${aIdx++}`;
            const delayMs = Math.max(0, Math.round(clip.start * 1000));
            filterComplex += `;[${inIdx}:a]volume=${(clip.volume / 100).toFixed(2)},adelay=${delayMs}|${delayMs}[${label}]`;
            audioLabels.push(`[${label}]`);
          });
          if (audioLabels.length > 0) {
            audioOutLabel = "aout";
            filterComplex += `;${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0[${audioOutLabel}]`;
          }
        }

        args[args.length - 1] = filterComplex;
        args.push("-map", `[${lastLabel}]`);
        if (audioOutLabel) args.push("-map", `[${audioOutLabel}]`);
        args.push("-t", String(totalDuration), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p");
        if (audioOutLabel) args.push("-c:a", "aac");
        args.push("out.mp4");
        return args;
      }

      setStatus("Đang dựng video...");
      logLines.length = 0;
      let exitCode = await ffmpeg.exec(buildArgs(true));

      if (exitCode !== 0) {
        const tail = logLines.slice(-8).join(" | ");
        const looksLikeAudioIssue = /matches no streams|does not contain any stream|Invalid stream specifier|stream #0:1|Stream specifier ':a'/i.test(tail);
        if (looksLikeAudioIssue) {
          setStatus("Một clip không có track âm thanh — đang thử dựng lại không kèm tiếng của clip đó...");
          logLines.length = 0;
          exitCode = await ffmpeg.exec(buildArgs(false));
        }
        if (exitCode !== 0) {
          const finalTail = logLines.slice(-8).join(" | ");
          throw new Error(`FFmpeg dựng video thất bại${finalTail ? ": " + finalTail : ". Hãy thử với ít clip hơn hoặc định dạng phổ biến hơn."}`);
        }
      }

      const data = await ffmpeg.readFile("out.mp4");
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      downloadBlob(blob, "video_timeline.mp4");
      setStatus("Hoàn tất! Đã dựng video và tải xuống.");

      for (const n of Object.values(fileNames)) await ffmpeg.deleteFile(n).catch(() => {});
      await ffmpeg.deleteFile("out.mp4").catch(() => {});
      offProgress?.();
      offLog?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi dựng video.");
    } finally {
      setBusy(false);
    }
  }

  const rulerTicks = useMemo(() => {
    const step = pxPerSec >= 80 ? 1 : pxPerSec >= 40 ? 2 : 5;
    const ticks: number[] = [];
    for (let t = 0; t <= totalDuration + step; t += step) ticks.push(t);
    return ticks;
  }, [pxPerSec, totalDuration]);

  const selectedClip = useMemo(() => {
    for (const t of tracks) {
      const found = t.clips.find((c) => c.id === selectedClipId);
      if (found) return found;
    }
    return null;
  }, [tracks, selectedClipId]);

  const tracksTopFirst = useMemo(
    () => tracks.map((t, i) => ({ track: t, index: i })).reverse(),
    [tracks]
  );

  if (stage === "preset") {
    return <PresetPicker onConfirm={(w, h) => { setCanvasSize({ w, h }); setStage("editor"); }} />;
  }

  return (
    <div className="tool-page">
      <h1><Layers3 size={22} /> Trình Dựng Video Timeline</h1>
      <p className="tool-subtitle">
        Khung hình {canvasSize.w}×{canvasSize.h}. Nhập media vào thư viện, kéo xuống dòng thời gian ở bất kỳ vị trí nào, xếp track chồng lên nhau — xử lý bằng FFmpeg WebAssembly ngay trên trình duyệt.
      </p>

      <div
        className={`vt-wrap ${isDragOver ? "is-drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handlePageDrop}
      >
        {isDragOver && (
          <div className="vt-drop-overlay">
            <UploadCloud size={30} />
            <span>Thả vào đây để nhập vào thư viện — kéo thả trực tiếp xuống dòng thời gian để đặt vào đúng vị trí</span>
          </div>
        )}

        <div className="vt-workspace">
          <div className="vt-workspace-left">
            <div className="vt-preview">
              {!hasClips ? (
                <div className="vt-preview-empty">Thêm media để xem trước tại đây</div>
              ) : (
                <canvas ref={canvasRef}
                  onMouseDown={onCanvasMouseDown}
                  style={{ cursor: hitTestClip(currentTime, canvasSize.w / 2, canvasSize.h / 2) ? "move" : "default" }} />
              )}
            </div>

            <div className="vt-controls">
              <button className="tool-icon-btn" onClick={togglePlay} disabled={!hasClips} style={{ border: "1px solid var(--line)" }}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span className="vt-time-label">{formatDuration(currentTime)} / {formatDuration(totalDuration)}</span>
            </div>
          </div>

          <div className="tool-card vt-properties-panel">
            <div className="vt-panel-title">{selectedClip ? `Thuộc tính clip: ${selectedClip.name}` : "Thuộc tính clip"}</div>

            {!selectedClip && (
              <p className="vt-properties-empty">Chọn 1 clip trên dòng thời gian để chỉnh sửa thuộc tính.</p>
            )}

            {selectedClip?.type === "text" && (
              <>
                <div className="tool-row" style={{ marginTop: 0 }}>
                  <div className="tool-field" style={{ flex: 2 }}>
                    <label>Nội dung</label>
                    <input type="text" value={selectedClip.text} onChange={(e) => updateClip(selectedClip.id, { text: e.target.value })} />
                  </div>
                  <div className="tool-field" style={{ maxWidth: 60 }}>
                    <label>Màu chữ</label>
                    <input type="color" value={selectedClip.color} onChange={(e) => updateClip(selectedClip.id, { color: e.target.value })} style={{ height: 36, padding: 2 }} />
                  </div>
                </div>

                <div className="tool-field">
                  <label>Font chữ</label>
                  <select value={selectedClip.fontFamily ?? "Inter"} onChange={(e) => updateClip(selectedClip.id, { fontFamily: e.target.value })}>
                    {TEXT_FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="tool-field">
                  <label>Cỡ chữ ({selectedClip.fontSize ?? 5}%)</label>
                  <input type="range" min={2} max={15} step={0.5} value={selectedClip.fontSize ?? 5} onChange={(e) => updateClip(selectedClip.id, { fontSize: Number(e.target.value) })} />
                </div>

                <div className="tool-row">
                  <label className="vt-checkbox-field">
                    <input type="checkbox" checked={selectedClip.bold !== false} onChange={(e) => updateClip(selectedClip.id, { bold: e.target.checked })} />
                    Chữ đậm
                  </label>
                  <label className="vt-checkbox-field">
                    <input type="checkbox" checked={!!selectedClip.italic} onChange={(e) => updateClip(selectedClip.id, { italic: e.target.checked })} />
                    Chữ nghiêng
                  </label>
                </div>

                <div className="tool-field">
                  <label>Phong cách nhanh</label>
                  <div className="vt-style-presets">
                    {TEXT_STYLE_PRESETS.map((p) => (
                      <button key={p.label} type="button" className="tool-btn tool-btn-secondary"
                        onClick={() => updateClip(selectedClip.id, p.patch)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="tool-field">
                  <label className="vt-checkbox-field">
                    <input type="checkbox" checked={!!selectedClip.strokeColor}
                      onChange={(e) => updateClip(selectedClip.id, { strokeColor: e.target.checked ? "#000000" : undefined, strokeWidth: e.target.checked ? 6 : undefined })} />
                    Viền chữ
                  </label>
                  {selectedClip.strokeColor && (
                    <div className="vt-inline-controls">
                      <input type="color" value={selectedClip.strokeColor} onChange={(e) => updateClip(selectedClip.id, { strokeColor: e.target.value })} />
                      <input type="range" min={1} max={15} value={selectedClip.strokeWidth ?? 6} onChange={(e) => updateClip(selectedClip.id, { strokeWidth: Number(e.target.value) })} />
                      <span className="vt-inline-value">{selectedClip.strokeWidth ?? 6}px</span>
                    </div>
                  )}
                </div>

                <div className="tool-field">
                  <label className="vt-checkbox-field">
                    <input type="checkbox" checked={!!selectedClip.shadowColor}
                      onChange={(e) => updateClip(selectedClip.id, { shadowColor: e.target.checked ? "rgba(0,0,0,0.8)" : undefined })} />
                    Đổ bóng
                  </label>
                  {selectedClip.shadowColor && (
                    <div className="vt-inline-controls">
                      <input type="color" value="#000000" onChange={(e) => updateClip(selectedClip.id, { shadowColor: e.target.value })} />
                    </div>
                  )}
                </div>

                <div className="tool-field">
                  <label className="vt-checkbox-field">
                    <input type="checkbox" checked={!!selectedClip.bgColor}
                      onChange={(e) => updateClip(selectedClip.id, { bgColor: e.target.checked ? "rgba(0,0,0,0.6)" : undefined })} />
                    Nền phía sau chữ
                  </label>
                  {selectedClip.bgColor && (
                    <div className="vt-inline-controls">
                      <input type="color" value="#000000" onChange={(e) => {
                        const opacityMatch = selectedClip.bgColor?.match(/[\d.]+\)$/);
                        const alpha = opacityMatch ? opacityMatch[0].replace(")", "") : "0.6";
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                        updateClip(selectedClip.id, { bgColor: `rgba(${r},${g},${b},${alpha})` });
                      }} />
                      <select
                        value={selectedClip.bgColor?.includes("0.3") ? "0.3" : selectedClip.bgColor?.includes("0.9") ? "0.9" : selectedClip.bgColor?.includes("1)") ? "1" : "0.6"}
                        onChange={(e) => {
                          const hexMatch = selectedClip.bgColor?.match(/rgba?\(([\d]+),([\d]+),([\d]+)/);
                          const [r, g, b] = hexMatch ? [hexMatch[1], hexMatch[2], hexMatch[3]] : [0, 0, 0];
                          updateClip(selectedClip.id, { bgColor: `rgba(${r},${g},${b},${e.target.value})` });
                        }}>
                        <option value="0.3">Mờ (30%)</option>
                        <option value="0.6">Vừa (60%)</option>
                        <option value="0.9">Đậm (90%)</option>
                        <option value="1">Đặc (100%)</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="tool-field">
                  <label>Vị trí nhanh</label>
                  <div className="vt-quick-pos">
                    <button type="button" className="tool-btn tool-btn-secondary" onClick={() => updateClip(selectedClip.id, { y: 0.12 })}>Trên</button>
                    <button type="button" className="tool-btn tool-btn-secondary" onClick={() => updateClip(selectedClip.id, { y: 0.5 })}>Giữa</button>
                    <button type="button" className="tool-btn tool-btn-secondary" onClick={() => updateClip(selectedClip.id, { y: 0.88 })}>Dưới</button>
                  </div>
                </div>
              </>
            )}

            {selectedClip && (selectedClip.type === "video" || selectedClip.type === "image") && (
              <>
                <div className="tool-field" style={{ marginTop: 0 }}>
                  <label>Kích thước ({Math.round(selectedClip.scale * 100)}%)</label>
                  <input type="range" min={0.1} max={2} step={0.05} value={selectedClip.scale} onChange={(e) => updateClip(selectedClip.id, { scale: Number(e.target.value) })} />
                </div>
                <div className="tool-field">
                  <label>Độ mờ ({Math.round(selectedClip.opacity * 100)}%)</label>
                  <input type="range" min={0} max={1} step={0.05} value={selectedClip.opacity} onChange={(e) => updateClip(selectedClip.id, { opacity: Number(e.target.value) })} />
                </div>
              </>
            )}

            {selectedClip && (selectedClip.type === "video" || selectedClip.type === "audio") && (
              <div className="tool-field">
                <label>Âm lượng ({selectedClip.volume}%)</label>
                <input type="range" min={0} max={200} value={selectedClip.volume} onChange={(e) => updateClip(selectedClip.id, { volume: Number(e.target.value) })} />
              </div>
            )}

            {selectedClip && selectedClip.type !== "audio" && (
              <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>Kéo trực tiếp clip này trên khung xem trước để đổi vị trí.</p>
            )}
          </div>
        </div>

        <div className="tool-card vt-media-library">
          <div className="vt-panel-title">Thư viện media ({mediaLibrary.length})</div>
          <div className="vt-media-grid">
            {mediaLibrary.map((m) => {
              const Icon = LAYER_META[m.kind].icon;
              return (
                <div key={m.id} className="vt-media-card"
                  style={{ ["--layer-color" as string]: LAYER_META[m.kind].color }}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", m.id)}
                  onClick={() => quickAddMedia(m)}
                  title="Kéo xuống dòng thời gian, hoặc bấm để thêm nhanh tại vị trí đang xem">
                  <Icon size={16} />
                  <span className="vt-media-name">{m.name}</span>
                  {m.sourceDuration !== undefined && <span className="vt-media-dur">{formatDuration(m.sourceDuration)}</span>}
                </div>
              );
            })}
            <button type="button" className="vt-media-add" onClick={() => libraryInputRef.current?.click()}>
              <Plus size={16} /> Nhập file
            </button>
            <button type="button" className="vt-media-add" onClick={quickAddText}>
              <Type size={16} color={LAYER_META.text.color} /> Thêm chữ
            </button>
            <input ref={libraryInputRef} type="file" hidden multiple accept="video/*,image/*,audio/*"
              onChange={(e) => { void importFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "8px 0 0" }}>
            Mẹo: nếu hộp thoại chọn file bị treo (hay gặp với MP3), hãy <strong>kéo thả file</strong> trực tiếp vào trang thay vì bấm nút. Mỗi file trong thư viện có thể kéo xuống dòng thời gian nhiều lần.
          </p>
        </div>

        <div className="vt-zoom-bar">
          <ZoomOut size={13} style={{ flexShrink: 0 }} />
          <input
            type="range"
            className="vt-zoom-slider"
            min={0}
            max={100}
            value={zoomPct}
            onChange={(e) => setZoomPct(Number(e.target.value))}
            title="Phóng to/thu nhỏ dòng thời gian"
          />
          <ZoomIn size={14} style={{ flexShrink: 0 }} />
          <span className="vt-zoom-pct">{zoomPct}%</span>
        </div>

        <div className="vt-timeline-scroll" ref={scrollRef}
          onDragOver={onTimelineDragOver}
          onDrop={onTimelineDrop}
          onDragLeave={() => setDragOverTrackIndex(null)}>
          <div className="vt-timeline-inner" style={{ width: Math.max(600, totalDuration * pxPerSec + 40) }}>
            <div className="vt-track-row" style={{ marginTop: 0 }}>
              <div className="vt-track-label" />
              <div className="vt-ruler" ref={rulerRef} onMouseDown={onRulerMouseDown} style={{ width: Math.max(400, totalDuration * pxPerSec), cursor: "pointer" }}>
                {rulerTicks.map((t) => (
                  <div key={t} className="vt-ruler-tick" style={{ left: t * pxPerSec }}>{formatDuration(t)}</div>
                ))}
              </div>
            </div>

            {tracksTopFirst.map(({ track, index }) => (
              <div key={track.id} data-track-index={index}
                className={`vt-track-row ${!track.visible ? "is-hidden-layer" : ""} ${draggingTrackId === track.id ? "is-reordering" : ""} ${dragOverTrackIndex === index ? "is-drop-target" : ""}`}>
                <div className="vt-track-label" onMouseDown={(e) => startTrackReorder(track, e)} title="Kéo để đổi thứ tự track (trên = lớp trước)">
                  <button className="tool-icon-btn" onClick={(e) => { e.stopPropagation(); toggleTrackVisible(track.id); }}>
                    {track.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <GripVertical size={13} className="vt-track-grip" />
                </div>
                <div className="vt-track-lane" style={{ width: Math.max(400, totalDuration * pxPerSec) }} onMouseDown={onRulerMouseDown}>
                  {track.clips.map((clip) => {
                    const meta = LAYER_META[clip.type];
                    return (
                      <div
                        key={clip.id}
                        className={`vt-clip-block ${selectedClipId === clip.id ? "is-selected" : ""}`}
                        style={{ left: clip.start * pxPerSec, width: Math.max(6, clip.duration * pxPerSec), ["--layer-color" as string]: meta.color }}
                        onMouseDown={(e) => startTimeDrag("move-time", clip, track, e)}
                        onDoubleClick={() => removeClip(clip.id)}
                        title={`${clip.name} — kéo để dời thời điểm, kéo mép để cắt, bấm đúp để xoá`}
                      >
                        <div className="vt-trim-handle left" onMouseDown={(e) => startTimeDrag("trim-left", clip, track, e)} />
                        <span className="vt-clip-label">{clip.name}</span>
                        <button className="vt-clip-delete" onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }}><X size={10} /></button>
                        <div className="vt-trim-handle right" onMouseDown={(e) => startTimeDrag("trim-right", clip, track, e)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="vt-track-row vt-new-track-zone" data-track-index="new">
              <div className="vt-track-label" />
              <div className={`vt-track-lane vt-empty-lane ${dragOverTrackIndex === "new" ? "is-drop-target" : ""}`} style={{ width: Math.max(400, totalDuration * pxPerSec) }}>
                Kéo media từ thư viện xuống đây để tạo track mới
              </div>
            </div>

            {snapGuide != null && <div className="vt-snap-guide" style={{ left: 90 + snapGuide * pxPerSec }} />}

            <div className="vt-playhead" style={{ left: 90 + currentTime * pxPerSec }}>
              <div
                className="vt-playhead-handle"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsPlaying(false);
                  dragStateRef.current = { type: "scrub", id: "", startX: e.clientX, orig: { time: currentTime } };
                }}
              />
            </div>
          </div>
        </div>

        <div className="tool-row">
          <button className="tool-btn" onClick={handleExport} disabled={busy || !hasClips}>
            <Download size={15} /> {busy ? `Đang dựng video (${progress}%)` : "Dựng và tải video MP4"}
          </button>
        </div>
        {busy && <div className="tool-progress-track"><div className="tool-progress-fill" style={{ width: `${progress}%` }} /></div>}
        {status && !error && <div className="tool-status-ok">{status}</div>}
        {error && <div className="tool-status-error">{error}</div>}
      </div>
    </div>
  );
}
