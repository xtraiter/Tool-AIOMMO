import type { Metadata } from "next";
import { MauVideoShell } from "@/features/mau-video/components/MauVideoShell";
import { MV_TITLE } from "@/features/mau-video/site";
import "@/features/mau-video/mau-video.css";

export const metadata: Metadata = {
  title: { default: `${MV_TITLE} · AIOMMO Studio`, template: "%s · AIOMMO Studio" },
  description:
    "Thư viện mẫu video, prompt và template AI đa nền tảng: Veo 3, Sora, Midjourney, ChatGPT, Gemini, Claude, ElevenLabs, CapCut. Điền biến, sao chép và dùng ngay, miễn phí, không cần đăng nhập."
};

export default function MauVideoLayout({ children }: { children: React.ReactNode }) {
  return <MauVideoShell>{children}</MauVideoShell>;
}
