import { Briefcase, Film, Image as ImageIcon, LayoutGrid, Music, PenLine, type LucideIcon } from "lucide-react";

export type CategoryId = "video" | "image" | "content" | "audio" | "biz";
export type PlatformId = "chatgpt" | "gemini" | "claude" | "veo3" | "midjourney" | "sora" | "elevenlabs" | "capcut";

export type Category = { id: CategoryId; short: string; name: string; color: string; desc: string; Icon: LucideIcon };
export type Platform = { id: PlatformId; name: string; color: string; url: string };

export const ALL_CATEGORY = { id: "all", short: "Tất cả", name: "Tất cả", color: "#f59e0b", Icon: LayoutGrid } as const;

const ICONS: Record<CategoryId, LucideIcon> = { video: Film, image: ImageIcon, content: PenLine, audio: Music, biz: Briefcase };

export const CATEGORIES: Category[] = ([
  {
    "id": "video",
    "short": "Video",
    "name": "Video AI",
    "color": "#ec4899",
    "desc": "Prompt Veo 3, Sora, Kling, kịch bản TikTok/Reels/YouTube"
  },
  {
    "id": "image",
    "short": "Hình ảnh",
    "name": "Hình ảnh AI",
    "color": "#a78bfa",
    "desc": "Midjourney, DALL·E, Imagen: ảnh sản phẩm, avatar, thumbnail"
  },
  {
    "id": "content",
    "short": "Nội dung",
    "name": "Viết nội dung",
    "color": "#f59e0b",
    "desc": "Caption, bài SEO, email, kịch bản bán hàng"
  },
  {
    "id": "audio",
    "short": "Âm thanh",
    "name": "Giọng nói & Nhạc",
    "color": "#22c55e",
    "desc": "ElevenLabs, MiniMax, Suno: lồng tiếng, nhạc nền"
  },
  {
    "id": "biz",
    "short": "MMO",
    "name": "Kinh doanh & MMO",
    "color": "#06b6d4",
    "desc": "Affiliate, chốt đơn, chăm sóc khách, phân tích thị trường"
  }
] as Omit<Category, "Icon">[]).map((c) => ({ ...c, Icon: ICONS[c.id as CategoryId] })) as Category[];

export const PLATFORMS: Platform[] = [
  {
    "id": "chatgpt",
    "name": "ChatGPT",
    "color": "#10a37f",
    "url": "https://chatgpt.com/"
  },
  {
    "id": "gemini",
    "name": "Gemini",
    "color": "#4285f4",
    "url": "https://gemini.google.com/"
  },
  {
    "id": "claude",
    "name": "Claude",
    "color": "#d97757",
    "url": "https://claude.ai/"
  },
  {
    "id": "veo3",
    "name": "Google Flow AI",
    "color": "#ec4899",
    "url": "https://labs.google/flow"
  },
  {
    "id": "midjourney",
    "name": "Midjourney",
    "color": "#a78bfa",
    "url": "https://www.midjourney.com/"
  },
  {
    "id": "sora",
    "name": "Sora",
    "color": "#38bdf8",
    "url": "https://sora.chatgpt.com/"
  },
  {
    "id": "elevenlabs",
    "name": "ElevenLabs",
    "color": "#22c55e",
    "url": "https://elevenlabs.io/"
  },
  {
    "id": "capcut",
    "name": "CapCut",
    "color": "#06b6d4",
    "url": "https://www.capcut.com/"
  }
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
export const platformById = (id: string) => PLATFORMS.find((p) => p.id === id);
