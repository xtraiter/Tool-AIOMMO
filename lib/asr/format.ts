export type Segment = { start: number; end: number; text: string };

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");

function stamp(t: number, comma: boolean) {
  const ms = Math.round(Math.max(0, t) * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? "," : "."}${pad(ms % 1000, 3)}`;
}

/** Splits long segments into short, readable cues (about `max` characters), spreading the time by text length. */
export function toCues(segments: Segment[], max = 42): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    if (text.length <= max * 1.3) { out.push({ ...seg, text }); continue; }
    const lines: string[] = [];
    let cur = "";
    for (const w of text.split(/\s+/)) {
      if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
    }
    if (cur) lines.push(cur);
    const totalChars = lines.reduce((a, l) => a + l.length, 0);
    let t = seg.start;
    for (const l of lines) {
      const d = ((seg.end - seg.start) * l.length) / totalChars;
      out.push({ start: t, end: t + d, text: l });
      t += d;
    }
  }
  return out;
}

export const toSrt = (segments: Segment[]) =>
  toCues(segments).map((c, i) => `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.text}\n`).join("\n");

export const toVtt = (segments: Segment[]) =>
  "WEBVTT\n\n" + toCues(segments).map((c) => `${stamp(c.start, false)} --> ${stamp(c.end, false)}\n${c.text}\n`).join("\n");

export const toTxt = (segments: Segment[]) => segments.map((s) => s.text.trim()).filter(Boolean).join("\n");

export function clock(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
