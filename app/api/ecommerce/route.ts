import { NextRequest, NextResponse } from "next/server";
import { assertPublicHttpUrl, safeFetchText } from "@/lib/safeUrl";
import { rateLimited } from "@/lib/rateLimit";
import { parseTikTokShop, parseTikTokProductUrl, type ProductInfo } from "@/lib/tiktokShop";
import { parseShopee, parseShopeeIds } from "@/lib/shopee";
import { browserFetch } from "@/lib/browserFetch";
import { mediaProxyUrl } from "@/lib/signedUrl";
import { detectPlatform as detectSite } from "@/lib/platforms";

// Detect platform from URL
function detectPlatform(url: string): "shopee" | "tiktok_shop" | "lazada" | "unknown" {
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  if (/(^|\.)(shopee\.vn|shopee\.com|shp\.ee)$/.test(host)) return "shopee";
  if (
    host === "shop.tiktok.com" ||
    host === "vt.tiktok.com" ||
    (host.endsWith("tiktok.com") && /\/(product|pdp|view\/product)\//.test(url))
  )
    return "tiktok_shop";
  if (url.includes("lazada.vn") || url.includes("lazada.com")) return "lazada";
  return "unknown";
}

// Desktop Chrome UA — short links answer it with a plain 301 (mobile gets an "open in app" page)
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
// Mobile UA (Android)
const UA_MOBILE =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const BOT_WALL =
  /security check|captcha|verify (you|that)|access denied|just a moment|are you a robot|unusual traffic|attention required|xác minh|kiểm tra bảo mật/i;

type OgInfo = { title?: string; image?: string };

/**
 * Follows a short link (s.shopee.vn, shp.ee, vt.tiktok.com) one hop at a time
 * until the URL carries product ids. TikTok's redirect also carries og_info
 * (title + cover), kept as a last resort if the product page is walled.
 */
async function resolveShortLink(href: string, hasIds: (u: string) => boolean): Promise<{ href: string; og: OgInfo }> {
  const og: OgInfo = {};
  let current = href;
  for (let hop = 0; hop < 5 && !hasIds(current); hop++) {
    const u = await assertPublicHttpUrl(current);
    const res = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA_DESKTOP }, signal: AbortSignal.timeout(15000) });
    await res.body?.cancel();
    const loc = res.headers.get("location");
    if (!loc) break;
    current = new URL(loc, u).href;
    try {
      const info = JSON.parse(new URL(current).searchParams.get("og_info") || "null");
      if (info?.title) og.title = info.title;
      if (info?.image) og.image = String(info.image).replace(/~tplv-[^?]+/, "");
    } catch {}
  }
  return { href: current, og };
}

async function scrapeShopee(url: string): Promise<ProductInfo> {
  const { href } = await resolveShortLink(url, (u) => !!parseShopeeIds(u));
  const ids = parseShopeeIds(href);
  if (!ids) throw new Error("Không nhận ra mã sản phẩm trong link Shopee này.");

  const canonical = `https://shopee.vn/product/${ids.shopid}/${ids.itemid}`;
  const page = await browserFetch(canonical);
  const product = parseShopee(page.text);
  if (product) return { ...product, source_url: canonical };

  if (page.text.includes("product-not-exist")) {
    throw new Error("Sản phẩm này không tồn tại hoặc đã bị xóa trên Shopee.");
  }
  const title = page.text.match(/<title>([^<]*)<\/title>/)?.[1] || "";
  if (BOT_WALL.test(title) || page.status === 403) {
    throw new Error("Shopee đang chặn truy cập tự động từ máy chủ, vui lòng thử lại sau ít phút.");
  }
  throw new Error("Không tìm thấy sản phẩm. Có thể sản phẩm đã bị xóa hoặc link không đúng.");
}

async function scrapeTikTokShop(url: string): Promise<ProductInfo> {
  const { href, og } = await resolveShortLink(url, (u) => !!parseTikTokProductUrl(u));
  const ids = parseTikTokProductUrl(href);
  if (!ids) throw new Error("Không nhận ra mã sản phẩm trong link TikTok Shop này.");

  // The bare /pdp/{id} URL serves the full page; the tracking params on
  // shared links (_d, chain_key…) trigger TikTok's "Security Check" wall.
  const canonical = `https://shop.tiktok.com/${ids.region}/pdp/${ids.id}`;
  const page = await browserFetch(canonical);
  const product = parseTikTokShop(page.text);
  if (product) return { ...product, source_url: canonical };

  if (og.title) {
    return {
      platform: "TikTok Shop",
      title: og.title,
      price: "Xem trên TikTok Shop",
      description: "",
      images: og.image ? [og.image] : [],
      videos: [],
      variants: [],
      skus: [],
      specs: [],
      source_url: canonical,
    };
  }
  throw new Error("TikTok Shop đang chặn truy cập tự động từ máy chủ (trang \"Security Check\"), vui lòng thử lại sau ít phút.");
}

async function curlFallback(url: string, platform: string) {
  const stdout = await safeFetchText(url, { "User-Agent": UA_MOBILE });

  const title =
    stdout.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
    stdout.match(/<title>([^<]+)<\/title>/)?.[1] ||
    "Sản phẩm";
  const description = stdout.match(/<meta name="description" content="([^"]+)"/)?.[1] || "";
  const image = stdout.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || "";

  if (BOT_WALL.test(title)) {
    throw new Error(
      `${platform} đang chặn truy cập tự động từ máy chủ (trang "${title.trim().slice(0, 40)}"), nên không lấy được dữ liệu từ link này.`
    );
  }

  if (!stdout.match(/<meta property="og:title"/) && !stdout.match(/<title>[^<]+<\/title>/)) {
    throw new Error("Trang này không cung cấp thông tin sản phẩm cho truy cập tự động.");
  }

  return {
    platform,
    title: title.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").trim(),
    price: "Xem trực tiếp trên trang",
    description,
    images: image ? [image] : [],
    videos: [],
    source_url: url,
  };
}

/** Routes every media URL through the signed proxy to avoid hotlink blocking. */
function proxyMedia(result: any) {
  const p = (u?: string) => (typeof u === "string" && u.startsWith("http") ? mediaProxyUrl(u) : undefined);
  const list = (a?: string[]) => (a ?? []).map(p).filter((u): u is string => !!u);
  return {
    ...result,
    images: list(result.images),
    videos: list(result.videos),
    variants: result.variants?.length
      ? result.variants.map((v: any) => ({ ...v, options: v.options.map((o: any) => ({ ...o, image: p(o.image) })) }))
      : undefined,
    skus: result.skus?.length ? result.skus.map((k: any) => ({ ...k, image: p(k.image) })) : undefined,
    specs: result.specs?.length ? result.specs : undefined,
  };
}

export async function POST(req: NextRequest) {
  if (rateLimited(req, "ecommerce")) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }
  try {
    const body = await req.json();
    const rawInput = (body.url || "").trim();

    if (!rawInput || typeof rawInput !== "string") {
      return NextResponse.json({ error: "Vui lòng cung cấp URL sản phẩm hợp lệ." }, { status: 400 });
    }

    // Extract first URL if user pasted raw share text from mobile app
    const urlMatch = rawInput.match(/https?:\/\/[^\s]+/);
    const cleanUrl = urlMatch ? urlMatch[0] : rawInput;

    const safe = await assertPublicHttpUrl(cleanUrl);
    console.log(`[API/ecommerce] Đang scrape: ${safe.href}`);

    const platform = detectPlatform(safe.href);
    let result: any;
    if (platform === "shopee") {
      result = await scrapeShopee(safe.href);
    } else if (platform === "tiktok_shop") {
      result = await scrapeTikTokShop(safe.href);
    } else {
      const site = detectSite(safe.href);
      result = await curlFallback(safe.href, site.id === "unknown" ? "E-Commerce" : site.name);
    }

    if (!result?.title) {
      throw new Error("Không thể trích xuất dữ liệu từ đường dẫn này. Vui lòng kiểm tra lại liên kết.");
    }
    return NextResponse.json(proxyMedia(result));
  } catch (error: any) {
    console.error("[API/ecommerce] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi trích xuất: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
