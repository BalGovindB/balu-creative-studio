import path from "node:path";
import { FORMATS, outputSize } from "@/core/formats";
import type { Engine, GenerationRequest, Storyboard } from "@/core/types";
import { fillTemplate, resolveTemplate } from "@/industries";
import { crossfadeClips, normalizeClip, renderFormat, type CaptionCue, type EndCard } from "@/media/compose";
import { resolveFont } from "@/media/text";
import { getProviders } from "@/providers/registry";
import type { StoryboardInput } from "@/providers/types";
import { assetFilePath, assetFilePaths } from "@/storage/assets";
import { brandFontPath, brandKitDir, getBrandKit } from "@/storage/brand-kits";
import { JobReporter, jobDir } from "@/storage/jobs";
import { ensureDir, toStorageRelative } from "@/storage/paths";
import { captionWindows, pickMasterRatio, planShots } from "./plan";
import { characterSheetPrompt, keyframePrompt, motionPrompt, scenePlatePrompt } from "./prompts";

export const STEP = {
  script: "Script & storyboard",
  characters: "Character references",
  scene: "Scene / background",
  keyframes: "Keyframes",
  motion: "Motion clips",
  assembly: "Assembly",
  formats: "Social formats",
} as const;

/** The step list a job is created with - the UI renders it as a checklist. */
export function stepNamesFor(engine: Engine): string[] {
  const steps: string[] = [STEP.script, STEP.characters, STEP.scene, STEP.keyframes];
  if (engine !== "image") steps.push(STEP.motion, STEP.assembly);
  steps.push(STEP.formats);
  return steps;
}

/** How many reference images a keyframe request carries; more than this confuses most models. */
const MAX_KEYFRAME_REFERENCES = 3;

export async function runGeneration(jobId: string, request: GenerationRequest): Promise<void> {
  const reporter = new JobReporter(jobId);
  try {
    reporter.running();
    await execute(reporter, request);
    reporter.succeeded();
  } catch (error) {
    reporter.failed(error);
  }
}

async function execute(reporter: JobReporter, request: GenerationRequest): Promise<void> {
  const root = jobDir(reporter.id);
  const genDir = ensureDir(path.join(root, "gen"));
  const workDir = ensureDir(path.join(root, "work"));
  const outDir = ensureDir(path.join(root, "out"));

  const { pack, template } = resolveTemplate(request.industryId, request.templateId);
  const brand = request.brandKitId ? getBrandKit(request.brandKitId) : undefined;
  const providers = getProviders();
  const plan = planShots(request.engine, request.durationSec);
  const masterRatio = pickMasterRatio(request.aspectRatios);
  const masterCanvas = FORMATS[masterRatio];

  // --- 1. Storyboard -------------------------------------------------------
  reporter.startStep(STEP.script);
  const storyboardInput: StoryboardInput = {
    engine: request.engine,
    pack,
    template,
    brief: fillTemplate(template.brief, request.templateVars),
    userPrompt: request.prompt,
    userScript: request.script,
    templateVars: request.templateVars,
    characters: request.characters,
    scene: request.scene,
    brand,
    durationSec: request.durationSec,
    shotCount: plan.shotCount,
    shotDurations: plan.visibleDurations,
  };

  let storyboard: Storyboard;
  let scriptNote = "";
  try {
    storyboard = await providers.script.createStoryboard(storyboardInput);
  } catch (error) {
    if (providers.script === providers.scriptFallback) throw error;
    // The script step must never block a render; fall back to the deterministic writer.
    scriptNote = ` (${providers.script.name} failed: ${error instanceof Error ? error.message : String(error)})`;
    storyboard = await providers.scriptFallback.createStoryboard(storyboardInput);
  }
  if (storyboard.shots.length !== plan.shotCount) {
    throw new Error(`Storyboard has ${storyboard.shots.length} shots but the plan needs ${plan.shotCount}.`);
  }
  reporter.setStoryboard(storyboard);
  reporter.finishStep(STEP.script, `${storyboard.shots.length} shot(s) via ${storyboard.source}${scriptNote}`);

  // --- 2. Character references --------------------------------------------
  reporter.startStep(STEP.characters);
  const characterReferences = new Map<string, string>();
  if (request.characters.length === 0) {
    reporter.skipStep(STEP.characters, "No characters selected");
  } else {
    for (const [index, character] of request.characters.entries()) {
      reporter.stepDetail(STEP.characters, `${index + 1} of ${request.characters.length}: ${character.name}`);
      const uploaded = character.referenceAssetId ? assetFilePath(character.referenceAssetId) : undefined;
      if (uploaded) {
        // A real photo anchors identity better than anything we could generate from it.
        characterReferences.set(character.id, uploaded);
        reporter.addPreview(`${character.name} (uploaded)`, uploaded);
        continue;
      }
      const base = path.join(ensureDir(path.join(genDir, "characters", safeSegment(character.id, index))), "sheet");
      const sheet = await providers.image.generate({
        prompt: characterSheetPrompt(pack, character),
        aspectRatio: "1:1",
        referenceImages: [],
        outputBase: base,
        label: character.name,
      });
      characterReferences.set(character.id, sheet);
      reporter.addPreview(character.name, sheet);
    }
    reporter.finishStep(STEP.characters, `${characterReferences.size} reference(s) ready`);
  }

  // --- 3. Scene plate ------------------------------------------------------
  reporter.startStep(STEP.scene);
  let scenePlate: string | undefined;
  const uploadedBackground = request.scene.backgroundAssetId ? assetFilePath(request.scene.backgroundAssetId) : undefined;
  if (uploadedBackground) {
    scenePlate = uploadedBackground;
    reporter.addPreview("Background (uploaded)", uploadedBackground);
    reporter.finishStep(STEP.scene, "Using the uploaded background");
  } else if (request.scene.description.trim()) {
    scenePlate = await providers.image.generate({
      prompt: scenePlatePrompt(pack, request.scene),
      aspectRatio: masterRatio,
      referenceImages: [],
      outputBase: path.join(ensureDir(path.join(genDir, "scene")), "plate"),
      label: "Scene",
    });
    reporter.addPreview("Scene plate", scenePlate);
    reporter.finishStep(STEP.scene, "Background generated");
  } else {
    reporter.skipStep(STEP.scene, "No background given - each shot sets its own");
  }

  // --- 4. Keyframes --------------------------------------------------------
  reporter.startStep(STEP.keyframes);
  const productReferences = assetFilePaths(request.sourceAssetIds);
  const keyframes: string[] = [];
  for (const shot of storyboard.shots) {
    reporter.stepDetail(STEP.keyframes, `Shot ${shot.index + 1} of ${storyboard.shots.length}`);
    const shotCharacters = shot.characterIds
      .map((id) => characterReferences.get(id))
      .filter((file): file is string => Boolean(file));
    // In image-upload mode the product the user gave us is what must survive; it goes first.
    const ordered =
      request.inputMode === "image"
        ? [...productReferences, ...shotCharacters]
        : [...shotCharacters, ...productReferences];
    const references = [...ordered, ...(scenePlate ? [scenePlate] : [])].slice(0, MAX_KEYFRAME_REFERENCES);

    const keyframe = await providers.image.generate({
      prompt: keyframePrompt({
        pack,
        shot,
        hasCharacterReferences: references.some((file) => shotCharacters.includes(file)),
        hasSceneReference: Boolean(scenePlate && references.includes(scenePlate)),
        hasProductReferences: references.some((file) => productReferences.includes(file)),
        brand,
      }),
      aspectRatio: masterRatio,
      referenceImages: references,
      outputBase: path.join(ensureDir(path.join(genDir, "shots", String(shot.index))), "key"),
      label: `Shot ${shot.index + 1}`,
    });
    keyframes.push(keyframe);
    reporter.addPreview(`Shot ${shot.index + 1}`, keyframe);
  }
  reporter.finishStep(STEP.keyframes, `${keyframes.length} keyframe(s) at ${masterRatio}`);

  // --- 5 & 6. Motion and assembly (video / GIF) ----------------------------
  let master = keyframes[0];
  if (request.engine !== "image") {
    reporter.startStep(STEP.motion);
    const rawClips: string[] = [];
    for (const shot of storyboard.shots) {
      reporter.stepDetail(STEP.motion, `Shot ${shot.index + 1} of ${storyboard.shots.length}`);
      rawClips.push(
        await providers.video.generate({
          prompt: motionPrompt(shot),
          imagePath: keyframes[shot.index],
          aspectRatio: masterRatio,
          durationSec: plan.clipDurations[shot.index],
          outputBase: path.join(genDir, "shots", String(shot.index), "clip"),
        }),
      );
    }
    reporter.finishStep(STEP.motion, `${rawClips.length} clip(s) via ${providers.video.name}`);

    reporter.startStep(STEP.assembly);
    const normalized: string[] = [];
    for (const [index, clip] of rawClips.entries()) {
      const normalizedClip = path.join(workDir, `shot_${index}.mp4`);
      await normalizeClip({
        input: clip,
        output: normalizedClip,
        width: masterCanvas.width,
        height: masterCanvas.height,
        durationSec: plan.clipDurations[index],
        workDir,
      });
      normalized.push(normalizedClip);
    }
    master = path.join(workDir, "master.mp4");
    await crossfadeClips({
      clips: normalized,
      visibleDurations: plan.visibleDurations,
      fade: plan.fadeSec,
      output: master,
      workDir,
    });
    reporter.finishStep(STEP.assembly, `${plan.contentDurationSec.toFixed(1)}s master at ${masterRatio}`);
  }

  // --- 7. Per-format renders ----------------------------------------------
  reporter.startStep(STEP.formats);
  const fontPath = brandFontPath(brand) ?? resolveFont();
  const brandDir = brand ? brandKitDir(brand.id) : undefined;
  const windows = captionWindows(plan.visibleDurations);
  const captions: CaptionCue[] =
    request.engine === "image"
      ? []
      : storyboard.shots.map((shot) => ({
          text: shot.caption,
          start: windows[shot.index].start,
          end: windows[shot.index].end,
        }));

  const endCard: EndCard | undefined =
    request.engine === "gif"
      ? undefined
      : {
          cta: storyboard.cta,
          headline: request.engine === "video" ? storyboard.hook : undefined,
          disclaimer: storyboard.disclaimer,
          durationSec: plan.endCardSec,
          fadeSec: plan.fadeSec,
        };

  const extension = request.engine === "image" ? "png" : request.engine === "gif" ? "gif" : "mp4";
  const baseName = slug(storyboard.title) || "creative";

  for (const ratio of request.aspectRatios) {
    reporter.stepDetail(STEP.formats, `Rendering ${ratio}`);
    const { width, height } = outputSize(ratio, request.engine);
    const output = path.join(outDir, `${baseName}_${ratio.replace(":", "x")}.${extension}`);
    await renderFormat({
      engine: request.engine,
      input: master,
      inputIsImage: request.engine === "image",
      contentDurationSec: plan.contentDurationSec,
      ratio,
      width,
      height,
      reframe: request.reframe,
      masterRatio,
      brand,
      brandDir,
      fontPath,
      captions,
      headline: request.engine === "image" ? storyboard.hook : undefined,
      persistentCta: request.engine === "gif" ? storyboard.cta : undefined,
      endCard,
      output,
      // Each format gets its own work dir: the renderer writes helper files by index,
      // and shared names would collide between formats.
      workDir: ensureDir(path.join(root, "render", ratio.replace(":", "x"))),
    });
    reporter.addOutput({ aspectRatio: ratio, kind: request.engine, path: toStorageRelative(output), width, height });
  }
  reporter.finishStep(STEP.formats, `${request.aspectRatios.length} format(s) exported`);
}

/** Client-supplied ids become directory names, so strip anything a path could use. */
function safeSegment(value: string, fallbackIndex: number): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || `character-${fallbackIndex}`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
