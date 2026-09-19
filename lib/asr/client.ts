import { modelBase, type AsrTier } from "./models";
import type { Segment } from "./format";

/** Decodes any audio/video file to mono 16 kHz floats (what Whisper expects). Falls back to FFmpeg for odd containers. */
export async function decodeTo16kMono(file: Blob, onStatus?: (s: string) => void): Promise<Float32Array> {
  const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const toMono = (buf: AudioBuffer) => {
    const n = buf.numberOfChannels, len = buf.length;
    const out = new Float32Array(len);
    for (let c = 0; c < n; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) out[i] += d[i] / n; }
    return out;
  };
  const decode = async (data: ArrayBuffer) => {
    const ctx = new Ctx({ sampleRate: 16000 });
    try { return toMono(await ctx.decodeAudioData(data)); } finally { ctx.close().catch(() => {}); }
  };
  try {
    return await decode(await file.arrayBuffer());
  } catch {
    onStatus?.("ffmpeg");
    const { loadSharedFfmpeg } = await import("@/lib/ffmpegLoader");
    const { fetchFile } = await import("@ffmpeg/util");
    const ff = await loadSharedFfmpeg();
    await ff.writeFile("asr_in", await fetchFile(file));
    const code = await ff.exec(["-i", "asr_in", "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", "asr_out.wav"]);
    if (code !== 0) throw new Error("decode");
    const data = (await ff.readFile("asr_out.wav")) as Uint8Array;
    await ff.deleteFile("asr_in").catch(() => {});
    await ff.deleteFile("asr_out.wav").catch(() => {});
    return decode(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  }
}

export type AsrEvents = {
  onDownload?: (loaded: number, total: number) => void;
  onProgress?: (fraction: number, segments: Segment[]) => void;
  onNote?: (note: string) => void;
};

export class AsrClient {
  private worker: Worker | null = null;

  private ensure() {
    if (!this.worker) this.worker = new Worker("/asr/worker.js", { type: "module" });
    return this.worker;
  }

  /** Sends a request and resolves on the first message of a terminal type. */
  private call<T>(msg: object, terminal: string[], ev: AsrEvents, transfer: Transferable[] = []): Promise<T> {
    const w = this.ensure();
    return new Promise((resolve, reject) => {
      const on = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "download") ev.onDownload?.(m.loaded, m.total);
        else if (m.type === "progress") ev.onProgress?.(m.done, m.segments);
        else if (m.type === "note") ev.onNote?.(m.text);
        else if (m.type === "error") { w.removeEventListener("message", on); reject(new Error(m.message)); }
        else if (terminal.includes(m.type)) { w.removeEventListener("message", on); resolve(m as T); }
      };
      w.addEventListener("message", on);
      w.postMessage(msg, transfer);
    });
  }

  load(tier: AsrTier, useWebGpu: boolean, ev: AsrEvents) {
    const device = tier.device === "webgpu" && useWebGpu ? "webgpu" : "wasm";
    const dtype = device === "wasm" && tier.fallbackWasm ? tier.fallbackWasm : tier.dtype;
    return this.call<{ device: string }>(
      { type: "load", model: tier.repo, device, dtype, fallbackWasm: device === "webgpu" ? tier.fallbackWasm : null, modelBase: modelBase() },
      ["ready"], ev
    );
  }

  transcribe(audio: Float32Array, languageName: string, ev: AsrEvents) {
    return this.call<{ type: string; segments: Segment[] }>({ type: "run", audio, language: languageName || null }, ["done", "cancelled"], ev, [audio.buffer]);
  }

  cancel() { this.worker?.postMessage({ type: "cancel" }); }
  dispose() { this.worker?.terminate(); this.worker = null; }
}
