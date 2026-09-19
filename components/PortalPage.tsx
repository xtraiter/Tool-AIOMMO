"use client";

import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DEFAULT_LOCAL_FEATURES, type AppFeature } from "@/lib/features";
import { ToolsLandingPage } from "@/features/landing/ToolsLandingPage";
import { isBackgroundBusy } from "@/lib/backgroundEffect";
import { terminateSharedFfmpeg } from "@/lib/ffmpegLoader";
import { useUiPreferences } from "@/lib/uiPreferences";

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
const LazySubtitleGenerator = dynamic(() => import("@/components/tools/SubtitleGenerator").then((m) => ({ default: m.SubtitleGenerator })), { ssr: false });
const LazyFileConverter = dynamic(() => import("@/components/tools/FileConverter").then((m) => ({ default: m.FileConverter })), { ssr: false });
const LazyVocalSeparator = dynamic(() => import("@/components/tools/VocalSeparator").then((m) => ({ default: m.VocalSeparator })), { ssr: false });
const LazyMultiDownloader = dynamic(() => import("@/components/tools/MultiDownloader").then((m) => ({ default: m.MultiDownloader })), { ssr: false });
const LazyAlbumDownloader = dynamic(() => import("@/components/tools/AlbumDownloader").then((m) => ({ default: m.AlbumDownloader })), { ssr: false });
const LazyBulkScanner = dynamic(() => import("@/components/tools/BulkScanner").then((m) => ({ default: m.BulkScanner })), { ssr: false });
const LazyEcommerceInfo = dynamic(() => import("@/components/tools/EcommerceInfo").then((m) => ({ default: m.EcommerceInfo })), { ssr: false });
const LazyAudioTTS = dynamic(() => import("@/components/tools/AudioTTS").then((m) => ({ default: m.AudioTTS })), { ssr: false });

export default function PortalPage({ initialSlug }: { initialSlug?: string }) {
  const validInitialSlug = initialSlug && DEFAULT_LOCAL_FEATURES.some((f) => f.slug === initialSlug) ? initialSlug : undefined;
  const [activeSlug, setActiveSlug] = useState(validInitialSlug ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const urlSyncedRef = useRef(false);
  const [resetKey, setResetKey] = useState(0);
  const { locale } = useUiPreferences();

  // Keep the URL in sync with whichever tool is open — however the switch
  // happened (homepage card, nav dropdown, mobile sheet) — so an F5 reload
  // (or a bookmark/shared link) lands back on that exact tool instead of
  // always resetting to whatever `?tool=` the page originally loaded with.
  useEffect(() => {
    if (!urlSyncedRef.current) { urlSyncedRef.current = true; return; }
    const url = activeSlug ? `${pathname}?tool=${encodeURIComponent(activeSlug)}` : pathname;
    router.replace(url, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleEvent = (e: Event) => {
      const slug = (e as CustomEvent).detail;
      if (slug && typeof slug === "string") {
        setActiveSlug(slug);
      }
    };
    window.addEventListener("app:change-slug", handleEvent);
    return () => window.removeEventListener("app:change-slug", handleEvent);
  }, []);

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
    const hasVideoTimeline = activeSlug === "video.timeline";
    const hasVocalSeparator = activeSlug === "premium.vocal.separator";
    const hasMultiDownloader = activeSlug === "premium.downloader";
    const hasAlbumDownloader = activeSlug === "premium.album";
    const hasBulkScanner = activeSlug === "premium.channel.scanner";
    const hasEcommerceInfo = activeSlug === "premium.product.info";
    const hasAudioTTS = activeSlug === "premium.audio.tts";
    const hasSubtitle = activeSlug === "premium.video.subtitle";
    const hasWatermark = activeSlug === "premium.watermark.remover";

    const showNone = !hasVideoCut && !hasVideoJoin && !hasVideoScreenrecord && !hasAudioCut && !hasAudioExtract
      && !hasAudioVolume && !hasAudioRecord && !hasUtilityZip && !hasVideoTimeline
      && !hasVocalSeparator && !hasMultiDownloader && !hasAlbumDownloader && !hasBulkScanner && !hasEcommerceInfo && !hasAudioTTS && !hasWatermark && !hasSubtitle && !hasConvert;

    if (hasAudioTTS) return <LazyAudioTTS />;
    if (hasSubtitle) return <LazySubtitleGenerator />;
    if (hasWatermark) return <LazyWatermarkRemover />;
    if (hasVideoCut) return <LazyVideoCutter />;
    if (hasVideoJoin) return <LazyVideoJoiner />;
    if (hasVideoScreenrecord) return <LazyScreenRecorder />;
    if (hasAudioCut) return <LazyAudioCutter />;
    if (hasAudioExtract) return <LazyAudioExtractor />;
    if (hasAudioVolume) return <LazyVolumeAmplifier />;
    if (hasAudioRecord) return <LazyVoiceRecorder />;
    if (hasConvert) return <LazyFileConverter />;
    if (hasUtilityZip) return <LazyZipExtractor />;
    if (hasVideoTimeline) return <LazyVideoTimeline />;
    if (hasVocalSeparator) return <LazyVocalSeparator />;
    if (hasMultiDownloader) return <LazyMultiDownloader />;
    if (hasAlbumDownloader) return <LazyAlbumDownloader />;
    if (hasBulkScanner) return <LazyBulkScanner />;
    if (hasEcommerceInfo) return <LazyEcommerceInfo />;
    if (showNone) return <ToolsLandingPage onSelectTool={(slug) => setActiveSlug(slug)} />;
    return null;
  }

  const content = renderActive();
  isTool = content !== null && activeSlug !== "" && DEFAULT_LOCAL_FEATURES.some((f) => f.slug === activeSlug);

  return (
    <AppShell features={DEFAULT_LOCAL_FEATURES} activeSlug={activeSlug} onSelect={setActiveSlug} onRefresh={isTool ? refreshTool : undefined}>
      <Fragment key={`${activeSlug}:${resetKey}`}>{content}</Fragment>
    </AppShell>
  );
}
