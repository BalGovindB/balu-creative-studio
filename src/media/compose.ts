import { writeFileSync } from "node:fs";
import path from "node:path";
import type { AspectRatio, BrandKit, Engine, ReframeMode } from "@/core/types";
import { runFfmpeg } from "./ffmpeg";
import { contrastText, TextRenderer } from "./text";

const FPS = 30;
const GIF_FPS = 12;
const X264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];

/** Scale-to-cover + crop a clip to the master canvas, retime to a fixed length, drop audio. */
export async function normalizeClip(opts: {
  input: string;
  output: string;
  width: number;
  height: number;
  durationSec: number;
  workDir: string;
}): Promise<void> {
  const { width: w, height: h, durationSec: d } = opts;
  const vf = [
    `scale=${w}:${h}:force_original_aspect_ratio=increase`,
    `crop=${w}:${h}`,
    `fps=${FPS}`,
    // Clone the last frame if the model returned a clip shorter than planned.
    `tpad=stop_mode=clone:stop_duration=${d.toFixed(2)}`,
    `trim=duration=${d.toFixed(3)}`,
    "setpts=PTS-STARTPTS",
    `fps=${FPS}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
  await runFfmpeg(["-i", opts.input, "-an", "-vf", vf, ...X264, opts.output], { cwd: opts.workDir });
}

/**
 * Crossfade normalised clips together. Callers pass each clip's *visible* duration; every clip
 * except the last must be `fade` seconds longer so the total equals the sum of visible durations.
 */
export async function crossfadeClips(opts: {
  clips: string[];
  visibleDurations: number[];
  fade: number;
  output: string;
  workDir: string;
}): Promise<void> {
  const { clips, visibleDurations, fade } = opts;
  if (clips.length === 1) {
    await runFfmpeg(["-i", clips[0], "-c", "copy", opts.output], { cwd: opts.workDir });
    return;
  }
  const graph: string[] = [];
  let prev = "[0:v]";
  let offset = 0;
  for (let i = 1; i < clips.length; i++) {
    offset += visibleDurations[i - 1];
    const label = i === clips.length - 1 ? "[out]" : `[x${i}]`;
    graph.push(`${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${label}`);
    prev = label;
  }
  const script = path.join(opts.workDir, "crossfade.graph");
  writeFileSync(script, graph.join(";\n"));
  await runFfmpeg(
    [...clips.flatMap((c) => ["-i", c]), "-filter_complex_script", path.basename(script), "-map", "[out]", ...X264, opts.output],
    { cwd: opts.workDir },
  );
}

export interface CaptionCue {
  text: string;
  start: number;
  end: number;
}

export interface EndCard {
  cta: string;
  headline?: string;
  disclaimer?: string;
  durationSec: number;
  fadeSec: number;
}

export interface RenderOptions {
  engine: Engine;
  /** Master video (video/gif) or master image (image). */
  input: string;
  inputIsImage: boolean;
  /** Visible length of the master content in seconds (ignored for images). */
  contentDurationSec: number;
  ratio: AspectRatio;
  width: number;
  height: number;
  reframe: ReframeMode;
  masterRatio: AspectRatio;
  brand?: BrandKit;
  brandDir?: string;
  fontPath: string;
  captions: CaptionCue[];
  /** Static creatives: headline on the image. */
  headline?: string;
  /** Burned-in CTA chip shown for the whole clip. Used for GIFs, which loop and get no end card. */
  persistentCta?: string;
  endCard?: EndCard;
  output: string;
  workDir: string;
}

const DEFAULT_COLORS = { primary: "#1f3cff", secondary: "#0b1330", accent: "#ffc53d", text: "#ffffff" };

/** Final per-format render: reframe, captions, logo bug, end card, and encode (MP4, GIF or PNG). */
export async function renderFormat(o: RenderOptions): Promise<void> {
  const W = o.width;
  const H = o.height;
  const base = Math.min(W, H);
  const colors = o.brand?.colors ?? DEFAULT_COLORS;
  const text = new TextRenderer(o.workDir, o.fontPath, `font_${o.ratio.replace(":", "x")}`);
  const logoPath = o.brand?.logoFile && o.brandDir ? path.join(o.brandDir, o.brand.logoFile) : undefined;
  const vertical = H > W;
  const margin = Math.round(base * 0.04);
  // A persistent CTA chip owns the bottom strip, so captions move up to clear it.
  const ctaReserve = o.persistentCta ? Math.round(base * 0.15) : 0;

  const inputs: string[] = [];
  if (o.inputIsImage) inputs.push("-loop", "1", "-i", o.input);
  else inputs.push("-i", o.input);
  let logoIndex = -1;
  if (logoPath) {
    logoIndex = 1;
    inputs.push("-loop", "1", "-i", logoPath);
  }

  const g: string[] = [];
  const settle = o.inputIsImage ? "" : `fps=${FPS},`;

  // 1. Reframe master to this canvas.
  if (o.reframe === "crop" || o.ratio === o.masterRatio) {
    g.push(`[0:v]${settle}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[base]`);
  } else {
    g.push(
      `[0:v]${settle}split[bgsrc][fgsrc]`,
      `[bgsrc]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=luma_radius=${Math.round(base / 40)}:luma_power=2,eq=brightness=-0.12[bg]`,
      `[fgsrc]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[base]`,
    );
  }

  // 2. Captions (video/gif) or headline (image), on a brand-coloured box.
  const captionFilters: string[] = [];
  const captionSize = Math.round(base * (o.engine === "gif" ? 0.07 : 0.058));
  const captionBottom = Math.round(H * (vertical ? 0.8 : 0.88)) - ctaReserve;
  const captionBox = { color: colors.primary, opacity: 0.88, padding: Math.round(captionSize * 0.35) };
  for (const cue of o.captions) {
    if (!cue.text.trim()) continue;
    captionFilters.push(
      ...text.block({
        text: cue.text,
        fontSize: captionSize,
        color: colors.text,
        y: captionBottom,
        anchor: "bottom",
        maxWidth: W * 0.84,
        maxLines: 2,
        box: captionBox,
        enable: [cue.start, cue.end],
      }),
    );
  }
  if (o.headline) {
    captionFilters.push(
      ...text.block({
        text: o.headline,
        fontSize: Math.round(base * 0.075),
        color: colors.text,
        y: Math.round(H * (vertical ? 0.1 : 0.08)),
        maxWidth: W * 0.86,
        maxLines: 3,
        box: captionBox,
      }),
    );
  }
  if (o.persistentCta) {
    captionFilters.push(
      ...text.block({
        text: o.persistentCta,
        fontSize: Math.round(base * 0.055),
        color: contrastText(colors.accent),
        y: H - margin,
        anchor: "bottom",
        maxWidth: W * 0.7,
        maxLines: 1,
        box: { color: colors.accent, opacity: 1, padding: Math.round(base * 0.022) },
      }),
    );
  }
  if (o.inputIsImage && o.endCard) {
    // Static creative: CTA button and disclaimer sit on the same frame.
    captionFilters.push(
      ...text.block({
        text: o.endCard.cta,
        fontSize: Math.round(base * 0.06),
        color: contrastText(colors.accent),
        y: Math.round(H * (vertical ? 0.86 : 0.84)),
        anchor: "bottom",
        maxWidth: W * 0.7,
        maxLines: 1,
        box: { color: colors.accent, opacity: 1, padding: Math.round(base * 0.025) },
      }),
    );
    if (o.endCard.disclaimer) {
      captionFilters.push(
        ...text.block({
          text: o.endCard.disclaimer,
          fontSize: Math.max(14, Math.round(base * 0.022)),
          color: "#ffffff",
          y: H - margin,
          anchor: "bottom",
          maxWidth: W * 0.9,
          maxLines: 2,
          box: { color: "#000000", opacity: 0.55, padding: 6 },
        }),
      );
    }
  }
  g.push(`[base]${captionFilters.length ? captionFilters.join(",") : "null"}[cap]`);

  // 3. Logo bug in the top-right corner.
  let main = "[cap]";
  const hasEndCardVideo = !o.inputIsImage && !!o.endCard;
  if (logoIndex >= 0) {
    const logoW = Math.round(base * 0.16);
    if (hasEndCardVideo) {
      // Every filter output must be consumed, so only split when the end card needs a second copy.
      g.push(`[${logoIndex}:v]format=rgba,split[logo_a_src][logo_b_src]`);
      g.push(`[logo_b_src]scale=${Math.round(base * 0.3)}:-1[logo_b]`);
    } else {
      g.push(`[${logoIndex}:v]format=rgba[logo_a_src]`);
    }
    g.push(`[logo_a_src]scale=${logoW}:-1[logo_a]`);
    g.push(`[cap][logo_a]overlay=W-w-${margin}:${margin}:shortest=1[main]`);
    main = "[main]";
  }

  // 4. End card (video/gif only).
  let final = main;
  if (hasEndCardVideo && o.endCard) {
    const ec = o.endCard;
    const endDur = ec.durationSec;
    const ecFilters: string[] = [];
    // The logo sits at 30% height; without one the text block moves up to fill that space.
    const ecTop = logoIndex >= 0 ? 0.6 : 0.44;
    if (ec.headline) {
      ecFilters.push(
        ...text.block({
          text: ec.headline,
          fontSize: Math.round(base * 0.055),
          color: contrastText(colors.primary),
          y: Math.round(H * ecTop),
          anchor: "bottom",
          maxWidth: W * 0.84,
          maxLines: 2,
        }),
      );
    }
    ecFilters.push(
      ...text.block({
        text: ec.cta,
        fontSize: Math.round(base * 0.065),
        color: contrastText(colors.accent),
        y: Math.round(H * (ecTop + 0.06)),
        maxWidth: W * 0.8,
        maxLines: 1,
        box: { color: colors.accent, opacity: 1, padding: Math.round(base * 0.025) },
      }),
    );
    const contact = [o.brand?.website, o.brand?.phone].filter(Boolean).join("  |  ");
    if (contact) {
      ecFilters.push(
        ...text.block({
          text: contact,
          fontSize: Math.round(base * 0.034),
          color: contrastText(colors.primary),
          y: Math.round(H * (ecTop + 0.2)),
          maxWidth: W * 0.9,
          maxLines: 1,
        }),
      );
    }
    if (ec.disclaimer) {
      ecFilters.push(
        ...text.block({
          text: ec.disclaimer,
          fontSize: Math.max(12, Math.round(base * 0.022)),
          color: contrastText(colors.primary),
          y: H - margin,
          anchor: "bottom",
          maxWidth: W * 0.9,
          maxLines: 3,
        }),
      );
    }
    g.push(`color=c=${colors.primary.replace("#", "0x")}:s=${W}x${H}:r=${FPS}:d=${endDur.toFixed(2)},format=yuv420p[endbg]`);
    let endCur = "[endbg]";
    if (logoIndex >= 0) {
      g.push(`[endbg][logo_b]overlay=(W-w)/2:H*0.3-h/2:shortest=1[endlogo]`);
      endCur = "[endlogo]";
    }
    g.push(`${endCur}${ecFilters.length ? ecFilters.join(",") + "," : ""}setsar=1,fps=${FPS},format=yuv420p[endcard]`);
    g.push(`${main}format=yuv420p,trim=duration=${o.contentDurationSec.toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS}[maintrim]`);
    const offset = Math.max(0, o.contentDurationSec - ec.fadeSec);
    g.push(`[maintrim][endcard]xfade=transition=fade:duration=${ec.fadeSec}:offset=${offset.toFixed(3)}[final]`);
    final = "[final]";
  }

  // 5. Encode.
  let outArgs: string[];
  if (o.engine === "image") {
    g.push(`${final}format=rgb24[out]`);
    outArgs = ["-map", "[out]", "-frames:v", "1", o.output];
  } else if (o.engine === "gif") {
    g.push(`${final}fps=${GIF_FPS},split[gif_a][gif_b]`, "[gif_a]palettegen=max_colors=128:stats_mode=diff[pal]", "[gif_b][pal]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[out]");
    outArgs = ["-map", "[out]", "-loop", "0", o.output];
  } else {
    g.push(`${final}format=yuv420p[out]`);
    outArgs = ["-map", "[out]", ...X264, o.output];
  }

  const script = path.join(o.workDir, `render_${o.ratio.replace(":", "x")}.graph`);
  writeFileSync(script, g.join(";\n"));
  await runFfmpeg([...inputs, "-filter_complex_script", path.basename(script), ...outArgs], { cwd: o.workDir });
}
