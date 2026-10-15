import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PromptCard } from "@/features/mau-video/components/PromptCard";
import { PromptDetail } from "@/features/mau-video/components/PromptDetail";
import { allPrompts, fillPrompt, promptBySlug, relatedPrompts } from "@/features/mau-video/prompts";
import { withMedia } from "@/features/mau-video/media";
import { platformById } from "@/features/mau-video/taxonomy";
import { MV_SITE_URL, mvPath } from "@/features/mau-video/site";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return allPrompts().map((p) => ({ slug: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = promptBySlug((await params).slug);
  if (!p) return {};
  const platforms = p.platforms.map((id) => platformById(id)?.name).filter(Boolean).join(", ");
  const description = `${p.desc} Prompt cho ${platforms}, sao chép và dùng ngay.`;
  return {
    title: p.title,
    description,
    alternates: { canonical: mvPath.prompt(p.id) },
    openGraph: { type: "article", title: p.title, description, url: `${MV_SITE_URL}${mvPath.prompt(p.id)}` }
  };
}

export default async function PromptPage({ params }: Props) {
  const found = promptBySlug((await params).slug);
  if (!found) notFound();
  const [p] = withMedia([found]);
  const related = withMedia(relatedPrompts(p));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: p.title,
    description: p.desc,
    inLanguage: "vi",
    keywords: p.tags.join(", "),
    text: fillPrompt(p),
    url: `${MV_SITE_URL}${mvPath.prompt(p.id)}`,
    publisher: { "@type": "Organization", name: "AIOMMO Studio" }
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PromptDetail p={p} />
      {related.length > 0 && (
        <>
          <div className="mv-section-title"><h2>Prompt liên quan</h2></div>
          <div className="mv-grid">{related.map((r) => <PromptCard key={r.id} p={r} />)}</div>
        </>
      )}
    </>
  );
}
