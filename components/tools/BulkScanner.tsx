"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Radar, AlertCircle, PlaySquare, ListPlus, CheckSquare, Square, Download, Video, Music, Check } from "lucide-react";
import { ProgressBar } from "./ProgressBar";
import { extractLinks } from "@/lib/extractLinks";
import { detectPlatform } from "@/lib/platforms";
import { parseContentDisposition } from "@/lib/filename";
import "./tool-page.css";

type ScannedItem = {
  id: string | number;
  title: string;
  duration: string;
  thumbnail: string;
  url: string;
  source_url: string;
  ext: string;

  // Frontend states
  selected: boolean;
  dlStatus: "idle" | "pending" | "downloading" | "done" | "error";
  dlProgress: number;
  dlLabel: string;
  errorMsg?: string;
};

const MAX_CONCURRENT = 2; // Server allow 3, we use 2 to be safe
const BITRATES = [320, 256, 192, 128];

export function BulkScanner() {
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScannedItem[]>([]);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);

  // Download settings
  const [format, setFormat] = useState<"mp4" | "mp3">("mp4");
  const [bitrate, setBitrate] = useState(320);
  const [isQueueRunning, setIsQueueRunning] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

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
    setIsQueueRunning(false);

    try {
      const links = extractLinks(urls, 50); // Cho phép tối đa 50 link mỗi lần
      if (links.length === 0) throw new Error("Không tìm thấy đường dẫn nào trong văn bản. Hãy dán nội dung có chứa link http(s).");

      const items: ScannedItem[] = [];
      const failures: string[] = [];
      setScanProgress({ done: 0, total: links.length });
      
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
          
          if (data.items) {
            items.push(...data.items.map((item: any, idx: number) => ({
              ...item,
              id: `${i}-${idx}-${item.id || Date.now()}`,
              selected: true,
              dlStatus: "idle",
              dlProgress: 0,
              dlLabel: ""
            })));
          }
        } catch (e: any) {
          failures.push(`${links[i]}: ${e.message}`);
        }
        setScanProgress({ done: i + 1, total: links.length });
      }

      if (items.length === 0) {
        throw new Error(failures[0] || "Không tìm thấy video nào trong các link trên.");
      }
      
      setResult(items);
      if (failures.length) setError(`Có ${failures.length}/${links.length} yêu cầu quét bị lỗi (có thể bị chặn).`);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi quét dữ liệu.");
    } finally {
      setLoading(false);
      setScanProgress(null);
    }
  };

  const updateItem = (id: string | number, updater: Partial<ScannedItem>) => {
    setResult((prev) => prev.map((item) => (item.id === id ? { ...item, ...updater } : item)));
  };

  const downloadSingle = async (item: ScannedItem) => {
    if (item.dlStatus === "downloading" || item.dlStatus === "done") return;
    
    updateItem(item.id, { dlStatus: "pending", dlProgress: 0, dlLabel: "Đang khởi tạo..." });
    
    try {
      const isVideo = format === "mp4";
      const start = await fetch("/api/download/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: item.url,
          type: format,
          ...(isVideo ? { height: 1080 } : { abr: bitrate }), // Mặc định tải 1080p nếu là video
        }),
      });
      const started = await start.json();
      if (!start.ok) throw new Error(started.error || "Không thể bắt đầu tải.");

      updateItem(item.id, { dlStatus: "downloading", dlLabel: "Máy chủ đang tải..." });

      // Poll status
      while (alive.current) {
        const st = await (await fetch(`/api/download/status?id=${started.id}`)).json();
        if (st.error && st.status !== "done") throw new Error(st.error);
        
        updateItem(item.id, { 
          dlProgress: Math.round(st.percent * 0.7), 
          dlLabel: st.stage === "convert" ? "Máy chủ đang chuyển đổi..." : "Máy chủ đang xử lý..." 
        });
        
        if (st.status === "done") break;
        await new Promise((r) => setTimeout(r, 600));
      }

      if (!alive.current) return;

      // Download file to browser
      updateItem(item.id, { dlLabel: "Đang tải về máy..." });
      const res = await fetch(`/api/download/file?id=${started.id}`);
      if (!res.ok || !res.body) throw new Error("Không thể tải file về máy.");
      
      const total = Number(res.headers.get("Content-Length") || 0);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      
      while (alive.current) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) {
          updateItem(item.id, { dlProgress: 70 + Math.round((got / total) * 30) });
        }
      }

      if (!alive.current) return;

      const blob = new Blob(chunks as BlobPart[], { type: res.headers.get("Content-Type") || "application/octet-stream" });
      const name = parseContentDisposition(res.headers.get("Content-Disposition"), `download_${item.id}.${format}`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);

      updateItem(item.id, { dlStatus: "done", dlProgress: 100, dlLabel: "Hoàn tất" });
      return true;
    } catch (err: any) {
      updateItem(item.id, { dlStatus: "error", errorMsg: err.message || "Lỗi tải file.", dlLabel: "Lỗi" });
      return false;
    }
  };

  // The Queue Processor
  useEffect(() => {
    if (!isQueueRunning || !alive.current) return;

    let activeCount = result.filter(r => r.dlStatus === "downloading" || r.dlStatus === "pending").length;
    const pendingItems = result.filter(r => r.selected && (r.dlStatus === "idle" || r.dlStatus === "error"));

    if (activeCount === 0 && pendingItems.length === 0) {
      setIsQueueRunning(false);
      return;
    }

    if (activeCount < MAX_CONCURRENT && pendingItems.length > 0) {
      const toStart = pendingItems.slice(0, MAX_CONCURRENT - activeCount);
      toStart.forEach(item => {
        downloadSingle(item);
      });
    }
  }, [result, isQueueRunning]);

  const handleDownloadAll = () => {
    setIsQueueRunning(true);
  };

  const handleStopAll = () => {
    setIsQueueRunning(false);
    // Reset pending items to idle so they stop queueing
    setResult(prev => prev.map(item => item.dlStatus === "pending" ? { ...item, dlStatus: "idle" } : item));
  };

  const toggleAll = (select: boolean) => {
    setResult(prev => prev.map(item => ({ ...item, selected: select })));
  };

  const isVideoFormat = format === "mp4";
  const selectedCount = result.filter(r => r.selected).length;
  const doneCount = result.filter(r => r.selected && r.dlStatus === "done").length;

  return (
    <div className="tool-page">
      <h1><Radar size={22} /> Tải Hàng Loạt & Quét Kênh</h1>
      <p className="tool-subtitle">
        Dán URL của một danh sách phát (Playlist), Kênh (Channel) hoặc danh sách nhiều link rời rạc (mỗi link một dòng) để hệ thống quét và tiến hành tải về tự động.
      </p>

      <div className="tool-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="tool-row" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div className="tool-field" style={{ flex: 1 }}>
              <textarea 
                placeholder="Dán link Kênh (Channel) / Playlist hoặc dán nhiều link rời rạc (mỗi link 1 dòng)..." 
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                disabled={loading}
                rows={4}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-card)", resize: 'vertical', minHeight: '44px' }}
              />
            </div>
            <button className="tool-btn" onClick={handleFetch} disabled={loading || !urls.trim()} style={{ whiteSpace: 'nowrap', height: '44px' }}>
              <Search size={16} /> {loading ? "Đang xử lý..." : "Lấy dữ liệu"}
            </button>
          </div>
          {detected.length > 0 && (
            <p className="tool-status-text" style={{ margin: 0 }}>
              Tự nhận diện {detected.length} link: {summary}
            </p>
          )}
        </div>

        {loading && scanProgress && (
          <ProgressBar percent={(scanProgress.done / scanProgress.total) * 100} label={`Đang quét link ${Math.min(scanProgress.done + 1, scanProgress.total)}/${scanProgress.total}...`} />
        )}

        {error && (
          <div className="tool-status-error" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {result.length > 0 && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            {/* Tùy chọn định dạng */}
            <div className="dl-options" style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px dashed var(--border)' }}>
              <div className="dl-segment" role="tablist">
                <button role="tab" aria-selected={isVideoFormat} className={isVideoFormat ? "is-active" : ""} onClick={() => setFormat("mp4")}>
                  <Video size={15} /> Video (MP4)
                </button>
                <button role="tab" aria-selected={!isVideoFormat} className={!isVideoFormat ? "is-active" : ""} onClick={() => setFormat("mp3")}>
                  <Music size={15} /> Âm thanh (MP3)
                </button>
              </div>

              {!isVideoFormat && (
                <div className="dl-selects" style={{ marginLeft: '16px' }}>
                  <div className="tool-field">
                    <label>Chất lượng (kbps)</label>
                    <select value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>
                      {BITRATES.map((b) => <option key={b} value={b}>{b} kbps</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Header danh sách */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', margin: '0 0 4px 0' }}>Đã quét thấy {result.length} video</h3>
                <div style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedCount === result.length} onChange={(e) => toggleAll(e.target.checked)} style={{ display: 'none' }} />
                    {selectedCount === result.length ? <CheckSquare size={16} /> : <Square size={16} />} 
                    Chọn tất cả
                  </label>
                  <span>Đã chọn: {selectedCount}</span>
                  {isQueueRunning && <span style={{ color: 'var(--primary)' }}>Đã tải xong: {doneCount}/{selectedCount}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {isQueueRunning ? (
                  <button className="tool-btn" style={{ background: '#ef4444' }} onClick={handleStopAll}>
                    Dừng tải
                  </button>
                ) : (
                  <button className="tool-btn tool-btn-secondary" style={{ padding: '8px 16px' }} onClick={handleDownloadAll} disabled={selectedCount === 0}>
                    <ListPlus size={16} /> Tải tất cả
                  </button>
                )}
              </div>
            </div>
            
            {/* Scrollable list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
              {result.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: '8px', gap: '12px', opacity: item.selected ? 1 : 0.6, transition: 'all 0.2s' }}>
                  <div style={{ cursor: 'pointer' }} onClick={() => updateItem(item.id, { selected: !item.selected })}>
                    {item.selected ? <CheckSquare size={18} style={{ color: 'var(--primary)' }}/> : <Square size={18} style={{ color: 'var(--muted)' }}/>}
                  </div>
                  
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="thumb" style={{ width: '60px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} referrerPolicy="no-referrer" />
                  ) : (
                    <div style={{ width: '60px', height: '40px', background: 'var(--border)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <PlaySquare size={20} style={{ color: 'var(--muted)' }} />
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span>Thời lượng: {item.duration}</span>
                      {item.dlLabel && (
                        <span style={{ color: item.dlStatus === 'error' ? '#ef4444' : item.dlStatus === 'done' ? '#22c55e' : 'var(--primary)' }}>
                          {item.dlLabel}
                        </span>
                      )}
                    </div>
                    {/* Inline Progress Bar */}
                    {(item.dlStatus === 'downloading' || item.dlStatus === 'pending') && (
                      <div style={{ width: '100%', height: '4px', background: 'var(--border)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${item.dlProgress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                      </div>
                    )}
                    {item.errorMsg && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>{item.errorMsg}</div>
                    )}
                  </div>

                  <button 
                    className="tool-icon-btn" 
                    style={{ fontSize: '13px', width: 'auto', padding: '6px 12px' }}
                    onClick={() => downloadSingle(item)}
                    disabled={item.dlStatus === 'downloading' || item.dlStatus === 'pending'}
                  >
                    {item.dlStatus === 'done' ? <Check size={16}/> : <Download size={16} />}
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
