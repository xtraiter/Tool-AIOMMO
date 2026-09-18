"use client";

import { useState } from "react";
import { ShoppingBag, AlertCircle, PackageSearch, Image as ImageIcon, Video, Copy } from "lucide-react";
import { placeholderImage } from "@/lib/placeholderImage";
import { ProgressBar } from "./ProgressBar";
import "./tool-page.css";

export function EcommerceInfo() {
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
      const res = await fetch("/api/ecommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Không thể trích xuất dữ liệu sản phẩm.");
      }

      setResult(data); // { platform, title, price, description, images[], videos[] }
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi bóc tách dữ liệu.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="tool-page">
      <h1><ShoppingBag size={22} /> Lấy Thông Tin Sản Phẩm E-Commerce</h1>
      <p className="tool-subtitle">
        Bóc tách tự động tên sản phẩm, giá bán, mô tả chi tiết, hình ảnh sắc nét và video giới thiệu từ Shopee, TikTok Shop...
      </p>

      <div className="tool-card">
        <div className="tool-row" style={{ display: 'flex', gap: '8px' }}>
          <div className="tool-field" style={{ flex: 1 }}>
            <input 
              type="text" 
              placeholder="Dán đường dẫn sản phẩm Shopee / TikTok Shop vào đây..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              disabled={loading}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-card)" }}
            />
          </div>
          <button className="tool-btn" onClick={handleFetch} disabled={loading || !url.trim()} style={{ whiteSpace: 'nowrap' }}>
            <PackageSearch size={16} /> {loading ? "Đang xử lý..." : "Lấy thông tin"}
          </button>
        </div>

        {loading && <ProgressBar label="Đang lấy thông tin sản phẩm..." />}

        {error && (
          <div className="tool-status-error" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            
            <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>{result.title}</h2>
                <div style={{ fontSize: '16px', color: '#ef4444', fontWeight: 'bold' }}>{result.price}</div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '8px', position: 'relative' }}>
                <h4 style={{ fontSize: '14px', margin: '0 0 8px 0' }}>Mô tả sản phẩm</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
                  {result.description}
                </pre>
                <button className="tool-icon-btn" style={{ position: 'absolute', top: '8px', right: '8px', width: 'auto', padding: '4px 8px', fontSize: '12px' }} onClick={() => navigator.clipboard.writeText(result.description)}>
                  <Copy size={12} style={{ marginRight: '4px' }} /> Copy
                </button>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '14px', margin: 0 }}>Tài nguyên Media ({result.images.length} ảnh, {result.videos} video)</h4>
                  <button className="tool-btn tool-btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                    Tải toàn bộ tài nguyên (ZIP)
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }}>
                  {result.images.map((img: string, idx: number) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={img} alt={`Product img ${idx + 1}`} style={{ width: '100%', display: 'block', aspectRatio: '1/1', objectFit: 'cover' }} />
                    </div>
                  ))}
                  {result.videos > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', aspectRatio: '1/1', color: 'var(--muted)' }}>
                      <Video size={24} style={{ marginBottom: '4px' }} />
                      <span style={{ fontSize: '12px' }}>Video SP</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
