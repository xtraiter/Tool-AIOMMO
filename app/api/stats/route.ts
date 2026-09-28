import { NextResponse } from "next/server";
import { publicStats } from "@/lib/analytics/store";

export const dynamic = "force-dynamic";

// Footer counters: total visits and people currently on the site.
export function GET() {
  return NextResponse.json(publicStats(), { headers: { "Cache-Control": "no-store" } });
}
