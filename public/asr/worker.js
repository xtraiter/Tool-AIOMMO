// Speech-to-text worker (Whisper via transformers.js). Runs entirely in the browser; audio never leaves the device.
const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js";

let T = null;
let asr = null;
let loadedKey = "";
let cancelled = false;

const post = (m) => self.postMessage(m);

async function lib(modelBase) {
  if (!T) {
    T = await import(LIB);
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = true;
  }
  if (modelBase) {
    // Self-hosted mirror: <base>/<repo>/onnx/<file> (same folder layout as Hugging Face).
    T.env.remoteHost = modelBase.replace(/\/+$/, "") + "/";
    T.env.remotePathTemplate = "{model}/";
  }
  return T;
}

async function load(m) {
  const key = m.model + "|" + m.device + "|" + JSON.stringify(m.dtype);
  if (asr && loadedKey === key) { post({ type: "ready", device: m.device }); return; }
  const t = await lib(m.modelBase);
  asr = null;
  const files = new Map();
  const progress = (p) => {
    if (p.status === "progress" && p.total) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let l = 0, tot = 0;
      for (const f of files.values()) { l += f.loaded; tot += f.total; }
      post({ type: "download", loaded: l, total: tot });
    }
  };
  try {
    asr = await t.pipeline("automatic-speech-recognition", m.model, { device: m.device, dtype: m.dtype, progress_callback: progress });
    loadedKey = key;
    post({ type: "ready", device: m.device });
  } catch (err) {
    if (m.device === "webgpu" && m.fallbackWasm) {
      post({ type: "note", text: "webgpu-failed" });
      return load(Object.assign({}, m, { device: "wasm", dtype: m.fallbackWasm, fallbackWasm: null }));
    }
    throw err;
  }
}

function rms(a, from, to) {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

// Cuts a 30 s window at its quietest moment in the last 5 s, so words are rarely split in half.
function cutPoint(a, start, max) {
  const SR = 16000;
  if (start + max >= a.length) return a.length;
  const lo = start + Math.floor(max * 0.83), hi = start + max, step = Math.floor(SR * 0.1);
  let best = hi, bestE = Infinity;
  for (let p = lo; p + step <= hi; p += step) {
    const e = rms(a, p, p + step);
    if (e < bestE) { bestE = e; best = p + Math.floor(step / 2); }
  }
  return best;
}

async function run(m) {
  cancelled = false;
  const SR = 16000, MAX = 30 * SR;
  const audio = m.audio;
  const total = audio.length;
  const segments = [];
  let pos = 0;
  while (pos < total) {
    if (cancelled) { post({ type: "cancelled", segments }); return; }
    const end = cutPoint(audio, pos, MAX);
    const chunk = audio.subarray(pos, end);
    const offset = pos / SR;
    if (rms(chunk, 0, chunk.length) > 0.0015) {
      const opts = { task: "transcribe", return_timestamps: true };
      if (m.language) opts.language = m.language;
      const out = await asr(chunk, opts);
      const parts = out.chunks && out.chunks.length ? out.chunks : [{ timestamp: [0, chunk.length / SR], text: out.text }];
      for (const c of parts) {
        const text = (c.text || "").trim();
        if (!text) continue;
        const s = offset + (c.timestamp && c.timestamp[0] != null ? c.timestamp[0] : 0);
        const e0 = c.timestamp ? c.timestamp[1] : null;
        const e = e0 == null ? offset + chunk.length / SR : offset + e0;
        const prev = segments[segments.length - 1];
        if (prev && prev.text === text && s - prev.end < 1) { prev.end = Math.max(prev.end, e); continue; } // drop looped hallucinations
        segments.push({ start: s, end: Math.max(e, s + 0.3), text: text });
      }
    }
    pos = end;
    post({ type: "progress", done: pos / total, segments: segments.slice() });
  }
  post({ type: "done", segments: segments });
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "load") await load(m);
    else if (m.type === "run") await run(m);
    else if (m.type === "cancel") cancelled = true;
  } catch (err) {
    post({ type: "error", message: String((err && err.message) || err) });
  }
};
