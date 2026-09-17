"use client";

import { useRef, useState } from "react";
import { MonitorPlay, Square, Download, Trash2, Play } from "lucide-react";
import { formatDuration, downloadBlob } from "@/lib/ffmpegLoader";
import "./tool-page.css";

type Recording = { url: string; blob: Blob; duration: number };

export function ScreenRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [includeMic, setIncludeMic] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const previewRef = useRef<HTMLVideoElement>(null);

  async function startRecording() {
    setError("");
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      let tracks: MediaStreamTrack[] = [...displayStream.getTracks()];
      streamsRef.current = [displayStream];

      if (includeMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsRef.current.push(micStream);
          tracks = [...tracks, ...micStream.getAudioTracks()];
        } catch {
          // Continue without mic if permission denied.
        }
      }

      const combined = new MediaStream(tracks);
      if (previewRef.current) {
        previewRef.current.srcObject = displayStream;
      }

      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const recorder = new MediaRecorder(combined, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecording({ url, blob, duration: (Date.now() - startedAtRef.current) / 1000 });
        streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      };
      displayStream.getVideoTracks()[0].addEventListener("ended", () => stopRecording());

      mediaRecorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setIsRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 200);
    } catch {
      setError("Không thể bắt đầu quay màn hình. Hãy cấp quyền chia sẻ màn hình cho trình duyệt.");
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

  function download() {
    if (!recording) return;
    downloadBlob(recording.blob, `quay_man_hinh_${Date.now()}.webm`);
  }

  return (
    <div className="tool-page">
      <h1><MonitorPlay size={22} /> Quay Màn Hình</h1>
      <p className="tool-subtitle">
        Quay lại màn hình, cửa sổ hoặc tab trình duyệt và tải video về máy — xử lý hoàn toàn cục bộ, không qua máy chủ.
      </p>

      <div className="tool-card">
        {isRecording && (
          <video ref={previewRef} autoPlay muted className="tool-video-preview" />
        )}
        {recording && !isRecording && (
          <video src={recording.url} controls className="tool-video-preview" />
        )}

        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginBottom: 16 }}>
            {formatDuration(recording ? recording.duration : elapsed)}
          </div>

          {!isRecording && !recording && (
            <>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, marginBottom: 16 }}>
                <input type="checkbox" checked={includeMic} onChange={(e) => setIncludeMic(e.target.checked)} />
                Ghi kèm âm thanh từ micro
              </label>
              <button className="tool-btn" onClick={startRecording}>
                <MonitorPlay size={16} /> Bắt đầu quay màn hình
              </button>
            </>
          )}
          {isRecording && (
            <button className="tool-btn tool-btn-danger" style={{ background: "var(--danger)", color: "#fff" }} onClick={stopRecording}>
              <Square size={16} /> Dừng quay
            </button>
          )}
          {recording && !isRecording && (
            <div className="tool-row" style={{ justifyContent: "center" }}>
              <button className="tool-btn" onClick={download}><Download size={15} /> Tải xuống</button>
              <button className="tool-btn tool-btn-danger" onClick={discard}><Trash2 size={15} /> Quay lại</button>
            </div>
          )}
        </div>

        {error && <div className="tool-status-error">{error}</div>}
      </div>
    </div>
  );
}
