import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { ytDlp } from "@/lib/ytdlp";

const execAsync = promisify(exec);

// Detect platform from URL
function detectPlatform(url: string): "shopee" | "tiktok_shop" | "lazada" | "unknown" {
  if (url.includes("shopee.vn") || url.includes("shopee.com")) return "shopee";
  if (url.includes("tiktok.com") && url.includes("item")) return "tiktok_shop";
  if (url.includes("lazada.vn") || url.includes("lazada.com")) return "lazada";
  return "unknown";
}

async function scrapeShopee(url: string) {
  // Shopee embeds data in __NEXT_DATA__ or window.__data__
  // Use curl with browser-like headers to fetch raw HTML
  const curlCmd = `curl -sL --max-time 20 -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" -H "Accept-Language: vi-VN,vi;q=0.9" "${url}"`;
  const { stdout } = await execAsync(curlCmd, { timeout: 25000 });

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

  // Fallback: extract og: meta tags
  const title = stdout.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || "Không thể lấy tên sản phẩm";
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
    const { stdout } = await ytDlp(`--dump-json --no-warnings "${url}"`);
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

async function curlFallback(url: string, platform: string) {
  const curlCmd = `curl -sL --max-time 20 -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15" "${url}"`;
  const { stdout } = await execAsync(curlCmd, { timeout: 25000 });

  const title = stdout.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ||
                stdout.match(/<title>([^<]+)<\/title>/)?.[1] || "Sản phẩm";
  const description = stdout.match(/<meta name="description" content="([^"]+)"/)?.[1] || "";
  const image = stdout.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || "";

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
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "Vui lòng cung cấp URL sản phẩm hợp lệ." }, { status: 400 });
    }

    console.log(`[API/ecommerce] Đang scrape: ${url}`);

    const platform = detectPlatform(url);

    let result;
    if (platform === "shopee") {
      result = await scrapeShopee(url);
    } else if (platform === "tiktok_shop") {
      result = await scrapeTikTokShop(url);
    } else {
      result = await curlFallback(url, "E-Commerce");
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API/ecommerce] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi trích xuất: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
