/** Helpers that build the visual backgrounds of the trimmer / timeline: video filmstrips and audio waveforms. */

/** Grabs `count` evenly spaced frames from a video URL as small JPEG data URLs. */
export async function makeFilmstrip(
  url: string,
  duration: number,
  count: number,
  height = 64,
  isCancelled: () => boolean = () => false
): Promise<string[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("video"));
  });
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  const canvas = document.createElement("canvas");
  canvas.height = height;
  canvas.width = Math.max(1, Math.round(height * aspect));
  const ctx = canvas.getContext("2d")!;
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    if (isCancelled()) break;
    const t = Math.min(duration - 0.05, ((i + 0.5) / count) * duration);
    await new Promise<void>((resolve) => {
      const done = () => { video.removeEventListener("seeked", done); resolve(); };
      video.addEventListener("seeked", done);
      video.currentTime = Math.max(0, t);
      setTimeout(done, 3000); // never hang on a stubborn codec
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.6));
  }
  video.removeAttribute("src");
  video.load();
  return frames;
}

/** Reduces decoded audio to `bins` peak values in 0..1 for drawing a waveform. */
export function computePeaks(buffer: AudioBuffer, bins = 1200): number[] {
  const ch = buffer.getChannelData(0);
  const other = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const size = Math.max(1, Math.floor(ch.length / bins));
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < bins; i++) {
    let p = 0;
    const from = i * size;
    const to = Math.min(ch.length, from + size);
    const step = Math.max(1, Math.floor((to - from) / 64));
    for (let j = from; j < to; j += step) {
      const v = Math.max(Math.abs(ch[j]), other ? Math.abs(other[j]) : 0);
      if (v > p) p = v;
    }
    peaks.push(p);
    if (p > max) max = p;
  }
  return max > 0 ? peaks.map((p) => p / max) : peaks;
}
