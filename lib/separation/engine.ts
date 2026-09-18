import { DemucsProcessor } from "demucs-web";
import { loadOrt } from "./ort";
import { loadModelBytes } from "./modelCache";
import { separateMdx } from "./mdx";
import type { Stem, TierConfig } from "./models";

export type StemAudio = { left: Float32Array; right: Float32Array };
export type StemMap = Partial<Record<Stem, StemAudio>>;

export type RunOptions = {
  tier: TierConfig;
  left: Float32Array;
  right: Float32Array;
  useWebGpu: boolean;
  onDownload: (loaded: number, total: number) => void;
  onStatus: (message: string) => void;
  onProgress: (fraction: number, etaSeconds: number | null) => void;
  isCancelled: () => boolean;
};

export async function runSeparation(o: RunOptions): Promise<{ stems: StemMap; backend: "webgpu" | "wasm" }> {
  const { tier, left, right } = o;

  o.onStatus("Đang chuẩn bị thư viện AI...");
  const ort = await loadOrt();

  o.onStatus("Đang tải mô hình...");
  const modelBytes = await loadModelBytes(tier.modelUrl, tier.sizeBytes, o.onDownload);
  if (o.isCancelled()) throw new Error("CANCELLED");

  o.onStatus("Đang khởi tạo mô hình...");
  const providers = o.useWebGpu ? ["webgpu", "wasm"] : ["wasm"];

  if (tier.engine === "mdx") {
    const session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: providers,
      graphOptimizationLevel: "all",
    });
    o.onStatus("Đang tách giọng và nhạc nền...");
    const vocals = await separateMdx({
      ort,
      session,
      left,
      right,
      params: tier.mdx!,
      onProgress: o.onProgress,
      isCancelled: o.isCancelled,
    });
    const beat: StemAudio = { left: new Float32Array(left.length), right: new Float32Array(left.length) };
    for (let i = 0; i < left.length; i++) {
      beat.left[i] = left[i] - vocals.left[i];
      beat.right[i] = right[i] - vocals.right[i];
    }
    return { stems: { vocals, beat }, backend: o.useWebGpu ? "webgpu" : "wasm" };
  }

  // Demucs (4 stems)
  let cancelled = false;
  const processor = new DemucsProcessor({
    ort,
    sessionOptions: { executionProviders: providers },
    onProgress: (p: { progress: number }) => {
      if (o.isCancelled()) cancelled = true;
      o.onProgress(p.progress, null);
    },
  });
  await processor.loadModel(modelBytes);
  o.onStatus("Đang tách 4 luồng âm thanh...");
  const result = await processor.separate(left, right);
  if (cancelled || o.isCancelled()) throw new Error("CANCELLED");

  const beat: StemAudio = { left: new Float32Array(left.length), right: new Float32Array(left.length) };
  for (let i = 0; i < left.length; i++) {
    beat.left[i] = result.drums.left[i] + result.bass.left[i] + result.other.left[i];
    beat.right[i] = result.drums.right[i] + result.bass.right[i] + result.other.right[i];
  }
  return {
    stems: { vocals: result.vocals, drums: result.drums, bass: result.bass, other: result.other, beat },
    backend: o.useWebGpu ? "webgpu" : "wasm",
  };
}
