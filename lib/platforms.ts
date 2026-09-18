export type PlatformId = string;

type Rule = { id: PlatformId; name: string; domains: string[]; referer?: string };

// Domains include each platform's CDN hosts so proxied images/videos get the right Referer.
const RULES: Rule[] = [
  { id: "tiktok", name: "TikTok", referer: "https://www.tiktok.com/", domains: ["tiktok.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokv.com", "ibytedtos.com", "byteimg.com", "ibyteimg.com"] },
  { id: "douyin", name: "Douyin", referer: "https://www.douyin.com/", domains: ["douyin.com", "iesdouyin.com", "douyinpic.com", "douyinvod.com", "douyincdn.com"] },
  { id: "facebook", name: "Facebook", referer: "https://www.facebook.com/", domains: ["facebook.com", "fb.watch", "fb.com", "fbcdn.net"] },
  { id: "instagram", name: "Instagram", referer: "https://www.instagram.com/", domains: ["instagram.com", "cdninstagram.com"] },
  { id: "youtube", name: "YouTube", domains: ["youtube.com", "youtu.be", "ytimg.com"] },
  { id: "twitter", name: "X (Twitter)", referer: "https://x.com/", domains: ["twitter.com", "x.com", "twimg.com"] },
  { id: "pinterest", name: "Pinterest", referer: "https://www.pinterest.com/", domains: ["pinterest.com", "pin.it", "pinimg.com"] },
  { id: "reddit", name: "Reddit", referer: "https://www.reddit.com/", domains: ["reddit.com", "redd.it", "redditmedia.com", "redditstatic.com"] },
  { id: "bilibili", name: "Bilibili", referer: "https://www.bilibili.com/", domains: ["bilibili.com", "b23.tv", "hdslb.com", "bilivideo.com"] },
  { id: "xiaohongshu", name: "Xiaohongshu", referer: "https://www.xiaohongshu.com/", domains: ["xiaohongshu.com", "xhslink.com", "xhscdn.com"] },
  { id: "weibo", name: "Weibo", referer: "https://weibo.com/", domains: ["weibo.com", "weibo.cn", "sinaimg.cn", "weibocdn.com"] },
  { id: "soundcloud", name: "SoundCloud", domains: ["soundcloud.com", "sndcdn.com"] },
  { id: "threads", name: "Threads", referer: "https://www.threads.net/", domains: ["threads.net", "threads.com"] },
  { id: "kuaishou", name: "Kuaishou", referer: "https://www.kuaishou.com/", domains: ["kuaishou.com", "kwai.com", "chenzhongtech.com", "gifshow.com"] },
  { id: "jimeng", name: "Jimeng", domains: ["jimeng.jianying.com"] },
  { id: "vimeo", name: "Vimeo", domains: ["vimeo.com", "vimeocdn.com"] },
  { id: "twitch", name: "Twitch", domains: ["twitch.tv"] },
  { id: "dailymotion", name: "Dailymotion", domains: ["dailymotion.com", "dai.ly"] },
  { id: "tumblr", name: "Tumblr", domains: ["tumblr.com"] },
  { id: "shopee", name: "Shopee", domains: ["shopee.vn", "shopee.com", "shp.ee"] },
  { id: "tiktokshop", name: "TikTok Shop", domains: ["shop.tiktok.com"] },
];

/** Platforms yt-dlp has no extractor for; links are recognised but need a custom scraper. */
export const UNSUPPORTED_BY_YTDLP = new Set(["threads", "kuaishou", "jimeng", "shopee", "tiktokshop"]);

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith("." + domain);
}

export function detectPlatform(raw: string): { id: PlatformId; name: string } {
  let host = "";
  try { host = new URL(raw).hostname.toLowerCase(); } catch { /* fall through */ }
  // shop.tiktok.com must win over the generic tiktok.com rule
  const ordered = [...RULES].sort((a, b) => Math.max(...b.domains.map((d) => d.length)) - Math.max(...a.domains.map((d) => d.length)));
  for (const r of ordered) {
    if (r.domains.some((d) => hostMatches(host, d))) return { id: r.id, name: r.name };
  }
  return { id: "unknown", name: host ? host.replace(/^www\./, "") : "Khác" };
}

export function platformReferer(raw: string): string | undefined {
  const { id } = detectPlatform(raw);
  return RULES.find((r) => r.id === id)?.referer;
}
