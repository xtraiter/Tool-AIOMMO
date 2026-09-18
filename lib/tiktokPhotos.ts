/** Pulls the image list out of a TikTok photo-post page (yt-dlp can't do these). */
export function extractTikTokPhotos(html: string): { title: string; images: string[]; author: string } | null {
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let json: any;
  try { json = JSON.parse(m[1]); } catch { return null; }
  const item = json?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  const list: any[] = item?.imagePost?.images ?? [];
  const images = list
    .map((i) => i?.imageURL?.urlList?.[0] as string | undefined)
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"));
  if (images.length === 0) return null;
  return { title: item.desc || "TikTok Photo", images, author: item.author?.uniqueId || item.author || "" };
}
