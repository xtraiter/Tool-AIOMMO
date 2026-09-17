// Minimal service worker — exists mainly to satisfy PWA installability
// criteria (a fetch handler + manifest). Deliberately does NOT cache the
// heavy FFmpeg/ONNX assets used by the tools, to avoid storage bloat or
// serving stale copies of those binaries.
const CACHE_NAME = "aiommo-shell-v1";
const SHELL_ASSETS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  // Only handle same-origin navigation requests; let everything else
  // (API calls, WASM/model files, cross-origin) pass straight through.
  if (event.request.mode !== "navigate" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match("/").then((r) => r || Response.error()))
  );
});
