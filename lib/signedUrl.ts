import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Persist across dev hot-reloads; set PROXY_SECRET in production so links
// survive restarts and work across multiple processes.
const g = globalThis as unknown as { __proxySecret?: string };
const secret = process.env.PROXY_SECRET || (g.__proxySecret ??= randomBytes(32).toString("hex"));

export function signUrl(url: string): string {
  return createHmac("sha256", secret).update(url).digest("hex");
}

export function verifyUrl(url: string, sig: string): boolean {
  const a = Buffer.from(signUrl(url));
  const b = Buffer.from(sig || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Same-origin URL that streams `src` through this server (only for URLs we signed). */
export function mediaProxyUrl(src: string, name?: string, download = false): string {
  const qs = new URLSearchParams({ src, sig: signUrl(src) });
  if (name) qs.set("name", name);
  if (download) qs.set("dl", "1");
  return `/api/media?${qs}`;
}
