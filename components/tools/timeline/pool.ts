import { end, hasAudio, type Clip, type Media } from "./model";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Owns one <video>/<audio> element per clip and keeps them in sync with the timeline clock:
 * seeks while scrubbing, plays (at the clip's speed and volume) while the timeline is playing.
 */
export class MediaPool {
  videos = new Map<string, HTMLVideoElement>();
  audios = new Map<string, HTMLAudioElement>();
  images = new Map<string, HTMLImageElement>();
  onFrameReady: () => void = () => {};

  /** Creates elements for new clips and drops the ones whose clips are gone. */
  ensure(clips: Clip[], mediaById: Map<string, Media>) {
    const live = new Set<string>();
    for (const c of clips) {
      const media = c.mediaId ? mediaById.get(c.mediaId) : undefined;
      if (!media) continue;
      live.add(c.id);
      if (c.kind === "video" && !this.videos.has(c.id)) {
        const v = document.createElement("video");
        v.src = media.url;
        v.preload = "auto";
        v.playsInline = true;
        v.addEventListener("seeked", () => this.onFrameReady());
        v.addEventListener("loadeddata", () => this.onFrameReady());
        this.videos.set(c.id, v);
      } else if (c.kind === "audio" && !this.audios.has(c.id)) {
        const a = document.createElement("audio");
        a.src = media.url;
        a.preload = "auto";
        this.audios.set(c.id, a);
      } else if (c.kind === "image" && !this.images.has(media.id)) {
        const img = new Image();
        img.src = media.url;
        img.onload = () => this.onFrameReady();
        this.images.set(media.id, img);
      }
    }
    for (const [id, v] of this.videos) if (!live.has(id)) { v.pause(); v.removeAttribute("src"); v.load(); this.videos.delete(id); }
    for (const [id, a] of this.audios) if (!live.has(id)) { a.pause(); a.removeAttribute("src"); a.load(); this.audios.delete(id); }
    const usedMedia = new Set(clips.filter((c) => c.kind === "image").map((c) => c.mediaId));
    for (const id of this.images.keys()) if (!usedMedia.has(id)) this.images.delete(id);
  }

  private el(c: Clip) {
    return c.kind === "video" ? this.videos.get(c.id) : c.kind === "audio" ? this.audios.get(c.id) : undefined;
  }

  /** Aligns every media element with timeline time `t`. */
  sync(t: number, playing: boolean, clips: Clip[]) {
    for (const c of clips) {
      if (!hasAudio(c)) continue;
      const el = this.el(c);
      if (!el) continue;
      const active = t >= c.start && t < end(c);
      if (!active) { if (!el.paused) el.pause(); continue; }
      const expected = c.srcIn + (t - c.start) * c.speed;
      el.volume = clamp(c.volume, 0, 1);
      el.playbackRate = clamp(c.speed, 0.0625, 16);
      if (playing) {
        if (el.paused) { el.currentTime = expected; el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - expected) > 0.35) el.currentTime = expected;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - expected) > 0.02) el.currentTime = expected;
      }
    }
  }

  pauseAll() {
    for (const v of this.videos.values()) if (!v.paused) v.pause();
    for (const a of this.audios.values()) if (!a.paused) a.pause();
  }

  dispose() {
    this.pauseAll();
    for (const v of this.videos.values()) { v.removeAttribute("src"); v.load(); }
    for (const a of this.audios.values()) { a.removeAttribute("src"); a.load(); }
    this.videos.clear();
    this.audios.clear();
    this.images.clear();
  }
}
