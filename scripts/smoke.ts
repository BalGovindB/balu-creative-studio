/**
 * End-to-end check of the generation pipeline with the offline mock providers.
 *
 *   npm run smoke                 # video, gif, image and a branded video
 *   npm run smoke -- gif image    # just those engines
 *
 * Writes into ./storage/smoke so it never disturbs real jobs.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

process.env.STORAGE_DIR ??= path.join(process.cwd(), "storage", "smoke");
// The point of the smoke test is the plumbing, so pin it to the deterministic providers.
process.env.SCRIPT_PROVIDER = "template";
process.env.IMAGE_PROVIDER = "mock";
process.env.VIDEO_PROVIDER = "mock";

import type { BrandKit, Engine } from "../src/core/types";
import { generationRequestSchema } from "../src/core/validation";
import { runFfmpeg } from "../src/media/ffmpeg";
import { resolveFont } from "../src/media/text";
import { runGeneration, stepNamesFor } from "../src/pipeline/run";
import { createBrandKit } from "../src/storage/brand-kits";
import { createJob, getJob } from "../src/storage/jobs";
import { ensureDir, resolveInStorage, storagePath } from "../src/storage/paths";

interface Case {
  name: string;
  engine: Engine;
  /** Exercises the logo overlay, brand colours and custom-font code paths. */
  branded?: boolean;
  input: Record<string, unknown>;
}

const CASES: Case[] = [
  {
    name: "video",
    engine: "video",
    input: {
      engine: "video",
      inputMode: "text",
      industryId: "insurance",
      templateId: "health-cover-awareness",
      prompt: "A young family enjoys a weekend at home, then learns their hospital bill is fully cashless.",
      templateVars: { product: "FamilyCare Health Plan", audience: "young families", offer: "Cashless at 10,000+ hospitals" },
      characters: [
        { id: "young-parent", name: "Young parent", description: "Parent in their early 30s, casual smart clothes, kind expression" },
        { id: "advisor", name: "Insurance advisor", description: "Friendly advisor in their 40s, business-casual, holding a tablet" },
      ],
      scene: { presetId: "family-home", description: "Bright modern living room, sofa, family photos, afternoon sunlight" },
      aspectRatios: ["9:16", "1:1"],
      reframe: "blur-pad",
      durationSec: 15,
    },
  },
  {
    name: "gif",
    engine: "gif",
    input: {
      engine: "gif",
      inputMode: "script",
      industryId: "qsr-food",
      templateId: "combo-deal",
      script: "Hungry? The Friends Feast Box is here. Four burgers, two fries, four drinks. Just 499.",
      templateVars: { product: "Friends Feast Box", audience: "groups of friends", offer: "4 burgers + 2 fries + 4 drinks at 499" },
      characters: [{ id: "college-friends", name: "Group of friends", description: "Three college friends in their early 20s, casual streetwear, laughing" }],
      scene: { presetId: "hostel-room", description: "Cosy hangout room with bean bags, evening lights, snacks on a table" },
      aspectRatios: ["1:1"],
      durationSec: 4,
    },
  },
  {
    name: "image",
    engine: "image",
    input: {
      engine: "image",
      inputMode: "text",
      industryId: "footwear",
      templateId: "sale-countdown",
      prompt: "Urgent, high-energy sale creative for the running collection.",
      templateVars: { product: "Sports collection", audience: "runners and gym-goers", offer: "Up to 50% off, ends Sunday" },
      characters: [{ id: "runner", name: "Runner", description: "Athletic runner in performance wear, determined, mid-stride" }],
      scene: { presetId: "running-track", description: "Stadium running track at sunrise, long shadows" },
      aspectRatios: ["16:9", "9:16"],
      reframe: "crop",
      durationSec: 0,
    },
  },
  {
    name: "branded",
    engine: "video",
    branded: true,
    input: {
      engine: "video",
      inputMode: "text",
      industryId: "security-cctv",
      templateId: "watch-from-anywhere",
      prompt: "A parent at work checks the home camera feed and relaxes.",
      templateVars: { product: "SmartEye 4K Wi-Fi Camera", audience: "working parents", offer: "Free installation this month" },
      characters: [{ id: "homeowner", name: "Homeowner", description: "Homeowner in their 30s checking a live camera feed on a smartphone" }],
      scene: { presetId: "home-entrance", description: "Modern home front door with a smart doorbell camera, evening lights" },
      aspectRatios: ["16:9"],
      durationSec: 15,
    },
  },
];

/** Builds a throwaway brand kit with a real PNG logo and a real font file. */
async function makeBrandKit(): Promise<BrandKit> {
  const workDir = ensureDir(storagePath("smoke-assets"));
  const logoPath = path.join(workDir, "logo.png");
  // drawbox blends RGB but never writes alpha, so the transparency comes from alphamerge:
  // an opaque badge on a transparent field, which is the shape a real brand logo arrives in.
  await runFfmpeg(
    [
      "-f", "lavfi", "-i", "color=c=0xf4d35e:s=400x140",
      "-f", "lavfi", "-i", "color=c=black:s=400x140,drawbox=x=30:y=20:w=340:h=100:color=white:t=fill",
      "-filter_complex", "[0:v][1:v]alphamerge[out]",
      "-map", "[out]", "-frames:v", "1", logoPath,
    ],
    { cwd: workDir },
  );

  const fontPath = resolveFont();
  return createBrandKit(
    {
      name: "SmokeBrand",
      colors: { primary: "#0d3b66", secondary: "#08223d", accent: "#f4d35e", text: "#ffffff" },
      tagline: "Always watching over you",
      website: "smokebrand.example",
      phone: "1800 000 000",
    },
    {
      logo: new File([readFileSync(logoPath)], "logo.png", { type: "image/png" }),
      font: new File([readFileSync(fontPath)], `font${path.extname(fontPath)}`, { type: "font/ttf" }),
    },
  );
}

async function main(): Promise<void> {
  const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const cases = wanted.length ? CASES.filter((c) => wanted.includes(c.name) || wanted.includes(c.engine)) : CASES;
  if (cases.length === 0) throw new Error(`No matching cases in: ${wanted.join(", ")}`);

  let brandKit: BrandKit | undefined;
  let failures = 0;

  for (const testCase of cases) {
    const started = Date.now();
    process.stdout.write(`\n=== ${testCase.name} ===\n`);

    if (testCase.branded && !brandKit) {
      brandKit = await makeBrandKit();
      console.log(`  brand kit ${brandKit.id}: logo=${brandKit.logoFile} font=${brandKit.fontFile}`);
    }

    const parsed = generationRequestSchema.safeParse(
      testCase.branded ? { ...testCase.input, brandKitId: brandKit?.id } : testCase.input,
    );
    if (!parsed.success) {
      failures++;
      console.error("  request did not validate:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      continue;
    }

    const request = parsed.data;
    const job = createJob(request, stepNamesFor(request.engine));
    await runGeneration(job.id, request);

    const finished = getJob(job.id);
    if (!finished || finished.status !== "succeeded") {
      failures++;
      console.error(`  FAILED: ${finished?.error ?? "job vanished"}`);
      for (const step of finished?.steps ?? []) {
        console.error(`    ${step.status.padEnd(7)} ${step.name}${step.detail ? ` - ${step.detail}` : ""}`);
      }
      continue;
    }

    for (const output of finished.outputs) {
      const absolute = resolveInStorage(output.path);
      const bytes = absolute ? statSync(absolute).size : 0;
      if (bytes < 1024) {
        failures++;
        console.error(`  FAILED: ${output.path} is ${bytes} bytes`);
      } else {
        console.log(`  ${output.aspectRatio.padEnd(5)} ${output.width}x${output.height}  ${(bytes / 1024).toFixed(0)} KB  ${output.path}`);
      }
    }
    console.log(
      `  storyboard: ${finished.storyboard?.shots.length} shot(s), ${finished.previews.length} preview(s), ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
