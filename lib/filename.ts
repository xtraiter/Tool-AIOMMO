export const FILE_PREFIX = "Allinonemmo.com - ";

const BACKSLASH = String.fromCharCode(92);
const ILLEGAL = "/:*?" + String.fromCharCode(34) + "<>|" + BACKSLASH;

function isBad(c: string) {
  const n = c.charCodeAt(0);
  return n < 32 || n === 127 || ILLEGAL.includes(c);
}

/** Strips characters that are illegal in file names and caps the length. */
export function cleanName(name: string, max = 150): string {
  return Array.from(name).map((c) => (isBad(c) ? " " : c)).join("").slice(0, max);
}

/** Unicode-safe file name: keeps Vietnamese, drops characters illegal on Windows/Linux. */
export function safeFilename(title: string, ext: string, opts: { prefix?: boolean; max?: number } = {}): string {
  const { prefix = true, max = 100 } = opts;
  const clean = cleanName(title.normalize("NFC"), 1000)
    .split(" ").filter(Boolean).join(" ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, max)
    .trim() || "download";
  return `${prefix ? FILE_PREFIX : ""}${clean}.${ext}`;
}

/** Content-Disposition with an ASCII fallback plus the real UTF-8 name (RFC 5987). */
export function contentDisposition(filename: string): string {
  const ascii = Array.from(filename.normalize("NFD"))
    .filter((c) => !/[̀-ͯ]/.test(c))
    .map((c) => (c === "đ" ? "d" : c === "Đ" ? "D" : c))
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126 || c === String.fromCharCode(34) || c === BACKSLASH ? "_" : c))
    .join("");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Reads the real file name back out of a Content-Disposition header (browser side). */
export function parseContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (star) { try { return decodeURIComponent(star); } catch { /* fall through */ } }
  return /filename="([^"]+)"/i.exec(header)?.[1] || fallback;
}
