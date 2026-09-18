import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { mkdtemp, readdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";
import { ytDlpDownload } from "@/lib/ytdlp";
import { assertPublicHttpUrl } from "@/lib/safeUrl";
import { rateLimited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const VIDEO_FORMATS = ["mp4", "mkv"] as const;
const AUDIO_FORMATS = ["mp3", "m4a", "opus", "wav", "flac"] as const;
const LOSSLESS = new Set(["wav", "flac"]);
const MIME: Record<string, string> = {
  mp4: "video/mp4", mkv: "video/x-matroska", mp3: "audio/mpeg", m4a: "audio/mp4",
  opus: "audio/opus", wav: "audio/wav", flac: "audio/flac",
};
const BITRATES = [64, 96, 128, 192, 256, 320];

const MAX_CONCURRENT = 3;
let active = 0;

export async function GET(req: NextRequest) {
  if (rateLimited(req, "download-file", 8)) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }
  if (active >= MAX_CONCURRENT) {
    return NextResponse.json({ error: "Máy chủ đang bận, vui lòng thử lại sau ít phút." }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const type = params.get("type") || "";
  const isVideo = (VIDEO_FORMATS as readonly string[]).includes(type);
  const isAudio = (AUDIO_FORMATS as readonly string[]).includes(type);
  if (!isVideo && !isAudio) {
    return NextResponse.json({ error: "Định dạng không hợp lệ." }, { status: 400 });
  }
  const requestedBitrate = parseInt(params.get("abr") || "", 10);
  const bitrate = BITRATES.includes(requestedBitrate) ? requestedBitrate : 320;
  const height = Math.min(Math.max(parseInt(params.get("height") || "1080", 10) || 1080, 144), 4320);

  active++;
  let dir: string | null = null;
  try {
    const safe = await assertPublicHttpUrl(params.get("url") || "");
    dir = await mkdtemp(path.join(tmpdir(), "aiommo-dl-"));

    const common = ["--no-playlist", "--no-warnings", "--restrict-filenames", "--max-filesize", "300M", "-o", path.join(dir, "%(title).80s.%(ext)s")];
    const options = isAudio
      ? [
          ...common, "-f", "ba/b", "-x", "--audio-format", type,
          ...(LOSSLESS.has(type) ? [] : ["--audio-quality", `${bitrate}K`]),
        ]
      : [
          ...common,
          "-f", `bv*[height<=${height}]+ba/b[height<=${height}]/b`,
          ...(type === "mp4" ? ["-S", "vcodec:h264,acodec:aac"] : []),
          "--merge-output-format", type,
          "--remux-video", type,
        ];

    await ytDlpDownload(options, safe.href);

    const files = (await readdir(dir)).filter((f) => f.endsWith(`.${type}`));
    if (files.length === 0) throw new Error("Không tạo được file. Có thể video vượt quá 300MB.");
    const file = path.join(dir, files[0]);
    const { size } = await stat(file);

    const cleanupDir = dir;
    const stream = createReadStream(file);
    stream.on("close", () => rm(cleanupDir, { recursive: true, force: true }).catch(() => {}));
    dir = null;

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": MIME[type],
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${files[0].replace(/[^\w.\-]/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("[API/download/file] Error:", error);
    return NextResponse.json({ error: error.message || "Không thể tải file." }, { status: 500 });
  } finally {
    active--;
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
