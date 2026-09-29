"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Cpu, Download, Film, Square, UploadCloud, Wand2, X } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { BG_TIERS, detectDevice, loadMasker, type BgTierId } from "@/lib/bgRemover/engine";
import { VIDEO_FORMATS, encodeArgs, formatById, frameName, type VideoFormatId } from "@/lib/bgRemover/videoExport";
import { FFFSType } from "@ffmpeg/ffmpeg";
import { downloadBlob, formatBytes, formatDuration, loadSharedFfmpeg, terminateSharedFfmpeg } from "@/lib/ffmpegLoader";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import { ProgressBar } from "./ProgressBar";
import "./tool-page.css";
import "./bg-remover.css";
import "./video-bg-remover.css";

type BgType = "transparent" | "color" | "green" | "image";

const GREEN_SCREEN = "#00b140";
const FPS_OPTIONS = [10, 15, 24, 30];
const WIDTH_OPTIONS = [360, 480, 720, 1080];
const MAX_SECONDS = 60;
const SOURCE_DIR = "/source";

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function seek(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("Không đọc được khung hình của video.")); };
    const cleanup = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    video.currentTime = t;
  });
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không mã hoá được khung hình."))), "image/png")
  );
}

export function VideoBgRemover() {
  const tr = useTr();
  const inputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  const [tierId, setTierId] = useState<BgTierId>("balanced");
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [fps, setFps] = useState(15);
  const [width, setWidth] = useState(480);
  const [smooth, setSmooth] = useState(true);
  const [bgType, setBgType] = useState<BgType>("transparent");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [formatId, setFormatId] = useState<VideoFormatId>("webm");
  const [keepAudio, setKeepAudio] = useState(true);

  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const [progress, setProgress] = useState<number | null>(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; url: string; name: string; preview: "video" | "image" | null; transparent: boolean } | null>(null);

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => { detectDevice().then((d) => setGpu(d.device === "webgpu")); }, []);

  const format = formatById(formatId);
  // MP4 can't be transparent — fall back to a green screen so the cut-out stays usable.
  const effectiveBg: BgType = !format.alpha && bgType === "transparent" ? "green" : bgType;
  const transparent = effectiveBg === "transparent";
  const clipLength = Math.max(0, end - start);
  const frameCount = Math.max(1, Math.floor(clipLength * fps));
  const outW = meta ? even(Math.min(width, meta.width)) : 0;
  const outH = meta ? even((outW * meta.height) / meta.width) : 0;

  function reset() {
    cancelRef.current = true;
    setFile(null);
    setMeta(null);
    setResult(null);
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function acceptFile(f: File | null | undefined) {
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(f.name)) {
      setError(tr("Chỉ hỗ trợ file video (MP4, MOV, WebM...).", "Only video files are supported (MP4, MOV, WebM...)."));
      return;
    }
    setError("");
    setResult(null);
    setMeta(null);
    setFile(f);
  }

  function onLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget;
    if (!v.videoWidth) {
      setError(tr("Trình duyệt không đọc được video này. Hãy thử file MP4 (H.264).", "Your browser can't read this video. Try an MP4 (H.264) file."));
      return;
    }
    setMeta({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    setStart(0);
    setEnd(Math.min(v.duration, 10));
  }

  function onBgImage(f: File | null | undefined) {
    if (!f) return;
    const img = new Image();
    img.onload = () => { setBgImage(img); setBgType("image"); };
    img.src = URL.createObjectURL(f);
  }

  async function run() {
    if (!file || !fileUrl || !meta) return;
    if (clipLength <= 0) {
      setError(tr("Điểm kết thúc phải sau điểm bắt đầu.", "The end must be after the start."));
      return;
    }
    if (clipLength > MAX_SECONDS) {
      setError(tr(`Mỗi lần xử lý tối đa ${MAX_SECONDS} giây, hãy rút ngắn đoạn cần tách.`, `Process at most ${MAX_SECONDS} seconds at a time; shorten the clip.`));
      return;
    }
    cancelRef.current = false;
    setBusy(true);
    setError("");
    setResult(null);
    setProgress(null);

    const ffmpegNeeded = format.id !== "zip";
    const written: string[] = [];
    let mounted = false;
    let ffmpegBroken = false;
    try {
      const masker = await loadMasker(tierId, (step, pct) => { setStatus(step); setProgress(pct * 0.1); });

      // Hidden decoder video, seeked frame by frame for exact timestamps.
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = fileUrl;
      await new Promise<void>((res, rej) => {
        video.onloadeddata = () => res();
        video.onerror = () => rej(new Error(tr("Không đọc được video.", "Couldn't read the video.")));
      });

      const frame = document.createElement("canvas");
      frame.width = outW;
      frame.height = outH;
      const fctx = frame.getContext("2d", { willReadFrequently: true })!;
      const cut = document.createElement("canvas");
      cut.width = outW;
      cut.height = outH;
      const cctx = cut.getContext("2d")!;
      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      const octx = out.getContext("2d")!;

      const live = liveCanvasRef.current;
      if (live) { live.width = outW; live.height = outH; }

      const ffmpeg = ffmpegNeeded ? await loadSharedFfmpeg() : null;
      const JSZip = format.id === "zip" ? (await import("jszip")).default : null;
      const zip = JSZip ? new JSZip() : null;

      let prev: Uint8ClampedArray | null = null;
      const t0 = performance.now();
      for (let i = 0; i < frameCount; i++) {
        if (cancelRef.current) throw new Error("cancelled");
        await seek(video, Math.min(start + i / fps, meta.duration - 0.001));
        fctx.drawImage(video, 0, 0, outW, outH);
        const alpha = await masker.mask(frame);

        // Temporal smoothing: blend with the previous mask to calm edge flicker.
        const pixels = fctx.getImageData(0, 0, outW, outH);
        const px = pixels.data;
        const cur = new Uint8ClampedArray(alpha.length);
        for (let j = 0; j < alpha.length; j++) {
          cur[j] = smooth && prev ? (alpha[j] * 7 + prev[j] * 3) / 10 : alpha[j];
          px[4 * j + 3] = cur[j];
        }
        prev = cur;
        cctx.putImageData(pixels, 0, 0);

        octx.clearRect(0, 0, outW, outH);
        if (effectiveBg === "color" || effectiveBg === "green") {
          octx.fillStyle = effectiveBg === "green" ? GREEN_SCREEN : bgColor;
          octx.fillRect(0, 0, outW, outH);
        } else if (effectiveBg === "image" && bgImage) {
          const s = Math.max(outW / bgImage.width, outH / bgImage.height);
          octx.drawImage(bgImage, (outW - bgImage.width * s) / 2, (outH - bgImage.height * s) / 2, bgImage.width * s, bgImage.height * s);
        }
        octx.drawImage(cut, 0, 0);
        live?.getContext("2d")?.drawImage(out, 0, 0);

        const png = await canvasToPng(out);
        if (zip) zip.file(frameName(i), png);
        else {
          await ffmpeg!.writeFile(frameName(i), new Uint8Array(await png.arrayBuffer()));
          written.push(frameName(i));
        }

        const done = i + 1;
        const perFrame = (performance.now() - t0) / done;
        const left = Math.round((perFrame * (frameCount - done)) / 1000);
        setProgress(10 + (done / frameCount) * (ffmpegNeeded ? 75 : 88));
        setStatus(
          tr(`Đang tách nền khung ${done}/${frameCount} · còn khoảng ${formatDuration(left)}`,
             `Removing background, frame ${done}/${frameCount} · about ${formatDuration(left)} left`)
        );
      }

      let blob: Blob;
      if (zip) {
        setStatus(tr("Đang nén ZIP...", "Packing ZIP..."));
        blob = await zip.generateAsync({ type: "blob" });
      } else {
        const ff = ffmpeg!;
        setStatus(tr(`Đang xuất ${format.label}...`, `Encoding ${format.labelEn}...`));
        setProgress(null);
        // Read the soundtrack straight from the user's file (WORKERFS) — copying a
        // long source video into FFmpeg's memory can exhaust it.
        const inputName = `${SOURCE_DIR}/${file.name}`;
        const withAudio = keepAudio && format.audio;
        if (withAudio) {
          await ff.createDir(SOURCE_DIR).catch(() => {});
          await ff.mount(FFFSType.WORKERFS, { files: [file] }, SOURCE_DIR);
          mounted = true;
        }
        const args = (audio: boolean) =>
          encodeArgs(format, { fps, transparent, audio, inputName, start, duration: clipLength });
        const logTail: string[] = [];
        const onLog = ({ message }: { message: string }) => { logTail.push(message); if (logTail.length > 30) logTail.shift(); };
        const onProgress = ({ progress: p }: { progress: number }) => {
          if (p > 0 && p <= 1) setProgress(85 + p * 15);
        };
        ff.on("log", onLog);
        ff.on("progress", onProgress);
        let code: number;
        try {
          code = await ff.exec(args(withAudio));
          // Some sources have audio FFmpeg can't re-encode — retry silently without it.
          if (code !== 0 && withAudio) code = await ff.exec(args(false));
        } finally {
          ff.off("log", onLog);
          ff.off("progress", onProgress);
        }
        if (code !== 0) {
          console.error("[VideoBgRemover] FFmpeg failed:\n" + logTail.join("\n"));
          throw new Error(tr("FFmpeg không xuất được định dạng này.", "FFmpeg couldn't encode this format."));
        }
        const outName = `out.${format.ext}`;
        written.push(outName);
        const data = (await ff.readFile(outName)) as Uint8Array;
        blob = new Blob([data.slice()], { type: format.mime });
      }

      const name = `${file.name.replace(/\.[^.]+$/, "")}_xoa-nen.${format.ext}`;
      setResult({ blob, url: URL.createObjectURL(blob), name, preview: format.preview, transparent });
      setProgress(100);
      setStatus(tr(`Xong! ${frameCount} khung hình · ${formatBytes(blob.size)}`, `Done! ${frameCount} frames · ${formatBytes(blob.size)}`));
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (msg === "cancelled") {
        setStatus(tr("Đã huỷ.", "Cancelled."));
      } else {
        console.error("[VideoBgRemover]", e);
        // A failed/aborted FFmpeg.wasm run can leave the instance unusable
        // ("memory access out of bounds") — drop it so the next run starts fresh.
        if (ffmpegNeeded) {
          terminateSharedFfmpeg();
          ffmpegBroken = true;
        }
        setError(msg || tr("Đã xảy ra lỗi khi xử lý video.", "Something went wrong while processing the video."));
        setStatus("");
      }
    } finally {
      if (ffmpegNeeded && !cancelRef.current && !ffmpegBroken) {
        const ff = await loadSharedFfmpeg().catch(() => null);
        for (const f of written) await ff?.deleteFile(f).catch(() => {});
        if (mounted) await ff?.unmount(SOURCE_DIR).catch(() => {});
      }
      setBusy(false);
    }
  }

  function cancel() {
    cancelRef.current = true;
    // An FFmpeg encode can't be interrupted — stop the worker; the next run loads a fresh one.
    terminateSharedFfmpeg();
  }

  return (
    <div className="tool-page">
      <h1><Film size={22} /> {tr("Xóa Nền Video AI", "AI Video Background Remover")}</h1>
      <p className="tool-subtitle">
        {tr(
          "Tách người / vật thể khỏi nền video bằng AI ngay trên trình duyệt, xuất WebM, MOV nền trong suốt, WebP động, GIF, MP4 phông xanh... Video không tải lên máy chủ.",
          "Cut people / objects out of a video with AI right in your browser; export transparent WebM or MOV, animated WebP, GIF, green-screen MP4... Your video never leaves your device."
        )}
      </p>

      {!file ? (
        <div className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); }}>
          <UploadCloud size={30} />
          <div className="tool-drop-title">{tr("Kéo thả video vào đây hoặc bấm để chọn", "Drop a video here or click to choose")}</div>
          <div className="tool-drop-hint">{tr(`MP4, MOV, WebM... · tối đa ${MAX_SECONDS} giây mỗi lần xử lý`, `MP4, MOV, WebM... · up to ${MAX_SECONDS} seconds per run`)}</div>
          <input ref={inputRef} type="file" accept="video/*" hidden onChange={(e) => acceptFile(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="tool-card">
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">
              {formatBytes(file.size)}{meta ? ` · ${formatDuration(meta.duration)} · ${meta.width}×${meta.height}` : ""}
            </span>
            <button className="tool-icon-btn" onClick={reset} disabled={busy} title={tr("Bỏ chọn", "Remove")}><X size={16} /></button>
          </div>

          <div className="vbr-stage">
            <video ref={previewRef} src={fileUrl ?? undefined} controls playsInline className="vbr-video" onLoadedMetadata={onLoadedMetadata} hidden={busy} />
            <canvas ref={liveCanvasRef} className={`vbr-live ${transparent ? "bgr-checker" : ""}`} hidden={!busy} />
          </div>

          {meta && (
            <>
              <div className="vbr-section">
                <h2>{tr("1. Đoạn cần tách nền", "1. Clip to process")}</h2>
                <div className="vbr-trim">
                  <div className="tool-field">
                    <label>{tr("Bắt đầu (giây)", "Start (s)")}</label>
                    <input type="number" min={0} max={meta.duration} step={0.1} value={Number(start.toFixed(1))} disabled={busy}
                      onChange={(e) => setStart(Math.max(0, Math.min(Number(e.target.value), meta.duration)))} />
                  </div>
                  <button type="button" className="tool-btn tool-btn-secondary" disabled={busy}
                    onClick={() => setStart(previewRef.current?.currentTime ?? 0)}>
                    {tr("Lấy vị trí đang xem", "Use current time")}
                  </button>
                  <div className="tool-field">
                    <label>{tr("Kết thúc (giây)", "End (s)")}</label>
                    <input type="number" min={0} max={meta.duration} step={0.1} value={Number(end.toFixed(1))} disabled={busy}
                      onChange={(e) => setEnd(Math.max(0, Math.min(Number(e.target.value), meta.duration)))} />
                  </div>
                  <button type="button" className="tool-btn tool-btn-secondary" disabled={busy}
                    onClick={() => setEnd(previewRef.current?.currentTime ?? meta.duration)}>
                    {tr("Lấy vị trí đang xem", "Use current time")}
                  </button>
                </div>
                <p className="vbr-note">
                  {tr(`Độ dài ${clipLength.toFixed(1)} giây → ${frameCount} khung hình ở ${fps} khung/giây, kích thước ${outW}×${outH}.`,
                      `${clipLength.toFixed(1)} s → ${frameCount} frames at ${fps} fps, ${outW}×${outH}.`)}
                </p>
              </div>

              <div className="vbr-section">
                <h2><Cpu size={15} /> {tr("2. Mô hình AI", "2. AI model")}</h2>
                <div className="asr-tiers" role="radiogroup">
                  {BG_TIERS.map((t) => (
                    <button key={t.id} type="button" role="radio" aria-checked={tierId === t.id} disabled={busy}
                      className={`asr-tier${tierId === t.id ? " is-on" : ""}`} onClick={() => setTierId(t.id)}>
                      <strong>{tr(t.name, t.nameEn)} {tierId === t.id && <Check size={14} />}</strong>
                      <em>{t.modelName} · {t.sizeFormatted}</em>
                      <small>{tr(t.tagline, t.taglineEn)}</small>
                    </button>
                  ))}
                </div>
                {gpu === false && (
                  <p className="vbr-note is-warn">
                    {tr("Máy/trình duyệt này không dùng được card đồ họa (WebGPU) nên AI chạy bằng CPU — mỗi khung hình có thể mất vài giây. Nên chọn đoạn ngắn, 10 khung/giây, 360px.",
                        "No usable graphics card (WebGPU) here, so the AI runs on the CPU — each frame can take seconds. Prefer a short clip, 10 fps, 360px.")}
                  </p>
                )}
              </div>

              <div className="vbr-section">
                <h2>{tr("3. Chất lượng & nền", "3. Quality & background")}</h2>
                <div className="dl-selects">
                  <div className="tool-field">
                    <label>{tr("Khung hình / giây", "Frames per second")}</label>
                    <select value={fps} disabled={busy} onChange={(e) => setFps(Number(e.target.value))}>
                      {FPS_OPTIONS.map((f) => <option key={f} value={f}>{f} fps</option>)}
                    </select>
                  </div>
                  <div className="tool-field">
                    <label>{tr("Chiều rộng", "Width")}</label>
                    <select value={width} disabled={busy} onChange={(e) => setWidth(Number(e.target.value))}>
                      {WIDTH_OPTIONS.map((w) => <option key={w} value={w} disabled={w > meta.width && w !== WIDTH_OPTIONS[0]}>{w}px</option>)}
                    </select>
                  </div>
                </div>
                <label className="vbr-check">
                  <input type="checkbox" checked={smooth} disabled={busy} onChange={(e) => setSmooth(e.target.checked)} />
                  {tr("Chống nhấp nháy viền (làm mượt giữa các khung)", "Reduce edge flicker (smooth across frames)")}
                </label>

                <div className="bgr-bg-options vbr-bg">
                  <button type="button" disabled={busy || !format.alpha} className={`bgr-bg-btn ${effectiveBg === "transparent" ? "active" : ""}`} onClick={() => setBgType("transparent")}>
                    <span className="bgr-checker-icon" /> {tr("Trong suốt", "Transparent")}
                  </button>
                  <button type="button" disabled={busy} className={`bgr-bg-btn ${effectiveBg === "green" ? "active" : ""}`} onClick={() => setBgType("green")}>
                    <span className="vbr-swatch" style={{ background: GREEN_SCREEN }} /> {tr("Phông xanh", "Green screen")}
                  </button>
                  <button type="button" disabled={busy} className={`bgr-bg-btn ${effectiveBg === "color" ? "active" : ""}`} onClick={() => setBgType("color")}>
                    <input type="color" className="bgr-color-picker" value={bgColor} disabled={busy}
                      onChange={(e) => { setBgColor(e.target.value); setBgType("color"); }} onClick={(e) => e.stopPropagation()} />
                    {tr("Màu", "Colour")}
                  </button>
                  <button type="button" disabled={busy} className={`bgr-bg-btn ${effectiveBg === "image" ? "active" : ""}`}
                    onClick={() => (bgImage ? setBgType("image") : bgInputRef.current?.click())}>
                    {tr("Ảnh nền", "Image")}
                  </button>
                  {bgImage && (
                    <button type="button" className="tool-btn tool-btn-secondary vbr-small" disabled={busy} onClick={() => bgInputRef.current?.click()}>
                      {tr("Đổi ảnh", "Change")}
                    </button>
                  )}
                  <input ref={bgInputRef} type="file" accept="image/*" hidden onChange={(e) => onBgImage(e.target.files?.[0])} />
                </div>
              </div>

              <div className="vbr-section">
                <h2>{tr("4. Định dạng xuất", "4. Output format")}</h2>
                <div className="vbr-formats" role="radiogroup">
                  {VIDEO_FORMATS.map((f) => (
                    <button key={f.id} type="button" role="radio" aria-checked={formatId === f.id} disabled={busy}
                      className={`vbr-format${formatId === f.id ? " is-on" : ""}`} onClick={() => setFormatId(f.id)}>
                      <strong>{tr(f.label, f.labelEn)}</strong>
                      <small>{tr(f.hint, f.hintEn)}</small>
                    </button>
                  ))}
                </div>
                {format.audio && (
                  <label className="vbr-check">
                    <input type="checkbox" checked={keepAudio} disabled={busy} onChange={(e) => setKeepAudio(e.target.checked)} />
                    {tr("Giữ âm thanh gốc", "Keep the original audio")}
                  </label>
                )}
                {!format.alpha && bgType === "transparent" && (
                  <p className="vbr-note">{tr("MP4 không hỗ trợ nền trong suốt nên sẽ dùng phông xanh.", "MP4 can't be transparent, so a green screen is used.")}</p>
                )}
              </div>

              <div className="tool-row">
                {busy ? (
                  <button type="button" className="tool-btn tool-btn-danger" onClick={cancel}>
                    <Square size={15} /> {tr("Dừng", "Stop")}
                  </button>
                ) : (
                  <button type="button" className="tool-btn" onClick={run} style={{ minHeight: 44 }}>
                    <Wand2 size={17} /> {tr(`Tách nền & xuất ${format.label}`, `Remove background & export ${format.labelEn}`)}
                  </button>
                )}
              </div>
            </>
          )}

          {busy && <ProgressBar percent={progress} label={status || tr("Đang xử lý...", "Processing...")} />}
          {status && !busy && !error && <div className="tool-status-ok">{status}</div>}
          {error && <div className="tool-status-error">{error}</div>}

          {result && !busy && (
            <div className="vbr-result">
              {result.preview === "video" && (
                <video src={result.url} controls loop playsInline className={`vbr-video ${result.transparent ? "bgr-checker" : ""}`} />
              )}
              {result.preview === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.url} alt={tr("Kết quả", "Result")} className={`vbr-video ${result.transparent ? "bgr-checker" : ""}`} />
              )}
              <button type="button" className="tool-btn" onClick={() => downloadBlob(result.blob, result.name)}>
                <Download size={16} /> {tr("Tải xuống", "Download")} {result.name.split(".").pop()?.toUpperCase()} · {formatBytes(result.blob.size)}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
