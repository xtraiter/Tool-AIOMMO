import { resolveModelBase } from "@/lib/modelConfig";

export type AsrTierId = "light" | "balanced" | "high";

export type AsrTier = {
  id: AsrTierId;
  name: string;
  nameEn: string;
  modelName: string;
  repo: string;
  sizeBytes: number;
  device: "wasm" | "webgpu";
  dtype: string | Record<string, string>;
  /** Used when WebGPU is unavailable or fails to start. */
  fallbackWasm?: string | Record<string, string>;
  needsWebGpu: boolean;
  minMemoryGB: number;
  tagline: string;
  taglineEn: string;
};

export const ASR_TIERS: AsrTier[] = [
  {
    id: "light",
    name: "Nhẹ",
    nameEn: "Light",
    modelName: "Whisper Base",
    repo: "onnx-community/whisper-base",
    sizeBytes: 77_000_000,
    device: "wasm",
    dtype: "q8",
    needsWebGpu: false,
    minMemoryGB: 2,
    tagline: "~77 MB, chạy được trên điện thoại. Nhanh nhưng tiếng Việt chỉ ở mức tạm được.",
    taglineEn: "~77 MB, runs on phones. Fast, but Vietnamese accuracy is only fair.",
  },
  {
    id: "balanced",
    name: "Cân bằng",
    nameEn: "Balanced",
    modelName: "Whisper Small",
    repo: "onnx-community/whisper-small",
    sizeBytes: 250_000_000,
    device: "wasm",
    dtype: "q8",
    needsWebGpu: false,
    minMemoryGB: 4,
    tagline: "~250 MB, khá chính xác với tiếng Việt và tiếng Anh. Phù hợp máy tính thường.",
    taglineEn: "~250 MB, fairly accurate for Vietnamese and English. Good for ordinary computers.",
  },
  {
    id: "high",
    name: "Cao cấp",
    nameEn: "High",
    modelName: "Whisper Large-v3 Turbo",
    repo: "onnx-community/whisper-large-v3-turbo",
    sizeBytes: 563_000_000,
    device: "webgpu",
    dtype: { encoder_model: "q4f16", decoder_model_merged: "q4f16" },
    fallbackWasm: { encoder_model: "q8", decoder_model_merged: "q8" },
    needsWebGpu: true,
    minMemoryGB: 8,
    tagline: "~563 MB, chính xác nhất. Cần máy mạnh có WebGPU (Chrome/Edge mới).",
    taglineEn: "~563 MB, the most accurate. Needs a strong device with WebGPU (recent Chrome/Edge).",
  },
];

export const modelBase = () => resolveModelBase();

export const LANGUAGES: { code: string; name: string; label: string; labelEn: string }[] = [
  { code: "vi", name: "vietnamese", label: "Tiếng Việt", labelEn: "Vietnamese" },
  { code: "en", name: "english", label: "Tiếng Anh", labelEn: "English" },
  { code: "zh", name: "chinese", label: "Tiếng Trung", labelEn: "Chinese" },
  { code: "ja", name: "japanese", label: "Tiếng Nhật", labelEn: "Japanese" },
  { code: "ko", name: "korean", label: "Tiếng Hàn", labelEn: "Korean" },
  { code: "th", name: "thai", label: "Tiếng Thái", labelEn: "Thai" },
  { code: "id", name: "indonesian", label: "Tiếng Indonesia", labelEn: "Indonesian" },
  { code: "fr", name: "french", label: "Tiếng Pháp", labelEn: "French" },
  { code: "de", name: "german", label: "Tiếng Đức", labelEn: "German" },
  { code: "es", name: "spanish", label: "Tiếng Tây Ban Nha", labelEn: "Spanish" },
  { code: "ru", name: "russian", label: "Tiếng Nga", labelEn: "Russian" },
  { code: "", name: "", label: "Tự nhận diện", labelEn: "Auto-detect" },
];
