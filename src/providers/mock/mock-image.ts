import { writeFileSync } from "node:fs";
import path from "node:path";
import { FORMATS } from "@/core/formats";
import { runFfmpeg } from "@/media/ffmpeg";
import { resolveFont, TextRenderer } from "@/media/text";
import type { ImageGenerateInput, ImageProvider } from "../types";

const PALETTE = ["#243b73", "#5b2a86", "#1d6f5f", "#8a3b12", "#14506e", "#6e1d4a", "#3c5a14", "#2f2f6b"];

/**
 * Offline stand-in for an image model. Produces a labelled placeholder and composites any
 * reference images side by side, so multi-character and background flows are visible
 * without API keys.
 */
export class MockImageProvider implements ImageProvider {
  readonly name = "mock";

  async generate(input: ImageGenerateInput): Promise<string> {
    const { width, height } = scaled(input.aspectRatio);
    const workDir = path.dirname(input.outputBase);
    const outputPath = `${input.outputBase}.png`;
    const color = PALETTE[hash(input.label) % PALETTE.length];
    const text = new TextRenderer(workDir, resolveFont(), `mockfont_${path.basename(input.outputBase)}`);
    const base = Math.min(width, height);

    const refs = input.referenceImages.slice(0, 4);
    const args = ["-f", "lavfi", "-i", `color=c=${color.replace("#", "0x")}:s=${width}x${height}:d=1`];
    for (const ref of refs) args.push("-i", ref);

    const g: string[] = [`[0:v]vignette=PI/4[bg]`];
    let cur = "[bg]";
    if (refs.length) {
      const refH = Math.round(height * 0.5);
      refs.forEach((_, i) => g.push(`[${i + 1}:v]scale=-2:${refH},setsar=1,format=rgba[r${i}]`));
      if (refs.length === 1) g.push(`[r0]null[strip]`);
      else g.push(`${refs.map((_, i) => `[r${i}]`).join("")}hstack=inputs=${refs.length}[strip]`);
      g.push(`[strip]scale='min(iw,${Math.round(width * 0.92)})':-2[stripfit]`);
      g.push(`${cur}[stripfit]overlay=(W-w)/2:H-h-${Math.round(height * 0.06)}[withrefs]`);
      cur = "[withrefs]";
    }

    const labels = [
      ...text.block({ text: `MOCK · ${input.label}`, fontSize: Math.round(base * 0.06), color: "#ffffff", y: Math.round(height * 0.06), maxWidth: width * 0.9, maxLines: 2 }),
      ...text.block({ text: input.prompt, fontSize: Math.round(base * 0.032), color: "#dfe6ff", y: Math.round(height * 0.2), maxWidth: width * 0.86, maxLines: refs.length ? 5 : 12 }),
    ];
    g.push(`${cur}${labels.join(",")},format=rgb24[out]`);

    const script = `${path.basename(input.outputBase)}.graph`;
    writeFileSync(path.join(workDir, script), g.join(";\n"));
    await runFfmpeg([...args, "-filter_complex_script", script, "-map", "[out]", "-frames:v", "1", outputPath], { cwd: workDir });
    return outputPath;
  }
}

/** Mock output at ~half resolution keeps the offline pipeline fast. */
function scaled(ratio: ImageGenerateInput["aspectRatio"]) {
  const { width, height } = FORMATS[ratio];
  return { width: Math.round(width / 2 / 2) * 2, height: Math.round(height / 2 / 2) * 2 };
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
