import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urls } = body;

    if (!urls || typeof urls !== "string" || !urls.trim()) {
      return NextResponse.json({ error: "Vui lòng cung cấp ít nhất 1 URL." }, { status: 400 });
    }

    const urlList = urls
      .split("\n")
      .map((u: string) => u.trim())
      .filter((u: string) => u.startsWith("http"));

    if (urlList.length === 0) {
      return NextResponse.json({ error: "Không tìm thấy URL hợp lệ. Hãy đảm bảo mỗi link nằm trên 1 dòng riêng." }, { status: 400 });
    }

    console.log(`[API/bulk] Quét ${urlList.length} URL(s)...`);

    const allItems: any[] = [];
    const errors: string[] = [];

    // Xử lý tuần tự từng URL (tránh quá tải)
    for (const url of urlList) {
      try {
        // --flat-playlist: chỉ lấy danh sách, không tải file
        const command = `yt-dlp --dump-json --no-warnings --flat-playlist "${url}"`;
        const { stdout, stderr } = await execAsync(command, { timeout: 60000 });

        if (!stdout) continue;

        const lines = stdout.trim().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            allItems.push({
              id: data.id || allItems.length + 1,
              title: data.title || data.fulltitle || "Không có tiêu đề",
              duration: data.duration_string || (data.duration ? formatDuration(data.duration) : "--:--"),
              thumbnail: data.thumbnail || "",
              url: data.url || data.webpage_url || url,
              source_url: url,
              ext: data.ext || "mp4",
            });
          } catch { /* bỏ qua */ }
        }
      } catch (err: any) {
        errors.push(`Lỗi khi quét ${url}: ${err.message}`);
        console.error(`[API/bulk] Lỗi: ${url}`, err.message);
      }
    }

    return NextResponse.json({
      total: allItems.length,
      items: allItems,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[API/bulk] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
