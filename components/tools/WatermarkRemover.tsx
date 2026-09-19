"use client";

import { useState } from "react";
import { Eraser, Image as ImageIcon, Film } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { ImageRemover } from "./watermark/ImageRemover";
import { VideoRemover } from "./watermark/VideoRemover";
import "./tool-page.css";
import "./watermark/watermark.css";

export function WatermarkRemover() {
  const tr = useTr();
  const [mode, setMode] = useState<"image" | "video">("image");
  return (
    <div className="tool-page wm-page">
      <h1><Eraser size={22} /> {tr("Xóa Logo & Watermark AI", "AI Logo & Watermark Remover")}</h1>
      <p className="tool-subtitle">
        {tr(
          "Tô lên logo, chữ hoặc vật thể thừa — AI điền lại phần nền tự nhiên, không làm mờ. Toàn bộ chạy trên thiết bị của bạn, không tải ảnh lên máy chủ.",
          "Paint over a logo, text or unwanted object — AI fills in the background naturally without blurring. Everything runs on your device; nothing is uploaded."
        )}
      </p>
      <div className="wm-modes" role="tablist" aria-label={tr("Loại tệp", "File type")}>
        <button type="button" role="tab" aria-selected={mode === "image"} className={mode === "image" ? "is-active" : ""} onClick={() => setMode("image")}><ImageIcon size={16} /> {tr("Ảnh (AI)", "Image (AI)")}</button>
        <button type="button" role="tab" aria-selected={mode === "video"} className={mode === "video" ? "is-active" : ""} onClick={() => setMode("video")}><Film size={16} /> {tr("Video (logo cố định)", "Video (fixed logo)")}</button>
      </div>
      {mode === "image" ? <ImageRemover /> : <VideoRemover />}
    </div>
  );
}
