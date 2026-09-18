import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { safeFetch } from "@/lib/safeUrl";
import { verifyUrl } from "@/lib/signedUrl";
import { rateLimited } from "@/lib/rateLimit";
import { platformReferer } from "@/lib/platforms";
import { cleanName, contentDisposition } from "@/lib/filename";

export const dynamic = "force-dynamic";

const MAX_BYTES = 60 * 1024 * 1024;

// Streams a media URL that this server itself issued (HMAC-signed), so it
// cannot be used as an open proxy. Needed because CDNs block hotlinking/CORS.
export async function GET(req: NextRequest) {
  if (rateLimited(req, "media", 300)) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu." }, { status: 429 });
  }
  const p = req.nextUrl.searchParams;
  const src = p.get("src") || "";
  if (!verifyUrl(src, p.get("sig") || "")) {
    return NextResponse.json({ error: "Liên kết không hợp lệ hoặc đã hết hạn." }, { status: 403 });
  }
  try {
    const referer = platformReferer(src);
    const { res } = await safeFetch(src, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      ...(referer ? { Referer: referer } : {}),
    }, 30000);
    const type = res.headers.get("content-type") || "application/octet-stream";
    const len = Number(res.headers.get("content-length") || 0);
    if (!res.ok || !res.body) return NextResponse.json({ error: "Nguồn không phản hồi." }, { status: 502 });
    if (!/^(image|video|audio)\//.test(type) && !type.startsWith("application/octet-stream")) {
      return NextResponse.json({ error: "Loại nội dung không được hỗ trợ." }, { status: 415 });
    }
    if (len > MAX_BYTES) return NextResponse.json({ error: "File quá lớn." }, { status: 413 });

    const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "private, max-age=600" };
    if (len) headers["Content-Length"] = String(len);
    if (p.get("dl")) {
      const name = cleanName(p.get("name") || "download");
      headers["Content-Disposition"] = contentDisposition(name);
    }
    return new Response(res.body, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Không tải được nội dung." }, { status: 502 });
  }
}
