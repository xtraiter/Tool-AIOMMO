import { allPrompts, promptBySlug } from "@/features/mau-video/prompts";
import { categoryById, platformById } from "@/features/mau-video/taxonomy";
import type { Prompt } from "@/features/mau-video/data/prompts";

// Poster SVG sinh tự động cho thẻ prompt chưa có ảnh thật (public/mau-video/previews/<id>.jpg sẽ được ưu tiên).
export const dynamic = "force-static";

export function generateStaticParams() {
  return allPrompts().map((p) => ({ slug: p.id }));
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Ngắt tiêu đề thành tối đa `maxLines` dòng, mỗi dòng ~`maxChars` ký tự. */
function wrap(text: string, maxChars: number, maxLines: number) {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

function poster(p: Prompt) {
  const cat = categoryById(p.category);
  const color = cat?.color ?? "#f59e0b";
  const plat = p.platforms.map((id) => platformById(id)?.name).filter(Boolean).slice(0, 2).join(" · ");
  const pillW = Math.max(96, (cat?.short.length ?? 5) * 13 + 40);
  const lines = wrap(p.title, 17, 5);
  const fontSize = lines.length > 3 ? 50 : 56;
  const lineH = fontSize * 1.18;
  const startY = 420 - ((lines.length - 1) * lineH) / 2;
  const title = lines.map((l, i) => `<tspan x="48" y="${Math.round(startY + i * lineH)}">${esc(l)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c2626"/><stop offset="1" stop-color="#071919"/></linearGradient>
    <radialGradient id="glow" cx="0.8" cy="0.15" r="0.9"><stop offset="0" stop-color="${color}" stop-opacity="0.75"/><stop offset="0.55" stop-color="${color}" stop-opacity="0.12"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2" cx="0.1" cy="0.95" r="0.7"><stop offset="0" stop-color="${color}" stop-opacity="0.45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#ffffff" fill-opacity="0.12"/></pattern>
  </defs>
  <rect width="600" height="760" fill="url(#bg)"/>
  <rect width="600" height="760" fill="url(#glow)"/>
  <rect width="600" height="760" fill="url(#glow2)"/>
  <rect width="600" height="760" fill="url(#dots)"/>
  <rect x="${552 - pillW}" y="48" rx="16" width="${pillW}" height="34" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-opacity="0.6"/>
  <text x="${552 - pillW / 2}" y="71" text-anchor="middle" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="17" font-weight="800" fill="${color}" letter-spacing="1">${esc((cat?.short ?? "").toUpperCase())}</text>
  <text font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff" letter-spacing="-0.5">${title}</text>
  <rect x="48" y="640" width="60" height="6" rx="3" fill="${color}"/>
  <text x="48" y="690" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff" fill-opacity="0.82">${esc(plat)}</text>
</svg>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = promptBySlug(slug);
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(poster(p), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
