"use client";

import { GOOGLE_FONTS, type FontCategory, type FontEntry } from "@/lib/fontCatalog";

/** Fallback stack, also the "default" font of text clips that never picked one. */
export const SYSTEM_FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SAMPLE = "Tiếng Việt Aa";

export type FontInfo = { family: string; category: FontCategory | "custom"; weights: number[]; italic: boolean };

const byFamily = new Map<string, FontInfo>(
  GOOGLE_FONTS.map(([family, category, weights, italic]: FontEntry) => [
    family,
    { family, category, weights: weights.split(",").map(Number), italic: !!italic },
  ])
);
const custom = new Map<string, FontInfo>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function allFonts(): FontInfo[] {
  return [...custom.values(), ...byFamily.values()];
}
export function fontInfo(family?: string): FontInfo | undefined {
  return family ? custom.get(family) ?? byFamily.get(family) : undefined;
}
/** Subscribe to "a font finished loading / was uploaded" so canvases can redraw. */
export function onFontsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The real weight to ask for: the family's closest weight to 700 (bold) or 400 (regular). */
export function resolveWeight(family: string | undefined, bold: boolean): number {
  const info = fontInfo(family);
  if (!info) return bold ? 700 : 500; // system font keeps the editor's original look
  if (info.category === "custom") return bold ? 700 : 400;
  const want = bold ? 700 : 400;
  return info.weights.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), info.weights[0]);
}

/** CSS `font` shorthand for canvas / inline styles. */
export function cssFont(family: string | undefined, bold: boolean, italic: boolean, px: number): string {
  const info = fontInfo(family);
  const stack = info ? `"${info.family}", ${SYSTEM_FONT}` : SYSTEM_FONT;
  const real = resolveWeight(family, bold);
  // A family without a bold cut still gets a (browser-synthesised) bold when asked for one.
  const weight = bold && real < 600 ? 700 : real;
  return `${italic ? "italic " : ""}${weight} ${px}px ${stack}`;
}

const cssLoaded = new Set<string>();
const loads = new Map<string, Promise<void>>();

function injectCss(href: string) {
  if (cssLoaded.has(href)) return;
  cssLoaded.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** Loads the regular + bold (and italic) cuts of a family; resolves once the glyphs are usable on a canvas. */
export function loadFont(family: string | undefined, bold = false, italic = false): Promise<void> {
  const info = fontInfo(family);
  if (!info || info.category === "custom" || typeof document === "undefined") return Promise.resolve();
  const key = `${info.family}|${bold}|${italic}`;
  const existing = loads.get(key);
  if (existing) return existing;

  const weights = [...new Set([resolveWeight(family, false), resolveWeight(family, true)])].sort((a, b) => a - b);
  const tuples = [
    ...weights.map((w) => `0,${w}`),
    ...(info.italic ? weights.map((w) => `1,${w}`) : []),
  ];
  injectCss(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(info.family).replace(/%20/g, "+")}:ital,wght@${tuples.join(";")}&display=swap`);

  const spec = `${italic && info.italic ? "italic " : ""}${resolveWeight(family, bold)} 40px "${info.family}"`;
  const p = (async () => {
    // The stylesheet may still be in flight: retry until the face exists (max ~6s).
    for (let i = 0; i < 30; i++) {
      const faces = await document.fonts.load(spec, SAMPLE).catch(() => [] as FontFace[]);
      if (faces.length) { notify(); return; }
      await new Promise((r) => setTimeout(r, 200));
    }
  })();
  loads.set(key, p);
  return p;
}

/** Makes sure every font used by the given text styles is loaded (call before exporting). */
export async function loadFontsFor(styles: { font?: string; bold: boolean; italic: boolean }[]): Promise<void> {
  await Promise.all(styles.map((s) => loadFont(s.font, s.bold, s.italic)));
}

// ---- tiny previews for the font picker: only the glyphs of the names, under a separate family name ----
const previewDone = new Set<string>();
export const previewFamily = (family: string) => `${family}__pv`;

export async function loadPreviews(families: string[]): Promise<void> {
  const todo = families.filter((f) => byFamily.has(f) && !previewDone.has(f));
  if (!todo.length) return;
  todo.forEach((f) => previewDone.add(f));
  const text = [...new Set((todo.join("") + SAMPLE).replace(/\s/g, ""))].join("") + " ";
  const qs = todo.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&");
  try {
    const res = await fetch(`https://fonts.googleapis.com/css2?${qs}&text=${encodeURIComponent(text)}&display=block`);
    if (!res.ok) throw new Error(String(res.status));
    const css = (await res.text()).replace(/font-family:\s*'([^']+)'/g, (_m, name) => `font-family: '${previewFamily(name)}'`);
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  } catch {
    todo.forEach((f) => previewDone.delete(f)); // let a later scroll retry
  }
}

/** Registers a user font file (.ttf/.otf/.woff/.woff2) for this session. Returns its family name. */
export async function addCustomFont(file: File): Promise<string> {
  const base = file.name.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Font";
  let family = base;
  for (let i = 2; byFamily.has(family) || custom.has(family); i++) family = `${base} ${i}`;
  const face = new FontFace(family, await file.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  custom.set(family, { family, category: "custom", weights: [400], italic: false });
  notify();
  return family;
}
