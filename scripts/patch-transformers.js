// Transformers.js chains every browser inference call on one promise
// (`webInferenceChain = webInferenceChain.then(run)`). Once a single run fails —
// e.g. a WebGPU kernel the GPU can't compile — the chain stays rejected and every
// later run in the page (even on the CPU) returns that same old error without
// running. Continue the chain after failures too, so the CPU fallback in
// lib/bgRemover/engine.ts actually works. Re-applied on every install.
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "node_modules", "@huggingface", "transformers", "dist");
const FROM = "webInferenceChain = webInferenceChain.then(run)";
const TO = "webInferenceChain = webInferenceChain.then(run, run)";

try {
  let patched = 0;
  for (const f of fs.readdirSync(dist).filter((n) => /\.(m?js|cjs)$/.test(n))) {
    const file = path.join(dist, f);
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes(FROM)) continue;
    fs.writeFileSync(file, src.split(FROM).join(TO));
    patched++;
  }
  console.log(`[patch-transformers] Patched the inference chain in ${patched} file(s).`);
} catch (e) {
  console.warn("[patch-transformers] Skipped:", e.message);
}
