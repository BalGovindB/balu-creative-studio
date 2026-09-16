import { z } from "zod";
import { DURATION_LIMITS } from "./formats";
import type { GenerationRequest } from "./types";

const aspect = z.enum(["9:16", "1:1", "16:9"]);

export const generationRequestSchema = z
  .object({
    engine: z.enum(["video", "gif", "image"]),
    inputMode: z.enum(["text", "script", "image"]),
    industryId: z.string().min(1),
    templateId: z.string().min(1),
    prompt: z.string().max(2000).default(""),
    script: z.string().max(5000).optional(),
    sourceAssetIds: z.array(z.string()).max(4).default([]),
    templateVars: z.record(z.string(), z.string().max(300)).default({}),
    characters: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1).max(60),
          description: z.string().max(600),
          referenceAssetId: z.string().optional(),
        }),
      )
      .max(4)
      .default([]),
    scene: z
      .object({
        presetId: z.string().optional(),
        description: z.string().max(600).default(""),
        backgroundAssetId: z.string().optional(),
      })
      .default({ description: "" }),
    brandKitId: z.string().optional(),
    aspectRatios: z.array(aspect).min(1).max(3),
    reframe: z.enum(["blur-pad", "crop"]).default("blur-pad"),
    durationSec: z.number().default(0),
  })
  .superRefine((req, ctx) => {
    if (req.inputMode === "text" && !req.prompt.trim()) {
      ctx.addIssue({ code: "custom", path: ["prompt"], message: "A prompt is required in text mode." });
    }
    if (req.inputMode === "script" && !req.script?.trim()) {
      ctx.addIssue({ code: "custom", path: ["script"], message: "A script is required in script mode." });
    }
    if (req.inputMode === "image" && req.sourceAssetIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["sourceAssetIds"], message: "Upload at least one image in image mode." });
    }
  })
  .transform((req): GenerationRequest => {
    const limits = DURATION_LIMITS[req.engine];
    const durationSec =
      req.engine === "image" ? 0 : clamp(req.durationSec || limits.default, limits.min, limits.max);
    return { ...req, aspectRatios: [...new Set(req.aspectRatios)], durationSec };
  });

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
