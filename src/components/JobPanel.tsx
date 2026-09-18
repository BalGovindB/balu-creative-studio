"use client";

import { useEffect, useState } from "react";
import { FORMATS } from "@/core/formats";
import type { Job, JobStep } from "@/core/types";
import { fileUrl } from "./upload";

const POLL_MS = 1500;

const STEP_ICONS: Record<JobStep["status"], string> = {
  pending: "○",
  running: "◐",
  done: "✓",
  failed: "✕",
  skipped: "–",
};

/** Live view of one generation job: steps, intermediate frames and the finished exports. */
export default function JobPanel({ jobId, liveJob }: { jobId: string | null; liveJob?: Job | null }) {
  const [job, setJob] = useState<Job | null>(liveJob ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (liveJob) {
      setJob(liveJob);
      setError(liveJob.error ?? null);
    }
  }, [liveJob]);

  useEffect(() => {
    // If live streamed job updates are being received, skip polling
    if (!jobId || liveJob) {
      if (!jobId && !liveJob) setJob(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;

    async function poll() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const body = (await response.json()) as { job?: Job; error?: string };
        if (cancelled) return;
        if (!response.ok || !body.job) {
          retries++;
          // Allow several retry attempts while the job initializes
          if (retries < 8) {
            timer = setTimeout(poll, POLL_MS);
            return;
          }
          throw new Error(body.error ?? "Job not found.");
        }
        retries = 0;
        setJob(body.job);
        setError(null);
        // Stop polling once the pipeline has settled either way.
        if (body.job.status === "queued" || body.job.status === "running") timer = setTimeout(poll, POLL_MS);
      } catch (pollError) {
        if (cancelled) return;
        setError(pollError instanceof Error ? pollError.message : "Lost contact with the job.");
        timer = setTimeout(poll, POLL_MS * 3);
      }
    }

    setJob(null);
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  if (!jobId) {
    return (
      <section className="card">
        <h2>Output</h2>
        <p className="empty">Fill in the brief and hit Generate. Progress, keyframes and every export land here.</p>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <h2>Progress</h2>
        {error && <div className="error">{error}</div>}
        {!job ? (
          <p className="empty">Starting…</p>
        ) : (
          <>
            <p className="hint" style={{ marginBottom: 0 }}>
              {job.status === "succeeded"
                ? "Done."
                : job.status === "failed"
                  ? "Failed."
                  : `Working… ${job.progress}%`}
            </p>
            <div className="progress">
              <div style={{ width: `${job.progress}%` }} />
            </div>
            {job.error && <div className="error">{job.error}</div>}
            <ul className="steps">
              {job.steps.map((step) => (
                <li key={step.name} className={step.status}>
                  <span className="icon">{STEP_ICONS[step.status]}</span>
                  <span>
                    {step.name}
                    {step.detail && <span className="detail">{step.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {job?.outputs && job.outputs.length > 0 && (
        <section className="card">
          <h2>Exports</h2>
          {job.outputs.map((output) => (
            <div className="output" key={output.path}>
              <header>
                <strong>{FORMATS[output.aspectRatio].label}</strong>
                <span className="pill">
                  {output.width}×{output.height}
                </span>
                <a className="btn small" href={fileUrl(output.path, true)} download>
                  Download
                </a>
              </header>
              {output.kind === "video" ? (
                <video src={fileUrl(output.path)} controls loop playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(output.path)} alt={`${output.aspectRatio} export`} />
              )}
            </div>
          ))}
        </section>
      )}

      {job?.storyboard && (
        <section className="card">
          <h2>Storyboard</h2>
          <p className="hint">
            <strong>{job.storyboard.title}</strong> · written by {job.storyboard.source}
          </p>
          <ul className="storyboard">
            {job.storyboard.shots.map((shot) => (
              <li key={shot.index}>
                <strong>
                  Shot {shot.index + 1}
                  {shot.durationSec > 0 ? ` · ${shot.durationSec}s` : ""} — “{shot.caption}”
                </strong>
                <span>{shot.visualPrompt}</span>
              </li>
            ))}
            <li>
              <strong>End card — “{job.storyboard.cta}”</strong>
              {job.storyboard.disclaimer && <span>{job.storyboard.disclaimer}</span>}
            </li>
          </ul>
        </section>
      )}

      {job?.previews && job.previews.length > 0 && (
        <section className="card">
          <h2>Frames</h2>
          <div className="thumbs">
            {job.previews.map((preview) => (
              <figure key={preview.path}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(preview.path)} alt={preview.label} />
                <figcaption>{preview.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
