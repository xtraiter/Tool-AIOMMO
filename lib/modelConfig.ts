/**
 * Where AI model files are downloaded from.
 * By default every model comes straight from its public Hugging Face repo. To serve them from your own
 * storage/CDN instead (faster, no third-party dependency), set NEXT_PUBLIC_MODEL_BASE_URL to a folder URL
 * that contains the same file names (see docs/model-setup.md) — the app then requests `<base>/<fileName>`.
 */
const BASE = (process.env.NEXT_PUBLIC_MODEL_BASE_URL || "").replace(/\/+$/, "");

export function resolveModelUrl(defaultUrl: string, fileName: string): string {
  return BASE ? `${BASE}/${fileName}` : defaultUrl;
}
