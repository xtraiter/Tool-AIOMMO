import { NextRequest, NextResponse } from "next/server";
import { ytDlp } from "@/lib/ytdlp";
import { assertPublicHttpUrl, safeFetchPage } from "@/lib/safeUrl";
import { rateLimited } from "@/lib/rateLimit";
import { detectPlatform } from "@/lib/platforms";
import { mediaProxyUrl } from "@/lib/signedUrl";
import { extractTikTokPhotos } from "@/lib/tiktokPhotos";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic"]);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

type Item = { url: string; thumbnail: string; title: string; ext: string };

function extOf(u: string, fallback = "jpg") {
  const m = /\.(jpe?g|png|webp|gif|heic)(?:\?|$)/i.exec(u);
  return (m ? m[1] : fallback).toLowerCase().replace("jpeg", "jpg");
}

function toItem(src: string, title: string, index: number): Item {
  const ext = extOf(src);
  const name = `${title.replace(/[^\w]+/g, "_").slice(0, 40) || "image"}_${index + 1}.${ext}`;
  return { url: mediaProxyUrl(src, name, true), thumbnail: mediaProxyUrl(src), title, ext };
}

export async function POST(req: NextRequest) {
  if (rateLimited(req, "album")) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Vui lòng cung cấp URL hợp lệ." }, { status: 400 });
    }

    let safe = await assertPublicHttpUrl(url);
    let platform = detectPlatform(safe.href);
    console.log(`[API/album] ${platform.name}: ${safe.href}`);

    // TikTok photo posts: yt-dlp does not support them, so read the page data directly.
    if (platform.id === "tiktok") {
      try {
        const page = await safeFetchPage(safe.href, { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" });
        const photos = extractTikTokPhotos(page.text);
        if (photos) {
          return NextResponse.json({
            platform: platform.name,
            title: photos.title,
            items: photos.images.map((src, i) => toItem(src, photos.title, i)),
          });
        }
        safe = await assertPublicHttpUrl(page.url); // resolved short link (vt./vm.tiktok.com)
      } catch { /* fall through to yt-dlp */ }
    }

    const { stdout } = await ytDlp(["--dump-single-json", "--no-warnings", "--flat-playlist"], safe.href);
    const data = JSON.parse(stdout);
    const entries: any[] = Array.isArray(data.entries) && data.entries.length ? data.entries : [data];
    const title: string = data.title || "Album";

    const images: string[] = [];
    for (const e of entries) {
      const direct = typeof e.url === "string" && IMAGE_EXT.has(String(e.ext || "").toLowerCase()) ? e.url : "";
      const bestThumb = Array.isArray(e.thumbnails) && e.thumbnails.length
        ? [...e.thumbnails].sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0]?.url
        : "";
      const isImageEntry = direct || (!e.formats?.some((f: any) => f.vcodec && f.vcodec !== "none") && !e.duration);
      const src = direct || (isImageEntry ? e.thumbnail || bestThumb : "");
      if (src && !images.includes(src)) images.push(src);
    }

    if (images.length === 0) {
      return NextResponse.json(
        { error: "Không tìm thấy ảnh nào. Nếu link này là video, hãy dùng công cụ \"Tải Video\"." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      platform: platform.name,
      title,
      items: images.map((src, i) => toItem(src, title, i)),
    });
  } catch (error: any) {
    console.error("[API/album] Error:", error);
    return NextResponse.json({ error: "Đã xảy ra lỗi: " + (error.message || "Unknown error") }, { status: 500 });
  }
}
