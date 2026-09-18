"use client";

import { useRef, useState } from "react";
import JSZip from "jszip";
import { FolderArchive, UploadCloud, Download, File as FileIcon, X, DownloadCloud } from "lucide-react";
import { formatBytes, downloadBlob } from "@/lib/ffmpegLoader";
import { ProgressBar } from "./ProgressBar";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import "./tool-page.css";

type ZipEntry = { name: string; size: number; getBlob: (onPercent?: (p: number) => void) => Promise<Blob> };

export function ZipExtractor() {
  const [fileName, setFileName] = useState("");
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [busy, setBusy] = useState(false);
  useBackgroundBusy(busy);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File | null) {
    if (!f) return;
    setError("");
    setStatus("Đang đọc tệp ZIP...");
    setProgress(null);
    setBusy(true);
    try {
      const zip = await JSZip.loadAsync(f);
      const list: ZipEntry[] = [];
      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        list.push({
          name: relativePath,
          size: (zipEntry as any)._data?.uncompressedSize ?? 0,
          getBlob: (onPercent?: (p: number) => void) => zipEntry.async("blob", onPercent ? (m) => onPercent(m.percent) : undefined)
        });
      });
      setEntries(list);
      setFileName(f.name);
      setStatus(`Đã đọc ${list.length} tệp trong kho lưu trữ.`);
    } catch {
      setError("Không thể đọc tệp ZIP này. Có thể tệp bị hỏng hoặc có mật khẩu.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadEntry(entry: ZipEntry, onPercent?: (p: number) => void) {
    const blob = await entry.getBlob(onPercent);
    downloadBlob(blob, entry.name.split("/").pop() || entry.name);
  }

  async function downloadOne(entry: ZipEntry) {
    setBusy(true);
    setProgress(0);
    setStatus(`Đang giải nén ${entry.name.split("/").pop()}...`);
    try {
      await downloadEntry(entry, setProgress);
      setStatus("Đã tải xuống tệp.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadAll() {
    setBusy(true);
    setProgress(0);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      setStatus(`Đang giải nén ${i + 1}/${entries.length}: ${entry.name.split("/").pop()}`);
      // eslint-disable-next-line no-await-in-loop
      await downloadEntry(entry, (p) => setProgress(((i + p / 100) / entries.length) * 100));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 200));
    }
    setBusy(false);
    setStatus("Đã tải xuống toàn bộ tệp.");
  }

  function reset() {
    setEntries([]);
    setFileName("");
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="tool-page">
      <h1><FolderArchive size={22} /> Giải Nén File ZIP</h1>
      <p className="tool-subtitle">
        Xem và tải từng tệp bên trong file ZIP ngay trên trình duyệt — không tải file lên máy chủ nào.
      </p>

      {entries.length === 0 ? (
        <>
        <div className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] ?? null); }}>
          <UploadCloud size={30} />
          <div className="tool-drop-title">Kéo thả tệp .zip vào đây hoặc bấm để chọn</div>
          <div className="tool-drop-hint">Không hỗ trợ ZIP có mật khẩu</div>
          <input ref={inputRef} type="file" accept=".zip" hidden onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </div>
        {busy && <ProgressBar percent={progress} label={status} />}
        </>
      ) : (
        <div className="tool-card">
          <div className="tool-file-row">
            <span className="tool-file-name">{fileName}</span>
            <span className="tool-file-meta">{entries.length} tệp</span>
            <button className="tool-icon-btn" onClick={reset} title="Chọn tệp khác"><X size={16} /></button>
          </div>

          <div className="tool-row">
            <button className="tool-btn" onClick={downloadAll} disabled={busy}>
              <DownloadCloud size={15} /> Tải tất cả
            </button>
          </div>

          <div className="tool-result-list">
            {entries.map((entry) => (
              <div key={entry.name} className="tool-clip-item">
                <FileIcon size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
                <span className="tool-clip-name">{entry.name}</span>
                <span className="tool-file-meta">{formatBytes(entry.size)}</span>
                <button className="tool-icon-btn" onClick={() => downloadOne(entry)} disabled={busy}><Download size={14} /></button>
              </div>
            ))}
          </div>

          {busy && <ProgressBar percent={progress} label={status} />}
          {status && !error && !busy && <div className="tool-status-ok">{status}</div>}
          {error && <div className="tool-status-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
