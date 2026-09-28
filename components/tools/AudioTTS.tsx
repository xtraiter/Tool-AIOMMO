"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { 
  MicVocal, Loader2, Download, AlertCircle, Sparkles, Search, Trash2, 
  Play, Pause, Check, Eraser, Plus, FileText, Settings2, X, Users,
  ListMusic, ChevronDown, Music, ChevronRight
} from "lucide-react";
import { useTr } from "@/lib/i18n";
import "./tool-page.css";
import "./audio-tts.css";

import { VOICES, type Voice } from "@/lib/capcutVoices";

const MAX_CHARS = 5000;
const DIALOGUE_MAX_CHARS = 800;

const SAMPLES: { vi: string; en: string; text: string }[] = [
  { vi: "Chào mừng", en: "Welcome", text: "Xin chào các bạn, chào mừng các bạn đã quay trở lại với kênh của mình!" },
  { vi: "Quảng cáo", en: "Ad", text: "Sản phẩm mới ra mắt, giảm giá 50% chỉ trong hôm nay. Nhanh tay đặt hàng ngay!" },
  { vi: "Kể chuyện", en: "Story", text: "Ngày xửa ngày xưa, ở một ngôi làng nhỏ bên bờ sông, có một cậu bé rất thích ngắm sao." },
];



const LANGUAGES = [
  { value: "All", label: "🌐 Tất cả ngôn ngữ / All" },
  { value: "vi", label: "🇻🇳 Tiếng Việt (Vietnamese)" },
  { value: "en", label: "🇺🇸 Tiếng Anh (English)" },
  { value: "ko", label: "🇰🇷 Tiếng Hàn (Korean)" },
  { value: "ja", label: "🇯🇵 Tiếng Nhật (Japanese)" },
  { value: "zh", label: "🇨🇳 Tiếng Trung (Chinese)" },
  { value: "es", label: "🇪🇸 Tây Ban Nha (Spanish)" },
  { value: "pt", label: "🇧🇷 Bồ Đào Nha (Portuguese)" },
  { value: "id", label: "🇮🇩 Tiếng Indo (Indonesian)" },
  { value: "de", label: "🇩🇪 Tiếng Đức (German)" },
  { value: "fr", label: "🇫🇷 Tiếng Pháp (French)" },
  { value: "th", label: "🇹🇭 Tiếng Thái (Thai)" },
  { value: "ru", label: "🇷🇺 Tiếng Nga (Russian)" },
  { value: "unknown", label: "🌐 Khác (Other)" }
];

type Clip = { id: string; url: string; voiceId: string; preview: string; at: number };
type Turn = { id: string; voiceId: string; text: string };
type DictEntry = { word: string; replace: string };

export function AudioTTS() {
  const tr = useTr();
  // Tabs: single, dialogue, dict, catalog
  const [activeTab, setActiveTab] = useState<"single" | "dialogue" | "dict" | "catalog">("single");
  
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState(VOICES.find(v => v.lang.startsWith("vi"))?.id ?? VOICES[0].id);
  const [speed, setSpeed] = useState(1.0);
  
  const [dialogueTurns, setDialogueTurns] = useState<Turn[]>([
    { id: "t1", voiceId: VOICES.find(v => v.lang.startsWith("vi") && v.gender === "male")?.id ?? VOICES[0].id, text: "" },
    { id: "t2", voiceId: VOICES.find(v => v.lang.startsWith("vi") && v.gender === "female")?.id ?? VOICES[1]?.id ?? VOICES[0].id, text: "" }
  ]);

  const [userDict, setUserDict] = useState<DictEntry[]>([]);
  const [newWord, setNewWord] = useState("");
  const [newReplace, setNewReplace] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  clipsRef.current = clips;

  // Catalog Filter State
  const [catQuery, setCatQuery] = useState("");
  
  // Custom dropdown state for Single tab picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [singleLang, setSingleLang] = useState("All");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("spai_tts_user_dict");
      if (stored) setUserDict(JSON.parse(stored));
    } catch (e) {}
  }, []);

  const saveDict = (newDict: DictEntry[]) => {
    setUserDict(newDict);
    localStorage.setItem("spai_tts_user_dict", JSON.stringify(newDict));
  };

  const addDictEntry = () => {
    if (!newWord.trim() || !newReplace.trim()) return;
    const updated = [...userDict, { word: newWord.trim(), replace: newReplace.trim() }];
    saveDict(updated);
    setNewWord("");
    setNewReplace("");
  };

  const removeDictEntry = (idx: number) => {
    const updated = [...userDict];
    updated.splice(idx, 1);
    saveDict(updated);
  };

  const applyDictionary = (input: string) => {
    let result = input;
    userDict.forEach(entry => {
      const regex = new RegExp(`\\b${entry.word}\\b`, "gi");
      result = result.replace(regex, entry.replace);
    });
    return result;
  };

  const handleApplyDictToText = () => {
    if (activeTab === "dialogue") {
      setDialogueTurns(prev => prev.map(t => ({ ...t, text: applyDictionary(t.text) })));
    } else {
      setText(applyDictionary(text));
    }
  };

  const vName = (v: Voice) => tr(v.name, v.nameEn);

  const shownCatalog = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    return VOICES.filter((v) => {
      // Name Search
      if (q && !v.name.toLowerCase().includes(q) && !v.nameEn.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catQuery]);
  
  const shownPicker = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return VOICES.filter((v) => {
      if (singleLang !== "All") {
        if (singleLang === "unknown") {
          if (v.lang !== "unknown" && !v.langEn.toLowerCase().includes("other")) return false;
        } else {
          if (!v.lang.startsWith(singleLang)) return false;
        }
      }
      if (q && !v.name.toLowerCase().includes(q) && !v.nameEn.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pickerSearch, singleLang]);

  const selectedVoice = VOICES.find(v => v.id === voiceId) ?? VOICES[0];

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

  const generateSingle = async () => {
    const value = text.trim();
    if (!value) { setError(tr("Hãy nhập nội dung cần đọc.", "Enter the text to read first.")); return; }
    setBusy(true); setError(null);
    try {
      const voice = selectedVoice;
      const res = await fetch("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, voiceId: voice.id, resourceId: voice.resourceId, speed }),
      });
      if (!res.ok) {
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

  const generateDialogue = async () => {
    const validTurns = dialogueTurns.filter(t => t.text.trim().length > 0);
    if (validTurns.length === 0) { setError(tr("Hãy nhập nội dung cho ít nhất 1 lượt hội thoại.", "Enter text for at least 1 turn.")); return; }
    setBusy(true); setError(null);
    try {
      const blobs: Blob[] = [];
      let previewText = "";
      for (const turn of validTurns) {
        const voice = VOICES.find(v => v.id === turn.voiceId) ?? VOICES[0];
        const res = await fetch("/api/audio/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: turn.text.trim(), voiceId: voice.id, resourceId: voice.resourceId, speed }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || tr("Không tạo được giọng nói. Hãy thử lại.", "Couldn't create the voice. Please try again."));
        }
        blobs.push(await res.blob());
        if (!previewText) previewText = turn.text.trim();
      }
      
      const mergedBlob = new Blob(blobs, { type: "audio/mpeg" });
      const url = URL.createObjectURL(mergedBlob);
      const clip: Clip = { id: `${Date.now()}`, url, voiceId: "dialogue", preview: previewText.slice(0, 80) + " (Hội thoại)", at: Date.now() };
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

  return (
    <div className="tool-page tts-page">
      {/* Hidden Font Warmup Container as requested */}
      <div style={{ position: "absolute", left: "-9999px", top: "-9999px", width: "1px", height: "1px", overflow: "hidden", opacity: 0, pointerEvents: "none" }} aria-hidden="true">
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800 }}>Montserrat 800 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600 }}>Montserrat 600 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Be Vietnam Pro', sans-serif", fontWeight: 800 }}>Be Vietnam Pro 800 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400 }}>Bebas Neue 400 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Anton', sans-serif", fontWeight: 400 }}>Anton 400 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800 }}>Outfit 800 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800 }}>Plus Jakarta Sans 800 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}>Inter 800 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>Poppins 800 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Bangers', cursive", fontWeight: 400 }}>Bangers 400 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Bungee', cursive", fontWeight: 400 }}>Bungee 400 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}>Oswald 700 Xin chào Việt Nam</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>JetBrains Mono 700 Xin chào Việt Nam</span>
      </div>

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} onPause={() => setPlayingId(null)} hidden />

      <div style={{ marginBottom: "24px" }}>
        <h1>
          <Sparkles size={24} style={{ color: "var(--accent)" }} /> 
          {tr("Tạo Giọng Nói AI (CapCut TTS)", "AI Voice Generator")}
        </h1>
        <p className="tool-subtitle">
          {tr("Chuyển văn bản thành giọng đọc truyền cảm CapCut, hỗ trợ kịch bản hội thoại đa nhân vật, từ điển phát âm chuẩn xác và ghép nối audio tức thì.", "Convert text to CapCut expressive speech, supporting accurate pronunciation dictionary and instant audio splicing.")}
        </p>
        
        {/* Tabs Switcher using native theme styling */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", background: "var(--panel-2)", padding: "6px", borderRadius: "12px", border: "1px solid var(--line)" }}>
          <button onClick={() => setActiveTab("single")} style={{ flex: 1, minWidth: "120px", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", transition: "all 0.15s", background: activeTab === "single" ? "var(--accent)" : "transparent", color: activeTab === "single" ? "var(--button-ink, #1a1200)" : "var(--muted)", border: "none" }}>
            <MicVocal size={16} /> {tr("Voice Đơn", "Single Voice")}
          </button>
          <button onClick={() => setActiveTab("dialogue")} style={{ flex: 1, minWidth: "120px", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", transition: "all 0.15s", background: activeTab === "dialogue" ? "var(--accent)" : "transparent", color: activeTab === "dialogue" ? "var(--button-ink, #1a1200)" : "var(--muted)", border: "none" }}>
            <Users size={16} /> {tr("Kịch Bản Hội Thoại", "Dialogue Script")}
          </button>
          <button onClick={() => setActiveTab("dict")} style={{ flex: 1, minWidth: "120px", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", transition: "all 0.15s", background: activeTab === "dict" ? "var(--accent)" : "transparent", color: activeTab === "dict" ? "var(--button-ink, #1a1200)" : "var(--muted)", border: "none" }}>
            <FileText size={16} /> {tr("Từ Điển", "Dictionary")}
          </button>
          <button onClick={() => setActiveTab("catalog")} style={{ flex: 1, minWidth: "120px", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", transition: "all 0.15s", background: activeTab === "catalog" ? "var(--accent)" : "transparent", color: activeTab === "catalog" ? "var(--button-ink, #1a1200)" : "var(--muted)", border: "none" }}>
            <ListMusic size={16} /> {tr("Kho Giọng Đọc", "Voice Catalog")}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* TAB 1: SINGLE VOICE */}
        {activeTab === "single" && (
          <div className="tool-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "12px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                <MicVocal size={16} style={{ color: "var(--accent)" }} /> {tr("Cấu Hình Giọng Đọc Đơn", "Selected Voice Config")}
              </div>
              <button onClick={() => setActiveTab("catalog")} style={{ background: "none", border: "none", fontSize: "12px", fontWeight: "bold", color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center" }}>
                {tr("Xem tất cả giọng", "View all voices")} <ChevronRight size={14} />
              </button>
            </div>

            {/* Currently Selected Prominent Display */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px", background: "var(--panel-2)", borderRadius: "12px", border: "1px solid var(--line)", marginBottom: "16px" }}>
              <div style={{ fontSize: "32px", display: "flex", alignItems: "center", justifyContent: "center", width: "56px", height: "56px", background: "var(--panel)", borderRadius: "12px", border: "1px solid var(--line)" }}>
                {selectedVoice.icon || selectedVoice.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {vName(selectedVoice)}
                  <span style={{ fontSize: "10px", padding: "2px 6px", background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)", borderRadius: "4px", fontWeight: "bold" }}>{tr(selectedVoice.tag, selectedVoice.tagEn)}</span>
                </h3>
                <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                  {tr(selectedVoice.lang, selectedVoice.langEn)} • {selectedVoice.gender === "male" ? tr("Nam", "Male") : tr("Nữ", "Female")}
                </div>
              </div>
            </div>

            {/* Custom Dropdown for Voice Selection replacing the chips */}
            <div style={{ background: "var(--panel-2)", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "bold", color: "var(--text)" }}>
                <ListMusic size={16} style={{ color: "var(--accent)" }} /> {tr("Lọc và chọn giọng khác:", "Filter and select other voice:")}
              </div>
              
              <select value={singleLang} onChange={e => setSingleLang(e.target.value)} style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", fontSize: "13px", outline: "none", width: "100%", fontWeight: "600" }}>
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              
              <div style={{ position: "relative" }}>
                <button onClick={() => setPickerOpen(!pickerOpen)} style={{ width: "100%", padding: "10px 16px", borderRadius: "8px", background: "var(--panel)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "14px", fontWeight: "600", color: "var(--text)", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>{selectedVoice.icon || "👤"}</span>
                    <span>{vName(selectedVoice)}</span>
                  </div>
                  <ChevronDown size={16} style={{ color: "var(--muted)" }} />
                </button>

                {pickerOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "8px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "12px", padding: "12px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)", zIndex: 50 }}>
                    <div style={{ position: "relative", marginBottom: "12px" }}>
                      <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
                      <input type="text" placeholder={tr("Tìm tên giọng...", "Search voice name...")} value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} style={{ width: "100%", padding: "8px 12px 8px 36px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--panel-2)", fontSize: "13px", color: "var(--text)" }} />
                    </div>
                    <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {shownPicker.slice(0, 50).map(v => (
                        <button key={v.id} onClick={() => { setVoiceId(v.id); setPickerOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: "8px", border: "none", background: v.id === voiceId ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "16px" }}>{v.icon || "👤"}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: "bold", color: v.id === voiceId ? "var(--accent)" : "var(--text)" }}>{vName(v)}</div>
                            <div style={{ fontSize: "11px", color: "var(--muted)" }}>{tr(v.lang, v.langEn)} • {v.gender === "male" ? "Nam" : "Nữ"}</div>
                          </div>
                          {v.id === voiceId && <Check size={14} style={{ color: "var(--accent)" }} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Config Sliders */}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: "16px", paddingTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div className="tool-slider-row" style={{ flex: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "bold" }}>
                    <span>{tr("Tốc độ đọc", "Speech Speed")}</span>
                    <span style={{ color: "var(--accent)" }}>{speed.toFixed(1)}x</span>
                  </div>
                  <input type="range" min="0.5" max="2.0" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <button onClick={handleApplyDictToText} style={{ background: "var(--panel-2)", border: "1px solid var(--line)", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", justifyContent: "center" }}>
                  <Settings2 size={14} /> {tr("Áp dụng từ điển", "Apply dictionary")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DIALOGUE MODE */}
        {activeTab === "dialogue" && (
          <div className="tool-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "900", marginBottom: "16px" }}>
              <Users size={20} style={{ color: "var(--accent)" }} /> {tr("Kịch Bản Hội Thoại", "Multi-character Dialogue")}
            </div>
            <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>{tr("Chế độ Hội Thoại cho phép ghép nối nhiều giọng đọc khác nhau. Tối đa 800 ký tự mỗi lượt.", "Dialogue Mode allows merging multiple voices. Max 800 chars per turn.")}</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
              {dialogueTurns.map((turn, idx) => {
                const tv = VOICES.find(v => v.id === turn.voiceId) ?? VOICES[0];
                return (
                  <div key={turn.id} style={{ display: "flex", gap: "16px", background: "var(--panel-2)", padding: "16px", borderRadius: "12px", border: "1px solid var(--line)", flexWrap: "wrap" }}>
                    <div style={{ width: "220px", display: "flex", flexDirection: "column", gap: "8px", flexGrow: 1 }}>
                      <label style={{ fontSize: "12px", fontWeight: "bold" }}>Lượt {idx + 1}</label>
                      <select 
                        value={turn.voiceId} 
                        onChange={(e) => {
                          const nt = [...dialogueTurns];
                          nt[idx].voiceId = e.target.value;
                          setDialogueTurns(nt);
                        }}
                        style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", fontSize: "13px", outline: "none" }}
                      >
                        {VOICES.filter(v => v.lang.startsWith("vi")).map(v => (
                          <option key={v.id} value={v.id}>{v.icon || "👤"} {vName(v)} - {v.gender === 'male' ? 'Nam' : 'Nữ'}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 3, position: "relative", minWidth: "250px" }}>
                      <textarea
                        value={turn.text}
                        onChange={(e) => {
                          const nt = [...dialogueTurns];
                          nt[idx].text = e.target.value;
                          setDialogueTurns(nt);
                        }}
                        maxLength={DIALOGUE_MAX_CHARS}
                        placeholder={tr("Nhập lời thoại...", "Enter dialogue...")}
                        style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", minHeight: "80px", resize: "vertical", fontSize: "14px", outline: "none" }}
                      />
                      <span style={{ position: "absolute", bottom: "12px", right: "12px", fontSize: "11px", color: "var(--muted)" }}>
                        {turn.text.length} / {DIALOGUE_MAX_CHARS}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start" }}>
                      <button onClick={() => {
                        const nt = [...dialogueTurns];
                        nt.splice(idx, 1);
                        setDialogueTurns(nt);
                      }} disabled={dialogueTurns.length <= 1} style={{ background: "none", border: "none", color: dialogueTurns.length <= 1 ? "var(--muted)" : "var(--danger)", cursor: dialogueTurns.length <= 1 ? "not-allowed" : "pointer", padding: "8px" }}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button onClick={() => {
                setDialogueTurns(prev => [...prev, { id: `t${Date.now()}`, voiceId: prev[prev.length - 1]?.voiceId ?? VOICES[0].id, text: "" }]);
              }} style={{ padding: "10px 20px", borderRadius: "10px", border: "1.5px dashed var(--line)", background: "transparent", color: "var(--muted)", fontSize: "13px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                <Plus size={16} /> {tr("Thêm lượt thoại", "Add Turn")}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: DICTIONARY */}
        {activeTab === "dict" && (
          <div className="tool-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "900", marginBottom: "8px", textTransform: "uppercase" }}>
              <FileText size={20} style={{ color: "var(--accent)" }} /> {tr("Từ Điển Phiên Âm", "Pronunciation Dictionary")}
            </div>
            <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>{tr("Tự động thay thế từ viết tắt, tiếng Anh thành phát âm tiếng Việt (VD: 'ko' -> 'không', 'AI' -> 'Ây Ai').", "Auto replace abbreviations or English words into Vietnamese pronunciation.")}</p>
            
            <div style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "12px", padding: "16px", display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end", marginBottom: "24px" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>Từ Gốc (Viết tắt / Tiếng Anh)</label>
                <input type="text" placeholder="Ví dụ: AI, VND..." value={newWord} onChange={e => setNewWord(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", fontSize: "13px", outline: "none" }} />
              </div>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>Phiên Âm Đọc Tiếng Việt</label>
                <input type="text" placeholder="Ví dụ: Ây Ai, Việt Nam Đồng..." value={newReplace} onChange={e => setNewReplace(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", fontSize: "13px", outline: "none" }} />
              </div>
              <button className="tool-btn" onClick={addDictEntry} disabled={!newWord || !newReplace} style={{ padding: "10px 20px", borderRadius: "8px", opacity: (!newWord || !newReplace) ? 0.6 : 1 }}>
                <Plus size={16} /> {tr("Thêm Từ", "Add")}
              </button>
            </div>

            {userDict.length > 0 ? (
              <div style={{ border: "1px solid var(--line)", borderRadius: "12px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead style={{ background: "var(--panel-2)", borderBottom: "1px solid var(--line)" }}>
                    <tr>
                      <th style={{ padding: "12px", textAlign: "left" }}>Từ Gốc</th>
                      <th style={{ padding: "12px", textAlign: "left" }}>Đọc Thành</th>
                      <th style={{ padding: "12px", width: "60px", textAlign: "center" }}>Xóa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userDict.map((d, i) => (
                      <tr key={i} style={{ borderBottom: i < userDict.length - 1 ? "1px solid var(--line)" : "none" }}>
                        <td style={{ padding: "12px", fontWeight: "bold" }}>{d.word}</td>
                        <td style={{ padding: "12px", color: "var(--accent)" }}>{d.replace}</td>
                        <td style={{ padding: "12px", textAlign: "center" }}>
                          <button onClick={() => removeDictEntry(i)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}><X size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px" }}>
                Chưa có từ điển cá nhân nào.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CATALOG */}
        {activeTab === "catalog" && (
          <div className="tool-card">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "20px", borderBottom: "1px solid var(--line)", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "900", textTransform: "uppercase" }}>
                <Music size={20} style={{ color: "var(--accent)" }} /> {tr("Kho 890+ Giọng Đọc Đa Ngôn Ngữ", "890+ Multi-Language Voice Catalog")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
                  <input type="text" placeholder={tr("Tìm kiếm tên giọng...", "Search voice name...")} value={catQuery} onChange={e => setCatQuery(e.target.value)} style={{ padding: "8px 10px 8px 32px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--panel-2)", color: "var(--text)", fontSize: "12px", outline: "none", width: "160px" }} />
                </div>
              </div>
            </div>



            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px", maxHeight: "600px", overflowY: "auto", paddingRight: "8px" }}>
              {shownCatalog.map(v => {
                const on = v.id === voiceId;
                return (
                  <div key={v.id} onClick={() => { setVoiceId(v.id); setActiveTab("single"); }} style={{ padding: "12px", borderRadius: "12px", border: on ? "2px solid var(--accent)" : "1px solid var(--line)", background: on ? "color-mix(in srgb, var(--accent) 5%, var(--panel))" : "var(--panel-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", transition: "all 0.15s" }}>
                    <div style={{ fontSize: "24px", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--panel)", borderRadius: "10px", border: "1px solid var(--line)" }}>
                      {v.icon || v.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)" }}>{vName(v)}</div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                        {tr(v.lang, v.langEn)} • {v.gender === "male" ? "Nam" : "Nữ"}
                      </div>
                    </div>
                    {on ? <span style={{ fontSize: "10px", fontWeight: "bold", color: "var(--accent)", padding: "2px 6px", background: "color-mix(in srgb, var(--accent) 15%, transparent)", borderRadius: "4px" }}>Đang chọn</span> : <Check size={16} style={{ color: "transparent" }} />}
                  </div>
                );
              })}
              {shownCatalog.length === 0 && (
                <div style={{ gridColumn: "1/-1", padding: "40px", textAlign: "center", color: "var(--muted)" }}>Không tìm thấy giọng đọc phù hợp.</div>
              )}
            </div>
          </div>
        )}

        {/* ALWAYS VISIBLE TEXT INPUT (Except Dialogue logic handles its own inputs, but we display the main text input regardless so user can type freely) */}
        <div className="tool-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "bold" }}>
              <FileText size={16} style={{ color: "var(--accent)" }} /> 
              {activeTab === "dialogue" ? tr("Nhập Khung Lời Thoại", "Dialogue Content") : tr("Nội Dung Văn Bản", "Text Content")}
            </div>
            
            {activeTab !== "dialogue" && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "var(--muted)" }}>
                <button onClick={() => setText("")} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}><Eraser size={14} /> {tr("Xóa", "Clear")}</button>
                <span>{text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
              </div>
            )}
          </div>
          
          {activeTab !== "dialogue" && (
            <textarea
              value={text}
              maxLength={MAX_CHARS}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={7}
              placeholder={tr("Nhập hoặc dán văn bản bạn muốn tạo giọng đọc vào đây...", "Type or paste the text to turn into speech...")}
              style={{ width: "100%", padding: "16px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--panel-2)", color: "var(--text)", fontSize: "14px", resize: "vertical", outline: "none" }}
            />
          )}
          {activeTab !== "dialogue" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "12px" }}>
              <span style={{ color: "var(--muted)" }}>{tr("Thử văn bản mẫu:", "Try sample:")}</span>
              {SAMPLES.map((s) => (
                <button key={s.vi} onClick={() => setText(s.text)} disabled={busy} style={{ background: "var(--panel-2)", border: "1px solid var(--line)", color: "var(--text)", padding: "4px 8px", borderRadius: "6px", cursor: "pointer" }}>{tr(s.vi, s.en)}</button>
              ))}
            </div>
          )}

          {activeTab === "dialogue" ? (
            <button className="tool-btn" onClick={generateDialogue} disabled={busy || dialogueTurns.every(t => !t.text.trim())} style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "15px", borderRadius: "12px", opacity: (busy || dialogueTurns.every(t => !t.text.trim())) ? 0.7 : 1 }}>
              {busy ? <><Loader2 size={20} className="tts-spin" /> {tr("Đang tạo...", "Creating...")}</> : <><Sparkles size={20} /> {tr("Tạo Hội Thoại", "Generate Dialogue")}</>}
            </button>
          ) : (
            <button className="tool-btn" onClick={generateSingle} disabled={busy || !text.trim()} style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "15px", borderRadius: "12px", marginTop: "16px", opacity: busy || !text.trim() ? 0.7 : 1 }}>
              {busy ? <><Loader2 size={20} className="tts-spin" /> {tr("Đang tạo...", "Creating...")}</> : <><Sparkles size={20} /> {tr("Tạo Giọng Đọc", "Generate Voice")}</>}
            </button>
          )}
        </div>
      </div>

      {/* RESULTS SECTION (always shown below if there are clips) */}
      {clips.length > 0 && (
        <section className="tool-card tts-step" style={{ marginTop: "24px" }}>
          <div className="tts-step-head">
            <span className="tts-num"><Play size={13} /></span>
            <h2>{tr("Kết quả", "Results")}</h2>
            <span className="tts-current">{clips.length}</span>
          </div>
          <ul className="tts-clips">
            {clips.map((c) => {
              const v = c.voiceId === "dialogue" ? { name: "Kịch bản hội thoại", nameEn: "Dialogue Script" } as Voice : VOICES.find((x) => x.id === c.voiceId) ?? VOICES[0];
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

      {error && (
        <div style={{ marginTop: "16px", padding: "16px", background: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)", color: "var(--danger)", borderRadius: "12px", display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "bold" }}>
          <AlertCircle size={20} /> <span>{error}</span>
        </div>
      )}
    </div>
  );
}
