import PortalPage from "@/components/PortalPage";

type Props = {
  searchParams: Promise<{ tool?: string }>;
};

export default async function AppPage({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalPage initialSlug={params.tool} />;
}
