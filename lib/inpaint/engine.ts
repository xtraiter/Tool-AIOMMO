import { loadOrt } from "@/lib/separation/ort";
import { loadModelBytes } from "@/lib/separation/modelCache";
import type { InpaintTier } from "./models";

export type Inpainter = {
  tier: InpaintTier;
  backend: "webgpu" | "wasm";
  /** Fills the masked pixels of `img` (hole[i] = 1) and returns an image of the same size. */
  run: (img: ImageData, hole: Uint8Array) => Promise<ImageData>;
};

type Ctx = { ort: any; session: any; backend: "webgpu" | "wasm" };
const sessions = new Map<string, Promise<Ctx>>();

async function createSession(tier: InpaintTier, useWebGpu: boolean, onDownload: (loaded: number, total: number) => void): Promise<Ctx> {
  const ort = await loadOrt();
  const bytes = await loadModelBytes(tier.modelUrl, tier.sizeBytes, onDownload);
  const attempts: ("webgpu" | "wasm")[] = useWebGpu ? ["webgpu", "wasm"] : ["wasm"];
  let lastErr: unknown;
  for (const backend of attempts) {
    try {
      const session = await ort.InferenceSession.create(bytes, { executionProviders: [backend], graphOptimizationLevel: "all" });
      return { ort, session, backend };
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Không khởi tạo được mô hình AI.");
}

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export async function loadInpainter(tier: InpaintTier, useWebGpu: boolean, onDownload: (loaded: number, total: number) => void): Promise<Inpainter> {
  const key = `${tier.id}:${useWebGpu}`;
  let p = sessions.get(key);
  if (!p) {
    p = createSession(tier, useWebGpu, onDownload);
    sessions.set(key, p);
    p.catch(() => sessions.delete(key));
  }
  const ctx = await p;
  const S = tier.io.size;

  const run = async (img: ImageData, hole: Uint8Array): Promise<ImageData> => {
    const w = img.width, h = img.height;
    const scale = S / Math.max(w, h);
    const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
    const ox = Math.floor((S - dw) / 2), oy = Math.floor((S - dh) / 2);

    // Image -> S x S: a stretched backdrop plus the aspect-fit copy, so any padding is plausible content.
    const src = canvasOf(w, h);
    src.getContext("2d")!.putImageData(img, 0, 0);
    const ic = canvasOf(S, S).getContext("2d", { willReadFrequently: true })!;
    ic.imageSmoothingQuality = "high";
    ic.drawImage(src, 0, 0, S, S);
    ic.drawImage(src, ox, oy, dw, dh);
    const px = ic.getImageData(0, 0, S, S).data;

    // Mask -> S x S (hole = 1); the padding stays "keep".
    const mSrc = canvasOf(w, h);
    const mImg = new ImageData(w, h);
    for (let i = 0; i < hole.length; i++) {
      if (hole[i]) { const o = i * 4; mImg.data[o] = mImg.data[o + 1] = mImg.data[o + 2] = mImg.data[o + 3] = 255; }
    }
    mSrc.getContext("2d")!.putImageData(mImg, 0, 0);
    const mc = canvasOf(S, S).getContext("2d", { willReadFrequently: true })!;
    mc.drawImage(mSrc, ox, oy, dw, dh);
    const mp = mc.getImageData(0, 0, S, S).data;

    const n = S * S;
    const isHole = new Uint8Array(n);
    for (let i = 0; i < n; i++) isHole[i] = mp[i * 4] > 100 ? 1 : 0;

    const ort = ctx.ort;
    let feeds: Record<string, unknown>;
    if (tier.io.kind === "float") {
      const im = new Float32Array(3 * n), mk = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        im[i] = px[i * 4] / 255; im[n + i] = px[i * 4 + 1] / 255; im[2 * n + i] = px[i * 4 + 2] / 255;
        mk[i] = isHole[i];
      }
      feeds = { image: new ort.Tensor("float32", im, [1, 3, S, S]), mask: new ort.Tensor("float32", mk, [1, 1, S, S]) };
    } else {
      const im = new Uint8Array(3 * n), mk = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        im[i] = px[i * 4]; im[n + i] = px[i * 4 + 1]; im[2 * n + i] = px[i * 4 + 2];
        mk[i] = isHole[i] ? 0 : 255; // MI-GAN: 255 = keep, 0 = fill
      }
      feeds = { image: new ort.Tensor("uint8", im, [1, 3, S, S]), mask: new ort.Tensor("uint8", mk, [1, 1, S, S]) };
    }

    const out = await ctx.session.run(feeds);
    const data = (out[ctx.session.outputNames[0]] as { data: ArrayLike<number> }).data;
    const res = new ImageData(S, S);
    for (let i = 0; i < n; i++) {
      res.data[i * 4] = data[i];
      res.data[i * 4 + 1] = data[n + i];
      res.data[i * 4 + 2] = data[2 * n + i];
      res.data[i * 4 + 3] = 255;
    }
    const resC = canvasOf(S, S);
    resC.getContext("2d")!.putImageData(res, 0, 0);
    const bc = canvasOf(w, h).getContext("2d", { willReadFrequently: true })!;
    bc.imageSmoothingQuality = "high";
    bc.drawImage(resC, ox, oy, dw, dh, 0, 0, w, h);
    return bc.getImageData(0, 0, w, h);
  };

  return { tier, backend: ctx.backend, run };
}
