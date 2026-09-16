import type { Engine } from "@/core/types";

/**
 * An IndustryPack is the unit of extension. Adding a new industry means writing one
 * file that exports a pack and registering it in ./index.ts - nothing else changes.
 */

export type CampaignGoal =
  | "awareness"
  | "lead-generation"
  | "conversion"
  | "retention"
  | "upsell"
  | "cross-sell"
  | "recovery"
  | "recruitment";

export interface TemplateVariable {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
}

export interface UseCaseTemplate {
  id: string;
  name: string;
  goal: CampaignGoal;
  description: string;
  /** Brief skeleton. `{{key}}` placeholders are filled from TemplateVariable values. */
  brief: string;
  variables: TemplateVariable[];
  /** Beat sheet the storyboard should follow, in order. */
  structure: string[];
  defaultCta: string;
  engines: Engine[];
  suggestedCharacterIds: string[];
  suggestedSceneId?: string;
}

export interface CharacterPreset {
  id: string;
  name: string;
  description: string;
}

export interface ScenePreset {
  id: string;
  name: string;
  description: string;
}

export interface IndustryPack {
  id: string;
  name: string;
  emoji: string;
  description: string;
  audience: string;
  tone: string;
  /** Art direction appended to every image/video prompt for this industry. */
  visualStyle: string;
  characters: CharacterPreset[];
  scenes: ScenePreset[];
  templates: UseCaseTemplate[];
  compliance: {
    /** Default on-screen disclaimer for end cards. Empty string = none. */
    disclaimer: string;
    /** Guardrails the script writer must follow. */
    rules: string[];
  };
}

/** Client-safe summary used by the picker UI. */
export type IndustrySummary = Pick<IndustryPack, "id" | "name" | "emoji" | "description">;
