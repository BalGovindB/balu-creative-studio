import type { AspectRatio, Engine } from "./types";

export interface FormatSpec {
  ratio: AspectRatio;
  label: string;
  platforms: string;
  /** Full-quality size for video and image. */
  width: number;
  height: number;
}

export const FORMATS: Record<AspectRatio, FormatSpec> = {
  "9:16": { ratio: "9:16", label: "Vertical 9:16", platforms: "Reels, Shorts, TikTok, Stories", width: 1080, height: 1920 },
  "1:1": { ratio: "1:1", label: "Square 1:1", platforms: "Instagram & Facebook feed, LinkedIn", width: 1080, height: 1080 },
  "16:9": { ratio: "16:9", label: "Landscape 16:9", platforms: "YouTube, X, website, CTV", width: 1920, height: 1080 },
};

export const ASPECT_RATIOS = Object.keys(FORMATS) as AspectRatio[];

/** GIFs are rendered smaller - file size matters more than resolution. */
const GIF_LONG_EDGE = 720;

export function outputSize(ratio: AspectRatio, engine: Engine): { width: number; height: number } {
  const { width, height } = FORMATS[ratio];
  if (engine !== "gif") return { width, height };
  const scale = GIF_LONG_EDGE / Math.max(width, height);
  // Even dimensions keep every encoder happy.
  return { width: even(width * scale), height: even(height * scale) };
}

function even(n: number): number {
  return Math.round(n / 2) * 2;
}

export const DURATION_LIMITS: Record<Engine, { min: number; max: number; default: number }> = {
  video: { min: 15, max: 30, default: 20 },
  gif: { min: 2, max: 6, default: 4 },
  image: { min: 0, max: 0, default: 0 },
};
