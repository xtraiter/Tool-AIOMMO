import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, readdir, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { ytDlpDownloadWithProgress } from "@/lib/ytdlp";
import { assertPublicHttpUrl } from "@/lib/safeUrl";
import { rateLimited } from "@/lib/rateLimit";
import { safeFilename } from "@/lib/filename";
import { createJob, runningJobs } from "@/lib/jobs";

const VIDEO_FORMATS = ["mp4", "mkv"];
const AUDIO_FORMATS = ["mp3", "m4a", "opus", "wav", "flac"];
const LOSSLESS = new Set(["wav", "flac"]);
const MIME: Record<string, string> = {
  mp4: "video/mp4", mkv: "video/x-matroska", mp3: "audio/mpeg", m4a: "audio/mp4",
  opus: "audio/opus", wav: "audio/wav", flac: "audio/flac",
};
const BITRATES = [64, 96, 128, 192, 256, 320];
const MAX_CONCURRENT = 3;

// Starts a background download job and returns its id; the client polls
// /api/download/status for a live percentage, then fetches /api/download/file.
export async function POST(req: NextRequest) {
  if (rateLimited(req, "download-file", 8)) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }
  if (runningJobs() >= MAX_CONCURRENT) {
    return NextResponse.json({ error: "Máy chủ đang bận, vui lòng thử lại sau ít phút." }, { status: 503 });
  }

  try {
    const body = await req.json();
    const type = String(body.type || "");
    const isAudio = AUDIO_FORMATS.includes(type);
    if (!isAudio && !VIDEO_FORMATS.includes(type)) {
      return NextResponse.json({ error: "Định dạng không hợp lệ." }, { status: 400 });
    }
    const bitrate = BITRATES.includes(Number(body.abr)) ? Number(body.abr) : 320;
    const height = Math.min(Math.max(parseInt(String(body.height || "1080"), 10) || 1080, 144), 4320);
    const safe = await assertPublicHttpUrl(String(body.url || ""));

    const job = createJob();
    const dir = await mkdtemp(path.join(tmpdir(), "aiommo-dl-"));
    job.dir = dir;

    const common = ["--no-playlist", "--no-warnings", "--max-filesize", "300M", "-o", path.join(dir, "media.%(ext)s"), "--print-to-file", "%(title)s", path.join(dir, "title.txt")];
    const options = isAudio
      ? [...common, "-f", "ba/b", "-x", "--audio-format", type, ...(LOSSLESS.has(type) ? [] : ["--audio-quality", `${bitrate}K`])]
      : [
          ...common,
          "-f", `bv*[height<=${height}]+ba/b[height<=${height}]/b`,
          ...(type === "mp4" ? ["-S", "vcodec:h264,acodec:aac"] : []),
          "--merge-output-format", type,
          "--remux-video", type,
        ];

    void (async () => {
      try {
        await ytDlpDownloadWithProgress(options, safe.href, isAudio ? 1 : 2, (p) => {
          job.percent = p.percent;
          job.stage = p.stage;
        });
        const file = (await readdir(dir)).find((f) => f === `media.${type}`);
        if (!file) throw new Error("Không tạo được file. Có thể vượt quá 300MB.");
        const title = await readFile(path.join(dir, "title.txt"), "utf8").catch(() => "");
        job.file = path.join(dir, file);
        job.size = (await stat(job.file)).size;
        job.filename = safeFilename(title, type);
        job.mime = MIME[type];
        job.percent = 100;
        job.stage = "ready";
        job.status = "done";
      } catch (e: any) {
        job.status = "error";
        job.error = e?.message || "Không thể tải file.";
        console.error("[API/download] job failed:", job.error);
        rm(dir, { recursive: true, force: true }).catch(() => {});
        job.dir = undefined; // the job entry stays so the client can read the error
      }
    })();

    return NextResponse.json({ id: job.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Không thể bắt đầu tải." }, { status: 400 });
  }
}
