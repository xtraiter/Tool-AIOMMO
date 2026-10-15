import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { Library } from "@/features/mau-video/components/Library";
import { SavedLink } from "@/features/mau-video/components/SavedLink";
import { PageHead } from "@/features/mau-video/components/PageHead";
import { allPrompts } from "@/features/mau-video/prompts";
import { withMedia } from "@/features/mau-video/media";
import { PLATFORMS } from "@/features/mau-video/taxonomy";
import { MV_BASE } from "@/features/mau-video/site";

export const metadata: Metadata = { alternates: { canonical: MV_BASE } };

export default function MauVideoHomePage() {
  const prompts = withMedia(allPrompts());
  return (
    <>
      <PageHead
        title="Thư viện Mẫu Video & Prompt AI"
        sub={`${prompts.length} prompt và template cho ${PLATFORMS.map((p) => p.name).join(", ")}. Điền thông tin của bạn, prompt tự cập nhật, bấm sao chép. Miễn phí, không cần đăng nhập.`}
        Icon={Sparkles}
        action={<SavedLink />}
      />
      <Library prompts={prompts} chipMode="category" />
    </>
  );
}
