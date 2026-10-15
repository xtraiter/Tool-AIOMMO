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
  shopName?: string;
  location?: string;
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

/** TikTok Shop product id and region ("vn") from any product URL. */
export function parseTikTokProductUrl(url: string): { id: string; region: string } | null {
  const m = url.match(/\/(?:pdp|product)\/(?:[^/?#]+\/)?(\d{12,})/);
  if (!m) return null;
  const region = url.match(/shop\.tiktok\.com\/([a-z]{2})\//)?.[1] ?? "vn";
  return { id: m[1], region };
}

/** Collects video URLs from any `*video*` object under `o`. */
function collectVideos(o: any, out: string[], inVideo = false) {
  if (typeof o === "string") {
    if (inVideo && o.startsWith("http") && !/\.(jpe?g|png|webp|image)(\?|~|$)/i.test(o) && !out.includes(o)) out.push(o);
  } else if (Array.isArray(o)) {
    o.forEach((v) => collectVideos(v, out, inVideo));
  } else if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      if (/cover|thumb|poster|image/i.test(k)) continue;
      collectVideos(v, out, inVideo || /video|play/i.test(k));
    }
  }
}

/**
 * Current page layout (2026): loaderData → page_config.components_map → the
 * "product_info" component carries title, price, images, sale_props, skus…
 */
function parseComponentsLayout(data: any): ProductInfo | null {
  const components = findKey(data, "components_map");
  const comp = Array.isArray(components) ? components.find((c: any) => c?.component_type === "product_info") : null;
  const p = comp?.component_data?.product_info;
  if (!p?.title) return null;

  const images: string[] = [];
  const addImg = (u?: string) => { if (u && !images.includes(u)) images.push(u); };
  (p.images ?? []).forEach((i: any) => addImg(firstUrl(i)));

  let description = "";
  for (const b of p.desc_blocks ?? []) {
    if (b?.type === "text" && b.text) description += b.text + "\n";
    else if (b?.type === "image") addImg(firstUrl(b.image));
  }

  const variants: ProductVariant[] = (p.sale_props ?? []).map((sp: any) => ({
    name: sp.prop_name,
    options: (sp.sale_prop_values ?? []).map((v: any) => ({ name: v.prop_value, image: firstUrl(v.image) })),
  }));
  (p.sale_props ?? []).forEach((sp: any) => (sp.sale_prop_values ?? []).forEach((v: any) => addImg(firstUrl(v.image))));
  const valueImage = new Map<string, string | undefined>();
  (p.sale_props ?? []).forEach((sp: any) => (sp.sale_prop_values ?? []).forEach((v: any) => valueImage.set(v.prop_value_id, firstUrl(v.image))));

  const symbol = p.price?.currency_symbol ?? "₫";
  const skus: ProductSku[] = (p.skus ?? []).map((k: any) => ({
    name: (k.sku_sale_props ?? []).map((x: any) => x.prop_value).join(" / ") || "Mặc định",
    price: k.price?.sale_price_format ? `${k.price.sale_price_format}${symbol}` : "",
    stock: typeof k.stock === "number" ? k.stock : undefined,
    image: (k.sku_sale_props ?? []).map((x: any) => valueImage.get(x.prop_value_id)).find(Boolean),
  }));

  const prices = (p.skus ?? []).map((k: any) => Number(k.price?.sale_price_decimal)).filter((n: number) => Number.isFinite(n) && n > 0);
  const lo = prices.length ? Math.min(...prices) : NaN;
  const hi = prices.length ? Math.max(...prices) : NaN;
  let price = p.price?.real_price || "";
  if (prices.length && hi > lo) price = `${lo.toLocaleString("vi-VN")}${symbol} - ${hi.toLocaleString("vi-VN")}${symbol}`;
  if (price && p.price?.discount) price += ` (${p.price.discount})`;

  const videos: string[] = [];
  collectVideos(p, videos);

  const shop = comp.component_data.shop_info ?? {};
  return {
    platform: "TikTok Shop",
    title: String(p.title).trim(),
    price,
    description: description.trim(),
    images,
    videos,
    variants,
    skus,
    specs: (p.specifications ?? []).map((x: any) => ({ name: String(x.name), value: String(x.value) })),
    sold: p.sold_count ? String(p.sold_count) : undefined,
    shopName: shop.shop_name || p.seller?.name || undefined,
  };
}

/** Reads the product JSON that TikTok Shop embeds in its product page (desktop layout). */
export function parseTikTokShop(html: string): ProductInfo | null {
  const m = html.match(/<script[^>]*id="__MODERN_ROUTER_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data: any;
  try { data = JSON.parse(m[1]); } catch { return null; }

  const current = parseComponentsLayout(data);
  if (current) return current;

  // Older layout: a full product_model object.
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
