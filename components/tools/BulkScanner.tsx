"use client";

import { useState } from "react";
import { Radar, AlertCircle, PlaySquare, ListPlus } from "lucide-react";
import "./tool-page.css";

export function BulkScanner() {
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any[]>([]);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    if (!urls.trim()) return;
    setLoading(true);
    setError("");
    setResult([]);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_DOWNLOAD_API || "";
      console.log("Fetching from API:", apiUrl);

      await new Promise(resolve => setTimeout(resolve, 2000));

      if (urls.includes("error")) {
        throw new Error("Không thể quét danh sách này.");
      }

      setResult([
        { id: 1, title: "Video TikTok 1", duration: "00:15", status: "ready" },
        { id: 2, title: "Video TikTok 2", duration: "00:20", status: "ready" },
        { id: 3, title: "Video TikTok 3", duration: "00:45", status: "ready" },
        { id: 4, title: "Video Facebook", duration: "01:30", status: "ready" },
      ]);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi quét dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-page">
      <h1><Radar size={22} /> Tải Hàng Loạt Danh Sách & Quét Kênh</h1>
      <p className="tool-subtitle">
        Dán URL của một danh sách phát (Playlist), Kênh (Channel) hoặc danh sách nhiều link rời rạc (mỗi link một dòng) để hệ thống quét và tiến hành tải về tự động.
      </p>

      <div className="tool-card">
        <div className="tool-row" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="tool-field">
            <textarea 
              placeholder="Dán link Kênh (Channel) / Playlist hoặc dán nhiều link rời rạc (mỗi link 1 dòng)..." 
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              disabled={loading}
              rows={5}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-card)", resize: 'vertical' }}
            />
          </div>
          <button className="tool-btn" onClick={handleFetch} disabled={loading || !urls.trim()} style={{ width: 'fit-content' }}>
            <Radar size={16} /> {loading ? "Đang quét dữ liệu..." : "Quét danh sách"}
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
              <h3 style={{ fontSize: '16px', margin: 0 }}>Đã quét thấy {result.length} video</h3>
              <button className="tool-btn tool-btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                <ListPlus size={14} /> Tải tất cả
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {result.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: '8px', gap: '12px' }}>
                  <PlaySquare size={20} style={{ color: 'var(--muted)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{item.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Thời lượng: {item.duration}</div>
                  </div>
                  <button className="tool-icon-btn" style={{ fontSize: '13px', width: 'auto', padding: '4px 12px' }}>
                    Tải riêng
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
