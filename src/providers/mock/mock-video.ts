import path from "node:path";
import { FORMATS } from "@/core/formats";
import { runFfmpeg } from "@/media/ffmpeg";
import type { VideoGenerateInput, VideoProvider } from "../types";

/** Offline stand-in for an image-to-video model: a slow Ken Burns push-in on the keyframe. */
export class MockVideoProvider implements VideoProvider {
  readonly name = "mock";
  readonly clipDurations = [5, 10];

  async generate(input: VideoGenerateInput): Promise<string> {
    const { width, height } = FORMATS[input.aspectRatio];
    const w = Math.round(width / 2 / 2) * 2;
    const h = Math.round(height / 2 / 2) * 2;
    const fps = 30;
    const frames = Math.round(input.durationSec * fps);
    const outputPath = `${input.outputBase}.mp4`;
    const zoomStep = (0.18 / frames).toFixed(5);
    const vf = [
      `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase`,
      `crop=${w * 2}:${h * 2}`,
      `zoompan=z='min(zoom+${zoomStep},1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`,
      "format=yuv420p",
    ].join(",");
    await runFfmpeg(
      ["-i", input.imagePath, "-vf", vf, "-frames:v", String(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", outputPath],
      { cwd: path.dirname(input.outputBase) },
    );
    return outputPath;
  }
}
