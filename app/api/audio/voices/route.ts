import { NextResponse } from "next/server";
import { VOICES } from "@/lib/capcutVoices";

// CapCut voice list for other front-ends on this domain (e.g. the OpenReel editor at /dung-video-pro),
// so the list lives in one place: lib/capcutVoices.ts.
export function GET() {
  return NextResponse.json(VOICES, { headers: { "Cache-Control": "public, max-age=3600" } });
}
