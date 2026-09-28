"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DEFAULT_LOCAL_FEATURES, featureBySlug, pathForSlug, slugFromPath } from "@/lib/features";
import { ToolsLandingPage } from "@/features/landing/ToolsLandingPage";
import { isBackgroundBusy } from "@/lib/backgroundEffect";
import { terminateSharedFfmpeg } from "@/lib/ffmpegLoader";
import { featureName, useUiPreferences } from "@/lib/uiPreferences";
import { initAnalytics, trackView } from "@/lib/analytics/client";
import type { NavSource } from "@/lib/analytics/types";

const LazyVideoCutter = dynamic(() => import("@/components/tools/VideoCutter").then((m) => ({ default: m.VideoCutter })), { ssr: false });
const LazyVideoJoiner = dynamic(() => import("@/components/tools/VideoJoiner").then((m) => ({ default: m.VideoJoiner })), { ssr: false });
const LazyAudioExtractor = dynamic(() => import("@/components/tools/AudioExtractor").then((m) => ({ default: m.AudioExtractor })), { ssr: false });
const LazyAudioCutter = dynamic(() => import("@/components/tools/AudioCutter").then((m) => ({ default: m.AudioCutter })), { ssr: false });
const LazyVolumeAmplifier = dynamic(() => import("@/components/tools/VolumeAmplifier").then((m) => ({ default: m.VolumeAmplifier })), { ssr: false });
const LazyVoiceRecorder = dynamic(() => import("@/components/tools/VoiceRecorder").then((m) => ({ default: m.VoiceRecorder })), { ssr: false });
const LazyScreenRecorder = dynamic(() => import("@/components/tools/ScreenRecorder").then((m) => ({ default: m.ScreenRecorder })), { ssr: false });
const LazyZipExtractor = dynamic(() => import("@/components/tools/ZipExtractor").then((m) => ({ default: m.ZipExtractor })), { ssr: false });
const LazyVideoTimeline = dynamic(() => import("@/components/tools/VideoTimeline").then((m) => ({ default: m.VideoTimeline })), { ssr: false });
const LazyWatermarkRemover = dynamic(() => import("@/components/tools/WatermarkRemover").then((m) => ({ default: m.WatermarkRemover })), { ssr: false });
const LazyBackgroundRemover = dynamic(() => import("@/components/tools/BackgroundRemover").then((m) => ({ default: m.BackgroundRemover })), { ssr: false });
const LazySubtitleGenerator = dynamic(() => import("@/components/tools/SubtitleGenerator").then((m) => ({ default: m.SubtitleGenerator })), { ssr: false });
const LazyFileConverter = dynamic(() => import("@/components/tools/FileConverter").then((m) => ({ default: m.FileConverter })), { ssr: false });
const LazyVocalSeparator = dynamic(() => import("@/components/tools/VocalSeparator").then((m) => ({ default: m.VocalSeparator })), { ssr: false });
const LazyMultiDownloader = dynamic(() => import("@/components/tools/MultiDownloader").then((m) => ({ default: m.MultiDownloader })), { ssr: false });
const LazyAlbumDownloader = dynamic(() => import("@/components/tools/AlbumDownloader").then((m) => ({ default: m.AlbumDownloader })), { ssr: false });
const LazyBulkScanner = dynamic(() => import("@/components/tools/BulkScanner").then((m) => ({ default: m.BulkScanner })), { ssr: false });
const LazyEcommerceInfo = dynamic(() => import("@/components/tools/EcommerceInfo").then((m) => ({ default: m.EcommerceInfo })), { ssr: false });
const LazyAudioTTS = dynamic(() => import("@/components/tools/AudioTTS").then((m) => ({ default: m.AudioTTS })), { ssr: false });

type HistoryState = { aioIdx?: number } | null;

// Position of the current entry in this tab's in-app navigation stack
// (0 = the page the visitor landed on). Next.js keeps custom history state.
function stackIndex() {
  return (window.history.state as HistoryState)?.aioIdx ?? 0;
}

export default function PortalPage() {
  // The URL is the single source of truth for which tool is open (/cat-video →
  // "video.cut"), so browser Back/Forward, reloads and shared links all agree.
  const pathname = usePathname();
  const activeSlug = slugFromPath(pathname);
  const [resetKey, setResetKey] = useState(0);
  const { locale } = useUiPreferences();
  const navSourceRef = useRef<NavSource>("direct");
  const scrollByIndex = useRef(new Map<number, number>());

  // Opening a tool pushes a history entry without reloading the page, so the
  // phone's back gesture / browser Back walks the stack like a native app.
  const navigate = useCallback((slug: string, source: NavSource) => {
    const path = pathForSlug(slug);
    if (path === window.location.pathname) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const idx = stackIndex();
    scrollByIndex.current.set(idx, window.scrollY);
    navSourceRef.current = source;
    window.history.pushState({ aioIdx: idx + 1 }, "", path);
    window.scrollTo({ top: 0 });
  }, []);

  // "Quay lại": pop the stack when there is an in-app page behind us, otherwise
  // (landed straight on a tool from Google / a shared link) go up to the homepage.
  const goBack = useCallback(() => {
    if (stackIndex() > 0) window.history.back();
    else navigate("", "crumb");
  }, [navigate]);

  useEffect(() => {
    const onPopState = () => {
      navSourceRef.current = "back";
      const saved = scrollByIndex.current.get(stackIndex()) ?? 0;
      // Wait for the restored page to render before putting the scroll back.
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: saved })));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    initAnalytics(activeSlug || "home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    trackView(activeSlug || "home", navSourceRef.current);
    navSourceRef.current = "direct";
    const feature = featureBySlug(activeSlug);
    document.title = feature
      ? `${featureName(feature.slug, feature.name, locale)} · AIOMMO Studio`
      : "AIOMMO Studio · Công cụ Video & Âm thanh miễn phí";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug]);

  useEffect(() => {
    const handleEvent = (e: Event) => {
      const slug = (e as CustomEvent).detail;
      if (slug && typeof slug === "string") navigate(slug, "link");
    };
    window.addEventListener("app:change-slug", handleEvent);
    return () => window.removeEventListener("app:change-slug", handleEvent);
  }, [navigate]);

  let isTool = false;

  // Remounting the open tool (new key) resets every piece of its state; if something is
  // still processing, ask first and stop any running FFmpeg job.
  function refreshTool() {
    if (isBackgroundBusy()) {
      const ok = window.confirm(
        locale === "en"
          ? "A task is still running. Refreshing will cancel it and clear this tool. Continue?"
          : "Đang có tác vụ xử lý. Làm mới sẽ hủy tác vụ và xóa dữ liệu của công cụ này. Tiếp tục?"
      );
      if (!ok) return;
      terminateSharedFfmpeg();
    }
    setResetKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderActive() {
    const hasVideoCut = activeSlug === "video.cut";
    const hasVideoJoin = activeSlug === "video.join";
    const hasVideoScreenrecord = activeSlug === "video.screenrecord";
    const hasAudioCut = activeSlug === "audio.cut";
    const hasAudioExtract = activeSlug === "audio.extract" || activeSlug === "audio.extract.audiotab";
    const hasAudioVolume = activeSlug === "audio.volume";
    const hasAudioRecord = activeSlug === "audio.record";
    const hasUtilityZip = activeSlug === "utility.zip";
    const hasConvert = activeSlug === "utility.convert";
    const hasConvertVideo = activeSlug === "utility.convert.video";
    const hasConvertImage = activeSlug === "utility.convert.image";
    const hasConvertAudio = activeSlug === "utility.convert.audio";
    const hasVideoTimeline = activeSlug === "video.timeline";
    const hasVocalSeparator = activeSlug === "premium.vocal.separator";
    const hasMultiDownloader = activeSlug === "premium.downloader";
    const hasAlbumDownloader = activeSlug === "premium.album";
    const hasBulkScanner = activeSlug === "premium.channel.scanner";
    const hasEcommerceInfo = activeSlug === "premium.product.info";
    const hasAudioTTS = activeSlug === "premium.audio.tts";
    const hasSubtitle = activeSlug === "premium.video.subtitle";
    const hasWatermark = activeSlug === "premium.watermark.remover";
    const hasBgRemover = activeSlug === "image.bgremover";

    const showNone = !hasVideoCut && !hasVideoJoin && !hasVideoScreenrecord && !hasAudioCut && !hasAudioExtract
      && !hasAudioVolume && !hasAudioRecord && !hasUtilityZip && !hasVideoTimeline
      && !hasVocalSeparator && !hasMultiDownloader && !hasAlbumDownloader && !hasBulkScanner && !hasEcommerceInfo && !hasAudioTTS && !hasWatermark && !hasSubtitle && !hasConvert && !hasConvertVideo && !hasConvertImage && !hasConvertAudio && !hasBgRemover;

    if (hasAudioTTS) return <LazyAudioTTS />;
    if (hasSubtitle) return <LazySubtitleGenerator />;
    if (hasWatermark) return <LazyWatermarkRemover />;
    if (hasBgRemover) return <LazyBackgroundRemover />;
    if (hasVideoCut) return <LazyVideoCutter />;
    if (hasVideoJoin) return <LazyVideoJoiner />;
    if (hasVideoScreenrecord) return <LazyScreenRecorder />;
    if (hasAudioCut) return <LazyAudioCutter />;
    if (hasAudioExtract) return <LazyAudioExtractor />;
    if (hasAudioVolume) return <LazyVolumeAmplifier />;
    if (hasAudioRecord) return <LazyVoiceRecorder />;
    if (hasConvert) return <LazyFileConverter />;
    if (hasConvertImage) return <LazyFileConverter initialTab="image" />;
    if (hasConvertVideo) return <LazyFileConverter initialTab="video" />;
    if (hasConvertAudio) return <LazyFileConverter initialTab="audio_conv" />;
    if (hasUtilityZip) return <LazyZipExtractor />;
    if (hasVideoTimeline) return <LazyVideoTimeline />;
    if (hasVocalSeparator) return <LazyVocalSeparator />;
    if (hasMultiDownloader) return <LazyMultiDownloader />;
    if (hasAlbumDownloader) return <LazyAlbumDownloader />;
    if (hasBulkScanner) return <LazyBulkScanner />;
    if (hasEcommerceInfo) return <LazyEcommerceInfo />;
    if (showNone) return <ToolsLandingPage onSelectTool={navigate} />;
    return null;
  }

  const content = renderActive();
  isTool = content !== null && activeSlug !== "" && DEFAULT_LOCAL_FEATURES.some((f) => f.slug === activeSlug);

  return (
    <AppShell
      features={DEFAULT_LOCAL_FEATURES}
      activeSlug={activeSlug}
      onSelect={navigate}
      onBack={isTool ? goBack : undefined}
      onRefresh={isTool ? refreshTool : undefined}
    >
      <Fragment key={`${activeSlug}:${resetKey}`}>{content}</Fragment>
    </AppShell>
  );
}
