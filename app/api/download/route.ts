import { NextRequest, NextResponse } from "next/server";
import { ytDlp } from "@/lib/ytdlp";
import { assertPublicHttpUrl } from "@/lib/safeUrl";
import { rateLimited } from "@/lib/rateLimit";
import { detectPlatform, UNSUPPORTED_BY_YTDLP } from "@/lib/platforms";
import { mediaProxyUrl } from "@/lib/signedUrl";

export async function POST(req: NextRequest) {
  if (rateLimited(req, "download")) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Vui lòng cung cấp URL hợp lệ." }, { status: 400 });
    }

    const safe = await assertPublicHttpUrl(url);
    const detected = detectPlatform(safe.href);
    if (UNSUPPORTED_BY_YTDLP.has(detected.id)) {
      return NextResponse.json({ error: `Đã nhận diện ${detected.name} nhưng hiện chưa hỗ trợ tải từ nền tảng này.` }, { status: 422 });
    }
    console.log(`[API] Đang trích xuất: ${safe.href}`);

    const { stdout } = await ytDlp(["--dump-json", "--no-warnings", "--no-playlist"], safe.href);
    const data = JSON.parse(stdout);

    const formats: any[] = data.formats ?? [];
    const heights = [
      ...new Set(
        formats
          .filter((f) => f.vcodec && f.vcodec !== "none" && typeof f.height === "number" && f.height >= 144)
          .map((f) => f.height as number)
      ),
    ].sort((a, b) => b - a);
    const maxAbr = Math.round(Math.max(0, ...formats.filter((f) => f.acodec && f.acodec !== "none" && typeof f.abr === "number").map((f) => f.abr)));
    const hasAudio = formats.some((f) => f.acodec && f.acodec !== "none");

    return NextResponse.json({
      type: "video",
      platform: detectPlatform(safe.href).name,
      title: data.title || data.fulltitle || "Không có tiêu đề",
      description: data.description || "",
      uploader: data.uploader || data.channel || "",
      thumbnail: typeof data.thumbnail === "string" && data.thumbnail.startsWith("http") ? mediaProxyUrl(data.thumbnail) : "",
      duration: data.duration_string || data.duration || 0,
      heights,
      hasAudio,
      maxAbr,
      source: data.webpage_url || safe.href,
    });
  } catch (error: any) {
    console.error("[API] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi trong quá trình xử lý: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
