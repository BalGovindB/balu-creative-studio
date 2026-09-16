import type { Shot, Storyboard } from "@/core/types";
import { fillTemplate } from "@/industries";
import type { ScriptProvider, StoryboardInput } from "../types";

/**
 * Deterministic storyboard writer. Used when no LLM is configured and as the fallback
 * when the LLM call fails, so generation never blocks on the script step.
 */
export class TemplateScriptProvider implements ScriptProvider {
  readonly name = "template";

  async createStoryboard(input: StoryboardInput): Promise<Storyboard> {
    const vars = input.templateVars;
    const product = vars.product?.trim() || input.template.name;
    const offer = vars.offer?.trim();
    const beats = input.template.structure.map((b) => fillTemplate(b, vars));
    const scriptLines = input.userScript ? splitIntoChunks(input.userScript, input.shotCount) : [];
    const cast = input.characters;
    const sceneText = input.scene.description || "a clean, well-lit setting";

    const shots: Shot[] = input.shotDurations.map((durationSec, i) => {
      const beat = beats[Math.min(beats.length - 1, Math.floor((i * beats.length) / input.shotCount))];
      const beatText = beat.replace(/^[^:]+:\s*/, "");
      // Rotate the cast through shots so every character appears at least once.
      const inShot = cast.length ? [cast[i % cast.length]] : [];
      if (cast.length > 1 && i === input.shotCount - 1) inShot.splice(0, 1, ...cast);
      const who = inShot.map((c) => c.description).join("; ");
      const isLast = i === input.shotCount - 1;
      const caption =
        scriptLines[i] ??
        (i === 0 ? firstCaption(input.userPrompt, product) : isLast ? [product, offer].filter(Boolean).join(" - ") : offer || beatText);

      return {
        index: i,
        durationSec,
        visualPrompt: `${beatText}. ${who ? `Featuring ${who}. ` : ""}Setting: ${sceneText}. Product: ${product}.`,
        motionPrompt: i === 0 ? "slow cinematic push-in, subtle natural movement" : "smooth camera drift, natural character movement",
        caption: truncateWords(caption, input.engine === "gif" ? 6 : 9),
        voiceover: scriptLines[i] ?? caption,
        characterIds: inShot.map((c) => c.id),
      };
    });

    return {
      title: `${product} - ${input.template.name}`,
      hook: shots[0]?.caption ?? product,
      shots,
      cta: input.template.defaultCta,
      disclaimer: input.pack.compliance.disclaimer || undefined,
      source: this.name,
    };
  }
}

function firstCaption(prompt: string, product: string): string {
  const firstSentence = prompt.split(/(?<=[.!?])\s/)[0]?.trim();
  return firstSentence && firstSentence.length <= 70 ? firstSentence : product;
}

function truncateWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : words.slice(0, max).join(" ") + "…";
}

/** Split a script into `n` roughly even chunks on sentence boundaries. */
export function splitIntoChunks(script: string, n: number): string[] {
  const sentences = script
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return [];
  const chunks: string[] = [];
  const per = Math.max(1, Math.ceil(sentences.length / n));
  for (let i = 0; i < n; i++) {
    const chunk = sentences.slice(i * per, (i + 1) * per).join(" ");
    chunks.push(chunk || sentences[sentences.length - 1]);
  }
  return chunks;
}
