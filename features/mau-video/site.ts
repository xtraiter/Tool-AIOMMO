/** Thư viện mẫu video & prompt AI — chạy dưới đường dẫn con của tool.allinonemmo.com (một domain, một app). */
export const MV_BASE = "/mau-video";
export const MV_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://tool.allinonemmo.com").replace(/\/+$/, "");
export const MV_TITLE = "Thư viện Mẫu Video & Prompt AI";

export const mvPath = {
  home: MV_BASE,
  category: (cat: string) => `${MV_BASE}/danh-muc/${cat}`,
  prompt: (slug: string) => `${MV_BASE}/prompt/${slug}`,
  saved: `${MV_BASE}/da-luu`
};
