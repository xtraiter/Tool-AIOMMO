import fs from "node:fs";
import path from "node:path";
import type { Prompt } from "@/features/mau-video/data/prompts";
import { MV_BASE } from "@/features/mau-video/site";

// Chỉ dùng trong Server Component (đọc ổ đĩa lúc build/render). Không import vào file "use client".
const DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "mau-video", "previews");
const VIDEO_EXT = ["mp4", "webm"];
const POSTER_EXT = ["webp", "jpg", "jpeg", "png"];

/** Tìm public/mau-video/previews/<id>.<ext>; thêm ?v=<mtime> để trình duyệt tải lại khi bạn thay file. */
function find(id: string, exts: string[]): string | undefined {
  for (const ext of exts) {
    const file = path.join(DIR, `${id}.${ext}`);
    try {
      const st = fs.statSync(file);
      if (st.isFile()) return `${MV_BASE}/previews/${id}.${ext}?v=${Math.floor(st.mtimeMs)}`;
    } catch {
      /* không có file này */
    }
  }
  return undefined;
}

/** Gắn video/poster tự tìm thấy theo id. Giá trị khai báo tay trong data/prompts.ts được ưu tiên. */
export function withMedia(list: Prompt[]): Prompt[] {
  // Chưa có ảnh thật thì dùng poster SVG sinh tự động từ tiêu đề (app/mau-video/poster/[slug]).
  return list.map((p) => ({ ...p, video: p.video ?? find(p.id, VIDEO_EXT), poster: p.poster ?? find(p.id, POSTER_EXT) ?? `${MV_BASE}/poster/${p.id}` }));
}
