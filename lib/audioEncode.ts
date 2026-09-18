export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;
  const bufArr = new ArrayBuffer(length);
  const view = new DataView(bufArr);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, buffer.length * numChannels * 2, true);

  let offset = 44;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([bufArr], { type: "audio/wav" });
}

let lamejsLoadPromise: Promise<any> | null = null;

// lamejs's CommonJS files share state through implicit globals (e.g. MPEGMode),
// so it must run as a classic global script — importing it as an ES module
// breaks with "MPEGMode is not defined". Load /vendor/lame.min.js as a <script>
// tag instead, matching how the library expects to be used in a browser.
function loadLamejs(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).lamejs?.Mp3Encoder) {
    return Promise.resolve((window as any).lamejs);
  }
  if (lamejsLoadPromise) return lamejsLoadPromise;

  lamejsLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-lamejs="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).lamejs));
      existing.addEventListener("error", () => reject(new Error("Không thể tải bộ mã hoá MP3.")));
      return;
    }
    const script = document.createElement("script");
    script.src = "/vendor/lame.min.js";
    script.async = true;
    script.dataset.lamejs = "true";
    script.onload = () => resolve((window as any).lamejs);
    script.onerror = () => reject(new Error("Không thể tải bộ mã hoá MP3."));
    document.body.appendChild(script);
  });
  return lamejsLoadPromise;
}

export async function audioBufferToMp3(buffer: AudioBuffer, kbps = 192, onProgress?: (percent: number) => void): Promise<Blob> {
  const lamejs = await loadLamejs();
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
  const blockSize = 1152;
  const left = buffer.getChannelData(0);
  const right = numChannels > 1 ? buffer.getChannelData(1) : left;

  const toInt16 = (f32: Float32Array) => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };
  const leftI16 = toInt16(left);
  const rightI16 = toInt16(right);

  const chunks: Int8Array[] = [];
  let blocks = 0;
  for (let i = 0; i < leftI16.length; i += blockSize) {
    const lc = leftI16.subarray(i, i + blockSize);
    const rc = rightI16.subarray(i, i + blockSize);
    const enc = encoder.encodeBuffer(lc, rc);
    if (enc.length > 0) chunks.push(enc);
    // Yield regularly so the progress bar can repaint during long encodes.
    if (++blocks % 200 === 0) {
      onProgress?.(Math.min(99, Math.round((i / leftI16.length) * 100)));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const end = encoder.flush();
  if (end.length > 0) chunks.push(end);
  onProgress?.(100);
  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

export function getAudioContextCtor(): typeof AudioContext {
  return window.AudioContext || (window as any).webkitAudioContext;
}
