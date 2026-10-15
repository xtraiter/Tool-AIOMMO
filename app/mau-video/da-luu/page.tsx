import type { Metadata } from "next";
import { Bookmark } from "lucide-react";
import { PageHead } from "@/features/mau-video/components/PageHead";
import { SavedList } from "@/features/mau-video/components/SavedList";
import { allPrompts } from "@/features/mau-video/prompts";
import { withMedia } from "@/features/mau-video/media";

export const metadata: Metadata = {
  title: "Prompt đã lưu",
  description: "Các prompt bạn đã lưu trên trình duyệt này.",
  robots: { index: false }
};

export default function SavedPage() {
  return (
    <>
      <PageHead title="Đã lưu" sub="Các prompt bạn đã đánh dấu. Danh sách nằm trong trình duyệt này, không cần đăng nhập." Icon={Bookmark} />
      <SavedList prompts={withMedia(allPrompts())} />
    </>
  );
}
