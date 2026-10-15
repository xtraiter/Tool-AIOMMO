import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Library } from "@/features/mau-video/components/Library";
import { SavedLink } from "@/features/mau-video/components/SavedLink";
import { PageHead } from "@/features/mau-video/components/PageHead";
import { promptsByCategory } from "@/features/mau-video/prompts";
import { withMedia } from "@/features/mau-video/media";
import { CATEGORIES, categoryById } from "@/features/mau-video/taxonomy";
import { mvPath } from "@/features/mau-video/site";

type Props = { params: Promise<{ cat: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ cat: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = categoryById((await params).cat);
  if (!cat) return {};
  return {
    title: `Prompt ${cat.name}`,
    description: `Thư viện prompt ${cat.name}: ${cat.desc}. Sao chép và dùng ngay, miễn phí.`,
    alternates: { canonical: mvPath.category(cat.id) }
  };
}

export default async function CategoryPage({ params }: Props) {
  const cat = categoryById((await params).cat);
  if (!cat) notFound();
  return (
    <>
      <PageHead title={cat.name} sub={cat.desc} Icon={cat.Icon} color={cat.color} action={<SavedLink />} />
      <Library prompts={withMedia(promptsByCategory(cat.id))} chipMode="tag" />
    </>
  );
}
