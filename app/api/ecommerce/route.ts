import { NextRequest, NextResponse } from "next/server";
import { assertPublicHttpUrl, safeFetchText, safeFetchPage } from "@/lib/safeUrl";
import { rateLimited } from "@/lib/rateLimit";
import { parseTikTokShop, type ProductInfo } from "@/lib/tiktokShop";
import { mediaProxyUrl } from "@/lib/signedUrl";
import { detectPlatform as detectSite } from "@/lib/platforms";

// Detect platform from URL
function detectPlatform(url: string): "shopee" | "tiktok_shop" | "lazada" | "unknown" {
  if (url.includes("shopee.vn") || url.includes("shopee.com")) return "shopee";
  if (
    url.includes("shop.tiktok.com") ||
    (url.includes("tiktok.com") && (url.includes("/product") || url.includes("/pdp/")))
  )
    return "tiktok_shop";
  if (url.includes("lazada.vn") || url.includes("lazada.com")) return "lazada";
  return "unknown";
}

// Desktop Chrome UA
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
// Mobile UA (Android)
const UA_MOBILE =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const BASE_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

/** Extract shopid & itemid from any Shopee URL format */
function parseShopeeIds(url: string): { shopid: string; itemid: string } | null {
  // Format: /product/{shopid}/{itemid}
  let m = url.match(/\/product\/(\d+)\/(\d+)/);
  if (m) return { shopid: m[1], itemid: m[2] };
  // Format: -i.{shopid}.{itemid} (standard product URL)
  m = url.match(/-i\.(\d+)\.(\d+)/);
  if (m) return { shopid: m[1], itemid: m[2] };
  // Format: i.{shopid}.{itemid} in the path
  m = url.match(/[?&i]\.(\d+)\.(\d+)/);
  if (m) return { shopid: m[1], itemid: m[2] };
  return null;
}

/** Extract product title from Shopee URL slug */
function titleFromShopeeUrl(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    // Pattern: /SlugWithDashes-i.shopid.itemid
    const m = decoded.match(/shopee\.vn\/([^/]+)-i\.\d+\.\d+/);
    if (m) {
      return m[1]
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    // /product/ format - no slug
    const m2 = decoded.match(/shopee\.vn\/([^/?#]+)/);
    if (m2 && !m2[1].startsWith("product")) {
      return m2[1].replace(/-/g, " ").trim();
    }
  } catch {}
  return "";
}

/** Try to call Shopee API v4/item/get (works from VN IP) */
async function callShopeeApiV4(shopid: string, itemid: string): Promise<any | null> {
  const apiUrl = `https://shopee.vn/api/v4/item/get?itemid=${itemid}&shopid=${shopid}`;
  const apiHeaders = {
    "User-Agent": UA_MOBILE,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9",
    Referer: `https://shopee.vn/product/${shopid}/${itemid}`,
    Origin: "https://shopee.vn",
    "x-api-source": "rn",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  };
  try {
    const { text } = await safeFetchPage(apiUrl, apiHeaders, 15000);
    const data = JSON.parse(text);
    if (data?.item?.name) return data.item;
  } catch {}
  return null;
}

/** Parse product data from Shopee's embedded __STORE__ or initialState JSON */
function parseShopeeEmbeddedData(html: string): {
  title?: string;
  price?: string;
  description?: string;
  images?: string[];
  shopName?: string;
  location?: string;
} | null {
  try {
    // Parse the __STORE__ JSON (escaped string inside JSON.parse(...))
    const storeMatch = html.match(/window\.__STORE__=JSON\.parse\("((?:[^"\\]|\\.)*)"\)/);
    if (storeMatch) {
      const unescaped = storeMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t");
      const store = JSON.parse(unescaped);
      const items = store?.item?.items || {};
      const item = Object.values(items)[0] as any;
      if (item?.name) {
        const images: string[] = (item.images || []).map(
          (id: string) => `https://down-vn.img.susercontent.com/file/${id}`
        );
        const priceCents = item.price || item.price_min;
        const price = priceCents ? `${(priceCents / 100000).toLocaleString("vi-VN")}đ` : "";
        return {
          title: item.name,
          price,
          description: item.description || "",
          images,
          shopName: item.shop_name || "",
          location: item.shop_location || "",
        };
      }
    }
  } catch {}

  try {
    // Parse initialState (newer mobile pages)
    const initMatch = html.match(/<script[^>]*>\s*(\{"initialState":.*?)\s*<\/script>/s);
    if (initMatch) {
      const data = JSON.parse(initMatch[1]);
      const pdp = data?.initialState?.DOMAIN_PDP?.data?.PDP_BFF_DATA?.cachedMap || {};
      const entry = Object.values(pdp)[0] as any;
      if (entry?.product_model?.name) {
        const pm = entry.product_model;
        const images: string[] = (pm.images || []).map((img: any) => img?.url_list?.[0] || img?.url || "").filter(Boolean);
        return {
          title: pm.name,
          price: "",
          description: pm.description || "",
          images,
        };
      }
    }
  } catch {}

  return null;
}

/** Build Shopee image URL from image hash ID */
function shopeeImgUrl(id: string): string {
  return `https://down-vn.img.susercontent.com/file/${id}`;
}

async function scrapeShopee(url: string) {
  // === Strategy 1: Direct API call (works on VN IP) ===
  const ids = parseShopeeIds(url);
  if (ids) {
    const item = await callShopeeApiV4(ids.shopid, ids.itemid);
    if (item) {
      const images = (item.images || []).map((id: string) => shopeeImgUrl(id));
      const priceCents = item.price || item.price_min;
      const priceFormatted = priceCents
        ? `${(priceCents / 100000).toLocaleString("vi-VN")}đ`
        : "Liên hệ shop";
      const priceMaxCents = item.price_max;
      const priceText =
        priceMaxCents && priceMaxCents !== priceCents
          ? `${(priceCents / 100000).toLocaleString("vi-VN")}đ - ${(priceMaxCents / 100000).toLocaleString("vi-VN")}đ`
          : priceFormatted;

      // Parse tier variations (SKUs)
      const tierVars = item.tier_variations || [];
      const models = item.models || [];
      const variants = tierVars.map((tv: any) => ({
        name: tv.name,
        options: (tv.options || []).map((opt: string, i: number) => ({
          name: opt,
          image: tv.images?.[i] ? shopeeImgUrl(tv.images[i]) : undefined,
        })),
      }));
      const skus = models.map((m: any) => {
        const priceC = m.price;
        const optionIds = m.extinfo?.tier_index || [];
        const optionNames = optionIds
          .map((idx: number, vi: number) => tierVars[vi]?.options?.[idx])
          .filter(Boolean)
          .join(" / ");
        return {
          name: optionNames || m.name || "Mặc định",
          price: priceC ? `${(priceC / 100000).toLocaleString("vi-VN")}đ` : "—",
          stock: m.stock !== undefined ? m.stock : undefined,
        };
      });

      // Description
      let description = item.description || "";

      // Video
      const videos: string[] = [];
      if (item.video_info_list) {
        for (const v of item.video_info_list as any[]) {
          const vu = v?.default_format?.url;
          if (vu && typeof vu === "string" && vu.startsWith("http")) videos.push(vu);
        }
      }

      return {
        platform: "Shopee",
        title: item.name.trim(),
        price: priceText,
        description,
        images: images.slice(0, 12),
        videos,
        variants,
        skus,
        sold: item.historical_sold ? String(item.historical_sold) : undefined,
        shopName: item.shop_name || "",
        location: item.shop_location || "",
        source_url: url,
      };
    }
  }

  // === Strategy 2: Fetch HTML and parse embedded data ===
  let html = "";
  try {
    html = await safeFetchText(url, { "User-Agent": UA_MOBILE, ...BASE_HEADERS });
  } catch {
    try {
      html = await safeFetchText(url, { "User-Agent": UA_DESKTOP, ...BASE_HEADERS });
    } catch (e: any) {
      throw new Error("Không thể tải trang sản phẩm Shopee: " + e.message);
    }
  }

  // Try to parse embedded data
  const embedded = parseShopeeEmbeddedData(html);
  if (embedded?.title) {
    return {
      platform: "Shopee",
      title: embedded.title,
      price: embedded.price || "Xem trên Shopee",
      description: embedded.description || "",
      images: (embedded.images || []).slice(0, 12),
      videos: [],
      shopName: embedded.shopName || "",
      location: embedded.location || "",
      source_url: url,
    };
  }

  // === Strategy 3: Extract title from URL slug + OG images ===
  const slugTitle = titleFromShopeeUrl(url);
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];

  // Detect bot wall (security check pages)
  const pageTitle = html.match(/<title>([^<]+)<\/title>/)?.[1] || "";
  const effectiveTitle = (ogTitle && !ogTitle.includes("Shopee Việt Nam") && !ogTitle.includes("Shopee Vietnam"))
    ? ogTitle
    : slugTitle;

  if (!effectiveTitle || /security check|captcha|verify|xác minh/i.test(effectiveTitle)) {
    if (slugTitle) {
      // We have slug title but may not be able to confirm it's a valid product
      // Return with limited data and let the UI show the bookmarklet
    } else {
      throw new Error(
        "Shopee đang chặn truy cập tự động từ máy chủ (yêu cầu đăng nhập/xác minh), nên không thể lấy dữ liệu sản phẩm từ link này."
      );
    }
  }

  // Try to get images from og:image tags
  const imgMatches = [...html.matchAll(/<meta property="og:image(?:[^"]+)?" content="([^"]+)"/g)];
  const ogImages = [...new Set(imgMatches.map((m) => m[1]).filter((u) => u.includes("http")))];

  // Get description from og:description
  const description =
    html.match(/<meta name="description" content="([^"]+)"/)?.[1] ||
    html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ||
    "";

  const finalTitle = effectiveTitle || "Sản phẩm Shopee";

  return {
    platform: "Shopee",
    title: decodeURIComponent(
      finalTitle.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    ),
    price: "Xem trên Shopee",
    description: description.replace(/\\n/g, "\n"),
    images: ogImages.slice(0, 9),
    videos: [],
    shopName: "",
    location: "",
    source_url: url,
    _partial: !embedded?.title && !ogImages.length,
  };
}

async function scrapeTikTokShop(url: string) {
  // Strategy 1: Desktop layout embeds __MODERN_ROUTER_DATA__ JSON
  try {
    const page = await safeFetchPage(url, { "User-Agent": UA_DESKTOP, ...BASE_HEADERS });
    const product = parseTikTokShop(page.text);
    if (product) {
      const proxy = (u?: string) => (u ? mediaProxyUrl(u) : u);
      const out: ProductInfo = {
        ...product,
        images: product.images.map((u) => mediaProxyUrl(u)),
        videos: product.videos.map((u) => mediaProxyUrl(u)),
        variants: product.variants.map((v) => ({
          ...v,
          options: v.options.map((o) => ({ ...o, image: proxy(o.image) })),
        })),
        skus: product.skus.map((k) => ({ ...k, image: proxy(k.image) })),
        source_url: page.url,
        __proxied: true,
      } as any;
      return out;
    }
    // If we got a page but couldn't parse it, check if it's a bot wall
    const pageTitle = page.text.match(/<title>([^<]+)<\/title>/)?.[1] || "";
    if (/security check|captcha|verify|access denied|just a moment/i.test(pageTitle + page.text.slice(0, 3000))) {
      throw new Error(
        `TikTok Shop đang chặn truy cập tự động từ máy chủ (trang "Security Check"), nên không lấy được dữ liệu từ link này.`
      );
    }
  } catch (e: any) {
    if (e.message?.includes("chặn") || e.message?.includes("Security Check")) throw e;
    // Otherwise fall through to Strategy 2
  }

  // Strategy 2: Try with mobile UA
  try {
    const page = await safeFetchPage(url, { "User-Agent": UA_MOBILE, "Accept-Language": "vi-VN,vi;q=0.9" });
    const product = parseTikTokShop(page.text);
    if (product) {
      const proxy = (u?: string) => (u ? mediaProxyUrl(u) : u);
      return {
        ...product,
        images: product.images.map((u) => mediaProxyUrl(u)),
        videos: product.videos.map((u) => mediaProxyUrl(u)),
        variants: product.variants.map((v) => ({
          ...v,
          options: v.options.map((o) => ({ ...o, image: proxy(o.image) })),
        })),
        skus: product.skus.map((k) => ({ ...k, image: proxy(k.image) })),
        source_url: url,
        __proxied: true,
      };
    }
    const pageTitle = page.text.match(/<title>([^<]+)<\/title>/)?.[1] || "";
    if (/security check|captcha|verify|access denied|just a moment/i.test(pageTitle)) {
      throw new Error(
        `TikTok Shop đang chặn truy cập tự động từ máy chủ (trang "Security Check"), nên không lấy được dữ liệu từ link này.`
      );
    }
  } catch (e: any) {
    if (e.message?.includes("chặn") || e.message?.includes("Security Check")) throw e;
  }

  throw new Error(
    `TikTok Shop đang chặn truy cập tự động từ máy chủ (trang "Security Check"), nên không lấy được dữ liệu từ link này.`
  );
}

const BOT_WALL =
  /security check|captcha|verify (you|that)|access denied|just a moment|are you a robot|unusual traffic|attention required|xác minh|kiểm tra bảo mật/i;

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

    // Route images through the signed media proxy to avoid hotlink blocking
    // (skip if already proxied by scrapeTikTokShop)
    if (result.images && !result.__proxied) {
      result.images = (result.images as string[])
        .filter((u) => typeof u === "string" && u.startsWith("http"))
        .map((u) => mediaProxyUrl(u));
    }
    if (result.videos && !result.__proxied) {
      result.videos = (result.videos as string[])
        .filter((u) => typeof u === "string" && u.startsWith("http"))
        .map((u) => mediaProxyUrl(u));
    }
    delete result.__proxied;
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API/ecommerce] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi trích xuất: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
