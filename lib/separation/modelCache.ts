const CACHE_NAME = "aiommo-models-v1";

export async function isModelCached(url: string): Promise<boolean> {
  try {
    return !!(await (await caches.open(CACHE_NAME)).match(url));
  } catch {
    return false;
  }
}

export async function clearModelCache() {
  try { await caches.delete(CACHE_NAME); } catch { /* ignore */ }
}

/**
 * Downloads a model with byte-accurate progress and stores it in Cache Storage,
 * so later runs load instantly without hitting the network.
 */
export async function loadModelBytes(
  url: string,
  expectedBytes: number,
  onProgress: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      onProgress(buf.byteLength, buf.byteLength);
      return buf;
    }
  } catch { /* Cache Storage unavailable (private mode) — just download */ }

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Không tải được mô hình (HTTP ${res.status}).`);
  const header = Number(res.headers.get("Content-Length") || 0);
  const total = header > 0 ? header : expectedBytes;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(Math.min(loaded, total), total);
  }
  const bytes = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { bytes.set(c, off); off += c.length; }
  onProgress(loaded, loaded);

  try {
    await cache?.put(url, new Response(bytes.slice(0), { headers: { "Content-Type": "application/octet-stream" } }));
  } catch { /* storage quota */ }
  return bytes.buffer;
}
