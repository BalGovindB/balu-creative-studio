import type { AspectRatio, BrandKit, CharacterSpec, Engine, SceneSpec, Storyboard } from "@/core/types";
import type { IndustryPack, UseCaseTemplate } from "@/industries/types";

/**
 * Provider contracts. The pipeline only talks to these interfaces, so swapping
 * Replicate for Runway, Fal, Veo, Kling direct APIs, or an in-house model means
 * adding one adapter and wiring it in ./registry.ts.
 */

export interface ImageGenerateInput {
  prompt: string;
  aspectRatio: AspectRatio;
  /** Local file paths of reference images (characters, product, background). */
  referenceImages: string[];
  /** Absolute path without extension. The provider appends the real extension and returns the full path. */
  outputBase: string;
  /** Short label used by the mock provider and in logs. */
  label: string;
}

export interface ImageProvider {
  readonly name: string;
  generate(input: ImageGenerateInput): Promise<string>;
}

export interface VideoGenerateInput {
  /** Motion + content prompt. */
  prompt: string;
  /** Start frame (local path). Image-to-video is the default for character consistency. */
  imagePath: string;
  aspectRatio: AspectRatio;
  durationSec: number;
  /** Absolute path without extension. The provider appends the real extension and returns the full path. */
  outputBase: string;
}

export interface VideoProvider {
  readonly name: string;
  /** Clip lengths the model can produce natively, ascending (e.g. [5, 10]). */
  readonly clipDurations: number[];
  generate(input: VideoGenerateInput): Promise<string>;
}

export interface StoryboardInput {
  engine: Engine;
  pack: IndustryPack;
  template: UseCaseTemplate;
  /** Template brief with variables filled in. */
  brief: string;
  userPrompt: string;
  userScript?: string;
  templateVars: Record<string, string>;
  characters: CharacterSpec[];
  scene: SceneSpec;
  brand?: BrandKit;
  durationSec: number;
  shotCount: number;
  /** Target seconds per shot (the pipeline's clip plan). */
  shotDurations: number[];
}

export interface ScriptProvider {
  readonly name: string;
  createStoryboard(input: StoryboardInput): Promise<Storyboard>;
}
