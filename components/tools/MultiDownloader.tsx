"use client";

import { useState } from "react";
import { Download, Search, AlertCircle, Video, Image as ImageIcon } from "lucide-react";
import "./tool-page.css";

export function MultiDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // Giả lập gọi API (sử dụng biến môi trường NEXT_PUBLIC_DOWNLOAD_API nếu có)
      const apiUrl = process.env.NEXT_PUBLIC_DOWNLOAD_API || "";
      console.log("Fetching from API:", apiUrl);

      // Timeout giả lập
      await new Promise(resolve => setTimeout(resolve, 1500));

      if (url.includes("error")) {
        throw new Error("Không thể trích xuất dữ liệu từ đường dẫn này.");
      }

      setResult({
        type: "video",
        title: "Video TikTok / Facebook Mẫu",
        thumbnail: "https://via.placeholder.com/400x225?text=Video+Thumbnail",
        url: "#",
      });
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi lấy dữ liệu.");
    } finally {
      setLoading(false);
    }
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

        {result && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Kết quả trích xuất</h3>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <img src={result.thumbnail} alt="Thumbnail" style={{ width: '200px', borderRadius: '8px', objectFit: 'cover' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <strong style={{ fontSize: '15px' }}>{result.title}</strong>
                <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {result.type === "video" ? <Video size={14} /> : <ImageIcon size={14} />} {result.type.toUpperCase()}
                </span>
                <button className="tool-btn tool-btn-secondary" style={{ marginTop: 'auto', width: 'fit-content' }}>
                  <Download size={14} /> Tải xuống máy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
