export type BgTierId = "balanced" | "quality";

export interface BgTier {
  id: BgTierId;
  name: string;
  nameEn: string;
  modelName: string;
  sizeFormatted: string;
  tagline: string;
  taglineEn: string;
}

export const BG_TIERS: BgTier[] = [
  {
    id: "balanced",
    name: "Nhanh",
    nameEn: "Fast",
    modelName: "BRIA RMBG-1.4",
    sizeFormatted: "42 MB",
    tagline: "~42 MB, nhận diện đa năng: người, thú cưng, xe cộ, sản phẩm. Chạy tốt cả trên máy không có card đồ họa.",
    taglineEn: "~42 MB, versatile: people, pets, vehicles, products. Runs well even without a graphics card.",
  },
  {
    id: "quality",
    name: "Chất lượng cao",
    nameEn: "High quality",
    modelName: "BiRefNet-lite",
    sizeFormatted: "115 MB",
    tagline: "~115 MB, viền tóc & chi tiết nhỏ sắc nét nhất. Cần máy có card đồ họa (WebGPU); máy không có sẽ rất chậm.",
    taglineEn: "~115 MB, sharpest hair & fine detail. Needs a graphics card (WebGPU); very slow without one.",
  },
];

export type ProgressFn = (step: string, percent: number) => void;

type Device = "webgpu" | "wasm";

let gpuProbe: Promise<{ device: Device; fp16: boolean }> | null = null;

/**
 * `navigator.gpu` existing doesn't mean a GPU is usable (blocklisted drivers,
 * many laptops/phones) — ask for an adapter, otherwise run on CPU (WASM).
 */
export function detectDevice() {
  gpuProbe ??= (async () => {
    try {
      const gpu = (navigator as any).gpu;
      const adapter = gpu ? await gpu.requestAdapter() : null;
      if (adapter) return { device: "webgpu" as Device, fp16: adapter.features.has("shader-f16") };
    } catch {}
    return { device: "wasm" as Device, fp16: false };
  })();
  return gpuProbe;
}

function downloadProgress(label: string, onProgress: ProgressFn) {
  return (p: any) => {
    if (p.status === "progress" && p.total) {
      const pct = Math.round((p.loaded / p.total) * 100);
      onProgress(`Đang tải ${label} (${pct}%)...`, Math.min(80, 10 + pct * 0.7));
    }
  };
}

/** Returns a per-image alpha mask (0–255, width × height) for the given canvas. */
export type MaskFn = (source: HTMLCanvasElement) => Promise<Uint8Array | Uint8ClampedArray>;

type Loaded = { mask: MaskFn; device: Device };
const loaded = new Map<string, Promise<Loaded>>();

async function loadRmbg(device: Device, onProgress: ProgressFn): Promise<Loaded> {
  const { AutoModel, AutoProcessor, RawImage, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  onProgress("Đang tải mô hình RMBG-1.4 (~42MB)...", 10);
  const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
    config: { model_type: "custom" } as any,
    device,
    progress_callback: downloadProgress("RMBG-1.4", onProgress),
  });
  const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
    config: {
      do_normalize: true,
      do_pad: false,
      do_rescale: true,
      do_resize: true,
      image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: "ImageFeatureExtractor",
      image_std: [1, 1, 1],
      resample: 2,
      rescale_factor: 0.00392156862745098,
      size: { width: 1024, height: 1024 },
    },
  });
  return {
    device,
    mask: async (source) => {
      const { pixel_values } = await processor(RawImage.fromCanvas(source));
      const { output } = await model({ input: pixel_values });
      const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(source.width, source.height);
      return mask.data as Uint8Array;
    },
  };
}

async function loadBiRefNet(device: Device, fp16: boolean, onProgress: ProgressFn): Promise<Loaded> {
  const { pipeline, RawImage, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  onProgress(`Đang tải mô hình BiRefNet-lite (~${fp16 ? 115 : 224}MB)...`, 10);
  const segmenter = await pipeline("image-segmentation", "onnx-community/BiRefNet_lite-ONNX", {
    device,
    dtype: fp16 ? "fp16" : "fp32",
    progress_callback: downloadProgress("BiRefNet-lite", onProgress),
  });
  return {
    device,
    mask: async (source) => {
      const [first] = (await segmenter(RawImage.fromCanvas(source))) as any[];
      return first.mask.data as Uint8Array;
    },
  };
}

/**
 * Loads (once) the segmentation model for a tier, on the GPU when one is
 * usable, and falls back to the CPU if the GPU backend fails to start or run.
 */
export async function loadMasker(tierId: BgTierId, onProgress: ProgressFn): Promise<Loaded> {
  const { device, fp16 } = await detectDevice();

  const load = (dev: Device) =>
    tierId === "quality" ? loadBiRefNet(dev, dev === "webgpu" && fp16, onProgress) : loadRmbg(dev, onProgress);

  const key = tierId;
  let pending = loaded.get(key);
  if (!pending) {
    pending = (async () => {
      if (device === "wasm") return load("wasm");
      let gpu: Loaded;
      try {
        gpu = await load("webgpu");
        // Some drivers load fine but fail on the first run — smoke-test on a tiny image.
        const probe = document.createElement("canvas");
        probe.width = probe.height = 32;
        await gpu.mask(probe);
      } catch (err) {
        console.warn(`[bgRemover] WebGPU failed for ${tierId}, falling back to CPU:`, err);
        onProgress("Card đồ họa không dùng được, chuyển sang xử lý bằng CPU...", 12);
        return load("wasm");
      }
      // Some GPUs pass the probe and still fail later (e.g. "Too many storage
      // buffers in shader" on GPUs capped at 16) — on the first runtime error,
      // switch to the CPU for good and redo that image instead of failing.
      let active = gpu;
      let cpu: Promise<Loaded> | null = null;
      return {
        get device() { return active.device; },
        mask: async (source) => {
          try {
            return await active.mask(source);
          } catch (err) {
            if (active.device !== "webgpu") throw err;
            console.warn(`[bgRemover] WebGPU run failed for ${tierId}, switching to CPU:`, err);
            onProgress("Card đồ họa gặp lỗi, chuyển sang xử lý bằng CPU...", 12);
            cpu ??= load("wasm");
            active = await cpu;
            return active.mask(source);
          }
        },
      };
    })();
    loaded.set(key, pending);
    pending.catch(() => loaded.delete(key));
  }
  return pending;
}

/** Copies `source` into a new canvas with `alpha` as its alpha channel. */
export function applyMask(source: HTMLCanvasElement, alpha: ArrayLike<number>) {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  for (let i = 0; i < alpha.length; i++) img.data[4 * i + 3] = alpha[i];
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Executes AI segmentation and returns an HTMLCanvasElement containing the
 * transparent cutout foreground with preserved alpha channel.
 */
export async function executeAiCutout(
  sourceCanvas: HTMLCanvasElement,
  tierId: BgTierId,
  onProgress: ProgressFn
): Promise<HTMLCanvasElement> {
  const masker = await loadMasker(tierId, onProgress);
  onProgress(
    masker.device === "webgpu" ? "Đang tách nền bằng card đồ họa..." : "Đang tách nền bằng CPU (có thể mất một lúc)...",
    85
  );
  const alpha = await masker.mask(sourceCanvas);
  onProgress("Đang dựng mặt nạ...", 97);
  return applyMask(sourceCanvas, alpha);
}
