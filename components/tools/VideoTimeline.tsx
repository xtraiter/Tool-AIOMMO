"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Layers3, Play, Pause, SkipBack, Undo2, Redo2, ZoomIn, ZoomOut, Plus, Type, Music, Scissors, Trash2, Copy,
  Volume2, SlidersHorizontal, Pencil, Clock, RectangleHorizontal, Download, X, UploadCloud,
} from "lucide-react";
import { downloadBlob } from "@/lib/ffmpegLoader";
import { terminateSharedFfmpeg } from "@/lib/ffmpegLoader";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import { useTr } from "@/lib/i18n";
import { fmtTime, clamp } from "@/lib/timeFormat";
import { safeFilename } from "@/lib/filename";
import { ProgressBar } from "./ProgressBar";
import { TimelineView, type TimelineApi, type TimelineHandle } from "./timeline/TimelineView";
import { MediaPool } from "./timeline/pool";
import { clipBox, drawFrame } from "./timeline/render";
import { exportProject } from "./timeline/exporter";
import { addFilmstrip, importFile, mediaKind } from "./timeline/importMedia";
import {
  DEFAULT_IMAGE_DUR, DEFAULT_TEXT_DUR, DEFAULT_TEXT_STYLE, RATIOS, addClip, canvasSize, clipAt, duplicateClip, end, hasAudio, makeClip,
  moveFree, projectDuration, removeClip, reorderMain, setDuration, setSpeed, splitClip, trimLeft, trimRight, updateClip,
  type Clip, type Media, type Project, type RatioId, type TextStyle,
} from "./timeline/model";
import "./tool-page.css";
import "./video-editor.css";

type Panel = "audio" | "look" | "text" | "duration" | "ratio" | "export";

const SWATCHES = ["#ffffff", "#000000", "#ffeb3b", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#3b82f6", "#22c55e"];
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <label className="te-slider">
      <span><em>{label}</em><b>{format(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function VideoTimeline() {
  const tr = useTr();
  const [project, setProjectState] = useState<Project>({ clips: [], ratio: "16:9" });
  const projectRef = useRef(project);
  const [media, setMedia] = useState<Map<string, Media>>(new Map());
  const mediaRef = useRef(media);
  const [, setMediaVer] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [pps, setPps] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [time, setTimeState] = useState(0);
  const timeRef = useRef(0);
  const [panel, setPanel] = useState<Panel>("audio");
  const [busyMsg, setBusyMsg] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [exp, setExp] = useState<{ pct: number; label: string } | null>(null);
  const [expRes, setExpRes] = useState<720 | 1080>(720);
  const [projectName, setProjectName] = useState("");
  const [, setHistVer] = useState(0);
  const cancelled = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const poolRef = useRef<MediaPool | null>(null);
  const rafRef = useRef(0);
  const drawRaf = useRef(0);
  const playingRef = useRef(false);
  const alive = useRef(true);

  useBackgroundBusy(!!exp || !!busyMsg);

  // ---------------------------------------------------------------- history
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastKey = useRef<{ key: string; t: number } | null>(null);
  const batchBase = useRef<Project | null>(null);

  const setProject = useCallback((p: Project) => { projectRef.current = p; setProjectState(p); }, []);
  const pushPast = (p: Project) => {
    past.current.push(p);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    setHistVer((v) => v + 1);
  };
  const commit = useCallback((fn: (p: Project) => Project, key?: string) => {
    const cur = projectRef.current;
    const next = fn(cur);
    if (next === cur) return null;
    const now = Date.now();
    if (!(key && lastKey.current?.key === key && now - lastKey.current.t < 900)) pushPast(cur);
    lastKey.current = key ? { key, t: now } : null;
    setProject(next);
    return next;
  }, [setProject]);
  const live = useCallback((fn: (p: Project) => Project) => {
    const next = fn(projectRef.current);
    if (next !== projectRef.current) setProject(next);
  }, [setProject]);

  const undo = () => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(projectRef.current);
    setProject(p);
    setHistVer((v) => v + 1);
  };
  const redo = () => {
    const p = future.current.pop();
    if (!p) return;
    past.current.push(projectRef.current);
    setProject(p);
    setHistVer((v) => v + 1);
  };

  const total = useMemo(() => projectDuration(project), [project]);
  const totalRef = useRef(total);
  totalRef.current = total;
  const selected = useMemo(() => project.clips.find((c) => c.id === selectedId) ?? null, [project, selectedId]);
  selectedRef.current = selectedId;
  const { w: W, h: H } = useMemo(() => canvasSize(project.ratio, 720), [project.ratio]);

  // ---------------------------------------------------------------- drawing & clock
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const pool = poolRef.current;
    if (!cv || !pool) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, cv.width, cv.height, timeRef.current, projectRef.current, mediaRef.current, pool, selectedRef.current, !playingRef.current);
  }, []);
  const requestDraw = useCallback(() => {
    if (drawRaf.current) return;
    drawRaf.current = requestAnimationFrame(() => { drawRaf.current = 0; draw(); });
  }, [draw]);

  useEffect(() => {
    alive.current = true;
    cancelled.current = false;
    const pool = new MediaPool();
    pool.onFrameReady = requestDraw;
    poolRef.current = pool;
    return () => {
      alive.current = false;
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(drawRaf.current);
      drawRaf.current = 0;
      cancelled.current = true;
      pool.dispose();
      mediaRef.current.forEach((m) => URL.revokeObjectURL(m.url));
    };
  }, [requestDraw]);

  useEffect(() => {
    poolRef.current?.ensure(project.clips, media);
    poolRef.current?.sync(timeRef.current, playingRef.current, project.clips);
    requestDraw();
  }, [project, media, requestDraw]);

  useEffect(() => { requestDraw(); }, [selectedId, W, H, requestDraw]);

  const seek = useCallback((t: number, fromScroll = false) => {
    const clamped = clamp(t, 0, totalRef.current);
    timeRef.current = clamped;
    if (!fromScroll) timelineRef.current?.setTime(clamped);
    setTimeState(clamped);
    poolRef.current?.sync(clamped, false, projectRef.current.clips);
    requestDraw();
  }, [requestDraw]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    playingRef.current = false;
    setPlaying(false);
    poolRef.current?.pauseAll();
    requestDraw();
  }, [requestDraw]);

  const play = useCallback(() => {
    if (totalRef.current <= 0) return;
    if (timeRef.current >= totalRef.current - 0.05) seek(0);
    playingRef.current = true;
    setPlaying(true);
    let last = performance.now();
    let lastUi = 0;
    const loop = (ts: number) => {
      if (!playingRef.current) return;
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      let t = timeRef.current + dt;
      const ended = t >= totalRef.current;
      if (ended) t = totalRef.current;
      timeRef.current = t;
      timelineRef.current?.setTime(t);
      poolRef.current?.sync(t, true, projectRef.current.clips);
      draw();
      if (ts - lastUi > 100) { lastUi = ts; setTimeState(t); }
      if (ended) { setTimeState(t); stop(); return; }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [draw, seek, stop]);

  const onScrubTo = useCallback((t: number) => {
    if (playingRef.current) stop();
    seek(t, true);
  }, [seek, stop]);

  // ---------------------------------------------------------------- importing
  async function importFiles(files: FileList | File[], only?: "audio") {
    const list = Array.from(files);
    if (!list.length) return;
    setError("");
    setBusyMsg(tr("Đang nhập media...", "Importing media..."));
    try {
      for (const file of list) {
        const kind = mediaKind(file);
        if (!kind || (only === "audio" && kind !== "audio")) {
          setError(tr(`Không hỗ trợ tệp "${file.name}".`, `"${file.name}" is not a supported file.`));
          continue;
        }
        const m = await importFile(file);
        if (!m) {
          setError(tr(`Không đọc được "${file.name}" (định dạng hoặc codec chưa được trình duyệt hỗ trợ).`, `Could not read "${file.name}" (format or codec not supported by this browser).`));
          continue;
        }
        if (!alive.current) return;
        const next = new Map(mediaRef.current);
        next.set(m.id, m);
        mediaRef.current = next;
        setMedia(next);

        const hadMain = projectRef.current.clips.some((c) => c.lane === "main");
        let clip: Clip;
        if (m.kind === "audio") {
          clip = makeClip({ lane: "audio", kind: "audio", name: m.name, mediaId: m.id, start: timeRef.current, dur: m.duration });
        } else {
          clip = makeClip({ lane: "main", kind: m.kind, name: m.name, mediaId: m.id, start: 0, dur: m.kind === "image" ? DEFAULT_IMAGE_DUR : m.duration });
        }
        const at = clip.lane === "main" ? undefined : timeRef.current;
        const added = commit((p) => {
          let q = addClip(p, clip, at);
          if (!hadMain && clip.lane === "main" && m.w && m.h) {
            const r: RatioId = m.h > m.w ? "9:16" : m.w === m.h ? "1:1" : "16:9";
            q = { ...q, ratio: r };
          }
          return q;
        });
        if (added) setSelectedId(clip.id);
        if (m.kind === "video") {
          addFilmstrip(m, () => !alive.current).then(() => { setMediaVer((v) => v + 1); });
        }
      }
    } finally {
      setBusyMsg("");
    }
  }

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>, only?: "audio") => {
    if (e.target.files) importFiles(e.target.files, only);
    e.target.value = "";
  };

  // ---------------------------------------------------------------- editing actions
  const addText = () => {
    const clip = makeClip({
      lane: "text", kind: "text", name: "Text", start: timeRef.current, dur: DEFAULT_TEXT_DUR,
      text: tr("Nhập chữ của bạn", "Your text here"), style: { ...DEFAULT_TEXT_STYLE }, y: 0.8,
    });
    commit((p) => addClip(p, clip, timeRef.current));
    setSelectedId(clip.id);
    setPanel("text");
  };

  const doSplit = () => {
    const t = timeRef.current;
    const target = selected && t > selected.start && t < end(selected) ? selected : clipAt(projectRef.current, t, ["main"]) ?? null;
    if (!target) return;
    let rightId: string | null = null;
    commit((p) => { const r = splitClip(p, target.id, t); rightId = r.rightId; return r.project; });
    if (rightId) setSelectedId(target.id);
  };
  const doDelete = () => {
    if (!selected) return;
    commit((p) => removeClip(p, selected.id));
    setSelectedId(null);
  };
  const doDuplicate = () => {
    if (!selected) return;
    let id: string | null = null;
    commit((p) => { const r = duplicateClip(p, selected.id); id = r.newId; return r.project; });
    if (id) setSelectedId(id);
  };
  const patch = (p: Partial<Clip>, key: string) => { if (selected) commit((pr) => updateClip(pr, selected.id, p), `${key}:${selected.id}`); };
  const patchStyle = (s: Partial<TextStyle>, key: string) => { if (selected?.style) patch({ style: { ...selected.style, ...s } }, key); };
  const mediaOf = (id: string) => { const c = projectRef.current.clips.find((x) => x.id === id); return c?.mediaId ? mediaRef.current.get(c.mediaId) : undefined; };

  const api: TimelineApi = useMemo(() => ({
    begin: () => { batchBase.current = projectRef.current; },
    finish: () => {
      const base = batchBase.current;
      batchBase.current = null;
      if (base && base !== projectRef.current) pushPast(base);
    },
    moveFree: (id, s) => live((p) => moveFree(p, id, s)),
    reorderMain: (id, i) => live((p) => reorderMain(p, id, i)),
    trimLeft: (id, t) => live((p) => trimLeft(p, id, t)),
    trimRight: (id, t) => live((p) => trimRight(p, id, t, mediaOf(id))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [live]);

  // ---------------------------------------------------------------- preview: drag / scale the selected clip
  const canvasDrag = useRef<null | { mode: "move" | "scale"; id: string; dx: number; dy: number; baseScale: number; baseDist: number; began: boolean }>(null);
  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, unit: W / r.width };
  };
  const onCanvasDown = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const p = toCanvas(e);
    const t = timeRef.current;
    const visible = projectRef.current.clips.filter((c) => c.kind !== "audio" && t >= c.start && t < end(c));
    const boxOf = (c: Clip) => clipBox(ctx, c, c.mediaId ? mediaRef.current.get(c.mediaId) : undefined, W, H);
    const sel = visible.find((c) => c.id === selectedRef.current);
    if (sel) {
      const b = boxOf(sel);
      const hx = b.cx + b.w / 2, hy = b.cy + b.h / 2;
      if (Math.hypot(p.x - hx, p.y - hy) < 26 * p.unit) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        canvasDrag.current = { mode: "scale", id: sel.id, dx: 0, dy: 0, baseScale: sel.scale, baseDist: Math.max(10, Math.hypot(hx - b.cx, hy - b.cy)), began: false };
        return;
      }
    }
    const order = ["text", "overlay", "main"] as const;
    const hit = order.flatMap((lane) => visible.filter((c) => c.lane === lane).reverse()).find((c) => {
      const b = boxOf(c);
      return Math.abs(p.x - b.cx) <= b.w / 2 && Math.abs(p.y - b.cy) <= b.h / 2;
    });
    if (!hit) { setSelectedId(null); return; }
    setSelectedId(hit.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    canvasDrag.current = { mode: "move", id: hit.id, dx: p.x - hit.x * W, dy: p.y - hit.y * H, baseScale: hit.scale, baseDist: 1, began: false };
  };
  const onCanvasMove = (e: React.PointerEvent) => {
    const d = canvasDrag.current;
    if (!d) return;
    if (!d.began) { d.began = true; api.begin(); }
    const p = toCanvas(e);
    const c = projectRef.current.clips.find((x) => x.id === d.id);
    if (!c) return;
    if (d.mode === "move") {
      live((pr) => updateClip(pr, d.id, { x: clamp((p.x - d.dx) / W, 0, 1), y: clamp((p.y - d.dy) / H, 0, 1) }));
    } else {
      const dist = Math.hypot(p.x - c.x * W, p.y - c.y * H);
      live((pr) => updateClip(pr, d.id, { scale: clamp((d.baseScale * dist) / d.baseDist, 0.1, 5) }));
    }
  };
  const onCanvasUp = () => {
    if (canvasDrag.current?.began) api.finish();
    canvasDrag.current = null;
  };

  // ---------------------------------------------------------------- keyboard + zoom shortcuts
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") { e.preventDefault(); playingRef.current ? stop() : play(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); doDelete(); }
      else if (e.key.toLowerCase() === "s" && !mod) { e.preventDefault(); doSplit(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); onScrubTo(timeRef.current - (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onScrubTo(timeRef.current + (e.shiftKey ? 1 : 1 / 30)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, play, stop, onScrubTo]);

  useEffect(() => {
    const el = appRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !(e.target as HTMLElement).closest(".te-tl")) return;
      e.preventDefault();
      setPps((v) => clamp(v * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 6, 300));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---------------------------------------------------------------- export
  async function doExport() {
    if (!project.clips.some((c) => c.lane === "main" || c.lane === "overlay")) {
      setError(tr("Hãy thêm ít nhất 1 video hoặc ảnh vào dự án.", "Add at least one video or image to the project."));
      return;
    }
    stop();
    cancelled.current = false;
    setError("");
    setExp({ pct: 0, label: tr("Đang chuẩn bị...", "Preparing...") });
    try {
      const blob = await exportProject({
        project, media, longEdge: expRes === 1080 ? 1920 : 1280, tr,
        onProgress: (f, label) => alive.current && setExp({ pct: f * 100, label }),
        isCancelled: () => cancelled.current,
      });
      downloadBlob(blob, safeFilename(projectName.trim() || tr("Video dựng", "Edited video"), "mp4"));
      setExp({ pct: 100, label: tr("Hoàn tất! Đã tải video xuống.", "Done! The video was downloaded.") });
      setTimeout(() => alive.current && setExp(null), 2500);
    } catch (e: any) {
      if (e?.message === "CANCELLED") setExp(null);
      else { setExp(null); setError(e?.message || tr("Có lỗi xảy ra khi dựng video.", "Something went wrong while rendering.")); }
    }
  }
  useEffect(() => {
    if (error) document.querySelector(".te-error")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);
  const cancelExport = () => { cancelled.current = true; terminateSharedFfmpeg(); setExp(null); };

  // ---------------------------------------------------------------- panel sections available for the selection
  const kind = selected?.kind;
  const sections: Panel[] = [];
  if (selected) {
    if (kind === "video" || kind === "audio") sections.push("audio");
    if (kind === "video" || kind === "image" || kind === "text") sections.push("look");
    if (kind === "text") sections.push("text");
    if (kind === "image" || kind === "text") sections.push("duration");
  }
  sections.push("ratio", "export");
  useEffect(() => {
    if (selected && !sections.includes(panel)) setPanel(sections[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.kind]);
  const open = (p: Panel) => panel === p;
  const canSplit = !!(selected ? time > selected.start + 0.1 && time < end(selected) - 0.1 : clipAt(project, time, ["main"]));

  const tbBtn = (icon: React.ReactNode, label: string, onClick: () => void, opts: { active?: boolean; disabled?: boolean; danger?: boolean } = {}) => (
    <button type="button" className={`te-tb${opts.active ? " is-active" : ""}${opts.danger ? " is-danger" : ""}`} onClick={onClick} disabled={opts.disabled}>
      {icon}<span>{label}</span>
    </button>
  );
  const showPanel = (p: Panel) => {
    setPanel(p);
    // Bring the section into view (the side panel scrolls on desktop, the page on phones) and focus the text box for "Edit text".
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`.te-panel [data-sec="${p}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (p === "text") el?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    }));
  };
  const panelBtn = (p: Panel, icon: React.ReactNode, label: string) => tbBtn(icon, label, () => showPanel(p), { active: open(p) });

  const empty = project.clips.length === 0;

  return (
    <div className="tool-page te-page">
      <h1><Layers3 size={22} /> {tr("Trình Dựng Video", "Video Editor")}</h1>
      <p className="tool-subtitle">
        {tr(
          "Kéo dòng thời gian để lướt qua video — đầu phát đỏ luôn đứng giữa. Bấm một clip để chỉnh: tách, xóa, đổi tốc độ, âm lượng, thêm chữ và nhạc. Mọi thứ chạy trên thiết bị của bạn.",
          "Swipe the timeline to scrub — the red playhead stays in the middle. Tap a clip to edit it: split, delete, change speed and volume, add text and music. Everything runs on your device."
        )}
      </p>

      <input ref={fileInput} type="file" accept="video/*,image/*,audio/*" multiple hidden onChange={(e) => onFilesPicked(e)} />
      <input ref={audioInput} type="file" accept="audio/*" multiple hidden onChange={(e) => onFilesPicked(e, "audio")} />

      <div
        ref={appRef}
        className={`te-app${dragOver ? " is-drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files); }}
      >
        <div className="te-top">
          <div className="te-stage">
            <div className={`te-preview${selectedId ? " is-editing" : ""}`} style={{ ["--ar" as string]: W / H }}>
              <canvas
                ref={(el) => { canvasRef.current = el; if (el && (el.width !== W || el.height !== H)) { el.width = W; el.height = H; } }}
                onPointerDown={onCanvasDown}
                onPointerMove={onCanvasMove}
                onPointerUp={onCanvasUp}
                onPointerCancel={onCanvasUp}
              />
              {empty && (
                <button type="button" className="te-empty" onClick={() => fileInput.current?.click()}>
                  <UploadCloud size={30} />
                  <strong>{tr("Bấm để thêm video, ảnh hoặc nhạc", "Tap to add videos, images or music")}</strong>
                  <span>{tr("hoặc kéo thả tệp vào đây", "or drop files here")}</span>
                </button>
              )}
              {busyMsg && <div className="te-busy">{busyMsg}</div>}
            </div>

            <div className="te-transport">
              <button type="button" className="te-icon" onClick={() => onScrubTo(0)} disabled={empty} aria-label={tr("Về đầu", "Go to start")}><SkipBack size={18} /></button>
              <button type="button" className="te-play" onClick={() => (playing ? stop() : play())} disabled={empty} aria-label={playing ? tr("Tạm dừng", "Pause") : tr("Phát", "Play")}>
                {playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <span className="te-clock">{fmtTime(time, 1)} <em>/ {fmtTime(total, 1)}</em></span>
              <span className="te-spacer" />
              <button type="button" className="te-icon" onClick={undo} disabled={!past.current.length} aria-label={tr("Hoàn tác", "Undo")}><Undo2 size={18} /></button>
              <button type="button" className="te-icon" onClick={redo} disabled={!future.current.length} aria-label={tr("Làm lại", "Redo")}><Redo2 size={18} /></button>
              <button type="button" className="te-icon" onClick={() => setPps((v) => clamp(v / 1.4, 6, 300))} aria-label={tr("Thu nhỏ", "Zoom out")}><ZoomOut size={18} /></button>
              <button type="button" className="te-icon" onClick={() => setPps((v) => clamp(v * 1.4, 6, 300))} aria-label={tr("Phóng to", "Zoom in")}><ZoomIn size={18} /></button>
            </div>
          </div>

          <aside className="te-panel" aria-live="polite">
            {!selected && (
              <p className="te-hint">
                {empty
                  ? tr("Bắt đầu bằng cách thêm media. Ảnh và video được nối liền nhau trên dòng chính; chữ và nhạc nằm ở các dòng riêng.", "Start by adding media. Images and videos join end to end on the main track; text and music sit on their own tracks.")
                  : tr("Bấm vào một clip trên dòng thời gian (hoặc trong khung xem trước) để chỉnh sửa. Bấm lên khoảng trống để bỏ chọn.", "Tap a clip on the timeline (or in the preview) to edit it. Tap empty space to deselect.")}
              </p>
            )}

            {selected && (selected.kind === "video" || selected.kind === "audio") && (
              <section data-sec="audio" className={`te-section${open("audio") ? " is-open" : ""}`}>
                <h3><Volume2 size={15} /> {tr("Âm thanh & tốc độ", "Audio & speed")}</h3>
                <Slider label={tr("Âm lượng", "Volume")} value={Math.round(selected.volume * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ volume: v / 100 }, "vol")} />
                <div className="te-speed" role="radiogroup" aria-label={tr("Tốc độ", "Speed")}>
                  {SPEEDS.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={selected.speed === s} className={selected.speed === s ? "is-active" : ""}
                      onClick={() => commit((p) => setSpeed(p, selected.id, s, mediaOf(selected.id)))}>{s}x</button>
                  ))}
                </div>
              </section>
            )}

            {selected && selected.kind !== "audio" && (
              <section data-sec="look" className={`te-section${open("look") ? " is-open" : ""}`}>
                <h3><SlidersHorizontal size={15} /> {tr("Hiển thị", "Appearance")}</h3>
                <Slider label={tr("Độ mờ", "Opacity")} value={Math.round(selected.opacity * 100)} min={5} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ opacity: v / 100 }, "op")} />
                <Slider label={tr("Kích thước", "Size")} value={Math.round(selected.scale * 100)} min={10} max={300} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ scale: v / 100 }, "sc")} />
                <Slider label={tr("Vị trí ngang", "Horizontal")} value={Math.round(selected.x * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ x: v / 100 }, "px")} />
                <Slider label={tr("Vị trí dọc", "Vertical")} value={Math.round(selected.y * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => patch({ y: v / 100 }, "py")} />
                <button type="button" className="tool-btn tool-btn-secondary te-small" onClick={() => patch({ x: 0.5, y: selected.kind === "text" ? 0.8 : 0.5, scale: 1, opacity: 1 }, "reset")}>{tr("Đặt lại", "Reset")}</button>
              </section>
            )}

            {selected?.kind === "text" && selected.style && (
              <section data-sec="text" className={`te-section${open("text") ? " is-open" : ""}`}>
                <h3><Pencil size={15} /> {tr("Nội dung chữ", "Text")}</h3>
                <textarea className="te-textarea" rows={3} value={selected.text ?? ""} onChange={(e) => patch({ text: e.target.value }, "txt")} aria-label={tr("Nội dung chữ", "Text")} />
                <Slider label={tr("Cỡ chữ", "Font size")} value={selected.style.size} min={3} max={20} step={0.5} format={(v) => `${v}`} onChange={(v) => patchStyle({ size: v }, "fs")} />
                <div className="te-swatches" role="radiogroup" aria-label={tr("Màu chữ", "Text colour")}>
                  {SWATCHES.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={selected.style!.color === c} className={selected.style!.color === c ? "is-active" : ""} style={{ background: c }} onClick={() => patchStyle({ color: c }, "col")} aria-label={c} />
                  ))}
                </div>
                <div className="te-toggles">
                  {([["bold", tr("Đậm", "Bold")], ["italic", tr("Nghiêng", "Italic")], ["stroke", tr("Viền", "Outline")], ["box", tr("Nền", "Box")], ["shadow", tr("Bóng", "Shadow")]] as const).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={selected.style![k]} className={selected.style![k] ? "is-active" : ""} onClick={() => patchStyle({ [k]: !selected.style![k] } as Partial<TextStyle>, `st-${k}`)}>{label}</button>
                  ))}
                </div>
              </section>
            )}

            {selected && (selected.kind === "image" || selected.kind === "text") && (
              <section data-sec="duration" className={`te-section${open("duration") ? " is-open" : ""}`}>
                <h3><Clock size={15} /> {tr("Thời lượng", "Duration")}</h3>
                <Slider label={tr("Hiển thị trong", "Shown for")} value={Number(selected.dur.toFixed(1))} min={0.5} max={30} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => commit((p) => setDuration(p, selected.id, v), `dur:${selected.id}`)} />
              </section>
            )}

            <section data-sec="ratio" className={`te-section${open("ratio") ? " is-open" : ""}`}>
              <h3><RectangleHorizontal size={15} /> {tr("Tỉ lệ khung hình", "Aspect ratio")}</h3>
              <div className="te-ratios" role="radiogroup" aria-label={tr("Tỉ lệ khung hình", "Aspect ratio")}>
                {RATIOS.map((r) => (
                  <button key={r.id} type="button" role="radio" aria-checked={project.ratio === r.id} className={project.ratio === r.id ? "is-active" : ""} onClick={() => commit((p) => ({ ...p, ratio: r.id }))}>
                    <i style={{ aspectRatio: `${r.w}/${r.h}` }} />{r.id}
                  </button>
                ))}
              </div>
            </section>

            <section data-sec="export" className={`te-section${open("export") ? " is-open" : ""}`}>
              <h3><Download size={15} /> {tr("Xuất video", "Export")}</h3>
              <label className="te-field">
                <span>{tr("Tên tệp", "File name")}</span>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={tr("Video dựng", "Edited video")} disabled={!!exp} />
              </label>
              <div className="te-ratios te-res" role="radiogroup" aria-label={tr("Độ phân giải", "Resolution")}>
                {([720, 1080] as const).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={expRes === r} className={expRes === r ? "is-active" : ""} onClick={() => setExpRes(r)} disabled={!!exp}>
                    {r}p<small>{r === 720 ? tr("nhanh", "fast") : tr("nét hơn", "sharper")}</small>
                  </button>
                ))}
              </div>
              {!exp ? (
                <button type="button" className="tool-btn te-export" onClick={doExport} disabled={empty}>
                  <Download size={16} /> {tr("Xuất MP4", "Export MP4")} ({fmtTime(total, 0)})
                </button>
              ) : (
                <>
                  <ProgressBar percent={exp.pct} label={exp.label} />
                  {exp.pct < 100 && <button type="button" className="tool-btn tool-btn-danger te-small" onClick={cancelExport}><X size={14} /> {tr("Hủy", "Cancel")}</button>}
                </>
              )}
            </section>
          </aside>
        </div>

        {error && <div className="tool-status-error te-error">{error}<button type="button" onClick={() => setError("")} aria-label={tr("Đóng", "Dismiss")}><X size={14} /></button></div>}

        <TimelineView
          ref={timelineRef}
          project={project}
          media={media}
          selectedId={selectedId}
          onSelect={setSelectedId}
          pps={pps}
          onScrubTo={onScrubTo}
          api={api}
          timeRef={timeRef}
          onAdd={() => fileInput.current?.click()}
          addLabel={tr("Thêm media", "Add media")}
          emptyHint={tr("Dòng thời gian trống", "Empty timeline")}
        />

        <div className="te-toolbar" role="toolbar" aria-label={tr("Công cụ", "Tools")}>
          {tbBtn(<Plus size={20} />, tr("Thêm", "Add"), () => fileInput.current?.click())}
          {tbBtn(<Type size={20} />, tr("Chữ", "Text"), addText)}
          {tbBtn(<Music size={20} />, tr("Nhạc", "Music"), () => audioInput.current?.click())}
          {selected && (
            <>
              <span className="te-tb-sep" />
              {tbBtn(<Scissors size={20} />, tr("Tách", "Split"), doSplit, { disabled: !canSplit })}
              {tbBtn(<Trash2 size={20} />, tr("Xóa", "Delete"), doDelete, { danger: true })}
              {tbBtn(<Copy size={20} />, tr("Nhân đôi", "Duplicate"), doDuplicate)}
              {sections.includes("audio") && panelBtn("audio", <Volume2 size={20} />, tr("Âm thanh", "Audio"))}
              {sections.includes("look") && panelBtn("look", <SlidersHorizontal size={20} />, tr("Hiển thị", "Look"))}
              {sections.includes("text") && panelBtn("text", <Pencil size={20} />, tr("Sửa chữ", "Edit text"))}
              {sections.includes("duration") && panelBtn("duration", <Clock size={20} />, tr("Thời lượng", "Duration"))}
            </>
          )}
          {!selected && canSplit && (<><span className="te-tb-sep" />{tbBtn(<Scissors size={20} />, tr("Tách", "Split"), doSplit)}</>)}
          <span className="te-tb-sep" />
          {panelBtn("ratio", <RectangleHorizontal size={20} />, tr("Tỉ lệ", "Ratio"))}
          {tbBtn(<Download size={20} />, tr("Xuất", "Export"), () => { showPanel("export"); if (!exp) void doExport(); }, { active: open("export") || !!exp, disabled: empty })}
        </div>
        <p className="te-shortcuts">{tr("Phím tắt: Space phát/dừng · S tách · Delete xóa · Ctrl+Z hoàn tác · ← → từng khung hình · Ctrl + lăn chuột để phóng to", "Shortcuts: Space play/pause · S split · Delete remove · Ctrl+Z undo · ← → frame step · Ctrl + scroll to zoom")}</p>
      </div>
    </div>
  );
}
