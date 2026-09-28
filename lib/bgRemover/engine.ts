export type BgTierId = "light" | "balanced" | "local";

export interface BgTier {
  id: BgTierId;
  name: string;
  nameEn: string;
  modelName: string;
  sizeFormatted: string;
  tagline: string;
  taglineEn: string;
  isLocalDefault: boolean;
}

export const BG_TIERS: BgTier[] = [
  {
    id: "light",
    name: "Nhẹ",
    nameEn: "Light",
    modelName: "MODNet AI",
    sizeFormatted: "6.3 MB",
    tagline: "~6.3 MB, chuyên trị chân dung & tóc tơ cực nét. Siêu nhẹ, chạy mượt trên cả điện thoại.",
    taglineEn: "~6.3 MB, specialised in portraits & fine hair. Very lightweight, runs smoothly on phones.",
    isLocalDefault: false,
  },
  {
    id: "balanced",
    name: "Cân bằng",
    nameEn: "Balanced",
    modelName: "BRIA RMBG-1.4",
    sizeFormatted: "42.4 MB",
    tagline: "~42 MB, nhận diện vật thể đa năng: người, thú cưng, xe cộ, đồ vật sản phẩm phức tạp.",
    taglineEn: "~42 MB, versatile segmentation for people, pets, vehicles, and complex products.",
    isLocalDefault: false,
  },
  {
    id: "local",
    name: "Nội bộ (Offline)",
    nameEn: "Local (Offline)",
    modelName: "ISNet Cục bộ",
    sizeFormatted: "40.0 MB",
    tagline: "~40 MB, lưu sẵn trong hệ thống nội bộ, hoạt động 100% không cần tải từ Hugging Face.",
    taglineEn: "~40 MB, stored locally on the server, works 100% without internet downloads.",
    isLocalDefault: true,
  },
];

// Singletons for loaded models
let cachedModnetPipe: any = null;
let cachedRmbgModel: any = null;
let cachedRmbgProcessor: any = null;

export type ProgressFn = (step: string, percent: number) => void;

/**
 * Executes AI segmentation and returns an HTMLCanvasElement containing the
 * transparent cutout foreground with preserved alpha channel.
 */
export async function executeAiCutout(
  sourceCanvas: HTMLCanvasElement,
  tierId: BgTierId,
  onProgress: ProgressFn
): Promise<HTMLCanvasElement> {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  if (tierId === "light") {
    onProgress("Đang khởi tạo thư viện Transformers...", 5);
    const { pipeline, env, RawImage } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    if (!cachedModnetPipe) {
      onProgress("Đang tải mô hình MODNet (~6.3MB)...", 15);
      cachedModnetPipe = await pipeline("background-removal", "Xenova/modnet", {
        device: (navigator as any).gpu ? "webgpu" : "wasm",
        progress_callback: (p: any) => {
          if (p.status === "progress" && p.total) {
            const pct = Math.round((p.loaded / p.total) * 100);
            onProgress(`Đang tải MODNet (${pct}%)...`, pct);
          }
        },
      });
    }

    onProgress("Đang nhận diện tóc & chân dung...", 85);
    const rawImage = RawImage.fromCanvas(sourceCanvas);
    const output = await cachedModnetPipe(rawImage);

    onProgress("Đang dựng mặt nạ...", 98);
    const outCanvas = output.toCanvas() as HTMLCanvasElement;
    return outCanvas;
  }

  if (tierId === "balanced") {
    onProgress("Đang khởi tạo RMBG-1.4...", 5);
    const { AutoModel, AutoProcessor, RawImage, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    if (!cachedRmbgModel) {
      onProgress("Đang tải mô hình RMBG-1.4 (~42MB)...", 15);
      cachedRmbgModel = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
        config: { model_type: "custom" } as any,
        progress_callback: (p: any) => {
          if (p.status === "progress" && p.total) {
            const pct = Math.round((p.loaded / p.total) * 100);
            onProgress(`Đang tải RMBG-1.4 (${pct}%)...`, pct);
          }
        },
      });
    }

    if (!cachedRmbgProcessor) {
      cachedRmbgProcessor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
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
    }

    onProgress("Đang phân đoạn chi tiết vật thể...", 80);
    const rawImage = RawImage.fromCanvas(sourceCanvas);
    const { pixel_values } = await cachedRmbgProcessor(rawImage);
    const { output } = await cachedRmbgModel({ input: pixel_values });

    onProgress("Đang tối ưu độ phân giải...", 92);
    const maskData = (
      await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(width, height)
    ).data;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const octx = outCanvas.getContext("2d")!;
    octx.drawImage(sourceCanvas, 0, 0);

    const imgData = octx.getImageData(0, 0, width, height);
    for (let i = 0; i < maskData.length; i++) {
      imgData.data[4 * i + 3] = maskData[i];
    }
    octx.putImageData(imgData, 0, 0);
    return outCanvas;
  }

  // ISNet local fallback (tierId === "local")
  onProgress("Đang chuẩn bị mô hình cục bộ...", 10);
  const { removeBackground } = await import("@imgly/background-removal");
  const dataUrl = sourceCanvas.toDataURL("image/png");

  const blob = await removeBackground(dataUrl, {
    publicPath: `${window.location.origin}/static/imgly/`,
    model: "medium",
    progress: (key: string, current: number, total: number) => {
      if (key.includes("fetch")) {
        const p = Math.round((current / total) * 100);
        onProgress(`Đang tải mô hình: ${p}%`, p);
      } else if (key.includes("compute")) {
        onProgress("Đang tách nền AI...", 90);
      }
    },
  });

  const img = new Image();
  const blobUrl = URL.createObjectURL(blob);
  img.src = blobUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Lỗi nạp ảnh kết quả từ ISNet"));
  });

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const octx = outCanvas.getContext("2d")!;
  octx.drawImage(img, 0, 0);
  URL.revokeObjectURL(blobUrl);

  return outCanvas;
}
