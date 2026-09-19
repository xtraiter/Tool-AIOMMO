"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, Sparkles, Download, Trash2, Info, X } from "lucide-react";
import { fetchFile } from "@ffmpeg/util";
import { useTr } from "@/lib/i18n";
import { downloadBlob, loadSharedFfmpeg, terminateSharedFfmpeg } from "@/lib/ffmpegLoader";
import { safeFilename } from "@/lib/filename";
import { ProgressBar } from "../ProgressBar";

type Rect = { x: number; y: number; w: number; h: number }; // in video pixels

export function VideoRemover() {
  const tr = useTr();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [dims, setDims] = useState<{ w: number; h: number; d: number } | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { setError(tr("Hãy chọn một tệp video.", "Choose a video file.")); return; }
    if (url) URL.revokeObjectURL(url);
    setError("");
    setDone(false);
    setRects([]);
    setDims(null);
    setFile(f);
    setUrl(URL.createObjectURL(f));
  };

  const at = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (busy || !dims) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = at(e);
    setDrag({ a: p, b: p });
  };
  const onMove = (e: React.PointerEvent) => { if (drag) setDrag({ a: drag.a, b: at(e) }); };
  const onUp = () => {
    if (!drag || !dims) { setDrag(null); return; }
    const x0 = Math.min(drag.a.x, drag.b.x), x1 = Math.max(drag.a.x, drag.b.x);
    const y0 = Math.min(drag.a.y, drag.b.y), y1 = Math.max(drag.a.y, drag.b.y);
    setDrag(null);
    if ((x1 - x0) * dims.w < 8 || (y1 - y0) * dims.h < 8) return;
    // delogo needs the box strictly inside the frame
    const x = Math.max(2, Math.round(x0 * dims.w)), y = Math.max(2, Math.round(y0 * dims.h));
    const w = Math.min(dims.w - 2 - x, Math.round((x1 - x0) * dims.w)), h = Math.min(dims.h - 2 - y, Math.round((y1 - y0) * dims.h));
    if (w >= 4 && h >= 4) setRects((r) => [...r, { x, y, w, h }]);
  };

  const run = async () => {
    if (!file || !dims || !rects.length) { setError(tr("Hãy kéo một khung quanh logo cần xóa.", "Drag a box around the logo to remove.")); return; }
    setBusy(true);
    setError("");
    setDone(false);
    setPct(0);
    cancelled.current = false;
    let ff: Awaited<ReturnType<typeof loadSharedFfmpeg>> | null = null;
    const onProg = ({ progress, time }: { progress: number; time: number }) => {
      const v = dims.d > 0 && time > 0 ? time / 1_000_000 / dims.d : progress;
      setPct(Math.min(99, Math.max(0, (Number.isFinite(v) ? v : 0) * 100)));
    };
    try {
      ff = await loadSharedFfmpeg();
      ff.on("progress", onProg);
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      await ff.writeFile(`in.${ext}`, await fetchFile(file));
      const vf = rects.map((r) => `delogo=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}`).join(",");
      const args = ["-i", `in.${ext}`, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", "out.mp4"];
      let code = await ff.exec(args);
      if (code !== 0 && !cancelled.current) {
        // audio codec not allowed in MP4 -> re-encode it instead of copying
        code = await ff.exec(args.map((a) => (a === "copy" ? "aac" : a)));
      }
      if (code !== 0) throw new Error(tr("FFmpeg không xử lý được video này.", "FFmpeg couldn't process this video."));
      const data = await ff.readFile("out.mp4");
      downloadBlob(new Blob([data as BlobPart], { type: "video/mp4" }), safeFilename(`${file.name.replace(/\.[^.]+$/, "")} ${tr("đã xóa logo", "watermark removed")}`, "mp4"));
      await ff.deleteFile(`in.${ext}`).catch(() => {});
      await ff.deleteFile("out.mp4").catch(() => {});
      setPct(100);
      setDone(true);
    } catch (e) {
      if (!cancelled.current) setError((e as Error)?.message || tr("Có lỗi khi xử lý video.", "Something went wrong while processing."));
    } finally {
      ff?.off("progress", onProg);
      setBusy(false);
    }
  };

  const cancel = () => { cancelled.current = true; terminateSharedFfmpeg(); setBusy(false); };

  const shown = drag && dims ? { x: Math.min(drag.a.x, drag.b.x), y: Math.min(drag.a.y, drag.b.y), w: Math.abs(drag.a.x - drag.b.x), h: Math.abs(drag.a.y - drag.b.y) } : null;

  if (!file) {
    return (
      <div>
        <div className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null); }}>
          <UploadCloud size={30} />
          <div className="tool-drop-title">{tr("Kéo thả video vào đây hoặc bấm để chọn", "Drop a video here or click to choose")}</div>
          <div className="tool-drop-hint">{tr("Xử lý ngay trên máy bạn. Phù hợp logo cố định ở một vị trí.", "Processed on your device. Best for a logo that stays in one place.")}</div>
        </div>
        <input ref={inputRef} type="file" accept="video/*" hidden onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {error && <div className="tool-status-error">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="wm-stage-wrap">
        <div ref={boxRef} className="wm-vstage" style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}>
          <video ref={videoRef} src={url} controls={!drag} playsInline muted onLoadedMetadata={(e) => { const v = e.currentTarget; setDims({ w: v.videoWidth, h: v.videoHeight, d: v.duration }); }} />
          <div className="wm-vlayer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {dims && rects.map((r, i) => (
              <span key={i} className="wm-rect" style={{ left: `${(r.x / dims.w) * 100}%`, top: `${(r.y / dims.h) * 100}%`, width: `${(r.w / dims.w) * 100}%`, height: `${(r.h / dims.h) * 100}%` }} />
            ))}
            {shown && <span className="wm-rect is-live" style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }} />}
          </div>
        </div>
      </div>
      <p className="wm-note"><Info size={14} /> {tr("Kéo trên video để khoanh vùng logo (có thể khoanh nhiều vùng). Muốn tua/phát video, hãy chạm vào thanh điều khiển ở dưới.", "Drag over the video to box the logo (you can add several). To seek or play, use the controls at the bottom.")}</p>
      {rects.length > 0 && (
        <ul className="wm-rects">
          {rects.map((r, i) => (
            <li key={i}>{tr("Vùng", "Area")} {i + 1}: {r.w}×{r.h} @ ({r.x},{r.y})<button type="button" onClick={() => setRects((all) => all.filter((_, k) => k !== i))} aria-label={tr("Xóa vùng", "Remove area")} disabled={busy}><Trash2 size={14} /></button></li>
          ))}
        </ul>
      )}
      {busy && <div className="wm-progress"><ProgressBar percent={pct} label={tr("Đang xóa logo khỏi video...", "Removing the logo from the video...")} /><button type="button" className="tool-btn tool-btn-danger wm-small" onClick={cancel}><X size={14} /> {tr("Hủy", "Cancel")}</button></div>}
      {error && <div className="tool-status-error">{error}</div>}
      {done && !busy && <div className="tool-status-ok">{tr("Xong! Video đã được tải xuống.", "Done! The video was downloaded.")}</div>}
      <div className="wm-cta">
        <button type="button" className="tool-btn wm-go" onClick={run} disabled={busy || !rects.length}><Sparkles size={18} /> {tr("Xóa logo & tải video", "Remove logo & download")}</button>
        <button type="button" className="tool-btn tool-btn-secondary" onClick={() => { setFile(null); setRects([]); setDone(false); }} disabled={busy}><Download size={16} style={{ display: "none" }} />{tr("Đổi video khác", "Choose another video")}</button>
      </div>
    </div>
  );
}
