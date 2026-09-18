import { lookup } from "dns/promises";
import net from "net";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
  }
  return false;
}

/** Throws unless `raw` is an http(s) URL whose host resolves only to public IPs. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("URL không hợp lệ.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Chỉ hỗ trợ đường dẫn http/https.");
  }
  if (u.username || u.password) throw new Error("URL không được chứa thông tin đăng nhập.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Địa chỉ không được phép.");
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Địa chỉ không được phép.");
  }
  return u;
}

/** GET with manual redirects, validating every hop. Returns the final Response and URL. */
export async function safeFetch(raw: string, headers: Record<string, string> = {}, timeoutMs = 20000): Promise<{ res: Response; url: string }> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const u = await assertPublicHttpUrl(current);
    const res = await fetch(u, { headers, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      current = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    return { res, url: u.toString() };
  }
  throw new Error("Quá nhiều lần chuyển hướng.");
}

/** GET a page as text (capped at 2MB), returning the final URL after redirects. */
export async function safeFetchPage(raw: string, headers: Record<string, string> = {}, timeoutMs = 20000): Promise<{ text: string; url: string }> {
  const { res, url } = await safeFetch(raw, headers, timeoutMs);
  return { text: (await res.text()).slice(0, 2_000_000), url };
}

export async function safeFetchText(raw: string, headers: Record<string, string> = {}, timeoutMs = 20000): Promise<string> {
  return (await safeFetchPage(raw, headers, timeoutMs)).text;
}
