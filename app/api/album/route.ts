import { NextRequest, NextResponse } from "next/server";
import { ytDlp } from "@/lib/ytdlp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Vui lòng cung cấp URL hợp lệ." }, { status: 400 });
    }

    console.log(`[API/album] Đang trích xuất album: ${url}`);

    // yt-dlp dump-json với playlist để lấy từng ảnh/video trong bài viết
    const { stdout, stderr } = await ytDlp(`--dump-json --no-warnings --flat-playlist "${url}"`);

    if (!stdout || (stderr && stderr.includes("ERROR:"))) {
      return NextResponse.json({ error: "Không thể trích xuất album từ URL này. Hãy thử link khác." }, { status: 500 });
    }

    // yt-dlp có thể trả về nhiều dòng JSON (mỗi dòng là 1 media item)
    const lines = stdout.trim().split("\n").filter(Boolean);
    
    const items: { url: string; thumbnail: string; title: string; ext: string }[] = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        // Ưu tiên thumbnail làm URL ảnh nếu là album ảnh
        const mediaUrl = data.url || data.webpage_url || "";
        const thumbnail = data.thumbnail || "";

        items.push({
          url: mediaUrl,
          thumbnail: thumbnail || mediaUrl,
          title: data.title || `Media ${items.length + 1}`,
          ext: data.ext || "jpg",
        });
      } catch {
        // bỏ qua dòng lỗi
      }
    }

    if (items.length === 0) {
      // Thử lấy thông tin tổng quát (không phải playlist)
      const { stdout: singleOut } = await ytDlp(`--dump-json --no-warnings "${url}"`);
      const data = JSON.parse(singleOut.trim());

      if (data.thumbnail) {
        items.push({
          url: data.thumbnail,
          thumbnail: data.thumbnail,
          title: data.title || "Ảnh",
          ext: "jpg",
        });
      }

      // Nếu có subtitles hoặc formats là ảnh, cũng thêm vào
      if (data.formats) {
        const imageFormats = data.formats.filter((f: any) => f.ext === "jpg" || f.ext === "png" || f.ext === "webp");
        for (const f of imageFormats) {
          if (f.url) {
            items.push({ url: f.url, thumbnail: f.url, title: data.title || "Ảnh", ext: f.ext });
          }
        }
      }
    }

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("[API/album] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
