"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Video xem trước trên card:
 * - Chuột: phát khi rê vào card (hoặc focus bàn phím), dừng và về đầu khi rời đi.
 * - Cảm ứng (không có hover): tự phát khi card hiện đủ trong màn hình, dừng khi cuộn đi.
 * - Tự phát khi cuộn bị tắt nếu người dùng bật "giảm chuyển động" của hệ điều hành.
 * Video luôn tắt tiếng, lặp lại, và chỉ tải khi cần (preload=none nếu có ảnh bìa).
 */
export function PreviewVideo({ src, poster }: { src: string; poster?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = video.current;
    const card = wrap.current?.closest<HTMLElement>(".mv-card");
    if (!v || !card) return;

    const play = () => {
      v.play().catch(() => {});
    };
    const stop = () => {
      v.pause();
      v.currentTime = 0;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("playing", onPlay);
    v.addEventListener("pause", onPause);

    const cleanups: (() => void)[] = [() => { v.removeEventListener("playing", onPlay); v.removeEventListener("pause", onPause); }];

    if (matchMedia("(hover: hover)").matches) {
      const enter = () => play();
      card.addEventListener("pointerenter", enter);
      card.addEventListener("pointerleave", stop);
      card.addEventListener("focusin", enter);
      card.addEventListener("focusout", stop);
      cleanups.push(() => {
        card.removeEventListener("pointerenter", enter);
        card.removeEventListener("pointerleave", stop);
        card.removeEventListener("focusin", enter);
        card.removeEventListener("focusout", stop);
      });
    } else if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : stop()), { threshold: 0.7 });
      io.observe(card);
      cleanups.push(() => io.disconnect());
    }
    return () => cleanups.forEach((c) => c());
  }, []);

  return (
    <div className={`mv-card-media${playing ? " is-playing" : ""}`} ref={wrap}>
      <video
        ref={video}
        src={poster ? src : `${src}#t=0.001`}
        poster={poster}
        muted
        loop
        playsInline
        preload={poster ? "none" : "metadata"}
        aria-hidden="true"
        tabIndex={-1}
      />
      <span className="mv-card-media-badge" aria-hidden="true"><Play size={11} fill="currentColor" /> Video</span>
    </div>
  );
}
