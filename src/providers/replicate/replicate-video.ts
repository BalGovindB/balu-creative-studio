import type { VideoGenerateInput, VideoProvider } from "../types";
import type { ReplicateClient } from "./client";

interface VideoModelSpec {
  clipDurations: number[];
  build: (prompt: string, imageUrl: string, duration: number, aspectRatio: string) => Record<string, unknown>;
}

/** Known image-to-video models. Add an entry to support another model via REPLICATE_VIDEO_MODEL. */
const MODELS: Record<string, VideoModelSpec> = {
  "bytedance/seedance-1-lite": {
    clipDurations: [5, 10],
    build: (prompt, image, duration, aspect_ratio) => ({ prompt, image, duration, aspect_ratio, resolution: "720p", camera_fixed: false }),
  },
  "bytedance/seedance-1-pro": {
    clipDurations: [5, 10],
    build: (prompt, image, duration, aspect_ratio) => ({ prompt, image, duration, aspect_ratio, resolution: "1080p", camera_fixed: false }),
  },
  "kwaivgi/kling-v2.1": {
    clipDurations: [5, 10],
    build: (prompt, start_image, duration) => ({ prompt, start_image, duration, mode: "standard" }),
  },
  "minimax/video-01": {
    clipDurations: [6],
    build: (prompt, first_frame_image) => ({ prompt, first_frame_image, prompt_optimizer: true }),
  },
};

const GENERIC: VideoModelSpec = {
  clipDurations: [5],
  build: (prompt, image, duration, aspect_ratio) => ({ prompt, image, duration, aspect_ratio }),
};

export class ReplicateVideoProvider implements VideoProvider {
  readonly name = "replicate";
  readonly clipDurations: number[];
  private readonly spec: VideoModelSpec;

  constructor(
    private readonly client: ReplicateClient,
    private readonly model: string,
  ) {
    this.spec = MODELS[model.split(":")[0]] ?? GENERIC;
    this.clipDurations = this.spec.clipDurations;
  }

  async generate(input: VideoGenerateInput): Promise<string> {
    const imageUrl = await this.client.uploadFile(input.imagePath);
    const duration = this.clipDurations.find((d) => d >= input.durationSec) ?? this.clipDurations[this.clipDurations.length - 1];
    const output = await this.client.run(this.model, this.spec.build(input.prompt, imageUrl, duration, input.aspectRatio));
    return this.client.downloadOutput(output, input.outputBase, ".mp4");
  }
}
