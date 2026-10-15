import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import { pythonPath } from "@/lib/serverTools";

const execFileAsync = promisify(execFile);
const SCRIPT = path.join(/*turbopackIgnore: true*/ process.cwd(), "lib", "python", "fetch_page.py");

/**
 * GETs a Shopee/TikTok page with a real Chrome TLS fingerprint (curl_cffi in
 * the project venv). Only shop domains are allowed; see lib/python/fetch_page.py.
 */
export async function browserFetch(url: string): Promise<{ status: number; url: string; text: string }> {
  try {
    const { stdout } = await execFileAsync(await pythonPath(), ["-I", SCRIPT, url], {
      timeout: 40_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err: any) {
    const detail = String(err?.stderr || err?.message || "").trim().split("\n").pop();
    throw new Error("Không tải được trang sản phẩm" + (detail ? `: ${detail.slice(0, 160)}` : "."));
  }
}
