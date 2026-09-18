"use client";

import { useState } from "react";
import { Search, AlertCircle, ImageIcon, DownloadCloud } from "lucide-react";
import { placeholderImage } from "@/lib/placeholderImage";
import "./tool-page.css";

export function AlbumDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string[]>([]);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult([]);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_DOWNLOAD_API || "";
      console.log("Fetching from API:", apiUrl);

      await new Promise(resolve => setTimeout(resolve, 1500));

      if (url.includes("error")) {
        throw new Error("Không thể trích xuất album từ đường dẫn này.");
      }

      setResult([
        placeholderImage("Ảnh 1", 600, 800),
        placeholderImage("Ảnh 2", 600, 800),
        placeholderImage("Ảnh 3", 600, 800),
        placeholderImage("Ảnh 4", 600, 800),
      ]);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi lấy dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-page">
      <h1><ImageIcon size={22} /> Tải Album Ảnh HD Không Logo</h1>
      <p className="tool-subtitle">
        Dán đường dẫn của bài viết dạng ảnh (Album) từ Facebook, TikTok, Douyin. Hệ thống sẽ bóc tách và cung cấp lựa chọn tải từng ảnh hoặc tải toàn bộ bằng file ZIP.
      </p>

      <div className="tool-card">
        <div className="tool-row" style={{ display: 'flex', gap: '8px' }}>
          <div className="tool-field" style={{ flex: 1 }}>
            <input 
              type="text" 
              placeholder="Dán URL bài viết dạng album vào đây..." 
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

        {result.length > 0 && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', margin: 0 }}>Kết quả trích xuất ({result.length} ảnh)</h3>
              <button className="tool-btn tool-btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                <DownloadCloud size={14} /> Tải tất cả (ZIP)
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
              {result.map((img, idx) => (
                <div key={idx} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={img} alt={`Album img ${idx + 1}`} style={{ width: '100%', display: 'block', aspectRatio: '3/4', objectFit: 'cover' }} />
                  <a href={img} download={`image_${idx + 1}.jpg`} style={{ 
                    position: 'absolute', bottom: '8px', right: '8px', 
                    background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', 
                    borderRadius: '4px', fontSize: '12px', textDecoration: 'none'
                  }}>Tải về</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
