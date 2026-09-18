import { randomUUID } from "crypto";
import { rm } from "fs/promises";

export type Job = {
  id: string;
  status: "running" | "done" | "error";
  percent: number;
  stage: "download" | "convert" | "ready";
  error?: string;
  dir?: string;
  file?: string;
  filename?: string;
  size?: number;
  mime?: string;
  createdAt: number;
};

const g = globalThis as unknown as { __jobs?: Map<string, Job> };
const jobs = (g.__jobs ??= new Map<string, Job>());

const TTL_MS = 10 * 60_000;

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.createdAt > TTL_MS) {
      if (j.dir) rm(j.dir, { recursive: true, force: true }).catch(() => {});
      jobs.delete(id);
    }
  }
}

export function createJob(): Job {
  sweep();
  const job: Job = { id: randomUUID(), status: "running", percent: 0, stage: "download", createdAt: Date.now() };
  jobs.set(job.id, job);
  return job;
}

export const getJob = (id: string) => jobs.get(id);
export const runningJobs = () => [...jobs.values()].filter((j) => j.status === "running").length;

export function deleteJob(id: string) {
  const j = jobs.get(id);
  if (j?.dir) rm(j.dir, { recursive: true, force: true }).catch(() => {});
  jobs.delete(id);
}
