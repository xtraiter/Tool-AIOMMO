// Copies the onnxruntime-web browser runtime into public/ort at install time so the
// vocal separator can load it from our own origin (not committed: ~45MB of binaries).
const fs = require("fs");
const path = require("path");

const FILES = [
  "ort.all.min.js",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
];

try {
  const src = path.join(__dirname, "..", "node_modules", "onnxruntime-web", "dist");
  const dest = path.join(__dirname, "..", "public", "ort");
  fs.mkdirSync(dest, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  console.log(`[copy-ort] Copied ${FILES.length} files to public/ort/`);
} catch (e) {
  console.warn("[copy-ort] Skipped:", e.message);
}
