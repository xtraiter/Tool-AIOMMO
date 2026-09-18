export type ProductVariant = { name: string; options: { name: string; image?: string }[] };
export type ProductSku = { name: string; price: string; stock?: number; image?: string };
export type ProductInfo = {
  platform: string;
  title: string;
  price: string;
  description: string;
  images: string[];
  videos: string[];
  variants: ProductVariant[];
  skus: ProductSku[];
  specs: { name: string; value: string }[];
  sold?: string;
  source_url?: string;
};

function findKey(o: any, key: string): any {
  if (o && typeof o === "object") {
    if (!Array.isArray(o) && key in o) return o[key];
    for (const v of Object.values(o)) {
      const r = findKey(v, key);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

const firstUrl = (img: any): string | undefined => {
  const u = img?.url_list?.[0] ?? img?.url ?? img?.play_addr?.url_list?.[0];
  return typeof u === "string" && u.startsWith("http") ? u : undefined;
};

/** Reads the product JSON that TikTok Shop embeds in its product page (desktop layout). */
export function parseTikTokShop(html: string): ProductInfo | null {
  const m = html.match(/<script[^>]*id="__MODERN_ROUTER_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data: any;
  try { data = JSON.parse(m[1]); } catch { return null; }

  const pm = findKey(data, "product_model");
  if (!pm?.name) return null;
  const price = findKey(data, "promotion_product_price");

  const images: string[] = [];
  const addImg = (u?: string) => { if (u && !images.includes(u)) images.push(u); };
  (pm.images ?? []).forEach((i: any) => addImg(firstUrl(i)));

  let description = "";
  try {
    const blocks = typeof pm.description === "string" ? JSON.parse(pm.description) : pm.description;
    for (const b of Array.isArray(blocks) ? blocks : []) {
      if (b?.type === "text") description += (b.text?.text ?? b.text ?? "") + "\n";
      else if (b?.type === "image") addImg(firstUrl(b.image));
    }
  } catch { /* description is optional */ }

  const videos: string[] = [];
  const vids = Array.isArray(pm.videos) ? pm.videos : pm.videos ? Object.values(pm.videos) : [];
  for (const v of vids as any[]) {
    const u = firstUrl(v) ?? v?.video_url ?? v?.main_url;
    if (typeof u === "string" && u.startsWith("http") && !videos.includes(u)) videos.push(u);
  }

  const symbol = price?.min_price?.currency_symbol ?? "₫";
  const fmt = (p: any) => (p?.sale_price_format ? `${p.sale_price_format}${symbol}` : "");
  const prices: number[] = Object.values<any>(price?.skus_price ?? {})
    .map((p) => Number(p.sale_price_decimal))
    .filter((n) => Number.isFinite(n));
  const min = fmt(price?.min_price);
  const max = prices.length ? Math.max(...prices).toLocaleString("vi-VN") + symbol : "";
  const priceText = min && max && min !== max ? `${min} - ${max}` : min || max;

  const variants: ProductVariant[] = (pm.sale_properties ?? []).map((p: any) => ({
    name: p.property_name,
    options: (p.property_values ?? []).map((v: any) => ({ name: v.property_value_name, image: firstUrl(v.image) })),
  }));
  (pm.sale_properties ?? []).forEach((p: any) => (p.property_values ?? []).forEach((v: any) => addImg(firstUrl(v.image))));

  const skus: ProductSku[] = (pm.skus ?? []).map((s: any) => ({
    name: (s.property_pairs ?? []).map((x: any) => x.sku_property_value_name).join(" / ") || s.sku_name || "Mặc định",
    price: fmt(price?.skus_price?.[s.sku_id]),
    stock: s.sku_quantity?.available_quantity !== undefined ? Number(s.sku_quantity.available_quantity) : undefined,
    image: firstUrl(s.sku_image),
  }));

  const specs = (pm.product_properties ?? []).map((p: any) => ({
    name: p.property_name,
    value: (p.property_values ?? []).map((v: any) => v.property_value_name).join(", "),
  }));

  return {
    platform: "TikTok Shop",
    title: String(pm.name).trim(),
    price: priceText,
    description: description.trim(),
    images,
    videos,
    variants,
    skus,
    specs,
    sold: pm.sold_count ? String(pm.sold_count) : undefined,
  };
}
