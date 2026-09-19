import { resolveModelUrl } from "@/lib/modelConfig";

export type InpaintTierId = "fast" | "best";

export type InpaintTier = {
  id: InpaintTierId;
  name: string;
  nameEn: string;
  modelName: string;
  fileName: string;
  modelUrl: string;
  sizeBytes: number;
  /** How the model wants its inputs. */
  io: {
    /** LaMa takes floats (image 0..1, mask 1 = hole, output 0..255); MI-GAN takes uint8 (mask 255 = keep, 0 = hole). */
    kind: "float" | "uint8";
    size: number;
  };
  minMemoryGB: number;
  tagline: string;
  taglineEn: string;
};

export const INPAINT_TIERS: InpaintTier[] = [
  {
    id: "fast",
    name: "Nhanh & nhẹ",
    nameEn: "Fast & light",
    modelName: "MI-GAN",
    fileName: "migan_pipeline.onnx",
    modelUrl: resolveModelUrl("https://huggingface.co/anyisalin/migan-onnx/resolve/main/onnx/migan_pipeline.onnx", "migan_pipeline.onnx"),
    sizeBytes: 28_079_181,
    io: { kind: "uint8", size: 512 },
    minMemoryGB: 2,
    tagline: "Chỉ ~28 MB, chạy tốt cả trên điện thoại. Hợp với logo, chữ, watermark nhỏ.",
    taglineEn: "Only ~28 MB and runs fine on phones. Good for logos, text and small watermarks.",
  },
  {
    id: "best",
    name: "Chất lượng cao",
    nameEn: "High quality",
    modelName: "LaMa (Big-LaMa)",
    fileName: "lama_fp32.onnx",
    modelUrl: resolveModelUrl("https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx", "lama_fp32.onnx"),
    sizeBytes: 208_044_816,
    io: { kind: "float", size: 512 },
    minMemoryGB: 4,
    tagline: "~208 MB, cần máy khá. Điền nền tự nhiên hơn cho vùng lớn và họa tiết phức tạp.",
    taglineEn: "~208 MB, needs a decent device. Fills large areas and complex textures more naturally.",
  },
];
