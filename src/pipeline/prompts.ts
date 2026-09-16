import type { BrandKit, CharacterSpec, SceneSpec, Shot } from "@/core/types";
import type { IndustryPack } from "@/industries/types";

/**
 * Image models render text as garbled glyphs, and every headline, logo and CTA is added
 * later by the compositor - so every prompt asks for a clean plate.
 */
const NO_BAKED_TEXT =
  "Absolutely no text, letters, words, numbers, logos, watermarks, subtitles, price tags or user-interface elements anywhere in the image.";

const PHOTO_QUALITY = "Professional advertising photography, high detail, natural skin texture, realistic lighting, sharp focus, no distortion, correct anatomy with five fingers per hand.";

export function characterSheetPrompt(pack: IndustryPack, character: CharacterSpec): string {
  return [
    `Character reference photograph: ${character.description}.`,
    "Single person, three-quarter body framing, facing camera, neutral expression, plain light grey seamless studio background, soft even lighting.",
    pack.visualStyle,
    PHOTO_QUALITY,
    NO_BAKED_TEXT,
  ].join(" ");
}

export function scenePlatePrompt(pack: IndustryPack, scene: SceneSpec): string {
  return [
    `Empty establishing photograph of a location: ${scene.description}.`,
    "No people in frame. Wide angle, natural depth, room left in the centre of the frame for a subject.",
    pack.visualStyle,
    PHOTO_QUALITY,
    NO_BAKED_TEXT,
  ].join(" ");
}

export interface KeyframeContext {
  pack: IndustryPack;
  shot: Shot;
  hasCharacterReferences: boolean;
  hasSceneReference: boolean;
  hasProductReferences: boolean;
  brand?: BrandKit;
}

export function keyframePrompt(context: KeyframeContext): string {
  const { pack, shot, brand } = context;
  const referenceNotes: string[] = [];
  if (context.hasCharacterReferences) {
    referenceNotes.push("Keep each person's face, hairstyle, body type and wardrobe identical to the attached character reference images.");
  }
  if (context.hasSceneReference) {
    referenceNotes.push("Place the action inside the location shown in the attached background reference, matching its lighting and colour.");
  }
  if (context.hasProductReferences) {
    referenceNotes.push("Reproduce the product in the attached product reference exactly - same shape, colour, materials and proportions.");
  }

  return [
    shot.visualPrompt,
    pack.visualStyle,
    ...referenceNotes,
    brand ? `Weave the brand colours ${brand.colors.primary} and ${brand.colors.accent} subtly into wardrobe, props or set dressing - never as graphics or text.` : "",
    PHOTO_QUALITY,
    NO_BAKED_TEXT,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Motion prompt for the image-to-video step; the keyframe already fixes the content. */
export function motionPrompt(shot: Shot): string {
  return [
    shot.motionPrompt || "gentle cinematic camera movement",
    "Natural, believable motion. Keep the subject's identity, wardrobe and the background consistent for the whole clip.",
    "No text or captions appearing in the video.",
  ].join(" ");
}
