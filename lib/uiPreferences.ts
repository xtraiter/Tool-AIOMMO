"use client";

import { useEffect, useSyncExternalStore } from "react";

export type UiTheme = "light" | "dark";
export type UiLocale = "vi" | "en";

const THEME_STORAGE_KEY = "aio-theme";
const LOCALE_STORAGE_KEY = "aio-locale";
const PREFERENCE_EVENT = "aio-ui-preference-change";

let memoryTheme: UiTheme = "dark";
let memoryLocale: UiLocale = "vi";

function readTheme(): UiTheme {
  try {
    // Dark is the default; only an explicit "light" choice switches it off.
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return memoryTheme;
  }
}

function readLocale(): UiLocale {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY) === "en" ? "en" : "vi";
  } catch {
    return memoryLocale;
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === THEME_STORAGE_KEY ||
      event.key === LOCALE_STORAGE_KEY ||
      event.key === null
    ) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(PREFERENCE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PREFERENCE_EVENT, listener);
  };
}

function updatePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The in-memory fallback still keeps the preference for this visit.
  }
  window.dispatchEvent(new Event(PREFERENCE_EVENT));
}

export function useUiPreferences() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as UiTheme);
  const locale = useSyncExternalStore(subscribe, readLocale, () => "vi" as UiLocale);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
  }, [locale, theme]);

  const toggleTheme = () => {
    memoryTheme = readTheme() === "dark" ? "light" : "dark";
    updatePreference(THEME_STORAGE_KEY, memoryTheme);
  };

  const toggleLocale = () => {
    memoryLocale = readLocale() === "vi" ? "en" : "vi";
    updatePreference(LOCALE_STORAGE_KEY, memoryLocale);
  };

  return { locale, theme, toggleLocale, toggleTheme };
}

const ENGLISH_FEATURE_NAMES: Record<string, string> = {
  "content.create": "Create content",
  "content.rewrite": "Rewrite content",
  "content.story": "Story studio",
  "trending.youtube": "YouTube trends",
  "diamond.niche.hunter": "Diamond Niche Hunter",
  "external.crm": "Partner portal",
  "image.short": "Create Shorts images",
  "image.generate": "Generate images",
  "image.thumbnail": "Create thumbnails",
  "video.merge": "Music video merger",
  "video.short": "Shorts management",
  "video.short.create": "Create short videos",
  "video.short.stickman": "Automated video creator",
  "video.opencut": "OpenCut editor",
  "audio.tts": "Gemini TTS",
  "audio.nghitts": "AIO TTS",
  "settings.providers": "API settings",
  "user.guide": "User guide",
  "admin.phones": "Phone numbers",
  "admin.referrals": "Partners & referrals",
  "admin.tutorial": "Tutorial management",
  "admin.users": "User management",
  "admin.roles": "Role management",
  "admin.plans": "Plan management",
  "admin.licenses": "License management",
  "admin.features": "Feature management",
  "admin.audit_logs": "Audit logs",
  "admin.usage": "Online & usage",
  // Current AIOMMO Studio tool set
  "premium.downloader": "All-in-One Video & Album Downloader",
  "premium.album": "HD Photo Album Downloader (No Logo)",
  "premium.channel.scanner": "Bulk List Downloader",
  "premium.product.info": "E-Commerce Product Info Extractor",
  "video.cut": "Trim / Cut Video",
  "video.join": "Merge Videos Online",
  "video.screenrecord": "Screen Recorder Online",
  "audio.extract": "Extract Audio From Video",
  "premium.video.subtitle": "AI Auto Video Subtitles",
  "video.timeline": "Video Timeline Editor",
  "premium.audio.tts": "AI Voice Generator",
  "audio.cut": "Cut & Edit Audio",
  "premium.vocal.separator": "AI Vocal & Karaoke Beat Splitter",
  "audio.volume": "Boost Video / Audio Volume",
  "audio.record": "Voice Recorder",
  "audio.extract.audiotab": "Extract Audio From Video",
  "utility.zip": "Extract ZIP Files Online",
  "premium.watermark.remover": "AI Watermark Remover",
  "tips.all": "All Guides",
  "tips.mobile": "Mobile Guide (iOS & Android)",
  "tips.social": "Social Media Guide",
  "tips.ai-news": "AI News & Trends",
};

const ENGLISH_FEATURE_DESCRIPTIONS: Record<string, string> = {
  "external.crm": "Open the All In One MMO customer and partner management system",
  "content.create": "Create new content",
  "content.rewrite": "Rewrite existing content",
  "content.story": "Write long-form stories and novels with AI",
  "user.guide": "View tutorials and service plans",
  "settings.providers": "Configure local API providers",
  // Current AIOMMO Studio tool set
  "premium.downloader": "Extract logo-free HD video and photo albums from Facebook, TikTok, Douyin, YouTube...",
  "premium.album": "Download full Facebook, TikTok, Douyin photo albums at the highest original resolution.",
  "premium.channel.scanner": "Paste a list of links or scan an entire channel to batch-download clips to your device.",
  "premium.product.info": "Extract descriptions, HD images, product videos and pricing from Shopee & TikTok Shop.",
  "video.cut": "Trim clip segments precisely by timestamp, export MP4 right in your browser.",
  "video.join": "Drop multiple MP4 clips to merge into one video — no software install needed.",
  "video.screenrecord": "Record your desktop, an app window, or a browser tab with audio, export MP4/WebM instantly.",
  "audio.extract": "Extract the full audio track from a video to high-quality MP3.",
  "premium.video.subtitle": "AI speech recognition automatically generates subtitles and exports SRT / subtitled video.",
  "video.timeline": "Multi-track video editing: combine clips/images, add background music, overlay text, export MP4.",
  "premium.audio.tts": "Turn text into natural AI speech, supports multi-character dialogue scripts.",
  "audio.cut": "Visual waveform, drag to trim, fade in/out, export the file right in your browser.",
  "premium.vocal.separator": "Separate vocals and karaoke backing beat independently using advanced AI.",
  "audio.volume": "Amplify quiet audio to a clear volume without distortion or clipping.",
  "audio.record": "Record directly from your microphone with a real-time waveform, download the WebM file instantly.",
  "audio.extract.audiotab": "Extract the full audio track from a video to high-quality MP3.",
  "utility.zip": "View and extract the contents of a ZIP file right in your browser.",
  "premium.watermark.remover": "Automatically remove logos, text and watermarks from images/videos without blurring or artifacts.",
  "tips.all": "A complete collection of usage guides and tips.",
  "tips.mobile": "Shortcuts, battery tips, and mobile device tricks.",
  "tips.social": "Extracting videos and photo albums from Facebook, TikTok, Douyin.",
  "tips.ai-news": "AI models and the latest technology trends.",
};

const ENGLISH_BADGES: Record<string, string> = {
  "HOẠT ĐỘNG": "ACTIVE",
  "HD GỐC": "ORIGINAL HD",
  "HÀNG LOẠT": "BATCH",
  "CHÍNH XÁC": "PRECISE",
  "SIÊU TỐC": "ULTRA FAST",
  "TRỰC TIẾP": "LIVE",
  "MỚI": "NEW",
  "MICRO LIVE": "LIVE MIC",
  "SIÊU NHANH": "ULTRA FAST",
  "TỰ ĐỘNG": "AUTOMATIC",
};

export function featureName(slug: string, fallback: string, locale: UiLocale) {
  if (locale === "vi") {
    if (slug === "video.short.stickman") return "Tạo video tự động";
    if (slug === "audio.nghitts") return "AIO TTS";
    return fallback;
  }
  return ENGLISH_FEATURE_NAMES[slug] ?? fallback;
}

export function featureDescription(
  slug: string,
  fallback: string | null,
  locale: UiLocale,
) {
  return locale === "en" ? ENGLISH_FEATURE_DESCRIPTIONS[slug] ?? fallback : fallback;
}

/** Badge text (e.g. "MỚI", "CHÍNH XÁC") is stored in Vietnamese as the canonical value — this only translates the displayed label. */
export function badgeLabel(badge: string | undefined, locale: UiLocale) {
  if (!badge) return badge;
  return locale === "en" ? ENGLISH_BADGES[badge] ?? badge : badge;
}

const CATEGORY_LABELS: Record<string, { vi: string; en: string }> = {
  download: { vi: "Tải Video & Album", en: "Download & Albums" },
  video: { vi: "Công Cụ Video", en: "Video Tools" },
  audio: { vi: "Âm Thanh", en: "Audio Tools" },
  storage: { vi: "Lưu Trữ & Zip", en: "Storage & Zip" },
  tips: { vi: "Hướng Dẫn", en: "Guides" },
};

export function categoryLabel(category: string, locale: UiLocale) {
  const entry = CATEGORY_LABELS[category];
  if (!entry) return category;
  return locale === "en" ? entry.en : entry.vi;
}

const SECTION_TITLES: Record<string, { vi: string; en: string }> = {
  download: {
    vi: "Bộ Tải Video & Album Ảnh Đa Nền Tảng",
    en: "All-in-One Video & Photo Album Downloader"
  },
  video: { vi: "Công Cụ Video Trực Tuyến", en: "Online Video Tools" },
  audio: { vi: "Công Cụ Âm Thanh Trực Tuyến", en: "Online Audio Tools" },
  storage: { vi: "Lưu Trữ & Tiện Ích Tệp", en: "Storage & File Utilities" },
  tips: { vi: "Hướng Dẫn", en: "Guides" },
};

export function sectionTitle(category: string, locale: UiLocale) {
  const entry = SECTION_TITLES[category];
  if (!entry) return categoryLabel(category, locale);
  return locale === "en" ? entry.en : entry.vi;
}
