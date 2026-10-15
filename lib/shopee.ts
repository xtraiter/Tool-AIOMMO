import type { ProductInfo, ProductSku, ProductVariant } from "@/lib/tiktokShop";

const img = (id: string) => `https://down-vn.img.susercontent.com/file/${id}`;
const vnd = (raw: number) => `${Math.round(raw / 100000).toLocaleString("vi-VN")}₫`;

/** shopid & itemid from any Shopee product URL (incl. the opaanlp page short links redirect to). */
export function parseShopeeIds(url: string): { shopid: string; itemid: string } | null {
  const m =
    url.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/) ||
    url.match(/-i\.(\d+)\.(\d+)/) ||
    url.match(/[/?&]i\.(\d+)\.(\d+)/);
  return m ? { shopid: m[1], itemid: m[2] } : null;
}

/**
 * Reads the `{"initialState":…}` JSON Shopee embeds in its product page.
 * Logged-out pages omit price, sold count and shop name (and show a fake
 * stock of 10), so those are only filled when Shopee does send them.
 */
export function parseShopee(html: string): ProductInfo | null {
  const m = html.match(/<script[^>]*>\s*(\{"initialState":[\s\S]*?)\s*<\/script>/);
  if (!m) return null;
  let state: any;
  try { state = JSON.parse(m[1]).initialState; } catch { return null; }

  const item: any = Object.values(state?.item?.items ?? {})[0];
  const title = item?.title || item?.name;
  if (!title) return null;
  const pdp: any = Object.values(state?.DOMAIN_PDP?.data?.PDP_BFF_DATA?.cachedMap ?? {})[0] ?? {};

  const images: string[] = [];
  const addImg = (id?: string | null) => { if (id && !images.includes(img(id))) images.push(img(id)); };
  (item.images ?? []).forEach(addImg);

  let description = item.description ?? "";
  for (const p of item.rich_text_description?.paragraph_list ?? []) {
    if (p?.type === 1) addImg(p.img_id);
    else if (!description && p?.type === 0 && p.text) description += p.text + "\n";
  }

  const videos: string[] = [];
  for (const v of item.video_info_list ?? []) {
    const u = v?.default_format?.url || v?.formats?.[0]?.url;
    if (typeof u === "string" && u.startsWith("http") && !videos.includes(u)) videos.push(u);
  }

  const tiers: any[] = item.tier_variations ?? [];
  const variants: ProductVariant[] = tiers.map((t) => ({
    name: t.name,
    options: (t.options ?? []).map((name: string, i: number) => ({ name, image: t.images?.[i] ? img(t.images[i]) : undefined })),
  }));
  tiers.forEach((t) => (t.images ?? []).forEach(addImg));

  const hasPrice = item.price != null || item.price_min != null;
  const skus: ProductSku[] = (item.models ?? []).map((md: any) => {
    const idx: number[] = md.extinfo?.tier_index ?? [];
    const name = idx.map((n, ti) => tiers[ti]?.options?.[n]).filter(Boolean).join(" / ") || md.name || "Mặc định";
    const optImg = idx.map((n, ti) => tiers[ti]?.images?.[n]).find(Boolean);
    return {
      name,
      price: md.price != null ? vnd(md.price) : "",
      stock: hasPrice && typeof md.stock === "number" ? md.stock : undefined,
      image: md.extinfo?.sku_image ? img(md.extinfo.sku_image) : optImg ? img(optImg) : undefined,
    };
  });

  let price = "Xem giá trực tiếp trên Shopee";
  const min = item.price_min ?? item.price;
  const max = item.price_max;
  if (min != null) price = max != null && max !== min ? `${vnd(min)} - ${vnd(max)}` : vnd(min);

  const specs = ((pdp.product_attributes?.attrs ?? []) as any[])
    .filter((a) => a?.name && a?.value)
    .map((a) => ({ name: String(a.name), value: String(a.value) }));

  const sold = item.historical_sold ?? item.global_sold;
  return {
    platform: "Shopee",
    title: String(title).trim(),
    price,
    description: description.trim(),
    images,
    videos,
    variants,
    skus,
    specs,
    sold: sold != null ? String(sold) : undefined,
    shopName: pdp.shop_detailed?.name || pdp.shop_detailed?.account?.username || undefined,
    location: item.shop_location || undefined,
  };
}
