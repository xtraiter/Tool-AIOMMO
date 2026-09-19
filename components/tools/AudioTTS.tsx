"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MicVocal, Loader2, Download, AlertCircle, Sparkles, Search, Trash2, Play, Pause, Check, Eraser } from "lucide-react";
import { useTr } from "@/lib/i18n";
import "./tool-page.css";
import "./audio-tts.css";

type Gender = "male" | "female";
type Voice = { id: string; name: string; nameEn: string; gender: Gender; tag: string; tagEn: string };

const VOICES: Voice[] = [
  { id: "BV075_streaming", name: "Thanh niên tự tin", nameEn: "Confident young man", gender: "male", tag: "Hot", tagEn: "Popular" },
  { id: "BV074_streaming", name: "Cô gái hoạt ngôn", nameEn: "Lively young woman", gender: "female", tag: "Hot", tagEn: "Popular" },
  { id: "vi_female_huong", name: "Giọng nữ phổ thông", nameEn: "Standard female", gender: "female", tag: "Hot", tagEn: "Popular" },
  { id: "BV421_vivn_streaming", name: "Giọng nam ngọt ngào", nameEn: "Sweet male", gender: "male", tag: "Hot", tagEn: "Popular" },
  { id: "BV074_streaming_dsp", name: "Giọng bé", nameEn: "Child voice", gender: "female", tag: "Dễ thương", tagEn: "Cute" },
  { id: "BV560_streaming", name: "Anh Dũng", nameEn: "Anh Dung", gender: "male", tag: "Hot", tagEn: "Popular" },
  { id: "BV562_streaming", name: "Chí Mai", nameEn: "Chi Mai", gender: "female", tag: "Hot", tagEn: "Popular" },
  { id: "BV075_streaming_vibrato_dsp", name: "Việt rung", nameEn: "Vibrato", gender: "male", tag: "Hiệu ứng", tagEn: "Effect" },
];

const MAX_CHARS = 5000;

const SAMPLES: { vi: string; en: string; text: string }[] = [
  { vi: "Chào mừng", en: "Welcome", text: "Xin chào các bạn, chào mừng các bạn đã quay trở lại với kênh của mình!" },
  { vi: "Quảng cáo", en: "Ad", text: "Sản phẩm mới ra mắt, giảm giá 50% chỉ trong hôm nay. Nhanh tay đặt hàng ngay!" },
  { vi: "Kể chuyện", en: "Story", text: "Ngày xửa ngày xưa, ở một ngôi làng nhỏ bên bờ sông, có một cậu bé rất thích ngắm sao." },
];

type Clip = { id: string; url: string; voiceId: string; preview: string; at: number };

export function AudioTTS() {
  const tr = useTr();
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [filter, setFilter] = useState<"all" | Gender>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  clipsRef.current = clips;

  const voice = VOICES.find((v) => v.id === voiceId) ?? VOICES[0];
  const vName = (v: Voice) => tr(v.name, v.nameEn);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VOICES.filter((v) => (filter === "all" || v.gender === filter) && (!q || v.name.toLowerCase().includes(q) || v.nameEn.toLowerCase().includes(q)));
  }, [filter, query]);

  useEffect(() => () => {
    audioRef.current?.pause();
    clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
  }, []);

  const play = (c: Clip) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingId === c.id) { a.pause(); return; }
    a.src = c.url;
    a.play().catch(() => {});
    setPlayingId(c.id);
  };

  const generate = async () => {
    const value = text.trim();
    if (!value) { setError(tr("Hãy nhập nội dung cần đọc.", "Enter the text to read first.")); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, voiceId }),
      });
      if (!res.ok) {
        if (res.status === 501) throw new Error(tr("Máy chủ giọng nói chưa được cấu hình. Quản trị viên cần thiết lập nguồn giọng đọc trước khi dùng.", "The voice server isn't configured yet. The administrator needs to set up a voice source first."));
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || tr("Không tạo được giọng nói. Hãy thử lại.", "Couldn't create the voice. Please try again."));
      }
      const url = URL.createObjectURL(await res.blob());
      const clip: Clip = { id: `${Date.now()}`, url, voiceId, preview: value.slice(0, 80), at: Date.now() };
      setClips((prev) => [clip, ...prev]);
      const a = audioRef.current;
      if (a) { a.src = url; a.play().catch(() => {}); setPlayingId(clip.id); }
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Lỗi kết nối tới máy chủ.", "Couldn't reach the server."));
    } finally {
      setBusy(false);
    }
  };

  const removeClip = (c: Clip) => {
    if (playingId === c.id) { audioRef.current?.pause(); setPlayingId(null); }
    URL.revokeObjectURL(c.url);
    setClips((prev) => prev.filter((x) => x.id !== c.id));
  };

  const count = text.length;

  return (
    <div className="tool-page tts-page">
      <h1><MicVocal size={22} /> {tr("Tạo Giọng Nói AI", "AI Voice Generator")}</h1>
      <p className="tool-subtitle">
        {tr("Chọn giọng, dán văn bản và nghe ngay. Mỗi lần tạo được lưu lại bên dưới để bạn nghe lại hoặc tải MP3.", "Pick a voice, paste your text and listen right away. Every take is kept below so you can replay it or download the MP3.")}
      </p>

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} onPause={() => setPlayingId(null)} hidden />

      <section className="tool-card tts-step">
        <div className="tts-step-head">
          <span className="tts-num">1</span>
          <h2>{tr("Chọn giọng đọc", "Choose a voice")}</h2>
          <span className="tts-current">{vName(voice)}</span>
        </div>
        <div className="tts-filters">
          <div className="tts-seg" role="tablist" aria-label={tr("Lọc theo giới tính", "Filter by gender")}>
            {(["all", "male", "female"] as const).map((g) => (
              <button key={g} type="button" role="tab" aria-selected={filter === g} className={filter === g ? "is-active" : ""} onClick={() => setFilter(g)}>
                {g === "all" ? tr("Tất cả", "All") : g === "male" ? tr("Nam", "Male") : tr("Nữ", "Female")}
              </button>
            ))}
          </div>
          <label className="tts-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Tìm giọng...", "Search voices...")} aria-label={tr("Tìm giọng", "Search voices")} />
          </label>
        </div>
        <div className="tts-voices" role="radiogroup" aria-label={tr("Giọng đọc", "Voices")}>
          {shown.map((v) => {
            const on = v.id === voiceId;
            return (
              <button key={v.id} type="button" role="radio" aria-checked={on} className={`tts-voice ${on ? "is-on" : ""}`} onClick={() => setVoiceId(v.id)}>
                <span className={`tts-avatar is-${v.gender}`}>{vName(v).trim().charAt(0).toUpperCase()}</span>
                <span className="tts-voice-info">
                  <strong>{vName(v)}</strong>
                  <small>{v.gender === "male" ? tr("Nam", "Male") : tr("Nữ", "Female")} · {tr("Tiếng Việt", "Vietnamese")} · {tr(v.tag, v.tagEn)}</small>
                </span>
                {on && <Check size={16} className="tts-check" />}
              </button>
            );
          })}
          {shown.length === 0 && <p className="tts-none">{tr("Không có giọng nào khớp.", "No voices match.")}</p>}
        </div>
      </section>

      <section className="tool-card tts-step">
        <div className="tts-step-head">
          <span className="tts-num">2</span>
          <h2>{tr("Nhập nội dung", "Enter your text")}</h2>
        </div>
        <textarea
          className="tts-textarea"
          value={text}
          maxLength={MAX_CHARS}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          rows={7}
          placeholder={tr("Nhập hoặc dán nội dung cần chuyển thành giọng nói...", "Type or paste the text to turn into speech...")}
        />
        <div className="tts-text-foot">
          <div className="tts-samples">
            <span>{tr("Thử nhanh:", "Try:")}</span>
            {SAMPLES.map((s) => (
              <button key={s.vi} type="button" onClick={() => setText(s.text)} disabled={busy}>{tr(s.vi, s.en)}</button>
            ))}
          </div>
          <div className="tts-count">
            {text && (
              <button type="button" className="tts-clear" onClick={() => setText("")} disabled={busy} aria-label={tr("Xóa nội dung", "Clear text")}><Eraser size={14} /></button>
            )}
            <span className={count > MAX_CHARS * 0.9 ? "is-warn" : ""}>{count.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
          </div>
        </div>

        <button type="button" className="tool-btn tts-go" onClick={generate} disabled={busy || !text.trim()}>
          {busy ? <><Loader2 size={18} className="tts-spin" /> {tr("Đang tạo giọng nói...", "Creating the voice...")}</> : <><Sparkles size={18} /> {tr("Tạo giọng nói", "Generate voice")}</>}
        </button>

        {error && (
          <div className="tts-error" role="alert"><AlertCircle size={18} /><span>{error}</span></div>
        )}
      </section>

      {clips.length > 0 && (
        <section className="tool-card tts-step">
          <div className="tts-step-head">
            <span className="tts-num"><Play size={13} /></span>
            <h2>{tr("Kết quả", "Results")}</h2>
            <span className="tts-current">{clips.length}</span>
          </div>
          <ul className="tts-clips">
            {clips.map((c) => {
              const v = VOICES.find((x) => x.id === c.voiceId) ?? VOICES[0];
              const on = playingId === c.id;
              return (
                <li key={c.id} className={on ? "is-playing" : ""}>
                  <button type="button" className="tts-play" onClick={() => play(c)} aria-label={on ? tr("Tạm dừng", "Pause") : tr("Nghe", "Play")}>
                    {on ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <div className="tts-clip-info">
                    <strong>{vName(v)}</strong>
                    <span>{c.preview}{c.preview.length >= 80 ? "…" : ""}</span>
                  </div>
                  <a className="tool-btn tool-btn-secondary tts-dl" href={c.url} download={`Allinonemmo.com - ${tr("Giọng AI", "AI voice")} - ${vName(v)}.mp3`}>
                    <Download size={16} /> <span>MP3</span>
                  </a>
                  <button type="button" className="tts-del" onClick={() => removeClip(c)} aria-label={tr("Xóa", "Remove")}><Trash2 size={16} /></button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
