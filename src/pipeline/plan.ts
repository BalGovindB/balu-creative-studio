import type { AspectRatio, Engine } from "@/core/types";

/** Crossfade overlap between shots, and between the last shot and the end card. */
export const FADE_SEC = 0.5;

export interface ShotPlan {
  shotCount: number;
  /** On-screen seconds per shot. Sums to contentDurationSec. */
  visibleDurations: number[];
  /** Seconds each generated clip must cover: visible time plus the outgoing crossfade. */
  clipDurations: number[];
  /** Length of the animated content before the end card overlaps it. */
  contentDurationSec: number;
  endCardSec: number;
  fadeSec: number;
  /** What the viewer ends up with. */
  totalDurationSec: number;
}

/**
 * Turns a requested duration into a shot plan. Roughly five seconds per shot matches what
 * image-to-video models generate natively and reads well in social feeds.
 */
export function planShots(engine: Engine, durationSec: number): ShotPlan {
  if (engine === "image") {
    return { shotCount: 1, visibleDurations: [0], clipDurations: [0], contentDurationSec: 0, endCardSec: 0, fadeSec: 0, totalDurationSec: 0 };
  }

  const fadeSec = FADE_SEC;
  // A GIF loops, so it gets no end card - the CTA is burned in as a persistent chip instead.
  const endCardSec = engine === "video" ? 3 : 0;
  // The end card overlaps the content by one fade, so content must be that much longer.
  const contentDurationSec = round2(durationSec - endCardSec + (endCardSec > 0 ? fadeSec : 0));

  const shotCount =
    engine === "gif" ? (durationSec >= 4 ? 2 : 1) : clamp(Math.round(contentDurationSec / 5), 3, 6);

  const visibleDurations = evenSplit(contentDurationSec, shotCount);
  const clipDurations = visibleDurations.map((d, i) => round2(d + (i < shotCount - 1 ? fadeSec : 0)));

  return {
    shotCount,
    visibleDurations,
    clipDurations,
    contentDurationSec,
    endCardSec,
    fadeSec,
    totalDurationSec: round2(contentDurationSec + endCardSec - (endCardSec > 0 ? fadeSec : 0)),
  };
}

/** Caption windows on the master timeline, inset slightly so text does not flash across cuts. */
export function captionWindows(visibleDurations: number[], inset = 0.12): { start: number; end: number }[] {
  const windows: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const duration of visibleDurations) {
    windows.push({ start: round2(cursor + inset), end: round2(cursor + duration - inset) });
    cursor = round2(cursor + duration);
  }
  return windows;
}

/**
 * One master render is produced and reframed into the other formats. Vertical carries the most
 * detail for the formats social platforms favour, so it wins when several are requested.
 */
export function pickMasterRatio(ratios: AspectRatio[]): AspectRatio {
  if (ratios.length === 1) return ratios[0];
  return (["9:16", "1:1", "16:9"] as const).find((r) => ratios.includes(r)) ?? ratios[0];
}

function evenSplit(total: number, parts: number): number[] {
  const each = round2(total / parts);
  const durations = Array.from({ length: parts }, () => each);
  // Give the rounding remainder to the last shot so the sum is exact.
  durations[parts - 1] = round2(total - each * (parts - 1));
  return durations;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
