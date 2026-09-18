/**
 * Mixed-radix complex FFT for sizes whose factors are 2, 3 or 5 (e.g. 6144, 7680).
 * MDX-Net models use non-power-of-two FFT sizes, so a plain radix-2 FFT is not enough.
 */
export class FFT {
  readonly n: number;
  private factors: number[] = [];
  private cosT: Float64Array;
  private sinT: Float64Array;
  private tmpRe: Float64Array;
  private tmpIm: Float64Array;
  private inRe: Float64Array;
  private inIm: Float64Array;

  constructor(n: number) {
    this.n = n;
    let m = n;
    for (const p of [5, 3, 2]) while (m % p === 0) { this.factors.push(p); m /= p; }
    if (m !== 1) throw new Error(`FFT size ${n} must only have factors 2, 3, 5`);
    this.cosT = new Float64Array(n);
    this.sinT = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.cosT[i] = Math.cos((2 * Math.PI * i) / n);
      this.sinT[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    this.tmpRe = new Float64Array(n);
    this.tmpIm = new Float64Array(n);
    this.inRe = new Float64Array(n);
    this.inIm = new Float64Array(n);
  }

  private rec(outOff: number, inOff: number, stride: number, size: number, fi: number) {
    const { tmpRe, tmpIm, inRe, inIm, cosT, sinT } = this;
    if (size === 1) {
      tmpRe[outOff] = inRe[inOff];
      tmpIm[outOff] = inIm[inOff];
      return;
    }
    const p = this.factors[fi];
    const m = size / p;
    for (let q = 0; q < p; q++) this.rec(outOff + q * m, inOff + q * stride, stride * p, m, fi + 1);

    const step = this.n / size;
    if (p === 2) {
      for (let k = 0; k < m; k++) {
        const w = k * step;
        const c = cosT[w], s = sinT[w];
        const i0 = outOff + k, i1 = i0 + m;
        const br = tmpRe[i1] * c - tmpIm[i1] * s;
        const bi = tmpRe[i1] * s + tmpIm[i1] * c;
        const ar = tmpRe[i0], ai = tmpIm[i0];
        tmpRe[i0] = ar + br; tmpIm[i0] = ai + bi;
        tmpRe[i1] = ar - br; tmpIm[i1] = ai - bi;
      }
      return;
    }
    const pStep = this.n / p;
    const bufRe = this.bufRe, bufIm = this.bufIm;
    for (let k = 0; k < m; k++) {
      for (let q = 0; q < p; q++) {
        const idx = outOff + q * m + k;
        const w = (q * k * step) % this.n;
        const c = cosT[w], s = sinT[w];
        bufRe[q] = tmpRe[idx] * c - tmpIm[idx] * s;
        bufIm[q] = tmpRe[idx] * s + tmpIm[idx] * c;
      }
      for (let r = 0; r < p; r++) {
        let sr = 0, si = 0;
        for (let q = 0; q < p; q++) {
          const w = ((q * r) % p) * pStep;
          const c = cosT[w], s = sinT[w];
          sr += bufRe[q] * c - bufIm[q] * s;
          si += bufRe[q] * s + bufIm[q] * c;
        }
        this.scratchRe[r] = sr;
        this.scratchIm[r] = si;
      }
      for (let r = 0; r < p; r++) {
        tmpRe[outOff + r * m + k] = this.scratchRe[r];
        tmpIm[outOff + r * m + k] = this.scratchIm[r];
      }
    }
  }

  private bufRe = new Float64Array(8);
  private bufIm = new Float64Array(8);
  private scratchRe = new Float64Array(8);
  private scratchIm = new Float64Array(8);

  /** In-place forward transform (or inverse, unscaled, when `inverse` is true). */
  transform(re: Float64Array, im: Float64Array, inverse = false) {
    const n = this.n;
    if (inverse) { this.inRe.set(im); this.inIm.set(re); } else { this.inRe.set(re); this.inIm.set(im); }
    this.rec(0, 0, 1, n, 0);
    if (inverse) { re.set(this.tmpIm); im.set(this.tmpRe); } else { re.set(this.tmpRe); im.set(this.tmpIm); }
  }
}
