import { NextRequest, NextResponse } from "next/server";
import { ytDlp } from "@/lib/ytdlp";
import { assertPublicHttpUrl, safeFetchText } from "@/lib/safeUrl";
import { rateLimited } from "@/lib/rateLimit";
import { parseTikTokShop, type ProductInfo } from "@/lib/tiktokShop";
import { safeFetchPage } from "@/lib/safeUrl";
import { mediaProxyUrl } from "@/lib/signedUrl";
import { detectPlatform as detectSite } from "@/lib/platforms";

// Detect platform from URL
function detectPlatform(url: string): "shopee" | "tiktok_shop" | "lazada" | "unknown" {
  if (url.includes("shopee.vn") || url.includes("shopee.com")) return "shopee";
  if (url.includes("tiktok.com") && (url.includes("item") || url.includes("/product"))) return "tiktok_shop";
  if (url.includes("lazada.vn") || url.includes("lazada.com")) return "lazada";
  return "unknown";
}

async function scrapeShopee(url: string) {
  // Shopee embeds data in __NEXT_DATA__ or window.__data__
  // Use curl with browser-like headers to fetch raw HTML
  const stdout = await safeFetchText(url, { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36", "Accept-Language": "vi-VN,vi;q=0.9" });

  // Try to extract __NEXT_DATA__
  const nextDataMatch = stdout.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    const nextData = JSON.parse(nextDataMatch[1]);
    const props = nextData?.props?.pageProps?.initialData?.data?.pdpLayout;
    if (props) {
      const basicInfo = props?.components?.find((c: any) => c?.componentType === "NORMAL" && c?.name === "product_header");
      // fallback: just return partial parse
    }
  }

  // Shopee serves an empty app shell / verification page to server-side requests.
  const ogTitle = stdout.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
  if (!ogTitle) {
    throw new Error(
      "Shopee đang chặn truy cập tự động từ máy chủ (yêu cầu đăng nhập/xác minh), nên không thể lấy dữ liệu sản phẩm từ link này."
    );
  }
  const title = ogTitle;
  const description = stdout.match(/<meta name="description" content="([^"]+)"/)?.[1] || "";
  const image = stdout.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || "";
  const price = stdout.match(/itemPrice.*?"([\d,\.]+)"/)?.[1] || 
                stdout.match(/"price":\s*([\d]+)/)?.[1] || "";

  // Find more images from og:image tags
  const imgMatches = [...stdout.matchAll(/<meta property="og:image(?::[^"]+)?" content="([^"]+)"/g)];
  const images = [...new Set(imgMatches.map(m => m[1]).filter(Boolean))].slice(0, 12);
  if (image && !images.includes(image)) images.unshift(image);

  return {
    platform: "Shopee",
    title: decodeURIComponent(title.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')),
    price: price ? `${Number(price).toLocaleString("vi-VN")}đ` : "Xem trên Shopee",
    description: description.replace(/\\n/g, "\n"),
    images: images.slice(0, 9),
    videos: [],
    source_url: url,
  };
}

async function scrapeTikTokShop(url: string) {
  // Use yt-dlp for TikTok product pages — may not work perfectly but tries
  try {
    const { stdout } = await ytDlp(["--dump-json", "--no-warnings"], url);
    const data = JSON.parse(stdout.trim());

    return {
      platform: "TikTok Shop",
      title: data.title || "Sản phẩm TikTok Shop",
      price: "Xem trên TikTok Shop",
      description: data.description || "",
      images: data.thumbnail ? [data.thumbnail] : [],
      videos: data.url ? [data.url] : [],
      source_url: url,
    };
  } catch {
    // Fallback to curl
    return await curlFallback(url, "TikTok Shop");
  }
}

const BOT_WALL = /security check|captcha|verify (you|that)|access denied|just a moment|are you a robot|unusual traffic|attention required|xác minh|kiểm tra bảo mật/i;

async function curlFallback(url: string, platform: string) {
  const stdout = await safeFetchText(url, { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15" });

  const title = stdout.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
                stdout.match(/<title>([^<]+)<\/title>/)?.[1] || "Sản phẩm";
  const description = stdout.match(/<meta name="description" content="([^"]+)"/)?.[1] || "";
  const image = stdout.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || "";

  if (BOT_WALL.test(title)) {
    throw new Error(`${platform} đang chặn truy cập tự động từ máy chủ (trang "${title.trim().slice(0, 40)}"), nên không lấy được dữ liệu từ link này.`);
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

export async function POST(req: NextRequest) {
  if (rateLimited(req, "ecommerce")) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "Vui lòng cung cấp URL sản phẩm hợp lệ." }, { status: 400 });
    }

    const safe = await assertPublicHttpUrl(url);
    console.log(`[API/ecommerce] Đang scrape: ${safe.href}`);

    // TikTok Shop product pages embed their data for desktop browsers; the mobile
    // layout is what triggers the "Security Check" wall, so ask for the desktop one.
    const site0 = detectSite(safe.href);
    if (site0.id === "tiktok" || site0.id === "tiktokshop") {
      try {
        const page = await safeFetchPage(safe.href, {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        });
        const product = parseTikTokShop(page.text);
        if (product) {
          const proxy = (u?: string) => (u ? mediaProxyUrl(u) : u);
          const out: ProductInfo = {
            ...product,
            images: product.images.map((u) => mediaProxyUrl(u)),
            videos: product.videos.map((u) => mediaProxyUrl(u)),
            variants: product.variants.map((v) => ({ ...v, options: v.options.map((o) => ({ ...o, image: proxy(o.image) })) })),
            skus: product.skus.map((k) => ({ ...k, image: proxy(k.image) })),
            source_url: page.url,
          };
          return NextResponse.json(out);
        }
      } catch { /* fall through to the generic path below */ }
    }

    const platform = detectPlatform(url);

    let result;
    if (platform === "shopee") {
      result = await scrapeShopee(url);
    } else if (platform === "tiktok_shop") {
      result = await scrapeTikTokShop(url);
    } else {
      const site = detectSite(url);
      result = await curlFallback(url, site.id === "unknown" ? "E-Commerce" : site.name);
    }

    // Product CDNs block hotlinking, so route images through the signed media proxy.
    result.images = (result.images as string[])
      .filter((u) => typeof u === "string" && u.startsWith("http"))
      .map((u) => mediaProxyUrl(u));
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API/ecommerce] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi trích xuất: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
