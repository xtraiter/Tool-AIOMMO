"use client";

import { useEffect, useRef, useState } from "react";
import { Radar, AlertCircle, PlaySquare, ListPlus } from "lucide-react";
import { ProgressBar } from "./ProgressBar";
import { extractLinks } from "@/lib/extractLinks";
import { detectPlatform } from "@/lib/platforms";
import "./tool-page.css";

export function BulkScanner() {
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any[]>([]);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const detected = extractLinks(urls, 20);
  const summary = Object.entries(
    detected.reduce<Record<string, number>>((acc, l) => {
      const n = detectPlatform(l).name;
      acc[n] = (acc[n] || 0) + 1;
      return acc;
    }, {})
  ).map(([n, c]) => `${n} ×${c}`).join(", ");

  const handleFetch = async () => {
    if (!urls.trim()) return;
    setLoading(true);
    setError("");
    setResult([]);

    try {
      const links = extractLinks(urls, 20);
      if (links.length === 0) throw new Error("Không tìm thấy đường dẫn nào trong văn bản. Hãy dán nội dung có chứa link http(s).");

      const items: any[] = [];
      const failures: string[] = [];
      setProgress({ done: 0, total: links.length });
      for (let i = 0; i < links.length; i++) {
        if (!alive.current) return;
        try {
          const res = await fetch("/api/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: links[i] }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || "Không thể quét link này.");
          if (data.errors?.length) failures.push(...data.errors);
          items.push(...(data.items || []));
        } catch (e: any) {
          failures.push(`${links[i]}: ${e.message}`);
        }
        setProgress({ done: i + 1, total: links.length });
      }

      if (items.length === 0) {
        throw new Error(failures[0] || "Không tìm thấy video nào trong link này.");
      }
      setResult(items);
      if (failures.length) setError(`Có ${failures.length}/${links.length} link không quét được.`);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi quét dữ liệu.");
    } finally {
      setLoading(false);
      setProgress(null);
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
          {detected.length > 0 && (
            <p className="tool-status-text" style={{ margin: 0 }}>
              Tự nhận diện {detected.length} link: {summary}
            </p>
          )}
          <button className="tool-btn" onClick={handleFetch} disabled={loading || !urls.trim()} style={{ width: 'fit-content' }}>
            <Radar size={16} /> {loading ? "Đang quét dữ liệu..." : "Quét danh sách"}
          </button>
        </div>

        {loading && progress && (
          <ProgressBar percent={(progress.done / progress.total) * 100} label={`Đang quét link ${Math.min(progress.done + 1, progress.total)}/${progress.total}...`} />
        )}

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
