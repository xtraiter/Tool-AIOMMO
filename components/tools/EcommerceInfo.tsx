"use client";

import { useEffect, useRef, useState } from "react";
import { ShoppingBag, AlertCircle, PackageSearch, Video, Copy, Check, Bookmark, DownloadCloud } from "lucide-react";
import JSZip from "jszip";
import { ProgressBar } from "./ProgressBar";
import { buildBookmarklet } from "@/lib/productBookmarklet";
import { safeFilename } from "@/lib/filename";
import "./tool-page.css";

type Product = {
  platform: string;
  title: string;
  price: string;
  description: string;
  images: string[];
  videos: string[];
  variants?: { name: string; options: { name: string; image?: string }[] }[];
  skus?: { name: string; price: string; stock?: number; image?: string }[];
  specs?: { name: string; value: string }[];
  sold?: string;
  source_url?: string;
};

export function EcommerceInfo() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [copied, setCopied] = useState("");
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [bookmarklet, setBookmarklet] = useState("");

  useEffect(() => {
    const code = buildBookmarklet(window.location.origin);
    setBookmarklet(code);
    // React refuses javascript: hrefs as props, so set it on the element directly.
    bookmarkRef.current?.setAttribute("href", code);

    // Data handed over by the bookmarklet arrives in the URL hash.
    const m = /^#data=(.+)$/.exec(window.location.hash);
    if (!m) return;
    (async () => {
      setLoading(true);
      try {
        const raw = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
        const signed = await (await fetch("/api/ecommerce/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: raw.images, videos: raw.videos }),
        })).json();
        setResult({
          platform: raw.platform || "E-Commerce",
          title: raw.title || "Sản phẩm",
          price: raw.price || "",
          description: raw.description || "",
          images: signed.images || [],
          videos: signed.videos || [],
          source_url: raw.source,
        });
      } catch {
        setError("Không đọc được dữ liệu từ nút lấy thông tin. Hãy thử lại trên trang sản phẩm.");
      } finally {
        setLoading(false);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    })();
  }, []);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setBlocked(false);
    setResult(null);

    try {
      const res = await fetch("/api/ecommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        if (/chặn|không cung cấp/i.test(data.error || "")) setBlocked(true);
        throw new Error(data.error || "Không thể trích xuất dữ liệu sản phẩm.");
      }
      setResult({ ...data, videos: data.videos || [] });
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi bóc tách dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1500);
  };

  const downloadZip = async () => {
    if (!result) return;
    const files = [
      ...result.images.map((u, i) => ({ u, name: `anh_${String(i + 1).padStart(2, "0")}.jpg` })),
      ...result.videos.map((u, i) => ({ u, name: `video_${i + 1}.mp4` })),
    ];
    setZipping({ done: 0, total: files.length });
    try {
      const zip = new JSZip();
      zip.file("thong-tin.txt", `${result.title}\n${result.price}\n\n${result.description}\n\n${result.source_url || ""}`);
      for (let i = 0; i < files.length; i++) {
        if (!alive.current) return;
        const res = await fetch(files[i].u);
        if (res.ok) zip.file(files[i].name, await res.blob());
        setZipping({ done: i + 1, total: files.length });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = safeFilename(result.title, "zip");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch {
      setError("Không thể tạo file ZIP.");
    } finally {
      setZipping(null);
    }
  };

  return (
    <div className="tool-page">
      <h1><ShoppingBag size={22} /> Lấy Thông Tin Sản Phẩm E-Commerce</h1>
      <p className="tool-subtitle">
        Lấy tên sản phẩm, giá bán, mô tả, hình ảnh và video sản phẩm từ Shopee, TikTok Shop và các trang bán hàng khác.
      </p>

      <div className="tool-card">
        <div className="tool-row" style={{ display: 'flex', gap: '8px' }}>
          <div className="tool-field" style={{ flex: 1 }}>
            <input
              type="text"
              placeholder="Dán đường dẫn sản phẩm vào đây..."
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

        <details className="ec-helper" open={blocked}>
          <summary><Bookmark size={15} /> Shopee / TikTok Shop chặn máy chủ? Lấy ngay trên trình duyệt của bạn</summary>
          <ol>
            <li>Kéo nút bên dưới lên <strong>thanh dấu trang</strong> của trình duyệt (hoặc bấm "Sao chép mã" rồi tạo dấu trang mới, dán mã vào ô địa chỉ).</li>
            <li>Mở trang sản phẩm Shopee/TikTok Shop như bình thường (đăng nhập nếu cần).</li>
            <li>Bấm dấu trang <strong>"Lấy sản phẩm"</strong> — công cụ này sẽ mở ra kèm dữ liệu vừa lấy.</li>
          </ol>
          <div className="ec-helper-actions">
            <a ref={bookmarkRef} className="tool-btn" draggable onClick={(e) => e.preventDefault()} title="Kéo nút này lên thanh dấu trang">
              <Bookmark size={14} /> Lấy sản phẩm
            </a>
            <button className="tool-btn tool-btn-secondary" onClick={() => copy(bookmarklet, "code")} disabled={!bookmarklet}>
              {copied === "code" ? <Check size={14} /> : <Copy size={14} />} Sao chép mã
            </button>
          </div>
          <p className="tool-status-text">Cách này dùng trên máy tính. Dữ liệu được đọc từ chính trang bạn đang xem nên không bị sàn chặn; nếu sàn đổi giao diện, một số trường (giá, mô tả) có thể trống.</p>
        </details>

        {result && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{result.platform}</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '4px 0 8px', flex: 1 }}>{result.title}</h2>
                  <button className="tool-icon-btn" title="Copy tên" onClick={() => copy(result.title, "title")}>
                    {copied === "title" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                {result.price && <div style={{ fontSize: '16px', color: '#ef4444', fontWeight: 'bold' }}>{result.price}</div>}
                {result.sold && <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>Đã bán {result.sold}</div>}
              </div>

              {result.skus && result.skus.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', margin: '0 0 8px 0' }}>Phân loại &amp; giá ({result.skus.length})</h4>
                  <div className="ec-table-wrap">
                    <table className="ec-table">
                      <thead><tr><th>Phân loại</th><th>Giá</th><th>Kho</th></tr></thead>
                      <tbody>
                        {result.skus.map((k, i) => (
                          <tr key={i}>
                            <td>
                              {k.image && <img src={k.image} alt="" referrerPolicy="no-referrer" />}
                              <span>{k.name}</span>
                            </td>
                            <td className="ec-price">{k.price}</td>
                            <td>{k.stock !== undefined ? k.stock.toLocaleString("vi-VN") : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {result.specs && result.specs.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', margin: '0 0 8px 0' }}>Thông số</h4>
                  <dl className="ec-specs">
                    {result.specs.map((sp, i) => (
                      <div key={i}><dt>{sp.name}</dt><dd>{sp.value}</dd></div>
                    ))}
                  </dl>
                </div>
              )}

              <div style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '8px', position: 'relative' }}>
                <h4 style={{ fontSize: '14px', margin: '0 0 8px 0' }}>Mô tả sản phẩm</h4>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '14px', color: 'var(--muted)', margin: 0, maxHeight: '260px', overflowY: 'auto' }}>
                  {result.description || "(Không có mô tả)"}
                </pre>
                {result.description && (
                  <button className="tool-icon-btn" style={{ position: 'absolute', top: '8px', right: '8px', width: 'auto', padding: '4px 8px', fontSize: '12px' }} onClick={() => copy(result.description, "desc")}>
                    {copied === "desc" ? <Check size={12} style={{ marginRight: '4px' }} /> : <Copy size={12} style={{ marginRight: '4px' }} />} Copy
                  </button>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '14px', margin: 0 }}>Tài nguyên Media ({result.images.length} ảnh, {result.videos.length} video)</h4>
                  <button className="tool-btn tool-btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={downloadZip} disabled={!!zipping || (result.images.length + result.videos.length === 0)}>
                    <DownloadCloud size={14} /> {zipping ? "Đang nén..." : "Tải toàn bộ (ZIP)"}
                  </button>
                </div>
                {zipping && <ProgressBar percent={(zipping.done / Math.max(1, zipping.total)) * 100} label={`Đang tải ${Math.min(zipping.done + 1, zipping.total)}/${zipping.total}...`} />}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  {result.images.map((img, idx) => (
                    <a key={idx} href={img} download={`anh_${idx + 1}.jpg`} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)', display: 'block' }}>
                      <img src={img} alt={`Ảnh sản phẩm ${idx + 1}`} referrerPolicy="no-referrer" style={{ width: '100%', display: 'block', aspectRatio: '1/1', objectFit: 'cover' }} />
                    </a>
                  ))}
                  {result.videos.map((v, idx) => (
                    <a key={`v${idx}`} href={v} download={`video_${idx + 1}.mp4`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', aspectRatio: '1/1', color: 'var(--muted)', textDecoration: 'none' }}>
                      <Video size={24} style={{ marginBottom: '4px' }} />
                      <span style={{ fontSize: '12px' }}>Tải video {idx + 1}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
