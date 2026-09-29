"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Scissors,
  UploadCloud,
  Download,
  Sparkles,
  Paintbrush,
  Eraser as EraserIcon,
  Image as ImageIcon,
  Palette,
  MousePointer2,
  X,
  Eye,
  CheckCircle2,
  Undo2,
  Sliders,
  Cpu,
  Check,
  Info
} from "lucide-react";
import { useTr } from "@/lib/i18n";
import { executeAiCutout, BG_TIERS, BgTierId } from "@/lib/bgRemover/engine";
import "./tool-page.css";
import "./bg-remover.css";

type Status = "idle" | "processing" | "ready" | "error";
type ViewMode = "mask" | "cutout";
type BrushMode = "none" | "paint" | "erase";

const cacheKey = (id: string) => `bgr-cached-${id}`;
const flagged = (id: string) => {
  try {
    return localStorage.getItem(cacheKey(id)) === "1";
  } catch {
    return false;
  }
};

export function BackgroundRemover() {
  const tr = useTr();
  const inputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  // File & Process state
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [progressText, setProgressText] = useState("");
  const [progress, setProgress] = useState(0);
  const [tierId, setTierId] = useState<BgTierId>("balanced");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [hasProcessed, setHasProcessed] = useState(false);

  // View & Mask state
  const [viewMode, setViewMode] = useState<ViewMode>("mask");
  const [maskOpacity, setMaskOpacity] = useState(0.45);

  // Brush controls
  const [brushMode, setBrushMode] = useState<BrushMode>("paint");
  const [brushSize, setBrushSize] = useState(25);

  // Background options
  const [bgType, setBgType] = useState<"transparent" | "color" | "image">("transparent");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [bgImage, setBgImage] = useState<string>("");

  // Canvases
  const canvasRef = useRef<HTMLCanvasElement>(null); // Main display canvas
  const maskCanvasRef = useRef<HTMLCanvasElement>(null); // Cutout with alpha channel
  const imgRef = useRef<HTMLImageElement | null>(null); // Original image
  const bgImgRef = useRef<HTMLImageElement | null>(null); // Custom bg image
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setSaved(Object.fromEntries(BG_TIERS.map((t) => [t.id, flagged(t.id)])));
  }, []);

  // Render composite to display canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (viewMode === "mask") {
      // 1. Draw original photo
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(img, 0, 0);

      // 2. Draw semi-transparent Red Mask over the detected foreground
      if (maskCanvas && hasProcessed) {
        const tint = document.createElement("canvas");
        tint.width = canvas.width;
        tint.height = canvas.height;
        const tctx = tint.getContext("2d");
        if (tctx) {
          tctx.drawImage(maskCanvas, 0, 0);
          tctx.globalCompositeOperation = "source-in";
          tctx.fillStyle = `rgba(239, 68, 68, ${maskOpacity})`;
          tctx.fillRect(0, 0, tint.width, tint.height);

          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(tint, 0, 0);
        }
      }
    } else {
      // viewMode === "cutout"
      // 1. Draw Background
      ctx.globalCompositeOperation = "source-over";
      if (bgType === "color") {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (bgType === "image" && bgImgRef.current) {
        const bg = bgImgRef.current;
        const scale = Math.max(canvas.width / bg.width, canvas.height / bg.height);
        const w = bg.width * scale;
        const h = bg.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(bg, x, y, w, h);
      }

      // 2. Draw the cut-out foreground
      if (maskCanvas) {
        ctx.drawImage(maskCanvas, 0, 0);
      }
    }
  }, [viewMode, maskOpacity, bgType, bgColor, hasProcessed]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const loadImage = (f: File) => {
    setFile(f);
    setError("");
    setStatus("idle");
    setHasProcessed(false);
    setViewMode("mask");
    setBrushMode("none");
    const url = URL.createObjectURL(f);
    const image = new Image();
    image.onload = () => {
      imgRef.current = image;
      if (canvasRef.current && maskCanvasRef.current) {
        canvasRef.current.width = image.naturalWidth;
        canvasRef.current.height = image.naturalHeight;
        maskCanvasRef.current.width = image.naturalWidth;
        maskCanvasRef.current.height = image.naturalHeight;

        const mctx = maskCanvasRef.current.getContext("2d")!;
        mctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      }
      renderCanvas();
    };
    image.src = url;
  };

  const accept = (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    const f = list[0];
    if (!f.type.startsWith("image/") && !/\.(jpe?g|png|webp|bmp|avif|gif)$/i.test(f.name)) {
      setError(tr("Chỉ hỗ trợ file ảnh (JPG, PNG, WebP...).", "Only image files are supported (JPG, PNG, WebP...)."));
      return;
    }
    loadImage(f);
  };

  // Run AI Background / Hair Detection
  const runAiDetection = useCallback(async () => {
    if (!file || !imgRef.current || !maskCanvasRef.current) return;
    setStatus("processing");
    setError("");
    setProgress(0);
    setProgressText(tr("Đang khởi động AI...", "Starting AI..."));

    try {
      // Create source canvas from original image
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = imgRef.current.naturalWidth;
      srcCanvas.height = imgRef.current.naturalHeight;
      const sctx = srcCanvas.getContext("2d")!;
      sctx.drawImage(imgRef.current, 0, 0);

      const cutoutCanvas = await executeAiCutout(srcCanvas, tierId, (step, pct) => {
        setProgressText(step);
        setProgress(pct);
      });

      // Put cutout into maskCanvasRef
      const mctx = maskCanvasRef.current.getContext("2d")!;
      mctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      mctx.drawImage(cutoutCanvas, 0, 0);

      try {
        localStorage.setItem(cacheKey(tierId), "1");
      } catch {}
      setSaved((s) => ({ ...s, [tierId]: true }));

      setHasProcessed(true);
      setViewMode("mask");
      setBrushMode("paint"); // Default to paint brush so user can immediately touch up
      setStatus("ready");
      setProgressText("");
    } catch (e: any) {
      console.error("[BackgroundRemover] Error:", e);
      setError(e?.message || tr("Đã xảy ra lỗi khi xử lý hình ảnh.", "An error occurred while processing the image."));
      setStatus("error");
    }
  }, [file, tierId, tr]);

  // Brush drawing interactions
  const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (brushMode === "none" || !hasProcessed) return;
    isDrawing.current = true;
    lastPos.current = getMousePos(e);
    draw(e);
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    renderCanvas();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || brushMode === "none" || !maskCanvasRef.current || !imgRef.current) return;
    e.preventDefault();

    const { x, y } = getMousePos(e);
    const mctx = maskCanvasRef.current.getContext("2d")!;
    mctx.lineJoin = "round";
    mctx.lineCap = "round";

    if (brushMode === "paint") {
      // Add pixels from original image to maskCanvas
      mctx.save();
      mctx.beginPath();
      if (lastPos.current) {
        mctx.moveTo(lastPos.current.x, lastPos.current.y);
        mctx.lineTo(x, y);
      } else {
        mctx.arc(x, y, brushSize, 0, Math.PI * 2);
      }
      mctx.lineWidth = brushSize * 2;
      mctx.stroke();

      mctx.clip();
      mctx.globalCompositeOperation = "source-over";
      mctx.drawImage(imgRef.current, 0, 0);
      mctx.restore();
    } else if (brushMode === "erase") {
      // Erase pixels from maskCanvas
      mctx.save();
      mctx.globalCompositeOperation = "destination-out";
      mctx.beginPath();
      if (lastPos.current) {
        mctx.moveTo(lastPos.current.x, lastPos.current.y);
        mctx.lineTo(x, y);
      } else {
        mctx.arc(x, y, brushSize, 0, Math.PI * 2);
      }
      mctx.lineWidth = brushSize * 2;
      mctx.stroke();
      mctx.restore();
    }

    lastPos.current = { x, y };
    renderCanvas();
  };

  // Download Output
  const triggerDownload = () => {
    if (!canvasRef.current || !file) return;
    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name.replace(/\.[^.]+$/, "") + (bgType === "transparent" ? "_nobg.png" : "_cutout.jpg");
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      },
      bgType === "transparent" ? "image/png" : "image/jpeg",
      1.0
    );
  };

  const handleDownload = () => {
    if (viewMode === "mask") {
      setViewMode("cutout");
      setTimeout(() => triggerDownload(), 60);
    } else {
      triggerDownload();
    }
  };

  const reset = () => {
    setFile(null);
    setStatus("idle");
    setError("");
    setProgressText("");
    setHasProcessed(false);
    setViewMode("mask");
    setBrushMode("none");
    setBgType("transparent");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      bgImgRef.current = img;
      setBgImage(url);
      setBgType("image");
      setViewMode("cutout");
    };
    img.src = url;
  };

  return (
    <div className="tool-page">
      <h1>
        <Scissors size={22} /> {tr("Xóa Nền & Thay Nền AI", "AI Background Remover & Editor")}
      </h1>
      <p className="tool-subtitle">
        {tr(
          "Tự động nhận diện và tô đỏ vật thể (đặc biệt tóc tơ & chân dung) bằng AI. Tinh chỉnh vùng chọn bằng cọ vẽ trước khi xóa hoặc thay nền mới. Chạy ngay trên máy bạn, không tải file lên đâu cả.",
          "Auto detect and highlight subjects (especially fine hair & portraits) with AI. Refine with brush before removing or changing background. Runs on your device — nothing is uploaded."
        )}
      </p>

      {/* Hidden offscreen cutout canvas */}
      <canvas ref={maskCanvasRef} style={{ display: "none" }} />

      {!file ? (
        <div
          className="tool-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            accept(e.dataTransfer.files);
          }}
        >
          <UploadCloud size={32} />
          <div className="tool-drop-title">
            {tr("Kéo thả ảnh vào đây hoặc bấm để chọn", "Drop an image here or click to select")}
          </div>
          <div className="tool-drop-hint">{tr("Hỗ trợ JPG, PNG, WEBP, AVIF... Tỷ lệ gốc 100%", "Supports JPG, PNG, WEBP, AVIF... 100% original ratio")}</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              accept(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="tool-card">
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">{file.size ? (file.size / 1024 / 1024).toFixed(2) + " MB" : ""}</span>
            <button className="tool-icon-btn" onClick={reset} title={tr("Bỏ chọn", "Remove")}>
              <X size={16} />
            </button>
          </div>

          {/* Synchronized AI Model Tiers Section */}
          <div style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 0 10px", fontSize: "15px", fontWeight: 700, color: "var(--text, var(--fg))" }}>
              <Cpu size={16} /> {tr("Tách nền & Nhận diện vật thể (AI)", "AI Background & Subject Detection")}
            </h2>
            <div className="asr-tiers" role="radiogroup" aria-label={tr("Chọn mô hình", "Choose a model")}>
              {BG_TIERS.map((t) => {
                const isSaved = saved[t.id];
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tierId === t.id}
                    className={`asr-tier${tierId === t.id ? " is-on" : ""}`}
                    onClick={() => setTierId(t.id)}
                    disabled={status === "processing"}
                  >
                    <strong>
                      {tr(t.name, t.nameEn)} {tierId === t.id && <Check size={14} />}
                    </strong>
                    <em>{t.modelName} · {t.sizeFormatted}</em>
                    <small>{tr(t.tagline, t.taglineEn)}</small>
                    <span className={`asr-badge${isSaved ? " is-ok" : ""}`}>
                      {isSaved ? tr("Đã lưu trong máy", "Saved on device") : tr("Tải lần đầu", "Downloads on first use")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Trigger button */}
          <div className="tool-row" style={{ marginTop: "12px" }}>
            <button
              type="button"
              className="tool-btn"
              style={{ minHeight: "44px" }}
              onClick={runAiDetection}
              disabled={status === "processing"}
            >
              <Sparkles size={18} />
              {status === "processing"
                ? `${progressText || "Đang xử lý..."} (${progress}%)`
                : hasProcessed
                ? tr("Quét lại bằng AI", "Re-scan with AI")
                : tr("Nhận diện & Tô đỏ vật thể (AI)", "Detect & Highlight Subject (AI)")}
            </button>
          </div>

          {status === "processing" && (
            <div className="tool-progress-track" style={{ marginTop: "10px" }}>
              <div className="tool-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}

          {error && <div className="tool-status-error" style={{ marginTop: "10px" }}>{error}</div>}

          {/* Workspace Area */}
          <div className="bgr-workspace-compact" style={{ marginTop: "1.2rem" }}>
            {/* View Mode Tabs */}
            {hasProcessed && (
              <div className="bgr-view-tabs">
                <button
                  type="button"
                  className={`bgr-view-tab tab-mask ${viewMode === "mask" ? "active" : ""}`}
                  onClick={() => setViewMode("mask")}
                >
                  <Eye size={16} /> {tr("1. Tô đỏ vật thể (Xem & Sửa cọ)", "1. Highlight Mask (Inspect & Edit)")}
                  <span className="bgr-badge-red">Mặt nạ đỏ</span>
                </button>
                <button
                  type="button"
                  className={`bgr-view-tab ${viewMode === "cutout" ? "active" : ""}`}
                  onClick={() => setViewMode("cutout")}
                >
                  <Scissors size={16} /> {tr("2. Kết quả tách nền", "2. Cutout Result")}
                </button>
              </div>
            )}

            {hasProcessed && viewMode === "mask" && (
              <div className="bgr-banner-guide">
                <Info size={18} />
                <span>
                  <strong>Vùng màu đỏ</strong> là đối tượng AI đã nhận diện (giữ lại). Dùng{" "}
                  <strong>Cọ tô đỏ</strong> để thêm sợi tóc bị sót, hoặc <strong>Cọ tẩy</strong> để bỏ vùng thừa, sau đó bấm{" "}
                  <strong>Áp dụng Xóa Nền</strong>.
                </span>
              </div>
            )}

            {/* Canvas Viewport */}
            <div
              className={`bgr-canvas-area ${viewMode === "cutout" && bgType === "transparent" ? "bgr-checker" : ""}`}
            >
              <canvas
                ref={canvasRef}
                className={`bgr-main-canvas ${brushMode !== "none" && hasProcessed ? "crosshair" : ""}`}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>

            {/* Controls panel based on active mode */}
            {hasProcessed && (
              <div className="bgr-editor-tools">
                {viewMode === "mask" ? (
                  // Mode 1: Red Mask Brush Controls
                  <>
                    <div className="bgr-tool-group">
                      <label className="bgr-tool-label">
                        <Paintbrush size={15} /> {tr("Công cụ cọ vẽ tinh chỉnh", "Brush Editing Tools")}
                      </label>
                      <div className="bgr-brush-tools">
                        <button
                          type="button"
                          className={`bgr-icon-btn btn-paint ${brushMode === "paint" ? "active" : ""}`}
                          onClick={() => setBrushMode("paint")}
                          title={tr("Tô thêm màu đỏ (Giữ lại vật thể/tóc)", "Add red mask (Keep subject/hair)")}
                        >
                          <Paintbrush size={15} /> {tr("Cọ tô đỏ (Thêm)", "Paint Red")}
                        </button>
                        <button
                          type="button"
                          className={`bgr-icon-btn ${brushMode === "erase" ? "active" : ""}`}
                          onClick={() => setBrushMode("erase")}
                          title={tr("Tẩy bớt màu đỏ (Bỏ vùng nền)", "Erase red mask (Remove background)")}
                        >
                          <EraserIcon size={15} /> {tr("Cọ tẩy đỏ (Xóa)", "Erase Red")}
                        </button>
                        <button
                          type="button"
                          className={`bgr-icon-btn ${brushMode === "none" ? "active" : ""}`}
                          onClick={() => setBrushMode("none")}
                          title={tr("Chỉ xem", "View Only")}
                        >
                          <MousePointer2 size={15} /> {tr("Xem", "View")}
                        </button>
                      </div>

                      {brushMode !== "none" && (
                        <div className="bgr-slider-group" style={{ marginTop: "0.4rem" }}>
                          <div className="bgr-slider-header">
                            <span>{tr("Cỡ cọ vẽ", "Brush Size")}</span>
                            <strong>{brushSize}px</strong>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="120"
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                          />
                        </div>
                      )}
                    </div>

                    <div className="bgr-tool-group">
                      <label className="bgr-tool-label">
                        <Sliders size={15} /> {tr("Độ rõ nét lớp phủ đỏ", "Red Mask Opacity")}
                      </label>
                      <div className="bgr-slider-group red-slider">
                        <div className="bgr-slider-header">
                          <span>{tr("Độ mờ màu đỏ", "Opacity")}</span>
                          <strong>{Math.round(maskOpacity * 100)}%</strong>
                        </div>
                        <input
                          type="range"
                          min="0.2"
                          max="0.8"
                          step="0.05"
                          value={maskOpacity}
                          onChange={(e) => setMaskOpacity(parseFloat(e.target.value))}
                        />
                      </div>

                      <div style={{ marginTop: "0.5rem" }}>
                        <button
                          type="button"
                          className="tool-btn"
                          style={{ width: "100%", padding: "0.6rem 1rem", fontSize: "0.9rem" }}
                          onClick={() => setViewMode("cutout")}
                        >
                          <CheckCircle2 size={16} /> {tr("Áp dụng Xóa Nền (Hoàn tất)", "Apply Background Removal")}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  // Mode 2: Cutout & Background Customization
                  <>
                    <div className="bgr-tool-group">
                      <label className="bgr-tool-label">
                        <Palette size={15} /> {tr("Đổi phông nền mới", "Change Background")}
                      </label>
                      <div className="bgr-bg-options">
                        <button
                          type="button"
                          className={`bgr-bg-btn ${bgType === "transparent" ? "active" : ""}`}
                          onClick={() => setBgType("transparent")}
                        >
                          <div className="bgr-checker-icon" /> {tr("Trong suốt", "Transparent")}
                        </button>
                        <button
                          type="button"
                          className={`bgr-bg-btn ${bgType === "color" ? "active" : ""}`}
                          onClick={() => setBgType("color")}
                        >
                          {tr("Màu sắc", "Solid Color")}
                          <input
                            type="color"
                            value={bgColor}
                            onChange={(e) => {
                              setBgColor(e.target.value);
                              setBgType("color");
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="bgr-color-picker"
                          />
                        </button>
                        <button
                          type="button"
                          className={`bgr-bg-btn ${bgType === "image" ? "active" : ""}`}
                          onClick={() => bgInputRef.current?.click()}
                        >
                          <ImageIcon size={15} /> {tr("Ảnh nền", "Image")}
                        </button>
                        <input ref={bgInputRef} type="file" accept="image/*" hidden onChange={handleBgImageUpload} />
                      </div>
                    </div>

                    <div className="bgr-tool-group">
                      <label className="bgr-tool-label">
                        <Scissors size={15} /> {tr("Thao tác", "Actions")}
                      </label>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="bgr-icon-btn"
                          onClick={() => setViewMode("mask")}
                          title={tr("Quay lại sửa vùng chọn màu đỏ", "Return to edit red mask")}
                        >
                          <Undo2 size={15} /> {tr("Sửa lại vùng chọn (Tô đỏ)", "Edit Mask")}
                        </button>
                        <button
                          type="button"
                          className="tool-btn"
                          style={{ flex: 1, padding: "0.55rem 1rem", fontSize: "0.88rem" }}
                          onClick={handleDownload}
                        >
                          <Download size={15} />
                          {bgType === "transparent"
                            ? tr("Tải PNG trong suốt", "Download Transparent PNG")
                            : tr("Tải ảnh kết quả (JPG)", "Download Result (JPG)")}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
