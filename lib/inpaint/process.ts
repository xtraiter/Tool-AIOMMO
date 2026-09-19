import type { Inpainter } from "./engine";

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Merges boxes that overlap (or nearly touch) so each AI call covers one connected watermark area. */
export function mergeBoxes(boxes: Box[], gap: number): Box[] {
  const out = boxes.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
          out[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
          out.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return out;
}

/** Grows a 0/1 mask by r pixels (separable square kernel) so the fill also covers anti-aliased halos. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = mask[y * w + k];
      tmp[y * w + x] = v;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x];
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Soft 0..1 alpha from a binary mask (two 3x3 box blurs) so the patch blends into its surroundings. */
function feather(mask: Uint8Array, w: number, h: number): Float32Array {
  let a = Float32Array.from(mask);
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            s += a[yy * w + xx];
            c++;
          }
        }
        b[y * w + x] = s / c;
      }
    }
    a = b;
  }
  return a;
}

/**
 * Removes everything marked in `hole` (full-image 0/1 mask). Works region by region: each cluster of marks is cropped
 * with surrounding context, sent through the model, and blended back, so untouched pixels stay byte-identical.
 */
export async function removeMarked(
  image: ImageData,
  hole: Uint8Array,
  boxes: Box[],
  inpainter: Inpainter,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean
): Promise<ImageData> {
  const W = image.width, H = image.height;
  const work = new ImageData(new Uint8ClampedArray(image.data), W, H);
  const clusters = mergeBoxes(boxes, 24);
  const grow = Math.max(2, Math.round(Math.max(W, H) / 400));

  for (let ci = 0; ci < clusters.length; ci++) {
    if (isCancelled()) throw new Error("CANCELLED");
    onProgress(ci, clusters.length);
    const b = clusters[ci];
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const margin = Math.max(48, Math.round(Math.max(bw, bh) * 0.7));
    const x0 = Math.max(0, Math.floor(b.x0 - margin)), y0 = Math.max(0, Math.floor(b.y0 - margin));
    const x1 = Math.min(W, Math.ceil(b.x1 + margin)), y1 = Math.min(H, Math.ceil(b.y1 + margin));
    const cw = x1 - x0, ch = y1 - y0;

    const crop = new ImageData(cw, ch);
    const cHole = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const srcRow = ((y0 + y) * W + x0) * 4;
      crop.data.set(work.data.subarray(srcRow, srcRow + cw * 4), y * cw * 4);
      for (let x = 0; x < cw; x++) cHole[y * cw + x] = hole[(y0 + y) * W + x0 + x];
    }
    const grown = dilate(cHole, cw, ch, grow);
    const out = await inpainter.run(crop, grown);
    const alpha = feather(grown, cw, ch);

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const a = alpha[y * cw + x];
        if (a <= 0) continue;
        const o = ((y0 + y) * W + x0 + x) * 4, s = (y * cw + x) * 4;
        work.data[o] = work.data[o] * (1 - a) + out.data[s] * a;
        work.data[o + 1] = work.data[o + 1] * (1 - a) + out.data[s + 1] * a;
        work.data[o + 2] = work.data[o + 2] * (1 - a) + out.data[s + 2] * a;
      }
    }
  }
  onProgress(clusters.length, clusters.length);
  return work;
}
