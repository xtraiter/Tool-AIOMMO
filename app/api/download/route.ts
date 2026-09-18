import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Vui lòng cung cấp URL hợp lệ." }, { status: 400 });
    }

    console.log(`[API] Đang trích xuất: ${url}`);

    // Sử dụng yt-dlp để lấy thông tin JSON
    const command = `yt-dlp --dump-json --no-warnings --no-playlist "${url}"`;
    
    const { stdout, stderr } = await execAsync(command);

    if (stderr && stderr.includes("ERROR:")) {
      console.error("[API] yt-dlp error:", stderr);
      return NextResponse.json({ error: "Không thể trích xuất dữ liệu từ URL này." }, { status: 500 });
    }

    const data = JSON.parse(stdout);

    // Bóc tách các trường cần thiết trả về cho Frontend
    const result = {
      type: "video",
      title: data.title || data.fulltitle || "Không có tiêu đề",
      thumbnail: data.thumbnail || "https://via.placeholder.com/400x225?text=No+Thumbnail",
      duration: data.duration_string || data.duration || 0,
      url: data.url || (data.formats && data.formats.length > 0 ? data.formats.slice(-1)[0].url : ""),
      formats: data.formats?.map((f: any) => ({
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution,
        url: f.url
      })),
      source: data.webpage_url
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi trong quá trình xử lý: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
