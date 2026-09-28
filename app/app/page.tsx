import { permanentRedirect } from "next/navigation";
import { pathForSlug } from "@/lib/features";

type Props = {
  searchParams: Promise<{ tool?: string }>;
};

// Legacy entry point (/app?tool=video.cut) — kept only so old bookmarks and
// shared links land on the new short path (/cat-video).
export default async function AppPage({ searchParams }: Props) {
  const params = await searchParams;
  permanentRedirect(pathForSlug(params.tool));
}
