"use client";

import { useState } from "react";
import { Download, Search, AlertCircle, Video, Music, Copy, Check } from "lucide-react";
import { parseContentDisposition } from "@/lib/filename";
import { ProgressBar } from "./ProgressBar";
import "./tool-page.css";

const VIDEO_FORMATS = [["mp4", "MP4"], ["mkv", "MKV"]] as const;
const AUDIO_FORMATS = [["mp3", "MP3"], ["m4a", "M4A"], ["opus", "OPUS"], ["wav", "WAV"], ["flac", "FLAC"]] as const;
const BITRATES = [320, 256, 192, 128, 96, 64];

type VideoInfo = {
  platform?: string;
  title: string;
  description: string;
  uploader: string;
  thumbnail: string;
  duration: string | number;
  heights: number[];
  hasAudio: boolean;
  maxAbr: number;
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
  const [format, setFormat] = useState<string>("mp4");
  const [bitrate, setBitrate] = useState(320);
  const [height, setHeight] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);
  const [dlPercent, setDlPercent] = useState<number | null>(null);
  const [dlLabel, setDlLabel] = useState("");
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
      setBitrate(320);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi lấy dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!info) return;
    setDownloading(true);
    setDlPercent(0);
    setDlLabel("Đang khởi động...");
    setError("");
    try {
      const isVideo = format === "mp4" || format === "mkv";
      const start = await fetch("/api/download/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: info.source || url.trim(),
          type: format,
          ...(isVideo && height ? { height } : {}),
          ...(!isVideo && format !== "wav" && format !== "flac" ? { abr: bitrate } : {}),
        }),
      });
      const started = await start.json();
      if (!start.ok) throw new Error(started.error || "Không thể bắt đầu tải.");

      // Phase 1: the server downloads/converts — poll its real percentage (0-90% download, then convert).
      for (;;) {
        const st = await (await fetch(`/api/download/status?id=${started.id}`)).json();
        if (st.error && st.status !== "done") throw new Error(st.error);
        setDlPercent(Math.round(st.percent * 0.7));
        setDlLabel(st.stage === "convert" ? "Máy chủ đang chuyển đổi định dạng..." : "Máy chủ đang tải dữ liệu nguồn...");
        if (st.status === "done") break;
        await new Promise((r) => setTimeout(r, 600));
      }

      // Phase 2: transfer the finished file to the browser (70-100%).
      const res = await fetch(`/api/download/file?id=${started.id}`);
      if (!res.ok || !res.body) throw new Error("Không thể tải file về máy.");
      const total = Number(res.headers.get("Content-Length") || 0);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      setDlLabel("Đang tải file về máy...");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) setDlPercent(70 + Math.round((got / total) * 30));
      }
      const blob = new Blob(chunks as BlobPart[], { type: res.headers.get("Content-Type") || "application/octet-stream" });
      const name = parseContentDisposition(res.headers.get("Content-Disposition"), `download.${format}`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setDlPercent(100);
    } catch (err: any) {
      setError(err.message || "Không thể tải file.");
    } finally {
      setDownloading(false);
    }
  };

  const isVideoFormat = format === "mp4" || format === "mkv";
  const isLossless = format === "wav" || format === "flac";

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
                  {[info.platform, info.uploader, info.duration ? formatDuration(info.duration) : ""].filter(Boolean).join(" · ")}
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

            <div className="dl-options">
              <div className="dl-segment" role="tablist" aria-label="Loại tệp">
                <button
                  role="tab"
                  aria-selected={isVideoFormat}
                  className={isVideoFormat ? "is-active" : ""}
                  disabled={!info.heights.length}
                  onClick={() => setFormat("mp4")}
                >
                  <Video size={15} /> Video
                </button>
                <button
                  role="tab"
                  aria-selected={!isVideoFormat}
                  className={!isVideoFormat ? "is-active" : ""}
                  disabled={!info.hasAudio}
                  onClick={() => setFormat("mp3")}
                >
                  <Music size={15} /> Âm thanh
                </button>
              </div>

              <div className="dl-selects">
                <div className="tool-field">
                  <label htmlFor="dl-format">Định dạng</label>
                  <select id="dl-format" value={format} onChange={(e) => setFormat(e.target.value)}>
                    {(isVideoFormat ? VIDEO_FORMATS : AUDIO_FORMATS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </div>

                {isVideoFormat && info.heights.length > 0 && (
                  <div className="tool-field">
                    <label htmlFor="dl-height">Chất lượng</label>
                    <select id="dl-height" value={height} onChange={(e) => setHeight(Number(e.target.value))}>
                      {info.heights.map((h) => (
                        <option key={h} value={h}>{h}p</option>
                      ))}
                    </select>
                  </div>
                )}

                {!isVideoFormat && !isLossless && (
                  <div className="tool-field">
                    <label htmlFor="dl-bitrate">Chất lượng</label>
                    <select id="dl-bitrate" value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>
                      {BITRATES.map((b) => (
                        <option key={b} value={b}>{b} kbps</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <button className="tool-btn dl-submit" onClick={handleDownload} disabled={downloading}>
                <Download size={16} /> {downloading ? "Đang xử lý..." : `Tải ${format.toUpperCase()}`}
              </button>
            </div>
            {!isVideoFormat && info.maxAbr > 0 && (
              <p className="tool-status-text">
                Âm thanh gốc của nguồn tối đa khoảng {info.maxAbr} kbps — chọn bitrate cao hơn mức này không làm tăng chất lượng thật.
                {isLossless ? " WAV/FLAC là định dạng không nén nên file lớn, nhưng không cải thiện âm thanh gốc." : ""}
              </p>
            )}
            {downloading && <ProgressBar percent={dlPercent} label={dlLabel} />}
          </div>
        )}
      </div>
    </div>
  );
}
