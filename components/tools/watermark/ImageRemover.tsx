"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brush, Square, Eraser, Undo2, Trash2, Sparkles, Download, UploadCloud, RotateCcw, Eye, Cpu, Check, X } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { downloadBlob, formatBytes } from "@/lib/ffmpegLoader";
import { safeFilename } from "@/lib/filename";
import { detectDevice, type DeviceInfo } from "@/lib/separation/device";
import { isModelCached, clearModelCache } from "@/lib/separation/modelCache";
import { INPAINT_TIERS, type InpaintTierId } from "@/lib/inpaint/models";
import { loadInpainter } from "@/lib/inpaint/engine";
import { removeMarked, type Box } from "@/lib/inpaint/process";
import { ProgressBar } from "../ProgressBar";

type Tool = "brush" | "rect" | "erase";
type Pt = { x: number; y: number };
type Stroke = { tool: Tool; size: number; pts: Pt[] };

const MAX_SIDE = 4096; // larger photos are scaled down first so the canvas and the crops stay within browser memory

function toCanvas(img: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c;
}

export function ImageRemover() {
  const tr = useTr();
  const inputRef = useRef<HTMLInputElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const current = useRef<ImageData | null>(null);
  const original = useRef<ImageData | null>(null);
  const history = useRef<ImageData[]>([]);
  const [histLen, setHistLen] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const live = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState(36);
  const [showOriginal, setShowOriginal] = useState(false);
  const [tierId, setTierId] = useState<InpaintTierId>("fast");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number | null; label: string } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const cancelled = useRef(false);
  const [dragOver, setDragOver] = useState(false);

  const tier = INPAINT_TIERS.find((t) => t.id === tierId)!;

  useEffect(() => {
    (async () => {
      const d = await detectDevice();
      setDevice(d);
      setTierId(d.mobile || (d.memoryGB !== null && d.memoryGB <= 2) ? "fast" : "best");
      const map: Record<string, boolean> = {};
      for (const t of INPAINT_TIERS) map[t.id] = await isModelCached(t.modelUrl);
      setCached(map);
    })();
    return () => { cancelled.current = true; };
  }, []);

  // ---- drawing -------------------------------------------------------------------------------------------------
  const paintBase = useCallback(() => {
    const cv = baseRef.current;
    const img = showOriginal ? original.current : current.current;
    if (!cv || !img) return;
    if (cv.width !== img.width || cv.height !== img.height) { cv.width = img.width; cv.height = img.height; }
    cv.getContext("2d")!.putImageData(img, 0, 0);
  }, [showOriginal]);

  const paintMask = useCallback((extra?: Stroke | null) => {
    const cv = maskRef.current;
    if (!cv || !size) return;
    if (cv.width !== size.w || cv.height !== size.h) { cv.width = size.w; cv.height = size.h; }
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const all = extra ? [...strokes, extra] : strokes;
    for (const s of all) {
      ctx.save();
      ctx.globalCompositeOperation = s.tool === "erase" ? "destination-out" : "source-over";
      ctx.fillStyle = ctx.strokeStyle = "#ff2d55";
      if (s.tool === "rect") {
        const a = s.pts[0], b = s.pts[s.pts.length - 1];
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      } else {
        ctx.lineWidth = s.size;
        ctx.lineCap = ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        if (s.pts.length === 1) ctx.lineTo(s.pts[0].x + 0.01, s.pts[0].y);
        for (const p of s.pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [strokes, size]);

  useEffect(() => { paintBase(); }, [paintBase, size, histLen, done]);
  useEffect(() => { paintMask(); }, [paintMask]);

  // ---- loading ---------------------------------------------------------------------------------------------------
  const loadFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError(tr("Hãy chọn một tệp ảnh (JPG, PNG, WebP...).", "Choose an image file (JPG, PNG, WebP...).")); return; }
    setError("");
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const c = toCanvas(bmp, w, h);
      bmp.close?.();
      const data = c.getContext("2d")!.getImageData(0, 0, w, h);
      original.current = data;
      current.current = data;
      history.current = [];
      setHistLen(0);
      setStrokes([]);
      setDone(null);
      setShowOriginal(false);
      setName(file.name.replace(/\.[^.]+$/, ""));
      setSize({ w, h });
    } catch {
      setError(tr("Không đọc được ảnh này. Thử ảnh JPG hoặc PNG khác.", "Couldn't read this image. Try another JPG or PNG."));
    }
  };

  // ---- pointer input ---------------------------------------------------------------------------------------------
  const toImage = (e: React.PointerEvent): Pt => {
    const r = maskRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size!.w, y: ((e.clientY - r.top) / r.height) * size!.h };
  };
  const imgBrush = () => {
    const r = maskRef.current!.getBoundingClientRect();
    return brush * (size!.w / r.width);
  };
  const onDown = (e: React.PointerEvent) => {
    if (!size || busy) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    live.current = { tool, size: imgBrush(), pts: [toImage(e)] };
    paintMask(live.current);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = live.current;
    if (!s) return;
    s.pts.push(toImage(e));
    paintMask(s);
  };
  const onUp = () => {
    const s = live.current;
    live.current = null;
    if (!s) return;
    if (s.tool === "rect") {
      const a = s.pts[0], b = s.pts[s.pts.length - 1];
      if (Math.abs(a.x - b.x) < 3 || Math.abs(a.y - b.y) < 3) { paintMask(); return; }
      s.pts = [a, b];
    }
    setStrokes((prev) => [...prev, s]);
  };

  // ---- run -------------------------------------------------------------------------------------------------------
  const boxes = useMemo<Box[]>(() => {
    const out: Box[] = [];
    for (const s of strokes) {
      if (s.tool === "erase") continue;
      const xs = s.pts.map((p) => p.x), ys = s.pts.map((p) => p.y);
      const pad = s.tool === "rect" ? 0 : s.size / 2;
      out.push({ x0: Math.max(0, Math.min(...xs) - pad), y0: Math.max(0, Math.min(...ys) - pad), x1: Math.min(size?.w ?? 0, Math.max(...xs) + pad), y1: Math.min(size?.h ?? 0, Math.max(...ys) + pad) });
    }
    return out;
  }, [strokes, size]);

  const hasMarks = useMemo(() => {
    const cv = maskRef.current;
    if (!cv || !boxes.length) return false;
    return true;
  }, [boxes]);

  const run = async () => {
    const cv = maskRef.current, img = current.current;
    if (!cv || !img || !size) return;
    // hole mask from what is painted on the mask canvas
    const a = cv.getContext("2d")!.getImageData(0, 0, size.w, size.h).data;
    const hole = new Uint8Array(size.w * size.h);
    let any = false;
    for (let i = 0; i < hole.length; i++) if (a[i * 4 + 3] > 127) { hole[i] = 1; any = true; }
    if (!any) { setError(tr("Hãy tô lên phần logo/chữ cần xóa trước.", "Paint over the logo or text you want to remove first.")); return; }

    setBusy(true);
    setError("");
    setDone(null);
    cancelled.current = false;
    try {
      setProgress({ pct: 0, label: tr("Đang chuẩn bị thư viện AI...", "Preparing the AI runtime...") });
      const inp = await loadInpainter(tier, !!device?.webgpu && tier.id === "best", (l, t) =>
        setProgress({ pct: (l / t) * 100, label: cached[tier.id] ? tr("Đang nạp mô hình từ bộ nhớ máy...", "Loading the model from local storage...") : tr(`Đang tải mô hình ${tier.modelName}: ${formatBytes(l)} / ${formatBytes(t)}`, `Downloading ${tier.modelName}: ${formatBytes(l)} / ${formatBytes(t)}`) }));
      setCached((c) => ({ ...c, [tier.id]: true }));
      const out = await removeMarked(img, hole, boxes, inp, (d, t) => setProgress({ pct: t ? (d / t) * 100 : 100, label: tr(`Đang xóa vùng ${Math.min(d + 1, t)}/${t}...`, `Removing area ${Math.min(d + 1, t)}/${t}...`) }), () => cancelled.current);
      history.current = [...history.current.slice(-3), img];
      setHistLen(history.current.length);
      current.current = out;
      setStrokes([]);
      setShowOriginal(false);
      setDone(tr(`Xong! Chạy bằng ${inp.backend === "webgpu" ? "GPU" : "CPU"}. Có thể tô thêm để xóa tiếp hoặc tải ảnh về.`, `Done! Ran on the ${inp.backend === "webgpu" ? "GPU" : "CPU"}. Paint more to keep removing, or download the image.`));
    } catch (e) {
      if ((e as Error)?.message !== "CANCELLED") setError((e as Error)?.message || tr("Không xóa được. Hãy thử lại hoặc chọn mức Nhanh & nhẹ.", "Couldn't remove it. Try again or pick the Fast & light model."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const undoResult = () => {
    const prev = history.current.pop();
    if (!prev) return;
    current.current = prev;
    setHistLen(history.current.length);
    setDone(null);
  };

  const download = () => {
    const cv = document.createElement("canvas");
    const img = current.current;
    if (!img) return;
    cv.width = img.width;
    cv.height = img.height;
    cv.getContext("2d")!.putImageData(img, 0, 0);
    cv.toBlob((b) => b && downloadBlob(b, safeFilename(`${name} ${tr("đã xóa logo", "watermark removed")}`, "png")), "image/png");
  };

  const reset = () => {
    current.current = original.current;
    history.current = [];
    setHistLen(0);
    setStrokes([]);
    setDone(null);
  };

  const changed = histLen > 0;

  return (
    <div>
      {!size ? (
        <div
          className={`tool-dropzone${dragOver ? " is-over" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files?.[0] ?? null); }}
        >
          <UploadCloud size={30} />
          <div className="tool-drop-title">{tr("Kéo thả ảnh vào đây hoặc bấm để chọn", "Drop an image here or click to choose")}</div>
          <div className="tool-drop-hint">{tr("JPG, PNG, WebP. Ảnh được xử lý ngay trên máy bạn, không tải lên đâu cả.", "JPG, PNG, WebP. Processed right on your device — nothing is uploaded.")}</div>
        </div>
      ) : (
        <>
          <div className="wm-toolbar" role="toolbar" aria-label={tr("Công cụ tô", "Paint tools")}>
            <div className="wm-tools">
              {([["brush", Brush, tr("Cọ", "Brush")], ["rect", Square, tr("Chữ nhật", "Box")], ["erase", Eraser, tr("Tẩy", "Erase")]] as const).map(([id, Icon, label]) => (
                <button key={id} type="button" className={tool === id ? "is-active" : ""} onClick={() => setTool(id)} aria-pressed={tool === id} disabled={busy}>
                  <Icon size={18} /><span>{label}</span>
                </button>
              ))}
            </div>
            <label className="wm-size" aria-label={tr("Cỡ cọ", "Brush size")}>
              <span>{tr("Cỡ cọ", "Brush")} <b>{brush}</b></span>
              <input type="range" min={8} max={140} value={brush} onChange={(e) => setBrush(Number(e.target.value))} disabled={busy || tool === "rect"} />
            </label>
            <div className="wm-actions">
              <button type="button" className="wm-icon" onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length || busy} aria-label={tr("Hoàn tác nét tô", "Undo stroke")}><Undo2 size={18} /></button>
              <button type="button" className="wm-icon" onClick={() => setStrokes([])} disabled={!strokes.length || busy} aria-label={tr("Xóa hết nét tô", "Clear marks")}><Trash2 size={18} /></button>
            </div>
          </div>

          <div className="wm-stage-wrap">
            <div ref={stageRef} className="wm-stage" style={{ aspectRatio: `${size.w} / ${size.h}`, ["--wm-ar" as string]: size.w / size.h }}>
              <canvas ref={baseRef} className="wm-base" />
              <canvas
                ref={maskRef}
                className={`wm-mask${showOriginal ? " is-hidden" : ""}`}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                aria-label={tr("Vùng vẽ để tô logo cần xóa", "Canvas to paint the logo to remove")}
              />
            </div>
            <div className="wm-under">
              <span className="wm-dim">{size.w} × {size.h}</span>
              <button
                type="button" className="wm-hold"
                onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} onPointerLeave={() => setShowOriginal(false)} onPointerCancel={() => setShowOriginal(false)}
                disabled={!changed}
              ><Eye size={15} /> {tr("Giữ để xem ảnh gốc", "Hold to see original")}</button>
            </div>
          </div>

          <div className="tool-card wm-tiers">
            <h2><Cpu size={16} /> {tr("Mô hình AI", "AI model")}</h2>
            <div className="wm-tier-grid" role="radiogroup" aria-label={tr("Chọn mô hình", "Choose a model")}>
              {INPAINT_TIERS.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={tierId === t.id} className={`wm-tier${tierId === t.id ? " is-on" : ""}`} onClick={() => setTierId(t.id)} disabled={busy}>
                  <strong>{tr(t.name, t.nameEn)} {tierId === t.id && <Check size={14} />}</strong>
                  <em>{t.modelName} · {formatBytes(t.sizeBytes)}</em>
                  <small>{tr(t.tagline, t.taglineEn)}</small>
                  <span className={`wm-badge${cached[t.id] ? " is-ok" : ""}`}>{cached[t.id] ? tr("Đã lưu trong máy", "Saved on device") : tr("Tải lần đầu", "Downloads on first use")}</span>
                </button>
              ))}
            </div>
            {device && <p className="wm-note">{tr(`Máy bạn: ${device.webgpu ? "có WebGPU" : "không có WebGPU"}${device.memoryGB ? `, ~${device.memoryGB} GB RAM` : ""}${device.mobile ? ", di động" : ""}. Gợi ý: ${device.mobile ? "Nhanh & nhẹ" : "Chất lượng cao"}.`, `Your device: ${device.webgpu ? "WebGPU available" : "no WebGPU"}${device.memoryGB ? `, ~${device.memoryGB} GB RAM` : ""}${device.mobile ? ", mobile" : ""}. Suggested: ${device.mobile ? "Fast & light" : "High quality"}.`)}</p>}
          </div>

          {progress && <div className="wm-progress"><ProgressBar percent={progress.pct} label={progress.label} />{busy && <button type="button" className="tool-btn tool-btn-danger wm-small" onClick={() => { cancelled.current = true; }}><X size={14} /> {tr("Hủy", "Cancel")}</button>}</div>}
          {error && <div className="tool-status-error">{error}</div>}
          {done && !busy && <div className="tool-status-ok">{done}</div>}

          <div className="wm-cta">
            <button type="button" className="tool-btn wm-go" onClick={run} disabled={busy || !hasMarks}>
              <Sparkles size={18} /> {tr("Xóa phần đã tô", "Remove painted area")}
            </button>
            <button type="button" className="tool-btn tool-btn-secondary" onClick={download} disabled={busy || !changed}><Download size={16} /> {tr("Tải ảnh", "Download")}</button>
            <button type="button" className="tool-btn tool-btn-secondary" onClick={undoResult} disabled={busy || !changed}><Undo2 size={16} /> {tr("Hoàn tác lần xóa", "Undo last removal")}</button>
            <button type="button" className="tool-btn tool-btn-secondary" onClick={reset} disabled={busy || !changed}><RotateCcw size={16} /> {tr("Về ảnh gốc", "Restore original")}</button>
            <button type="button" className="tool-btn tool-btn-secondary" onClick={() => { setSize(null); setStrokes([]); setDone(null); setError(""); }} disabled={busy}>{tr("Đổi ảnh khác", "Choose another image")}</button>
          </div>
          <div className="wm-cache">
            <button type="button" onClick={async () => { await clearModelCache(); setCached({}); }} disabled={busy}>{tr("Xóa mô hình đã lưu trong máy", "Clear saved models")}</button>
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {!size && error && <div className="tool-status-error">{error}</div>}
    </div>
  );
}
