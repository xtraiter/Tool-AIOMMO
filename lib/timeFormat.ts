/** "1:05.3" style clock used by the trimmer and the timeline editor. */
export function fmtTime(t: number, decimals = 1): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const sec = s.toFixed(decimals).padStart(decimals > 0 ? decimals + 3 : 2, "0");
  return `${m}:${sec}`;
}

/** Accepts "83.5", "1:23.5" or "01:23" and returns seconds, or null if it is not a time. */
export function parseTime(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!text) return null;
  const parts = text.split(":");
  if (parts.length > 3 || parts.some((p) => p === "" || Number.isNaN(Number(p)))) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
