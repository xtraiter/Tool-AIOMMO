import { NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/rateLimit";
import { mediaProxyUrl } from "@/lib/signedUrl";

// Product media collected in the user's own browser (bookmarklet) still needs the
// hotlink-proof proxy. Only well-known shop CDNs are signed, so this can't be
// abused as an open proxy.
const CDN_DOMAINS = [
  "susercontent.com", "shopeemobile.com", "shopee.vn",
  "tiktokcdn.com", "tiktokcdn-us.com", "ibyteimg.com", "byteimg.com", "ibytedtos.com",
  "alicdn.com", "lazcdn.com",
];

function allowed(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && CDN_DOMAINS.some((d) => url.hostname === d || url.hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (rateLimited(req, "ecommerce-media", 30)) {
    return NextResponse.json({ error: "Thao tác quá nhanh." }, { status: 429 });
  }
  const { images = [], videos = [] } = await req.json().catch(() => ({}));
  const sign = (list: unknown) =>
    (Array.isArray(list) ? list : []).filter(allowed).slice(0, 40).map((u) => mediaProxyUrl(u));
  return NextResponse.json({ images: sign(images), videos: sign(videos) });
}
