import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Storyboard } from "@/core/types";
import type { ScriptProvider, StoryboardInput } from "../types";

const StoryboardSchema = z.object({
  title: z.string(),
  hook: z.string(),
  shots: z.array(
    z.object({
      visualPrompt: z.string(),
      motionPrompt: z.string(),
      caption: z.string(),
      voiceover: z.string(),
      characterIds: z.array(z.string()),
    }),
  ),
  cta: z.string(),
  disclaimer: z.string(),
});

const SYSTEM = `You are a senior creative director who writes short-form social ad storyboards that are then produced by AI image and image-to-video models.

How your output is used:
- Each shot's visualPrompt generates one keyframe image, and motionPrompt animates it into a clip. The image model does not know character names or ids, so describe every person who appears by their appearance, wardrobe and action, and describe the setting, lighting and camera framing. Keep people and wardrobe consistent across shots.
- Never ask for written words, logos, UI text or captions inside images - on-screen text is added in post-production from the caption field, and garbled AI text ruins an ad.
- Captions are overlaid on video in a brand-coloured box, so they must be short and punchy. The CTA appears on a closing end card.
- Respect every compliance rule you are given. They exist for legal and brand-safety reasons; if the brief conflicts with a rule, follow the rule.
- Only use prices, figures and claims that appear in the brief or offer text. Do not invent statistics.`;

export class AnthropicScriptProvider implements ScriptProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(private readonly model: string) {
    this.client = new Anthropic();
  }

  async createStoryboard(input: StoryboardInput): Promise<Storyboard> {
    const captionWords = input.engine === "gif" ? 5 : input.engine === "image" ? 10 : 8;
    const { pack, template, brand } = input;

    const request = [
      `## Format`,
      input.engine === "image"
        ? `A single static social creative. Write exactly 1 shot; its caption is the headline.`
        : `A ${input.engine === "gif" ? "looping GIF" : "video ad"} of ${input.durationSec} seconds, followed by an end card. Write exactly ${input.shotCount} shots with these durations in seconds: ${input.shotDurations.map((d) => d.toFixed(1)).join(", ")}.`,
      `Captions: at most ${captionWords} words each. CTA: at most 4 words. Disclaimer: one short sentence, or the industry default below.`,
      ``,
      `## Industry: ${pack.name}`,
      `Audience: ${pack.audience}`,
      `Tone: ${pack.tone}`,
      `Visual style: ${pack.visualStyle}`,
      `Default disclaimer: ${pack.compliance.disclaimer || "(none)"}`,
      `Compliance rules:`,
      ...pack.compliance.rules.map((r) => `- ${r}`),
      ``,
      `## Use case: ${template.name} (goal: ${template.goal})`,
      `Brief: ${input.brief}`,
      `Beat structure to follow:`,
      ...template.structure.map((s, i) => `${i + 1}. ${s}`),
      `Suggested CTA: ${template.defaultCta}`,
      Object.keys(input.templateVars).length
        ? `Details:\n${Object.entries(input.templateVars).filter(([, v]) => v.trim()).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
        : "",
      ``,
      `## Cast (use these ids in characterIds)`,
      input.characters.length
        ? input.characters.map((c) => `- id "${c.id}": ${c.name} - ${c.description}${c.referenceAssetId ? " (a reference photo is provided to the image model)" : ""}`).join("\n")
        : "- No fixed cast. Use people only if the beat needs them, or focus on product and setting.",
      ``,
      `## Scene`,
      input.scene.description || "Choose a setting that suits the industry visual style.",
      brand ? `\n## Brand\nName: ${brand.name}${brand.tagline ? `\nTagline: ${brand.tagline}` : ""}\nBrand colours (weave subtly into wardrobe or set dressing): ${brand.colors.primary}, ${brand.colors.secondary}, ${brand.colors.accent}` : "",
      input.userPrompt.trim() ? `\n## Creative direction from the user\n${input.userPrompt.trim()}` : "",
      input.userScript?.trim()
        ? `\n## User's script\nKeep the user's wording for voiceover and derive captions from it; distribute it across the shots in order.\n${input.userScript.trim()}`
        : "",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: request }],
      output_config: { format: betaZodOutputFormat(StoryboardSchema) },
    });

    if (response.stop_reason === "refusal") {
      throw new Error(`Claude declined to write this storyboard${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}`);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`Claude returned no parseable storyboard (stop_reason: ${response.stop_reason})`);

    const validIds = new Set(input.characters.map((c) => c.id));
    const shots = input.shotDurations.map((durationSec, i) => {
      const s = parsed.shots[Math.min(i, parsed.shots.length - 1)];
      return {
        index: i,
        durationSec,
        visualPrompt: s.visualPrompt,
        motionPrompt: s.motionPrompt,
        caption: s.caption,
        voiceover: s.voiceover,
        characterIds: s.characterIds.filter((id) => validIds.has(id)),
      };
    });
    if (parsed.shots.length === 0) throw new Error("Claude returned a storyboard with no shots");

    return {
      title: parsed.title,
      hook: parsed.hook,
      shots,
      cta: parsed.cta,
      disclaimer: parsed.disclaimer.trim() || pack.compliance.disclaimer || undefined,
      source: `anthropic:${response.model}`,
    };
  }
}
