import { PROMPTS, type Prompt } from "@/features/mau-video/data/prompts";
import { platformById, categoryById, type CategoryId, type PlatformId } from "@/features/mau-video/taxonomy";

export type SortKey = "featured" | "new" | "az";

export const allPrompts = (): Prompt[] => PROMPTS;
export const promptBySlug = (slug: string) => PROMPTS.find((p) => p.id === slug);
export const promptsByCategory = (cat: CategoryId) => PROMPTS.filter((p) => p.category === cat);
export const countByCategory = (cat: CategoryId) => promptsByCategory(cat).length;
export const relatedPrompts = (p: Prompt, limit = 3) =>
  PROMPTS.filter((x) => x.id !== p.id && (x.category === p.category || x.platforms.some((pl) => p.platforms.includes(pl)))).slice(0, limit);

/** Thay {{biến}} bằng giá trị người dùng nhập; nếu trống thì dùng giá trị mẫu; nếu không có thì giữ nguyên {{biến}}. */
export function fillPrompt(p: Prompt, values: Record<string, string> = {}): string {
  return p.prompt.replace(/\{\{(\w+)\}\}/g, (m, key: string) => values[key] || p.vars?.[key] || m);
}

/** Tách prompt thành đoạn text thường và biến, để tô sáng phần biến. */
export function splitPrompt(p: Prompt, values: Record<string, string> = {}) {
  return p.prompt
    .split(/(\{\{\w+\}\})/)
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^\{\{(\w+)\}\}$/);
      if (!m) return { text: part, variable: false };
      return { text: values[m[1]] || p.vars?.[m[1]] || part, variable: true };
    });
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export function searchPrompts(list: Prompt[], opts: { q?: string; platform?: PlatformId | null; sort?: SortKey }): Prompt[] {
  const words = norm((opts.q || "").trim()).split(/\s+/).filter(Boolean);
  const out = list.filter((p) => {
    if (opts.platform && !p.platforms.includes(opts.platform)) return false;
    if (!words.length) return true;
    const hay = norm(
      [p.title, p.desc, p.prompt, p.tags.join(" "), p.platforms.map((x) => platformById(x)?.name ?? "").join(" "), categoryById(p.category)?.name ?? ""].join(" ")
    );
    return words.every((w) => hay.includes(w));
  });
  const rank = (p: Prompt) => (p.hot ? 2 : p.isNew ? 1 : 0);
  if (opts.sort === "az") out.sort((a, b) => a.title.localeCompare(b.title, "vi"));
  else if (opts.sort === "new") out.sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew));
  else out.sort((a, b) => rank(b) - rank(a));
  return out;
}
