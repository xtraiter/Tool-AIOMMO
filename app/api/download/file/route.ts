import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { Readable } from "stream";
import { getJob, deleteJob } from "@/lib/jobs";
import { contentDisposition } from "@/lib/filename";

export const dynamic = "force-dynamic";

// Serves the finished file of a job started via /api/download/start, then removes it.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  const job = getJob(id);
  if (!job || job.status !== "done" || !job.file || !job.filename) {
    return NextResponse.json({ error: "File chưa sẵn sàng hoặc đã hết hạn." }, { status: 404 });
  }
  const stream = createReadStream(job.file);
  stream.on("close", () => deleteJob(id));
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": job.mime || "application/octet-stream",
      "Content-Length": String(job.size),
      "Content-Disposition": contentDisposition(job.filename),
      "Cache-Control": "no-store",
    },
  });
}
