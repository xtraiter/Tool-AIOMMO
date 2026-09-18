"use client";

import React, { useState } from "react";
import { MicVocal, Loader2, Download, AlertCircle } from "lucide-react";
import "./audio-tts.css";

// Các giọng đọc tham khảo từ CapCut TTS (Ví dụ)
const VOICES = [
  { id: "v_nam_1", name: "Giọng Nam Đọc Truyện (Tiếng Việt)" },
  { id: "v_nu_1", name: "Giọng Nữ Dễ Thương (Tiếng Việt)" },
  { id: "v_nu_news", name: "Giọng Nữ Thời Sự (Tiếng Việt)" },
  { id: "v_en_male_1", name: "English Male - Energetic" },
  { id: "v_en_female_1", name: "English Female - Narrative" },
];

export function AudioTTS() {
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError("Vui lòng nhập văn bản cần chuyển đổi.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      // Gọi lên API Route của Next.js (Proxy)
      const res = await fetch("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Có lỗi xảy ra khi tạo giọng nói.");
      }

      // Xử lý file blob trả về
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối đến máy chủ.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="tts-container">
      <div className="tts-header">
        <h2>
          <MicVocal size={32} color="var(--primary)" />
          Tạo Giọng Nói AI
        </h2>
        <p>Sử dụng công nghệ AI để chuyển văn bản thành giọng đọc tự nhiên.</p>
      </div>

      <div className="tts-card">
        <div className="tts-form-group">
          <label htmlFor="tts-text">Văn bản cần chuyển đổi</label>
          <textarea
            id="tts-text"
            className="tts-textarea"
            placeholder="Nhập nội dung kịch bản hoặc văn bản tại đây..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="tts-form-group">
          <label htmlFor="tts-voice">Chọn giọng đọc</label>
          <select
            id="tts-voice"
            className="tts-select"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            disabled={isLoading}
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <button
          className="tts-button"
          onClick={handleGenerate}
          disabled={isLoading || !text.trim()}
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="spinner" />
              Đang tạo âm thanh...
            </>
          ) : (
            <>
              <MicVocal size={20} />
              Tạo Âm Thanh AI
            </>
          )}
        </button>

        {error && (
          <div className="tts-error">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {audioUrl && !isLoading && (
          <div className="tts-result">
            <audio controls src={audioUrl} className="tts-audio-player" autoPlay />
            
            <a
              href={audioUrl}
              download="voice_ai_generated.mp3"
              className="tts-download-btn"
            >
              <Download size={18} />
              Tải Xuống File MP3
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
