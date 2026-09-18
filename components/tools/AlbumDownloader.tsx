"use client";

import { useState } from "react";
import { Search, AlertCircle, ImageIcon, DownloadCloud } from "lucide-react";
import JSZip from "jszip";
import "./tool-page.css";

type AlbumItem = { url: string; thumbnail: string; title: string; ext: string };

export function AlbumDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AlbumItem[]>([]);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<{ platform: string; title: string } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const handleZip = async () => {
    setZipping(true);
    setZipProgress(0);
    setError("");
    try {
      const zip = new JSZip();
      for (let i = 0; i < result.length; i++) {
        const res = await fetch(result[i].url);
        if (!res.ok) throw new Error(`Không tải được ảnh ${i + 1}.`);
        zip.file(`image_${String(i + 1).padStart(2, "0")}.${result[i].ext || "jpg"}`, await res.blob());
        setZipProgress(i + 1);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(meta?.title || "album").replace(/[^\w]+/g, "_").slice(0, 40) || "album"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (err: any) {
      setError(err.message || "Không thể tạo file ZIP.");
    } finally {
      setZipping(false);
    }
  };

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult([]);
    setMeta(null);

    try {
      const res = await fetch("/api/album", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Không thể trích xuất dữ liệu.");
      }

      if (!data.items || data.items.length === 0) {
        throw new Error("Không tìm thấy ảnh nào trong link này.");
      }

      setResult(data.items);
      setMeta({ platform: data.platform, title: data.title });
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
              <h3 style={{ fontSize: '16px', margin: 0 }}>
                {meta?.platform ? `${meta.platform} · ` : ""}{result.length} ảnh
              </h3>
              <button className="tool-btn tool-btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={handleZip} disabled={zipping}>
                <DownloadCloud size={14} /> {zipping ? `Đang nén ${zipProgress}/${result.length}...` : "Tải tất cả (ZIP)"}
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
              {result.map((item, idx) => (
                <div key={idx} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={item.thumbnail || item.url} referrerPolicy="no-referrer" alt={item.title || `Album img ${idx + 1}`} style={{ width: '100%', display: 'block', aspectRatio: '3/4', objectFit: 'cover' }} />
                  <a href={item.url} style={{ 
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
