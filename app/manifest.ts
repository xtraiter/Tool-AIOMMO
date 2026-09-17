import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AIOMMO Studio — Công cụ Video & Âm thanh miễn phí",
    short_name: "AIOMMO Studio",
    description: "Cắt ghép video, tạo giọng nói AI, biên tập âm thanh, quay màn hình... miễn phí, xử lý ngay trên trình duyệt.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#091e1e",
    theme_color: "#091e1e",
    lang: "vi",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
