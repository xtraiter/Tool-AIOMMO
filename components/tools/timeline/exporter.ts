import { fetchFile } from "@ffmpeg/util";
import { loadSharedFfmpeg } from "@/lib/ffmpegLoader";
import { canvasSize, end, hasAudio, projectDuration, type Clip, type Media, type Project } from "./model";
import { drawText } from "./render";

type Tr = (vi: string, en: string) => string;

export type ExportOptions = {
  project: Project;
  media: Map<string, Media>;
  longEdge: number;
  onProgress: (fraction: number, label: string) => void;
  isCancelled: () => boolean;
  tr: Tr;
};

const f3 = (n: number) => n.toFixed(3);

/** atempo only accepts 0.5..2 per instance, so chain it for 0.25x and 4x. */
function atempoChain(speed: number): string {
  if (Math.abs(speed - 1) < 1e-3) return "";
  const parts: string[] = [];
  let s = speed;
  while (s > 2) { parts.push("atempo=2"); s /= 2; }
  while (s < 0.5) { parts.push("atempo=0.5"); s /= 0.5; }
  parts.push(`atempo=${s.toFixed(4)}`);
  return parts.join(",") + ",";
}

function renderTextPng(clip: Clip, W: number, H: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  drawText(ctx, clip, W, H);
  return new Promise((resolve, reject) =>
    canvas.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error("png"))), "image/png")
  );
}

export async function exportProject(o: ExportOptions): Promise<Blob> {
  const { project, media, tr } = o;
  const D = projectDuration(project);
  if (D <= 0) throw new Error(tr("Dự án đang trống.", "The project is empty."));
  const { w: W, h: H } = canvasSize(project.ratio, o.longEdge);

  o.onProgress(0, tr("Đang nạp bộ xử lý FFmpeg...", "Loading the FFmpeg engine..."));
  const ffmpeg = await loadSharedFfmpeg();
  const log: string[] = [];
  let probe: string[] | null = null;
  const onLog = ({ message }: { message: string }) => { probe?.push(message); log.push(message); if (log.length > 80) log.shift(); };
  const onProg = ({ progress, time }: { progress: number; time: number }) => {
    const byTime = time > 0 ? time / 1_000_000 / D : progress;
    o.onProgress(Math.min(0.99, Math.max(0, Number.isFinite(byTime) ? byTime : progress)), tr("Đang dựng video...", "Rendering the video..."));
  };
  ffmpeg.on("log", onLog);
  ffmpeg.on("progress", onProg);

  const written: string[] = [];
  try {
    // ---- 1. put every source into FFmpeg's in-memory filesystem (each file once) ----
    const fileOf = new Map<string, string>();
    const withAudio = new Set<string>();
    let n = 0;
    for (const c of project.clips) {
      if (!c.mediaId || fileOf.has(c.mediaId)) continue;
      const m = media.get(c.mediaId);
      if (!m) continue;
      if (o.isCancelled()) throw new Error("CANCELLED");
      const ext = (m.file.name.split(".").pop() || (m.kind === "image" ? "jpg" : m.kind === "audio" ? "mp3" : "mp4")).toLowerCase();
      const name = `m${n++}.${ext}`;
      o.onProgress(0, tr(`Đang nạp ${m.name}...`, `Loading ${m.name}...`));
      await ffmpeg.writeFile(name, await fetchFile(m.file));
      fileOf.set(c.mediaId, name);
      written.push(name);
      if (m.kind === "video") {
        // Probe with a tiny successful run: a failed exec (missing [n:a] stream) can leave the wasm build stuck on the next run.
        probe = [];
        await ffmpeg.exec(["-i", name, "-t", "0.05", "-c", "copy", "-f", "null", "-"]);
        if (probe.some((l) => /Stream #\d+:\d+.*: Audio:/.test(l))) withAudio.add(c.mediaId);
        probe = null;
      }
    }
    const textFile = new Map<string, string>();
    let ti = 0;
    for (const c of project.clips) {
      if (c.kind !== "text" || !c.text?.trim()) continue;
      const name = `t${ti++}.png`;
      await ffmpeg.writeFile(name, await renderTextPng(c, W, H));
      textFile.set(c.id, name);
      written.push(name);
    }

    // ---- 2. order: bottom to top main, overlay, text; every clip becomes one ffmpeg input ----
    const rank = { main: 0, overlay: 1, text: 2, audio: 3 } as const;
    const ordered = [...project.clips]
      .filter((c) => (c.kind === "text" ? textFile.has(c.id) : !!c.mediaId && fileOf.has(c.mediaId)))
      .sort((a, b) => rank[a.lane] - rank[b.lane] || a.start - b.start);

    const inputs: string[] = ["-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=30:d=${f3(D)}`];
    const idx = new Map<string, number>();
    ordered.forEach((c, i) => {
      idx.set(c.id, i + 1);
      if (c.kind === "text") inputs.push("-threads", "1", "-loop", "1", "-framerate", "30", "-t", f3(c.dur), "-i", textFile.get(c.id)!);
      else if (c.kind === "image") inputs.push("-threads", "1", "-loop", "1", "-framerate", "30", "-t", f3(c.dur), "-i", fileOf.get(c.mediaId!)!);
      else inputs.push("-threads", "1", "-ss", f3(c.srcIn), "-t", f3(c.dur * c.speed), "-i", fileOf.get(c.mediaId!)!);
    });

    const build = (opts: { videoClipAudio: boolean; normalize: boolean }) => {
      let fc = `[0:v]format=yuv420p[b0]`;
      let last = "b0";
      let step = 0;
      for (const c of ordered) {
        if (c.kind === "audio") continue;
        const k = idx.get(c.id)!;
        const window = `enable='between(t,${f3(c.start)},${f3(end(c))})'`;
        const shift = `+${f3(c.start)}/TB`;
        let chain: string;
        let x = `${W}*${c.x.toFixed(4)}-overlay_w/2`;
        let y = `${H}*${c.y.toFixed(4)}-overlay_h/2`;
        if (c.kind === "text") {
          chain = `[${k}:v]setpts=PTS-STARTPTS${shift},format=rgba`;
          x = "0"; y = "0";
        } else {
          const fw = Math.max(2, Math.round(W * c.scale));
          const fh = Math.max(2, Math.round(H * c.scale));
          const pts = c.kind === "video" ? `(PTS-STARTPTS)/${c.speed.toFixed(4)}` : "PTS-STARTPTS";
          const fmt = c.kind === "image" || c.opacity < 0.999 ? `,format=yuva420p${c.opacity < 0.999 ? `,colorchannelmixer=aa=${c.opacity.toFixed(3)}` : ""}` : "";
          chain = `[${k}:v]setpts=${pts}${shift},scale=w=${fw}:h=${fh}:force_original_aspect_ratio=decrease${fmt}`;
        }
        const v = `v${step}`;
        const next = `b${step + 1}`;
        fc += `;${chain}[${v}];[${last}][${v}]overlay=x=${x}:y=${y}:eof_action=pass:${window}[${next}]`;
        last = next;
        step++;
      }

      const labels: string[] = [];
      ordered.forEach((c) => {
        if (!hasAudio(c) || c.volume <= 0.001) return;
        if (c.kind === "video" && (!opts.videoClipAudio || !withAudio.has(c.mediaId!))) return;
        const k = idx.get(c.id)!;
        const delay = Math.max(0, Math.round(c.start * 1000));
        const label = `a${labels.length}`;
        fc += `;[${k}:a]aformat=sample_rates=44100:channel_layouts=stereo,${atempoChain(c.speed)}volume=${c.volume.toFixed(3)},adelay=${delay}|${delay}[${label}]`;
        labels.push(label);
      });
      let audioOut: string | null = null;
      if (labels.length === 1) audioOut = labels[0];
      else if (labels.length > 1) {
        audioOut = "aout";
        fc += `;${labels.map((l) => `[${l}]`).join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0${opts.normalize ? ":normalize=0" : ""}[aout]`;
      }

      const args = ["-filter_threads", "1", "-filter_complex_threads", "1", ...inputs, "-filter_complex", fc, "-map", `[${last}]`];
      if (audioOut) args.push("-map", `[${audioOut}]`);
      args.push("-t", f3(D), "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-threads", "1", "-pix_fmt", "yuv420p");
      if (audioOut) args.push("-c:a", "aac", "-b:a", "160k");
      args.push("-movflags", "+faststart", "out.mp4");
      return args;
    };

    // ---- 3. render, retrying without features an older/odd source can't satisfy ----
    const attempts = [
      { videoClipAudio: true, normalize: true },
      { videoClipAudio: true, normalize: false },
      { videoClipAudio: false, normalize: true },
    ];
    let code = 1;
    for (let i = 0; i < attempts.length; i++) {
      if (o.isCancelled()) throw new Error("CANCELLED");
      log.length = 0;
      if (i > 0) o.onProgress(0, i === 2 ? tr("Có clip không có âm thanh — dựng lại không kèm tiếng của clip video...", "A clip has no audio — rendering again without video-clip sound...") : tr("Đang thử lại...", "Retrying..."));
      code = await ffmpeg.exec(build(attempts[i]));
      if (code === 0) break;
      const tail = log.join(" | ");
      const audioProblem = /matches no streams|does not contain any stream|Invalid stream specifier|Stream specifier ':a'/i.test(tail);
      if (i === 0 && /normalize/i.test(tail)) continue; // this FFmpeg build has no amix "normalize": retry without it
      if (audioProblem && i < 2) { i = 1; continue; } // a clip has no audio track: skip straight to the video-audio-free attempt
      break; // any other failure: retrying would not help
    }
    if (code !== 0) {
      throw new Error(tr("FFmpeg dựng video thất bại", "FFmpeg failed to render the video") + (log.length ? `: ${log.slice(-6).join(" | ")}` : "."));
    }

    const data = await ffmpeg.readFile("out.mp4");
    written.push("out.mp4");
    o.onProgress(1, tr("Hoàn tất!", "Done!"));
    return new Blob([data as BlobPart], { type: "video/mp4" });
  } finally {
    ffmpeg.off("log", onLog);
    ffmpeg.off("progress", onProg);
    for (const name of written) await ffmpeg.deleteFile(name).catch(() => {});
  }
}
