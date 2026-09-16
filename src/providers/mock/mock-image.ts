import { writeFileSync } from "node:fs";
import path from "node:path";
import { FORMATS } from "@/core/formats";
import { runFfmpeg } from "@/media/ffmpeg";
import { resolveFont, TextRenderer } from "@/media/text";
import type { ImageGenerateInput, ImageProvider } from "../types";

/**
 * Gradient pairs, deliberately deep and low-contrast so brand-coloured captions, the logo and
 * the CTA read clearly on top of them instead of fighting the background.
 */
const PALETTE: [string, string][] = [
  ["0x4a7aa8", "0x24405e"],
  ["0x72588f", "0x372a52"],
  ["0x3d8a78", "0x1d4f45"],
  ["0xa5764a", "0x5a3722"],
  ["0x53768f", "0x2a3f4f"],
  ["0x95566f", "0x4a2038"],
  ["0x6d8a49", "0x36441f"],
  ["0x55558f", "0x2b2b54"],
];

/**
 * Offline stand-in for an image model.
 *
 * It renders a clean neutral panel rather than a technical dump. Running without API keys is
 * how the pipeline gets demonstrated, and everything composited on top - captions, logo, CTA,
 * end card, the three aspect ratios - is produced for real, so the placeholder should recede
 * rather than compete. The prompt behind each shot is still visible in the storyboard panel,
 * so nothing is actually lost by keeping it off the image.
 */
export class MockImageProvider implements ImageProvider {
  readonly name = "mock";

  async generate(input: ImageGenerateInput): Promise<string> {
    const { width, height } = scaled(input.aspectRatio);
    const workDir = path.dirname(input.outputBase);
    const outputPath = `${input.outputBase}.png`;
    const [from, to] = PALETTE[hash(input.label) % PALETTE.length];
    const base = Math.min(width, height);
    const fontSize = Math.round(base * 0.05);

    const text = new TextRenderer(workDir, resolveFont(), `mockfont_${path.basename(input.outputBase)}`);
    const label = text.block({
      text: input.label,
      fontSize,
      color: "#c8d4e8",
      // Optically centred: block() places the top edge, and one line is 1.25x the font size.
      y: Math.round(height / 2 - fontSize * 0.625),
      maxWidth: width * 0.8,
      maxLines: 1,
    });

    const script = `${path.basename(input.outputBase)}.graph`;
    writeFileSync(path.join(workDir, script), `[0:v]vignette=PI/9,${label.join(",")},format=rgb24[out]`);
    await runFfmpeg(
      [
        "-f",
        "lavfi",
        "-i",
        `gradients=s=${width}x${height}:c0=${from}:c1=${to}:x0=0:y0=0:x1=${width}:y1=${height}:d=1`,
        "-filter_complex_script",
        script,
        "-map",
        "[out]",
        "-frames:v",
        "1",
        outputPath,
      ],
      { cwd: workDir },
    );
    return outputPath;
  }
}

/** Mock output at half resolution keeps the offline pipeline fast. */
function scaled(ratio: ImageGenerateInput["aspectRatio"]) {
  const { width, height } = FORMATS[ratio];
  return { width: Math.round(width / 2 / 2) * 2, height: Math.round(height / 2 / 2) * 2 };
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
