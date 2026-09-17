"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Download, Trash2, Play, RefreshCw } from "lucide-react";
import { formatDuration, downloadBlob } from "@/lib/ffmpegLoader";
import "./tool-page.css";

type Recording = { url: string; blob: Blob; duration: number };
type MicOption = { deviceId: string; label: string };

export function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState("");
  const [mics, setMics] = useState<MicOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");
  const [isSecureContext, setIsSecureContext] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  async function refreshMics() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Micro ${i + 1}` }));
      setMics(inputs);
      setSelectedMicId((current) => (current && inputs.some((m) => m.deviceId === current) ? current : inputs[0]?.deviceId ?? ""));
    } catch {
      // Device enumeration can fail before permission is granted; ignore.
    }
  }

  useEffect(() => {
    setIsSecureContext(typeof window === "undefined" ? true : window.isSecureContext);
    void refreshMics();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshMics);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshMics);
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt của bạn không hỗ trợ ghi âm.");
      return;
    }
    if (!isSecureContext) {
      setError("Ghi âm chỉ hoạt động trên HTTPS hoặc localhost. Địa chỉ hiện tại không an toàn nên trình duyệt chặn quyền micro.");
      return;
    }
    try {
      stopStream();
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      void refreshMics();
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecording({ url, blob, duration: (Date.now() - startedAtRef.current) / 1000 });
        stopStream();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setIsRecording(true);
      setElapsed(0);
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 200);
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setError("Bạn đã từ chối quyền truy cập micro. Hãy cấp quyền micro cho trang này trong cài đặt trình duyệt rồi thử lại.");
      } else if (err?.name === "NotFoundError") {
        setError("Không tìm thấy thiết bị micro nào trên máy bạn.");
      } else {
        setError("Không thể truy cập micro. Hãy cấp quyền micro cho trình duyệt.");
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  function discard() {
    if (recording) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setElapsed(0);
  }

  function recordAgain() {
    discard();
    void startRecording();
  }

  function download() {
    if (!recording) return;
    downloadBlob(recording.blob, `ghi_am_${Date.now()}.webm`);
  }

  return (
    <div className="tool-page">
      <h1><Mic size={22} /> Ghi Âm Giọng Nói</h1>
      <p className="tool-subtitle">
        Ghi âm trực tiếp từ micro của bạn và tải xuống — hoàn toàn cục bộ trên trình duyệt, không gửi âm thanh đi bất cứ đâu.
      </p>

      <div className="tool-card" style={{ textAlign: "center", padding: "36px 20px" }}>
        {!isRecording && !recording && mics.length > 0 && (
          <div className="tool-field" style={{ maxWidth: 320, margin: "0 auto 18px", textAlign: "left" }}>
            <label>Chọn micro</label>
            <select value={selectedMicId} onChange={(e) => setSelectedMicId(e.target.value)}>
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{
          width: 96, height: 96, borderRadius: "50%", margin: "0 auto 18px",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isRecording ? "color-mix(in srgb, var(--danger) 15%, transparent)" : "var(--panel-2)",
          border: `2px solid ${isRecording ? "var(--danger)" : "var(--line)"}`,
          transition: "all 0.2s ease"
        }}>
          <Mic size={38} color={isRecording ? "var(--danger)" : "var(--accent)"} />
        </div>

        <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginBottom: 18 }}>
          {formatDuration(recording ? recording.duration : elapsed)}
        </div>

        {!isRecording && !recording && (
          <button className="tool-btn" onClick={startRecording}>
            <Mic size={16} /> Bắt đầu ghi âm
          </button>
        )}
        {isRecording && (
          <button className="tool-btn tool-btn-danger" style={{ background: "var(--danger)", color: "#fff" }} onClick={stopRecording}>
            <Square size={16} /> Dừng ghi âm
          </button>
        )}
        {recording && !isRecording && (
          <div className="tool-row" style={{ justifyContent: "center" }}>
            <button className="tool-btn tool-btn-secondary" onClick={() => new Audio(recording.url).play()}><Play size={15} /> Nghe lại</button>
            <button className="tool-btn" onClick={download}><Download size={15} /> Tải xuống</button>
            <button className="tool-btn tool-btn-danger" onClick={recordAgain}><RefreshCw size={15} /> Ghi lại</button>
            <button className="tool-icon-btn" onClick={discard} title="Xoá"><Trash2 size={15} /></button>
          </div>
        )}

        {error && <div className="tool-status-error">{error}</div>}
      </div>
    </div>
  );
}
