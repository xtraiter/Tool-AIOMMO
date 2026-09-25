"use client";

import { useEffect, useRef, useState } from "react";
import {
  ShoppingBag, AlertCircle, PackageSearch, Video, Copy, Check,
  Bookmark, DownloadCloud, Image, List, FileText, Star, MapPin, Store,
  ChevronDown, ExternalLink, Download,
} from "lucide-react";
import JSZip from "jszip";
import { ProgressBar } from "./ProgressBar";
import { buildBookmarklet } from "@/lib/productBookmarklet";
import { safeFilename } from "@/lib/filename";
import "./tool-page.css";

type Variant = { name: string; options: { name: string; image?: string }[] };
type Sku = { name: string; price: string; stock?: number; image?: string };
type Spec = { name: string; value: string };

type Product = {
  platform: string;
  title: string;
  price: string;
  description: string;
  images: string[];
  videos: string[];
  variants?: Variant[];
  skus?: Sku[];
  specs?: Spec[];
  sold?: string;
  shopName?: string;
  location?: string;
  source_url?: string;
  _partial?: boolean;
};

const SAMPLE_LINKS = [
  { label: "Nồi Inox Sunhouse (Shopee Mobile)", url: "https://shopee.vn/product/57714861/5434892" },
  { label: "Máy Game Sup 400 (Shopee Web)", url: "https://shopee.vn/M%C3%A1y-Ch%C6%A1i-Game-Sup-400-Game-In-1-Retro-K%C3%A8m-Tay-C%E1%BA%A7m-Ch%C6%A1i-Game-2-Ng%C6%B0%E1%BB%9Di-i.2748938.3428960" },
  { label: "Áo Thun Unisex (TikTok Shop)", url: "https://shop.tiktok.com/view/product/1729548464619620894" },
];

export function EcommerceInfo() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [copied, setCopied] = useState("");
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"desc" | "images" | "skus" | "video">("desc");
  const [showSamples, setShowSamples] = useState(false);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [bookmarklet, setBookmarklet] = useState("");

  useEffect(() => {
    const code = buildBookmarklet(window.location.origin);
    setBookmarklet(code);
    bookmarkRef.current?.setAttribute("href", code);

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
        setActiveTab("desc");
      } catch {
        setError("Không đọc được dữ liệu từ nút lấy thông tin. Hãy thử lại trên trang sản phẩm.");
      } finally {
        setLoading(false);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    })();
  }, []);

  const isBlockedPlatform = (u: string) =>
    /shopee\.(vn|com)|shop\.tiktok\.com|tiktok\.com/i.test(u);

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
        if (/chặn|không cung cấp|Security Check/i.test(data.error || "")) setBlocked(true);
        throw new Error(data.error || "Không thể trích xuất dữ liệu sản phẩm.");
      }
      setResult({ ...data, videos: data.videos || [] });
      setActiveTab("desc");
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi bóc tách dữ liệu.");
      if (isBlockedPlatform(url)) setBlocked(true);
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

  const platformColor = result?.platform === "Shopee"
    ? "linear-gradient(135deg,#ee4d2d,#ff6b35)"
    : "linear-gradient(135deg,#010101,#2d2d2d)";

  const tabData = result ? [
    { id: "desc" as const, label: "Bài Viết Mô Tả", icon: <FileText size={14} />, count: null },
    { id: "images" as const, label: "Album Ảnh HD", icon: <Image size={14} />, count: result.images.length },
    { id: "skus" as const, label: "Phân Loại Hàng (SKU)", icon: <List size={14} />, count: result.skus?.length },
    { id: "video" as const, label: "Video Sản Phẩm", icon: <Video size={14} />, count: result.videos.length },
  ] : [];

  return (
    <div className="tool-page">
      <h1><ShoppingBag size={22} /> Lấy Thông Tin Sản Phẩm E-Commerce</h1>
      <p className="tool-subtitle">
        Tự động lấy toàn bộ bài viết mô tả chi tiết, album ảnh HD gốc không logo, video sản phẩm và bảng giá phân loại từ Shopee và TikTok Shop.
      </p>

      <div className="tool-card">
        {/* URL Input */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              type="text"
              placeholder="Dán link sản phẩm Shopee hoặc TikTok Shop vào đây..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              disabled={loading}
              style={{
                width: "100%", padding: "10px 12px",
                borderRadius: "8px", border: "1px solid var(--border)",
                background: "var(--bg-card)", fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            className="tool-btn"
            onClick={handleFetch}
            disabled={loading || !url.trim()}
            style={{ whiteSpace: "nowrap" }}
          >
            <PackageSearch size={16} /> {loading ? "Đang xử lý..." : "Quét Thông Tin Sản Phẩm"}
          </button>
        </div>

        {/* Sample links */}
        <div style={{ marginBottom: "12px" }}>
          <button
            style={{ fontSize: "12px", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "4px" }}
            onClick={() => setShowSamples(!showSamples)}
          >
            <ChevronDown size={13} style={{ transform: showSamples ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            Thử nhanh link mẫu
          </button>
          {showSamples && (
            <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {SAMPLE_LINKS.map((s) => (
                <button
                  key={s.url}
                  className="tool-btn tool-btn-secondary"
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                  onClick={() => { setUrl(s.url); setShowSamples(false); }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading && <ProgressBar label="Đang bóc tách dữ liệu sản phẩm..." />}

        {error && (
          <div className="tool-status-error" style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "12px" }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
            <span>{error}</span>
          </div>
        )}

        {/* Bookmarklet helper */}
        <details className="ec-helper" open={blocked || isBlockedPlatform(url)}>
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
          <p className="tool-status-text">Cách này dùng trên máy tính. Dữ liệu được đọc từ chính trang bạn đang xem nên không bị sàn chặn.</p>
        </details>

        {/* Result display */}
        {result && (
          <div style={{ marginTop: "20px" }}>
            {/* Product header */}
            <div style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
            }}>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                {/* Thumbnail */}
                {result.images.length > 0 && (
                  <div style={{
                    width: "100px", height: "100px", flexShrink: 0,
                    borderRadius: "10px", overflow: "hidden",
                    border: "1px solid var(--border)", position: "relative",
                  }}>
                    <img
                      src={result.images[0]}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {/* Platform badge */}
                    <span style={{
                      position: "absolute", top: "4px", left: "4px",
                      background: platformColor,
                      color: "#fff", fontSize: "9px", fontWeight: 800,
                      padding: "2px 6px", borderRadius: "4px",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>
                      {result.platform}
                    </span>
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Title */}
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 8px", flex: 1, lineHeight: 1.4 }}>
                      {result.title}
                    </h2>
                    <button className="tool-icon-btn" title="Sao chép tên" onClick={() => copy(result.title, "title")}>
                      {copied === "title" ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>

                  {/* Price + meta */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "13px" }}>
                    {result.price && (
                      <span style={{ color: "#ef4444", fontWeight: 700, fontSize: "16px" }}>{result.price}</span>
                    )}
                    {result.sold && (
                      <span style={{ color: "var(--muted)" }}>· Đã bán {result.sold}</span>
                    )}
                  </div>

                  {/* Shop info */}
                  {(result.shopName || result.location) && (
                    <div style={{ marginTop: "6px", display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "12px", color: "var(--muted)" }}>
                      {result.shopName && (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Store size={12} /> {result.shopName}
                        </span>
                      )}
                      {result.location && (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <MapPin size={12} /> {result.location}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                <button
                  className="tool-btn"
                  style={{ padding: "7px 14px", fontSize: "13px" }}
                  onClick={() => copy(result.description || result.title, "desc")}
                >
                  {copied === "desc" ? <Check size={14} /> : <Copy size={14} />}
                  Sao Chép Bài Viết Mô Tả
                </button>
                <button
                  className="tool-btn tool-btn-secondary"
                  style={{ padding: "7px 14px", fontSize: "13px" }}
                  onClick={downloadZip}
                  disabled={!!zipping || result.images.length + result.videos.length === 0}
                >
                  <DownloadCloud size={14} />
                  {zipping ? `Đang nén ${zipping.done}/${zipping.total}...` : "Tải Tất Cả Ảnh (.ZIP)"}
                </button>
                {result.videos.length > 0 && (
                  <a
                    href={result.videos[0]}
                    download="video_san_pham.mp4"
                    className="tool-btn"
                    style={{ padding: "7px 14px", fontSize: "13px", background: "linear-gradient(135deg,#ef4444,#dc2626)", textDecoration: "none" }}
                  >
                    <Download size={14} /> Tải Video MP4
                  </a>
                )}
                {result.source_url && (
                  <a
                    href={result.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tool-btn tool-btn-secondary"
                    style={{ padding: "7px 14px", fontSize: "13px", textDecoration: "none" }}
                  >
                    <ExternalLink size={14} /> Xem trên {result.platform}
                  </a>
                )}
              </div>
              {zipping && <div style={{ marginTop: "8px" }}><ProgressBar percent={(zipping.done / Math.max(1, zipping.total)) * 100} label={`Đang tải ${Math.min(zipping.done + 1, zipping.total)}/${zipping.total}...`} /></div>}
            </div>

            {/* Partial warning */}
            {result._partial && (
              <div className="tool-status-text" style={{ marginBottom: "12px", padding: "10px 12px", background: "var(--bg-card)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                ⚠️ Shopee giới hạn truy cập máy chủ từ nước ngoài — chỉ lấy được thông tin cơ bản. Dùng nút <strong>Bookmarklet</strong> ở trên để lấy đầy đủ ảnh và mô tả.
              </div>
            )}

            {/* Tabs */}
            <div style={{ borderBottom: "2px solid var(--border)", marginBottom: "16px", display: "flex", gap: "0", overflowX: "auto" }}>
              {tabData.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "10px 16px", fontSize: "13px", fontWeight: 600,
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: activeTab === tab.id ? "2px solid var(--primary)" : "2px solid transparent",
                    color: activeTab === tab.id ? "var(--primary)" : "var(--muted)",
                    marginBottom: "-2px", whiteSpace: "nowrap",
                  }}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.count !== null && tab.count !== undefined && (
                    <span style={{
                      background: activeTab === tab.id ? "var(--primary)" : "var(--border)",
                      color: activeTab === tab.id ? "#fff" : "var(--muted)",
                      borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                      padding: "1px 7px", minWidth: "20px", textAlign: "center",
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab: Mô tả */}
            {activeTab === "desc" && (
              <div style={{ position: "relative" }}>
                <pre style={{
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  fontFamily: "inherit", fontSize: "14px", lineHeight: 1.7,
                  color: "var(--text)", margin: 0,
                  background: "var(--bg-card)", padding: "16px",
                  borderRadius: "10px", border: "1px solid var(--border)",
                  maxHeight: "500px", overflowY: "auto",
                }}>
                  {result.description || "(Không có bài viết mô tả)"}
                </pre>
                {result.description && (
                  <button
                    className="tool-icon-btn"
                    style={{ position: "absolute", top: "10px", right: "10px", padding: "4px 10px", fontSize: "12px", width: "auto" }}
                    onClick={() => copy(result.description, "desc")}
                  >
                    {copied === "desc" ? <Check size={12} /> : <Copy size={12} />} Copy
                  </button>
                )}
              </div>
            )}

            {/* Tab: Ảnh */}
            {activeTab === "images" && (
              <div>
                {result.images.length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: "14px", textAlign: "center", padding: "32px" }}>
                    Không tìm thấy ảnh sản phẩm
                  </p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px" }}>
                    {result.images.map((img, idx) => (
                      <div key={idx} style={{ position: "relative", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)", aspectRatio: "1/1", background: "var(--bg-card)" }}>
                        <img
                          src={img}
                          alt={`Ảnh ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          loading="lazy"
                        />
                        <a
                          href={img}
                          download={`anh_${String(idx + 1).padStart(2, "0")}.jpg`}
                          style={{
                            position: "absolute", bottom: "6px", right: "6px",
                            background: "rgba(0,0,0,0.7)", color: "#fff",
                            borderRadius: "6px", padding: "4px 7px",
                            fontSize: "11px", textDecoration: "none",
                            display: "flex", alignItems: "center", gap: "3px",
                          }}
                          title="Tải ảnh"
                        >
                          <Download size={11} /> Tải
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: SKU */}
            {activeTab === "skus" && (
              <div>
                {/* Variant options */}
                {result.variants && result.variants.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    {result.variants.map((v, vi) => (
                      <div key={vi} style={{ marginBottom: "12px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "var(--text)" }}>{v.name}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {v.options.map((opt, oi) => (
                            <div key={oi} style={{
                              display: "flex", alignItems: "center", gap: "6px",
                              border: "1px solid var(--border)", borderRadius: "6px",
                              padding: "4px 10px", fontSize: "12px",
                              background: "var(--bg-card)",
                            }}>
                              {opt.image && (
                                <img src={opt.image} alt="" referrerPolicy="no-referrer"
                                  style={{ width: "20px", height: "20px", objectFit: "cover", borderRadius: "3px" }} />
                              )}
                              {opt.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* SKU table */}
                {result.skus && result.skus.length > 0 ? (
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
                ) : (
                  <p style={{ color: "var(--muted)", fontSize: "14px", textAlign: "center", padding: "32px" }}>
                    Không có phân loại hàng (hoặc chỉ có 1 loại)
                  </p>
                )}
              </div>
            )}

            {/* Tab: Video */}
            {activeTab === "video" && (
              <div>
                {result.videos.length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: "14px", textAlign: "center", padding: "32px" }}>
                    Không tìm thấy video sản phẩm
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {result.videos.map((v, idx) => (
                      <div key={idx} style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                        <video
                          src={v}
                          controls
                          style={{ width: "100%", maxHeight: "400px", display: "block" }}
                        />
                        <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "13px", color: "var(--muted)" }}>Video sản phẩm {idx + 1}</span>
                          <a
                            href={v}
                            download={`video_${idx + 1}.mp4`}
                            className="tool-btn"
                            style={{ padding: "5px 12px", fontSize: "12px", textDecoration: "none" }}
                          >
                            <Download size={13} /> Tải MP4
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
