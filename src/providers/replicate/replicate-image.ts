import type { ImageGenerateInput, ImageProvider } from "../types";
import type { ReplicateClient } from "./client";

/**
 * Model input shapes differ per model. Add a builder here when switching models via env;
 * unknown models get the generic `{prompt, aspect_ratio, image_input}` shape.
 */
type Builder = (prompt: string, aspectRatio: string, imageUrls: string[]) => Record<string, unknown>;

const BUILDERS: Record<string, Builder> = {
  "black-forest-labs/flux-schnell": (prompt, aspect_ratio) => ({ prompt, aspect_ratio, output_format: "png", num_outputs: 1 }),
  "black-forest-labs/flux-1.1-pro": (prompt, aspect_ratio) => ({ prompt, aspect_ratio, output_format: "png" }),
  "google/nano-banana": (prompt, aspect_ratio, image_input) => ({ prompt, image_input, aspect_ratio, output_format: "png" }),
  "black-forest-labs/flux-kontext-pro": (prompt, aspect_ratio, urls) => ({ prompt, input_image: urls[0], aspect_ratio, output_format: "png" }),
};

const generic: Builder = (prompt, aspect_ratio, urls) => ({ prompt, aspect_ratio, ...(urls.length ? { image_input: urls } : {}) });

export class ReplicateImageProvider implements ImageProvider {
  readonly name = "replicate";

  constructor(
    private readonly client: ReplicateClient,
    /** Used when there are no reference images. */
    private readonly textToImageModel: string,
    /** Used when reference images must be respected (characters, products, backgrounds). */
    private readonly imageEditModel: string,
  ) {}

  async generate(input: ImageGenerateInput): Promise<string> {
    const refs = input.referenceImages;
    const model = refs.length ? this.imageEditModel : this.textToImageModel;
    const urls = await Promise.all(refs.map((r) => this.client.uploadFile(r)));
    const build = BUILDERS[model.split(":")[0]] ?? generic;
    const output = await this.client.run(model, build(input.prompt, input.aspectRatio, urls));
    return this.client.downloadOutput(output, input.outputBase, ".png");
  }
}
