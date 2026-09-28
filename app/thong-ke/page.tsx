import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";

export const metadata: Metadata = {
  title: "Thống kê hành vi · AIOMMO Studio",
  robots: { index: false, follow: false }
};

export default function StatsPage() {
  return <AnalyticsDashboard />;
}
