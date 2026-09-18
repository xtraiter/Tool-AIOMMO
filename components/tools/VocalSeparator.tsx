"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines, Feather, Scale, Sparkles, UploadCloud, X, Download, DownloadCloud, Cpu, Zap,
  CheckCircle2, AlertTriangle, Mic2, Music2, Drum, Guitar, Trash2, Info,
} from "lucide-react";
import JSZip from "jszip";
import { ProgressBar } from "./ProgressBar";
import { useBackgroundBusy } from "@/lib/backgroundEffect";
import { safeFilename } from "@/lib/filename";
import { detectDevice, recommendTier, type DeviceInfo } from "@/lib/separation/device";
import { TIERS, STEM_LABEL, type Stem, type TierConfig, type TierId } from "@/lib/separation/models";
import { isModelCached, clearModelCache } from "@/lib/separation/modelCache";
import { runSeparation, type StemMap } from "@/lib/separation/engine";
import { decodeStereo44k, stemToMp3, stemToWav } from "@/lib/separation/audioIO";
import "./tool-page.css";
import "./vocal-separator.css";

const TIER_ICON = { light: Feather, balanced: Scale, high: Sparkles } as const;
const STEM_ICON: Record<Stem, typeof Mic2> = { vocals: Mic2, beat: Music2, drums: Drum, bass: Guitar, other: AudioLines };
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes >= 1e8 ? 0 : 1)} MB`;

function formatEta(s: number | null) {
  if (s === null || !Number.isFinite(s)) return "";
  if (s < 60) return `còn khoảng ${Math.max(1, Math.round(s))} giây`;
  return `còn khoảng ${Math.round(s / 60)} phút`;
}

type Phase = "idle" | "download" | "init" | "decode" | "separate" | "done" | "error";

export function VocalSeparator() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [recommended, setRecommended] = useState<{ tier: TierId; reason: string } | null>(null);
  const [tierId, setTierId] = useState<TierId>("balanced");
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [useWebGpu, setUseWebGpu] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [download, setDownload] = useState<{ loaded: number; total: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [stems, setStems] = useState<StemMap | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<Stem, string>>>({});
  const [exporting, setExporting] = useState<{ label: string; percent: number | null } | null>(null);
  const [usedBackend, setUsedBackend] = useState<"webgpu" | "wasm" | null>(null);
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase === "download" || phase === "init" || phase === "decode" || phase === "separate";
  useBackgroundBusy(busy);

  const tier: TierConfig = TIERS.find((t) => t.id === tierId)!;

  useEffect(() => {
    (async () => {
      const d = await detectDevice();
      const rec = recommendTier(d);
      setDevice(d);
      setRecommended(rec);
      setTierId(rec.tier);
      setUseWebGpu(d.webgpu);
      const map: Record<string, boolean> = {};
      for (const t of TIERS) map[t.id] = await isModelCached(t.modelUrl);
      setCached(map);
    })();
  }, []);

  // Leaving the page (or pressing "Làm mới") stops a running separation.
  useEffect(() => () => { cancelled.current = true; }, []);

  useEffect(() => () => Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function reset() {
    Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u));
    setPreviews({});
    setStems(null);
    setFile(null);
    setPhase("idle");
    setError("");
    setStatus("");
    setDownload(null);
    setProgress(0);
    setUsedBackend(null);
  }

  async function start() {
    if (!file) return;
    cancelled.current = false;
    setError("");
    setStems(null);
    setDownload(null);
    setProgress(0);
    setEta(null);
    setPhase("decode");
    setStatus("Đang giải mã âm thanh...");
    try {
      const { left, right } = await decodeStereo44k(file);
      if (left.length / 44100 > 15 * 60) throw new Error("Bài hát dài quá 15 phút. Hãy cắt ngắn trước khi tách.");
      setPhase("download");
      const wantGpu = useWebGpu && !!device?.webgpu;
      const { stems: result, backend } = await runSeparation({
        tier,
        left,
        right,
        useWebGpu: wantGpu,
        onDownload: (loaded, total) => {
          setDownload({ loaded, total });
          setPhase("download");
        },
        onStatus: (m) => {
          setStatus(m);
          if (/khởi tạo/i.test(m)) setPhase("init");
          else if (/tách/i.test(m)) setPhase("separate");
        },
        onProgress: (f, e) => {
          setPhase("separate");
          setProgress(f * 100);
          setEta(e);
        },
        isCancelled: () => cancelled.current,
      });
      setUsedBackend(backend);
      const urls: Partial<Record<Stem, string>> = {};
      for (const s of tier.stems) if (result[s]) urls[s] = URL.createObjectURL(stemToWav(result[s]!));
      setPreviews(urls);
      setStems(result);
      setCached((c) => ({ ...c, [tier.id]: true }));
      setPhase("done");
      setStatus("Hoàn tất!");
    } catch (e: any) {
      if (e?.message === "CANCELLED") {
        setPhase("idle");
        setStatus("");
      } else {
        setPhase("error");
        setError(e?.message || "Không thể tách âm thanh.");
      }
    }
  }

  const baseName = file ? file.name.replace(/\.[^.]+$/, "") : "audio";

  function save(blob: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  async function exportStem(stem: Stem, format: "wav" | "mp3") {
    if (!stems?.[stem]) return;
    const label = STEM_LABEL[stem];
    setExporting({ label: `Đang xuất ${label} (${format.toUpperCase()})...`, percent: format === "mp3" ? 0 : null });
    try {
      const blob = format === "wav" ? stemToWav(stems[stem]!) : await stemToMp3(stems[stem]!, (p) => setExporting({ label: `Đang mã hoá MP3 — ${label}`, percent: p }));
      save(blob, safeFilename(`${baseName} - ${label}`, format));
    } finally {
      setExporting(null);
    }
  }

  async function exportAll() {
    if (!stems) return;
    const zip = new JSZip();
    const list = tier.stems.filter((s) => stems[s]);
    try {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const label = STEM_LABEL[s];
        const blob = await stemToMp3(stems[s]!, (p) =>
          setExporting({ label: `Đang mã hoá MP3 ${i + 1}/${list.length} — ${label}`, percent: ((i + p / 100) / list.length) * 100 })
        );
        zip.file(safeFilename(`${baseName} - ${label}`, "mp3", { prefix: false }), blob);
      }
      setExporting({ label: "Đang nén ZIP...", percent: null });
      save(await zip.generateAsync({ type: "blob" }), safeFilename(`${baseName} - tach am`, "zip"));
    } finally {
      setExporting(null);
    }
  }

  const tierNeedsGpuButMissing = tier.needsWebGpu && device && !device.webgpu;

  return (
    <div className="tool-page vs-page">
      <h1><AudioLines size={22} /> AI Tách Lời & Beat Karaoke</h1>
      <p className="tool-subtitle">
        Tách giọng hát và nhạc nền ngay trong trình duyệt của bạn — file âm thanh không được tải lên máy chủ nào. Chọn mức phù hợp với cấu hình thiết bị.
      </p>

      {device && (
        <div className="vs-device">
          <div className="vs-chips">
            <span className={device.webgpu ? "vs-chip is-ok" : "vs-chip"}><Zap size={12} /> WebGPU: {device.webgpu ? "có" : "không"}</span>
            <span className="vs-chip"><Cpu size={12} /> {device.cores} nhân CPU</span>
            <span className="vs-chip">RAM: {device.memoryGB ? `≥ ${device.memoryGB} GB` : "không rõ"}</span>
            {device.mobile && <span className="vs-chip">Di động</span>}
          </div>
          {recommended && <p><CheckCircle2 size={14} /> {recommended.reason}</p>}
        </div>
      )}

      <div className="vs-tiers" role="radiogroup" aria-label="Chọn mức chất lượng">
        {TIERS.map((t) => {
          const Icon = TIER_ICON[t.id];
          const active = t.id === tierId;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`vs-tier vs-tier--${t.id}${active ? " is-active" : ""}`}
              onClick={() => setTierId(t.id)}
              disabled={busy}
            >
              <span className="vs-tier-icon"><Icon size={20} /></span>
              <span className="vs-tier-name">{t.name}</span>
              <span className="vs-tier-meta">{t.stems.filter((s) => s !== "beat").length === 4 ? "4 luồng" : "Lời + Beat"} · {mb(t.sizeBytes)}</span>
              <span className="vs-tier-badges">
                {recommended?.tier === t.id && <span className="vs-badge vs-badge--rec">Khuyên dùng</span>}
                {cached[t.id] && <span className="vs-badge vs-badge--ok">Đã tải sẵn</span>}
                {t.needsWebGpu && device && !device.webgpu && <span className="vs-badge vs-badge--warn">Cần WebGPU</span>}
              </span>
            </button>
          );
        })}
      </div>

      <section className={`vs-panel vs-panel--${tier.id}`}>
        <h2>Mức {tier.name}: {tier.modelName}</h2>
        <p>{tier.tagline}</p>
        <dl className="vs-facts">
          <div><dt>Đầu ra</dt><dd>{tier.stems.map((s) => STEM_LABEL[s]).join(" · ")}</dd></div>
          <div><dt>Dung lượng mô hình</dt><dd>{mb(tier.sizeBytes)} (tải 1 lần, lần sau dùng lại){cached[tier.id] ? " — đã có trong máy" : ""}</dd></div>
          <div><dt>Tốc độ</dt><dd>{tier.speed}</dd></div>
          <div><dt>Chất lượng</dt><dd>{tier.quality}</dd></div>
          <div><dt>RAM khuyến nghị</dt><dd>từ {tier.minMemoryGB} GB</dd></div>
        </dl>

        {tier.id === "light" && (
          <p className="vs-hint"><Feather size={14} /> Hợp khi dùng điện thoại, máy cũ, hoặc muốn kết quả nhanh. Nếu còn nghe lẫn nhạc trong giọng, hãy thử mức Cân bằng.</p>
        )}
        {tier.id === "balanced" && (
          <label className="vs-toggle">
            <input type="checkbox" checked={useWebGpu && !!device?.webgpu} disabled={!device?.webgpu || busy} onChange={(e) => setUseWebGpu(e.target.checked)} />
            <span>Tăng tốc bằng WebGPU {device && !device.webgpu ? "(thiết bị chưa hỗ trợ — sẽ chạy bằng CPU, chậm hơn)" : ""}</span>
          </label>
        )}
        {tier.id === "high" && (
          <>
            <label className="vs-toggle">
              <input type="checkbox" checked={useWebGpu && !!device?.webgpu} disabled={!device?.webgpu || busy} onChange={(e) => setUseWebGpu(e.target.checked)} />
              <span>Dùng WebGPU {device && !device.webgpu ? "(không khả dụng)" : "(khuyến nghị)"}</span>
            </label>
            {tierNeedsGpuButMissing && (
              <p className="vs-warn"><AlertTriangle size={15} /> Thiết bị không có WebGPU: mức Cao cấp sẽ chạy bằng CPU và có thể mất hàng chục phút cho một bài hát, tốn nhiều RAM. Nên chọn mức Cân bằng.</p>
            )}
          </>
        )}
      </section>

      {!file ? (
        <div
          className="tool-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
        >
          <UploadCloud size={30} />
          <div className="tool-drop-title">Kéo thả bài hát vào đây hoặc bấm để chọn</div>
          <div className="tool-drop-hint">MP3, WAV, M4A, FLAC, MP4... (tối đa 15 phút)</div>
          <input ref={inputRef} type="file" accept="audio/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
        </div>
      ) : (
        <div className="tool-card">
          <div className="tool-file-row">
            <span className="tool-file-name">{file.name}</span>
            <span className="tool-file-meta">{(file.size / 1e6).toFixed(1)} MB</span>
            {!busy && <button className="tool-icon-btn" onClick={reset} title="Chọn tệp khác"><X size={16} /></button>}
          </div>

          <div className="tool-row">
            {!busy ? (
              <button className="tool-btn" onClick={start} disabled={phase === "done"}>
                <AudioLines size={16} /> {phase === "done" ? "Đã tách xong" : `Bắt đầu tách (mức ${tier.name})`}
              </button>
            ) : (
              <button className="tool-btn tool-btn-danger" onClick={() => { cancelled.current = true; }}>
                <X size={16} /> Hủy
              </button>
            )}
          </div>

          {busy && (
            <ol className="vs-steps">
              <li className={phase === "decode" ? "is-active" : "is-done"}>Giải mã âm thanh</li>
              <li className={phase === "download" || phase === "init" ? "is-active" : phase === "separate" ? "is-done" : ""}>Tải &amp; khởi tạo mô hình AI</li>
              <li className={phase === "separate" ? "is-active" : ""}>Tách âm thanh</li>
            </ol>
          )}

          {phase === "decode" && <ProgressBar label={status} />}
          {phase === "download" && download && (
            <ProgressBar
              percent={download.total ? (download.loaded / download.total) * 100 : null}
              label={cached[tier.id] ? "Đang nạp mô hình từ bộ nhớ máy..." : `Đang tải mô hình ${tier.modelName}: ${mb(download.loaded)} / ${mb(download.total)}`}
            />
          )}
          {phase === "download" && !download && <ProgressBar label={status || "Đang chuẩn bị..."} />}
          {phase === "init" && <ProgressBar label="Đang khởi tạo mô hình AI trên thiết bị của bạn (có thể mất vài chục giây)..." />}
          {phase === "separate" && progress === 0 && <ProgressBar label={status} />}
          {phase === "separate" && progress > 0 && (
            <ProgressBar percent={progress} label={`Đang tách âm thanh${eta ? ` — ${formatEta(eta)}` : ""}`} />
          )}
          {busy && <p className="tool-status-text">Đừng đóng hoặc chuyển tab trong lúc xử lý. Nhạc được xử lý hoàn toàn trên máy của bạn.</p>}

          {error && <div className="tool-status-error">{error}</div>}
        </div>
      )}

      {stems && phase === "done" && (
        <div className="tool-card vs-results">
          <div className="vs-results-head">
            <h2><CheckCircle2 size={18} /> Kết quả</h2>
            <span className="vs-backend">Chạy bằng {usedBackend === "webgpu" ? "WebGPU" : "CPU"}</span>
            <button className="tool-btn tool-btn-secondary" onClick={exportAll} disabled={!!exporting}>
              <DownloadCloud size={15} /> Tải tất cả (ZIP)
            </button>
          </div>
          {exporting && <ProgressBar percent={exporting.percent} label={exporting.label} />}
          <div className={`vs-stems vs-stems--${tier.id}`}>
            {tier.stems.filter((s) => stems[s]).map((s) => {
              const Icon = STEM_ICON[s];
              return (
                <div key={s} className={`vs-stem vs-stem--${s}`}>
                  <div className="vs-stem-head"><Icon size={16} /> <strong>{STEM_LABEL[s]}</strong></div>
                  {previews[s] && <audio controls preload="metadata" src={previews[s]} />}
                  <div className="vs-stem-actions">
                    <button className="tool-btn tool-btn-secondary" onClick={() => exportStem(s, "mp3")} disabled={!!exporting}><Download size={14} /> MP3</button>
                    <button className="tool-btn tool-btn-secondary" onClick={() => exportStem(s, "wav")} disabled={!!exporting}><Download size={14} /> WAV</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <details className="vs-license">
        <summary><Info size={14} /> Thông tin mô hình AI</summary>
        <p>
          Mô hình do bên thứ ba huấn luyện và được tải từ Hugging Face khi bạn dùng lần đầu: mức Nhẹ và Cân bằng dùng UVR MDX-Net,
          mức Cao cấp dùng HTDemucs (Meta). Giấy phép trọng số mô hình có thể khác giấy phép mã nguồn; hãy kiểm tra điều khoản
          của từng mô hình trước khi dùng kết quả cho mục đích thương mại.
        </p>
        <button className="tool-btn tool-btn-secondary" onClick={async () => { await clearModelCache(); setCached({}); }} disabled={busy}>
          <Trash2 size={14} /> Xóa mô hình đã tải khỏi máy
        </button>
      </details>
    </div>
  );
}
