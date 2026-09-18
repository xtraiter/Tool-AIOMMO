import { audioBufferToMp3, audioBufferToWav, getAudioContextCtor } from "@/lib/audioEncode";
import type { StemAudio } from "./engine";

export const SAMPLE_RATE = 44100;

/** Decodes any audio/video file to 44.1 kHz stereo Float32 channels. */
export async function decodeStereo44k(file: File): Promise<{ left: Float32Array; right: Float32Array; duration: number }> {
  const Ctx = getAudioContextCtor();
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    let buffer = decoded;
    if (decoded.sampleRate !== SAMPLE_RATE) {
      const off = new OfflineAudioContext(decoded.numberOfChannels, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
      const src = off.createBufferSource();
      src.buffer = decoded;
      src.connect(off.destination);
      src.start();
      buffer = await off.startRendering();
    }
    const left = buffer.getChannelData(0).slice();
    const right = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)).slice();
    return { left, right, duration: buffer.duration };
  } finally {
    ctx.close().catch(() => {});
  }
}

export function toAudioBuffer(stem: StemAudio): AudioBuffer {
  const buf = new AudioBuffer({ numberOfChannels: 2, length: stem.left.length, sampleRate: SAMPLE_RATE });
  buf.copyToChannel(stem.left as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(stem.right as Float32Array<ArrayBuffer>, 1);
  return buf;
}

export const stemToWav = (stem: StemAudio) => audioBufferToWav(toAudioBuffer(stem));
export const stemToMp3 = (stem: StemAudio, onProgress?: (p: number) => void) =>
  audioBufferToMp3(toAudioBuffer(stem), 320, onProgress);
