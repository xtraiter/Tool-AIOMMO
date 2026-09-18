export type PlatformId =
  | "tiktok" | "douyin" | "facebook" | "instagram" | "youtube"
  | "twitter" | "pinterest" | "threads" | "unknown";

const RULES: [PlatformId, string, string[]][] = [
  ["tiktok", "TikTok", ["tiktok.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokv.com", "ibytedtos.com", "byteimg.com", "ibyteimg.com"]],
  ["douyin", "Douyin", ["douyin.com", "iesdouyin.com", "douyinpic.com", "douyinvod.com", "douyincdn.com"]],
  ["facebook", "Facebook", ["facebook.com", "fb.watch", "fb.com", "fbcdn.net"]],
  ["instagram", "Instagram", ["instagram.com", "cdninstagram.com"]],
  ["youtube", "YouTube", ["youtube.com", "youtu.be"]],
  ["twitter", "X (Twitter)", ["twitter.com", "x.com", "twimg.com"]],
  ["pinterest", "Pinterest", ["pinterest.com", "pin.it", "pinimg.com"]],
  ["threads", "Threads", ["threads.net", "threads.com"]],
];

export function detectPlatform(raw: string): { id: PlatformId; name: string } {
  let host = "";
  try { host = new URL(raw).hostname.toLowerCase(); } catch { /* fall through */ }
  for (const [id, name, domains] of RULES) {
    if (domains.some((d) => host === d || host.endsWith("." + d))) return { id, name };
  }
  return { id: "unknown", name: "Khác" };
}
