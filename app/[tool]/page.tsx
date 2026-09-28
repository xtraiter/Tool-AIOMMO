import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PortalPage from "@/components/PortalPage";
import { featureBySlug, slugFromPath, toolPathSegments } from "@/lib/features";

type Props = {
  params: Promise<{ tool: string }>;
};

// Only the short tool paths from lib/features.ts exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return toolPathSegments().map((tool) => ({ tool }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tool } = await params;
  const feature = featureBySlug(slugFromPath(`/${tool}`));
  if (!feature) return {};
  return {
    title: `${feature.name} · AIOMMO Studio`,
    description: feature.description ?? undefined,
    alternates: { canonical: `/${tool}` }
  };
}

export default async function ToolPage({ params }: Props) {
  const { tool } = await params;
  if (!slugFromPath(`/${tool}`)) notFound();
  return <PortalPage />;
}
