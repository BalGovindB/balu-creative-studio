/**
 * Domain types shared by the API, the pipeline and the UI.
 * Keep this file free of Node-only imports so the client bundle can use it.
 */

/** What the user wants out: a 15-30s video, a short looping GIF, or a static creative. */
export type Engine = "video" | "gif" | "image";

/** How the creative is driven: a short brief, a full script, or uploaded image(s). */
export type InputMode = "text" | "script" | "image";

export type AspectRatio = "9:16" | "1:1" | "16:9";

/** How a master render is adapted to another aspect ratio. */
export type ReframeMode = "blur-pad" | "crop";

export interface CharacterSpec {
  id: string;
  name: string;
  /** Appearance, wardrobe, role - fed to the image model. */
  description: string;
  /** Optional uploaded reference photo (asset id). */
  referenceAssetId?: string;
}

export interface SceneSpec {
  /** Preset from the industry pack, if chosen. */
  presetId?: string;
  description: string;
  /** Optional uploaded background plate (asset id). Skips scene generation. */
  backgroundAssetId?: string;
}

export interface GenerationRequest {
  engine: Engine;
  inputMode: InputMode;
  industryId: string;
  templateId: string;
  /** Brief / idea. Required for text mode, optional context otherwise. */
  prompt: string;
  /** Full script (script mode). */
  script?: string;
  /** Uploaded source images (image mode). */
  sourceAssetIds: string[];
  /** Values for the template's variables, e.g. productName, offer. */
  templateVars: Record<string, string>;
  characters: CharacterSpec[];
  scene: SceneSpec;
  brandKitId?: string;
  aspectRatios: AspectRatio[];
  reframe: ReframeMode;
  /** Video: 15-30. GIF: 2-6. Ignored for image. */
  durationSec: number;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
}

export interface BrandKit {
  id: string;
  name: string;
  colors: BrandColors;
  /** Stored file names inside the brand kit folder. */
  logoFile?: string;
  fontFile?: string;
  tagline?: string;
  website?: string;
  phone?: string;
  createdAt: string;
}

export interface Shot {
  index: number;
  durationSec: number;
  /** What the frame shows - subject, action, framing. */
  visualPrompt: string;
  /** Motion direction for image-to-video. */
  motionPrompt: string;
  /** On-screen text overlay (short). */
  caption: string;
  /** Voiceover line (kept for the Phase 2 TTS track). */
  voiceover: string;
  /** Character ids that appear in this shot. */
  characterIds: string[];
}

export interface Storyboard {
  title: string;
  hook: string;
  shots: Shot[];
  cta: string;
  disclaimer?: string;
  /** Which provider wrote this - handy when debugging output quality. */
  source: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface OutputFile {
  aspectRatio: AspectRatio;
  kind: Engine;
  /** Path relative to the storage root, served through /api/files. */
  path: string;
  width: number;
  height: number;
}

export interface JobStep {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  detail?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  request: GenerationRequest;
  progress: number;
  steps: JobStep[];
  storyboard?: Storyboard;
  /** Generated intermediate assets worth showing (character sheets, scene plate, keyframes). */
  previews: { label: string; path: string }[];
  outputs: OutputFile[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}
