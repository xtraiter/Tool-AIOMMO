export type TierId = "light" | "balanced" | "high";

export type Stem = "vocals" | "beat" | "drums" | "bass" | "other";

export type TierConfig = {
  id: TierId;
  name: string;
  tagline: string;
  engine: "mdx" | "demucs";
  modelName: string;
  modelUrl: string;
  /** Approximate size in bytes, used when the server hides Content-Length. */
  sizeBytes: number;
  stems: Stem[];
  needsWebGpu: boolean;
  minMemoryGB: number;
  mdx?: { nFft: number; dimF: number; dimT: number };
  speed: string;
  quality: string;
};

const UVR = "https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/";

export const TIERS: TierConfig[] = [
  {
    id: "light",
    name: "Nhẹ",
    tagline: "Tách Lời + Beat cơ bản. Chạy tốt trên điện thoại và máy yếu.",
    engine: "mdx",
    modelName: "UVR MDX-Net (nhỏ)",
    modelUrl: UVR + "UVR_MDXNET_9482.onnx",
    sizeBytes: 29_700_000,
    stems: ["vocals", "beat"],
    needsWebGpu: false,
    minMemoryGB: 2,
    mdx: { nFft: 6144, dimF: 2048, dimT: 256 },
    speed: "Nhanh nhất",
    quality: "Khá — còn lẫn một ít nhạc trong giọng",
  },
  {
    id: "balanced",
    name: "Cân bằng",
    tagline: "Tách Lời + Beat sạch, hợp làm karaoke. Nên có WebGPU để nhanh.",
    engine: "mdx",
    modelName: "UVR MDX-Net Voc FT",
    modelUrl: UVR + "UVR-MDX-NET-Voc_FT.onnx",
    sizeBytes: 66_800_000,
    stems: ["vocals", "beat"],
    needsWebGpu: false,
    minMemoryGB: 4,
    mdx: { nFft: 7680, dimF: 3072, dimT: 256 },
    speed: "Vừa",
    quality: "Tốt — giọng sạch, beat ít lẫn giọng",
  },
  {
    id: "high",
    name: "Cao cấp",
    tagline: "Tách 4 luồng: Lời, Trống, Bass, Nhạc nền. Cần máy mạnh có WebGPU.",
    engine: "demucs",
    modelName: "HTDemucs",
    modelUrl: "https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx",
    sizeBytes: 181_000_000,
    stems: ["vocals", "drums", "bass", "other", "beat"],
    needsWebGpu: true,
    minMemoryGB: 8,
    speed: "Chậm (nhanh nếu có WebGPU)",
    quality: "Rất tốt — 4 luồng riêng biệt",
  },
];

export const STEM_LABEL: Record<Stem, string> = {
  vocals: "Lời",
  beat: "Beat",
  drums: "Trống",
  bass: "Bass",
  other: "Nhạc nền khác",
};
