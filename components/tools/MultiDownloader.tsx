"use client";

import { useState } from "react";
import { Download, Search, AlertCircle, Video, Music, Copy, Check } from "lucide-react";
import "./tool-page.css";

type VideoInfo = {
  title: string;
  description: string;
  uploader: string;
  thumbnail: string;
  duration: string | number;
  heights: number[];
  hasAudio: boolean;
  source: string;
};

function formatDuration(d: string | number) {
  if (typeof d === "string") return d;
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MultiDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState("");
  const [format, setFormat] = useState<"mp4" | "mp3">("mp4");
  const [height, setHeight] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState<"" | "title" | "desc">("");

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setInfo(null);

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Có lỗi xảy ra khi lấy dữ liệu.");

      setInfo(data);
      setHeight(data.heights?.[0] ?? 0);
      setFormat(data.heights?.length ? "mp4" : "mp3");
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi lấy dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!info) return;
    setDownloading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ url: info.source || url.trim(), type: format });
      if (format === "mp4" && height) qs.set("height", String(height));
      const res = await fetch(`/api/download/file?${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Không thể tải file.");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `download.${format}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (err: any) {
      setError(err.message || "Không thể tải file.");
    } finally {
      setDownloading(false);
    }
  };

  const copy = async (text: string, what: "title" | "desc") => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1500);
  };

  return (
    <div className="tool-page">
      <h1><Download size={22} /> Tải Video & Album Ảnh Đa Nền Tảng</h1>
      <p className="tool-subtitle">
        Dán đường dẫn (link) của video hoặc album ảnh từ Facebook, TikTok, Douyin, YouTube... hệ thống sẽ tự động nhận diện và bóc tách nội dung chất lượng cao.
      </p>

      <div className="tool-card">
        <div className="tool-row" style={{ display: 'flex', gap: '8px' }}>
          <div className="tool-field" style={{ flex: 1 }}>
            <input
              type="text"
              placeholder="Dán URL video hoặc bài viết vào đây..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              disabled={loading}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-card)" }}
            />
          </div>
          <button className="tool-btn" onClick={handleFetch} disabled={loading || !url.trim()} style={{ whiteSpace: 'nowrap' }}>
            <Search size={16} /> {loading ? "Đang xử lý..." : "Lấy dữ liệu"}
          </button>
        </div>

        {error && (
          <div className="tool-status-error" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {info && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {info.thumbnail && (
                <img src={info.thumbnail} alt="Thumbnail" referrerPolicy="no-referrer" style={{ width: '220px', maxWidth: '100%', borderRadius: '8px', objectFit: 'cover' }} />
              )}
              <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <strong style={{ fontSize: '16px', flex: 1 }}>{info.title}</strong>
                  <button className="tool-icon-btn" title="Copy tiêu đề" onClick={() => copy(info.title, "title")}>
                    {copied === "title" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  {[info.uploader, info.duration ? formatDuration(info.duration) : ""].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '16px', background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '8px', position: 'relative' }}>
              <h4 style={{ fontSize: '14px', margin: '0 0 8px 0' }}>Mô tả</h4>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '13.5px', color: 'var(--muted)', margin: 0, maxHeight: '180px', overflowY: 'auto' }}>
                {info.description || "(Không có mô tả)"}
              </pre>
              {info.description && (
                <button className="tool-icon-btn" style={{ position: 'absolute', top: '8px', right: '8px', width: 'auto', padding: '4px 8px', fontSize: '12px' }} onClick={() => copy(info.description, "desc")}>
                  {copied === "desc" ? <Check size={12} style={{ marginRight: '4px' }} /> : <Copy size={12} style={{ marginRight: '4px' }} />} Copy
                </button>
              )}
            </div>

            <div className="tool-row" style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '16px' }}>
              <div className="tool-field" style={{ flex: '0 0 auto', minWidth: 'unset' }}>
                <label>Định dạng</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className={format === "mp4" ? "tool-btn" : "tool-btn tool-btn-secondary"}
                    style={{ padding: '8px 14px' }}
                    disabled={!info.heights.length}
                    onClick={() => setFormat("mp4")}
                  >
                    <Video size={14} /> MP4
                  </button>
                  <button
                    className={format === "mp3" ? "tool-btn" : "tool-btn tool-btn-secondary"}
                    style={{ padding: '8px 14px' }}
                    disabled={!info.hasAudio}
                    onClick={() => setFormat("mp3")}
                  >
                    <Music size={14} /> MP3
                  </button>
                </div>
              </div>

              {format === "mp4" && info.heights.length > 0 && (
                <div className="tool-field" style={{ flex: '0 0 auto', minWidth: '140px' }}>
                  <label>Chất lượng</label>
                  <select value={height} onChange={(e) => setHeight(Number(e.target.value))}>
                    {info.heights.map((h) => (
                      <option key={h} value={h}>{h}p</option>
                    ))}
                  </select>
                </div>
              )}

              <button className="tool-btn" onClick={handleDownload} disabled={downloading}>
                <Download size={16} /> {downloading ? "Đang xử lý trên máy chủ..." : `Tải ${format.toUpperCase()}`}
              </button>
            </div>
            {downloading && (
              <p className="tool-status-text">Máy chủ đang tải và chuyển đổi file, có thể mất từ vài giây đến vài phút tuỳ độ dài video. Vui lòng không đóng trang.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
