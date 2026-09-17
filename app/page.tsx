import type { Metadata } from "next";
import PortalPage from "@/components/PortalPage";

export const metadata: Metadata = {
  title: "AIOMMO Studio · Công cụ Video & Âm thanh miễn phí",
  description:
    "Cắt ghép video, tạo giọng nói AI, biên tập âm thanh, quay màn hình... miễn phí, xử lý ngay trên trình duyệt, không cần đăng nhập."
};

type Props = {
  searchParams: Promise<{ tool?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalPage initialSlug={params.tool} />;
}
