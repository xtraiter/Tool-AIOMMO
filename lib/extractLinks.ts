/** Pulls every http(s) link out of arbitrary pasted text (share captions, chat logs, Chinese share text...). */
export function extractLinks(text: string, max = 30): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'`，。！？、；：（）【】《》「」]+/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const link = raw.replace(/[.,;:!?)\]}'"]+$/, "");
    try { new URL(link); } catch { continue; }
    if (seen.has(link)) continue;
    seen.add(link);
    out.push(link);
    if (out.length >= max) break;
  }
  return out;
}
