import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const job = getJob(req.nextUrl.searchParams.get("id") || "");
  if (!job) return NextResponse.json({ error: "Phiên tải không tồn tại hoặc đã hết hạn." }, { status: 404 });
  return NextResponse.json({
    status: job.status,
    percent: Math.round(job.percent),
    stage: job.stage,
    error: job.error,
    size: job.size,
  });
}
