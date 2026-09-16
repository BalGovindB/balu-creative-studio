import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { GenerationRequest, Job, JobStep, OutputFile } from "@/core/types";
import { ensureDir, storagePath, toStorageRelative } from "./paths";
import { isSafeId, newId } from "./ids";

/**
 * Jobs live in memory for fast polling and are mirrored to <job>/job.json so a dev-server
 * reload (or a second worker process) can still report on a job it did not start.
 */
const jobs = new Map<string, Job>();

export function jobDir(id: string): string {
  return storagePath("jobs", id);
}

function jobFile(id: string): string {
  return path.join(jobDir(id), "job.json");
}

function persist(job: Job): void {
  ensureDir(jobDir(job.id));
  writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2), "utf8");
}

export function createJob(request: GenerationRequest, steps: string[]): Job {
  const id = newId();
  const now = new Date().toISOString();
  const job: Job = {
    id,
    status: "queued",
    request,
    progress: 0,
    steps: steps.map((name): JobStep => ({ name, status: "pending" })),
    previews: [],
    outputs: [],
    createdAt: now,
    updatedAt: now,
  };
  ensureDir(jobDir(id));
  jobs.set(id, job);
  persist(job);
  return job;
}

export function getJob(id: string): Job | undefined {
  if (!isSafeId(id)) return undefined;
  const cached = jobs.get(id);
  if (cached) return cached;
  const file = jobFile(id);
  if (!existsSync(file)) return undefined;
  try {
    const job = JSON.parse(readFileSync(file, "utf8")) as Job;
    jobs.set(id, job);
    return job;
  } catch {
    return undefined;
  }
}

function update(id: string, mutate: (job: Job) => void): Job | undefined {
  const job = getJob(id);
  if (!job) return undefined;
  mutate(job);
  job.updatedAt = new Date().toISOString();
  persist(job);
  return job;
}

/**
 * A job only advances while the process that started it is alive. If the server restarted
 * mid-render - routine on hosted platforms - the job on disk is frozen at whatever step it
 * reached and would spin forever in the UI. Mark those failed at startup so they can be retried.
 */
export function failInterruptedJobs(): number {
  const root = storagePath("jobs");
  if (!existsSync(root)) return 0;
  let recovered = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const job = getJob(entry.name);
    if (!job || (job.status !== "running" && job.status !== "queued")) continue;
    update(entry.name, (stale) => {
      stale.status = "failed";
      stale.error = "The server restarted while this was generating. Please run it again.";
      const active = stale.steps.find((step) => step.status === "running");
      if (active) active.status = "failed";
    });
    recovered++;
  }
  return recovered;
}

/**
 * Write-through view of one job. The pipeline reports progress through this instead of
 * touching the store, so step bookkeeping stays in one place.
 */
export class JobReporter {
  constructor(readonly id: string) {}

  get job(): Job | undefined {
    return getJob(this.id);
  }

  running(): void {
    update(this.id, (job) => {
      job.status = "running";
    });
  }

  startStep(name: string): void {
    update(this.id, (job) => {
      const step = job.steps.find((s) => s.name === name);
      if (step) step.status = "running";
    });
  }

  finishStep(name: string, detail?: string): void {
    update(this.id, (job) => {
      const step = job.steps.find((s) => s.name === name);
      if (step) {
        step.status = "done";
        if (detail) step.detail = detail;
      }
      job.progress = Math.round((job.steps.filter((s) => s.status === "done" || s.status === "skipped").length / job.steps.length) * 100);
    });
  }

  skipStep(name: string, detail?: string): void {
    update(this.id, (job) => {
      const step = job.steps.find((s) => s.name === name);
      if (step) {
        step.status = "skipped";
        step.detail = detail;
      }
      job.progress = Math.round((job.steps.filter((s) => s.status === "done" || s.status === "skipped").length / job.steps.length) * 100);
    });
  }

  /** Progress inside a running step, expressed as "n of total". */
  stepDetail(name: string, detail: string): void {
    update(this.id, (job) => {
      const step = job.steps.find((s) => s.name === name);
      if (step) step.detail = detail;
    });
  }

  addPreview(label: string, absolutePath: string): void {
    update(this.id, (job) => {
      job.previews.push({ label, path: toStorageRelative(absolutePath) });
    });
  }

  setStoryboard(storyboard: NonNullable<Job["storyboard"]>): void {
    update(this.id, (job) => {
      job.storyboard = storyboard;
    });
  }

  addOutput(output: OutputFile): void {
    update(this.id, (job) => {
      job.outputs.push(output);
    });
  }

  succeeded(): void {
    update(this.id, (job) => {
      job.status = "succeeded";
      job.progress = 100;
    });
  }

  failed(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    update(this.id, (job) => {
      job.status = "failed";
      job.error = message;
      const running = job.steps.find((s) => s.status === "running");
      if (running) {
        running.status = "failed";
        running.detail = message;
      }
    });
  }
}
