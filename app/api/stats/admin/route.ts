import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/rateLimit";
import { adminSummary, heatmap } from "@/lib/analytics/store";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const expected = process.env.ANALYTICS_ADMIN_KEY ?? "";
  const given = req.headers.get("x-admin-key") ?? "";
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function GET(req: NextRequest) {
  if (rateLimited(req, "stats-admin", 30)) {
    return NextResponse.json({ error: "Thao tác quá nhanh, thử lại sau." }, { status: 429 });
  }
  if (!process.env.ANALYTICS_ADMIN_KEY) {
    return NextResponse.json({ error: "Chưa cấu hình ANALYTICS_ADMIN_KEY trên server." }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Sai khóa quản trị." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const heatPage = searchParams.get("heat");
  if (heatPage) {
    return NextResponse.json(heatmap(heatPage, searchParams.get("dev") ?? "d"), { headers: { "Cache-Control": "no-store" } });
  }
  const days = Math.min(120, Math.max(1, Number(searchParams.get("days")) || 7));
  return NextResponse.json(adminSummary(days), { headers: { "Cache-Control": "no-store" } });
}
