import { NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/rateLimit";
import { record } from "@/lib/analytics/store";
import type { TrackPayload } from "@/lib/analytics/types";

const MAX_BODY_BYTES = 32_000;

export async function POST(req: NextRequest) {
  if (rateLimited(req, "track", 120)) return new NextResponse(null, { status: 429 });
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
    const body = JSON.parse(text) as TrackPayload;
    if (typeof body?.vid !== "string" || !Array.isArray(body.ev)) return new NextResponse(null, { status: 400 });
    record(body.vid, body.ev.slice(0, 50));
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
