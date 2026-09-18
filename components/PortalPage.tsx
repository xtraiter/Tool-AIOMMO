"use client";

import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DEFAULT_LOCAL_FEATURES, type AppFeature } from "@/lib/features";
import { ToolsLandingPage } from "@/features/landing/ToolsLandingPage";
import { EmbedPage } from "@/components/tools/EmbedPage";
import { Layers3, Smartphone, Share2, Bot } from "lucide-react";

const LazyVideoCutter = dynamic(() => import("@/components/tools/VideoCutter").then((m) => ({ default: m.VideoCutter })), { ssr: false });
const LazyVideoJoiner = dynamic(() => import("@/components/tools/VideoJoiner").then((m) => ({ default: m.VideoJoiner })), { ssr: false });
const LazyAudioExtractor = dynamic(() => import("@/components/tools/AudioExtractor").then((m) => ({ default: m.AudioExtractor })), { ssr: false });
const LazyAudioCutter = dynamic(() => import("@/components/tools/AudioCutter").then((m) => ({ default: m.AudioCutter })), { ssr: false });
const LazyVolumeAmplifier = dynamic(() => import("@/components/tools/VolumeAmplifier").then((m) => ({ default: m.VolumeAmplifier })), { ssr: false });
const LazyVoiceRecorder = dynamic(() => import("@/components/tools/VoiceRecorder").then((m) => ({ default: m.VoiceRecorder })), { ssr: false });
const LazyScreenRecorder = dynamic(() => import("@/components/tools/ScreenRecorder").then((m) => ({ default: m.ScreenRecorder })), { ssr: false });
const LazyZipExtractor = dynamic(() => import("@/components/tools/ZipExtractor").then((m) => ({ default: m.ZipExtractor })), { ssr: false });
const LazyVideoTimeline = dynamic(() => import("@/components/tools/VideoTimeline").then((m) => ({ default: m.VideoTimeline })), { ssr: false });
const LazyMultiDownloader = dynamic(() => import("@/components/tools/MultiDownloader").then((m) => ({ default: m.MultiDownloader })), { ssr: false });
const LazyAlbumDownloader = dynamic(() => import("@/components/tools/AlbumDownloader").then((m) => ({ default: m.AlbumDownloader })), { ssr: false });
const LazyBulkScanner = dynamic(() => import("@/components/tools/BulkScanner").then((m) => ({ default: m.BulkScanner })), { ssr: false });
const LazyEcommerceInfo = dynamic(() => import("@/components/tools/EcommerceInfo").then((m) => ({ default: m.EcommerceInfo })), { ssr: false });

export default function PortalPage({ initialSlug }: { initialSlug?: string }) {
  const validInitialSlug = initialSlug && DEFAULT_LOCAL_FEATURES.some((f) => f.slug === initialSlug) ? initialSlug : undefined;
  const [activeSlug, setActiveSlug] = useState(validInitialSlug ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const urlSyncedRef = useRef(false);

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

  function renderActive() {
    const hasVideoCut = activeSlug === "video.cut";
    const hasVideoJoin = activeSlug === "video.join";
    const hasVideoScreenrecord = activeSlug === "video.screenrecord";
    const hasAudioCut = activeSlug === "audio.cut";
    const hasAudioExtract = activeSlug === "audio.extract" || activeSlug === "audio.extract.audiotab";
    const hasAudioVolume = activeSlug === "audio.volume";
    const hasAudioRecord = activeSlug === "audio.record";
    const hasUtilityZip = activeSlug === "utility.zip";
    const hasVideoTimeline = activeSlug === "video.timeline";
    const hasTipsAll = activeSlug === "tips.all";
    const hasTipsMobile = activeSlug === "tips.mobile";
    const hasTipsSocial = activeSlug === "tips.social";
    const hasTipsAiNews = activeSlug === "tips.ai-news";
    const hasMultiDownloader = activeSlug === "premium.downloader";
    const hasAlbumDownloader = activeSlug === "premium.album";
    const hasBulkScanner = activeSlug === "premium.channel.scanner";
    const hasEcommerceInfo = activeSlug === "premium.product.info";

    const showNone = !hasVideoCut && !hasVideoJoin && !hasVideoScreenrecord && !hasAudioCut && !hasAudioExtract
      && !hasAudioVolume && !hasAudioRecord && !hasUtilityZip && !hasVideoTimeline
      && !hasTipsAll && !hasTipsMobile && !hasTipsSocial && !hasTipsAiNews
      && !hasMultiDownloader && !hasAlbumDownloader && !hasBulkScanner && !hasEcommerceInfo;

    if (hasVideoCut) return <LazyVideoCutter />;
    if (hasVideoJoin) return <LazyVideoJoiner />;
    if (hasVideoScreenrecord) return <LazyScreenRecorder />;
    if (hasAudioCut) return <LazyAudioCutter />;
    if (hasAudioExtract) return <LazyAudioExtractor />;
    if (hasAudioVolume) return <LazyVolumeAmplifier />;
    if (hasAudioRecord) return <LazyVoiceRecorder />;
    if (hasUtilityZip) return <LazyZipExtractor />;
    if (hasVideoTimeline) return <LazyVideoTimeline />;
    if (hasMultiDownloader) return <LazyMultiDownloader />;
    if (hasAlbumDownloader) return <LazyAlbumDownloader />;
    if (hasBulkScanner) return <LazyBulkScanner />;
    if (hasEcommerceInfo) return <LazyEcommerceInfo />;
    if (hasTipsAll) return <EmbedPage icon={Layers3} title="Tất Cả Hướng Dẫn" subtitle="Tổng hợp hướng dẫn sử dụng và mẹo hay." />;
    if (hasTipsMobile) return <EmbedPage icon={Smartphone} title="Hướng Dẫn Di Động (iOS & Android)" subtitle="Phím tắt, mẹo pin và thủ thuật thiết bị di động." />;
    if (hasTipsSocial) return <EmbedPage icon={Share2} title="Hướng Dẫn Mạng Xã Hội" subtitle="Bóc tách video, album ảnh Facebook, TikTok, Douyin." />;
    if (hasTipsAiNews) return <EmbedPage icon={Bot} title="AI News & Xu Hướng AI" subtitle="Mô hình AI, xu hướng công nghệ mới." />;
    if (showNone) return <ToolsLandingPage onSelectTool={(slug) => setActiveSlug(slug)} />;
    return null;
  }

  return (
    <AppShell features={DEFAULT_LOCAL_FEATURES} activeSlug={activeSlug} onSelect={setActiveSlug}>
      {renderActive()}
    </AppShell>
  );
}
