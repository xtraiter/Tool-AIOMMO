import { FFT } from "./fft";

export type MdxParams = { nFft: number; dimF: number; dimT: number; hop?: number };

const HOP = 1024;

function hann(n: number) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); // periodic
  return w;
}

const reflect = (i: number, len: number) => {
  if (i < 0) return -i;
  if (i >= len) return 2 * (len - 1) - i;
  return i;
};

/**
 * Runs an MDX-Net ONNX model over a whole stereo track.
 * Returns the model's primary stem (vocals for the models we ship); the caller derives the
 * accompaniment as mix - primary.
 */
export async function separateMdx(opts: {
  ort: any;
  session: any;
  left: Float32Array;
  right: Float32Array;
  params: MdxParams;
  onProgress: (fraction: number, etaSeconds: number | null) => void;
  isCancelled: () => boolean;
}): Promise<{ left: Float32Array; right: Float32Array }> {
  const { ort, session, left, right, params, onProgress, isCancelled } = opts;
  const { nFft, dimF, dimT } = params;
  const hop = params.hop ?? HOP;
  const bins = nFft / 2 + 1;
  const half = nFft / 2;
  const chunkSize = hop * (dimT - 1);
  const trim = half;
  const gen = chunkSize - 2 * trim;
  const n = left.length;
  const numChunks = Math.ceil(n / gen);

  const fft = new FFT(nFft);
  const win = hann(nFft);
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);

  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const started = performance.now();

  const inName = session.inputNames[0];
  const outName = session.outputNames[0];

  for (let c = 0; c < numChunks; c++) {
    if (isCancelled()) throw new Error("CANCELLED");

    // chunk input covers mix samples [c*gen - trim, c*gen - trim + chunkSize)
    const base = c * gen - trim;
    const cl = new Float32Array(chunkSize);
    const cr = new Float32Array(chunkSize);
    for (let i = 0; i < chunkSize; i++) {
      const p = base + i;
      if (p >= 0 && p < n) { cl[i] = left[p]; cr[i] = right[p]; }
    }

    // STFT (center=True, reflect pad) of both channels packed into one complex FFT
    const input = new Float32Array(4 * dimF * dimT);
    for (let t = 0; t < dimT; t++) {
      const start = t * hop - half;
      for (let j = 0; j < nFft; j++) {
        const s = reflect(start + j, chunkSize);
        re[j] = cl[s] * win[j];
        im[j] = cr[s] * win[j];
      }
      fft.transform(re, im);
      for (let k = 0; k < dimF; k++) {
        const k2 = (nFft - k) % nFft;
        const zr = re[k], zi = im[k], cr2 = re[k2], ci2 = -im[k2]; // Z[k], conj(Z[N-k])
        // X_L = (Z + conj(Z'))/2 ; X_R = (Z - conj(Z'))/(2i)
        const lr = (zr + cr2) / 2, li = (zi + ci2) / 2;
        const rr = (zi - ci2) / 2, ri = -(zr - cr2) / 2;
        input[(0 * dimF + k) * dimT + t] = lr;
        input[(1 * dimF + k) * dimT + t] = li;
        input[(2 * dimF + k) * dimT + t] = rr;
        input[(3 * dimF + k) * dimT + t] = ri;
      }
    }

    const result = await session.run({ [inName]: new ort.Tensor("float32", input, [1, 4, dimF, dimT]) });
    const spec = result[outName].data as Float32Array;

    // ISTFT
    const total = hop * (dimT - 1) + nFft;
    const accL = new Float64Array(total);
    const accR = new Float64Array(total);
    const norm = new Float64Array(total);
    for (let t = 0; t < dimT; t++) {
      re.fill(0); im.fill(0);
      for (let k = 0; k < Math.min(dimF, bins); k++) {
        const lr = spec[(0 * dimF + k) * dimT + t], li = spec[(1 * dimF + k) * dimT + t];
        const rr = spec[(2 * dimF + k) * dimT + t], ri = spec[(3 * dimF + k) * dimT + t];
        // Z = X_L + i*X_R for bin k, and the Hermitian mirror bin N-k
        re[k] += lr - ri; im[k] += li + rr;
        if (k > 0 && k < half) { re[nFft - k] += lr + ri; im[nFft - k] += -li + rr; }
      }
      fft.transform(re, im, true);
      const o = t * hop;
      for (let j = 0; j < nFft; j++) {
        const w = win[j];
        accL[o + j] += (re[j] / nFft) * w;
        accR[o + j] += (im[j] / nFft) * w;
        norm[o + j] += w * w;
      }
    }

    // valid centre region maps to mix samples [c*gen, c*gen + gen)
    for (let i = 0; i < gen; i++) {
      const dst = c * gen + i;
      if (dst >= n) break;
      const src = half + trim + i; // skip the STFT centre padding, then the trimmed edge
      const d = norm[src] > 1e-8 ? norm[src] : 1;
      outL[dst] = accL[src] / d;
      outR[dst] = accR[src] / d;
    }

    const done = c + 1;
    const elapsed = (performance.now() - started) / 1000;
    onProgress(done / numChunks, done < numChunks ? (elapsed / done) * (numChunks - done) : 0);
    // let the UI repaint between chunks
    await new Promise((r) => setTimeout(r, 0));
  }

  return { left: outL, right: outR };
}
