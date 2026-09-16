# Balu Creative Studio — MVP Phase 1

AI ad-creative studio that turns a short brief into finished social creatives: a 15–30s **video**,
a looping **GIF**, or a static **image** — each exported in 9:16, 1:1 and 16:9, with brand colours,
logo, font and an industry-appropriate compliance disclaimer burned in.

It runs end to end with **no API keys** using offline mock generators, so the whole pipeline is
testable before a single credit is spent. Add keys and the same pipeline produces real footage.

```bash
npm install
npm run smoke      # full pipeline, offline, ~40s
npm run dev        # http://localhost:3000
```

---

## What it does

| MVP requirement | Where it lives |
| --- | --- |
| AI video generator, 15–30s | `engine: "video"` — `src/pipeline/plan.ts`, `src/pipeline/run.ts` |
| AI GIF generator | `engine: "gif"` — 2–6s, looping, CTA chip instead of an end card |
| Multiple character generation | `src/pipeline/run.ts` → one reusable reference image per character |
| Background change / scene generation | Scene preset, free-text description, or an uploaded plate |
| Brand kit: logo, colours, fonts | `src/storage/brand-kits.ts`, applied in `src/media/compose.ts` |
| Export 9:16, 1:1, 16:9 | `src/core/formats.ts`, one master render reframed per format |
| Text→video, image→video, text/image→GIF | `inputMode: "text" \| "script" \| "image"` |
| 8 target industries, modular | `src/industries/packs/*.ts` |

### The eight industry packs

Insurance · Credit Recovery · QSR / Food · Wellness · Shoes & Footwear · Manpower / Staffing ·
CCTV / Security · Upselling & Cross-selling.

Each pack carries its own audience, tone, art direction, character presets, location presets,
use-case templates (with beat structures and variable slots) and **compliance rules** that are fed
to the script writer and enforced in the output — e.g. credit recovery never threatens or implies
legal action, insurance never promises guaranteed claim approval, staffing never invents salary
figures.

---

## How a job runs

```
brief ─► storyboard ─► character refs ─► scene plate ─► keyframes ─► clips ─► master ─► formats
         (Claude or     (1 image per      (1 image,      (1 image      (image-   (crossfade  (reframe,
          template)      character)        optional)      per shot)     to-video)  + end card) captions,
                                                                                               logo, CTA)
```

The key idea for consistency: **every character gets exactly one reference image**, reused as an
input to every keyframe that character appears in. Upload a photo and that photo becomes the
reference instead. Scene plates work the same way. Nothing is ever asked to render text —
headlines, captions, CTA and disclaimers are composited afterwards by ffmpeg, because image models
render text as garbled glyphs.

Progress is reported step by step through the job store and polled by the UI, so keyframes and the
storyboard are visible while the slow video step is still running.

### Timing

A 20s video becomes 4 shots of ~4.4s plus a 3s end card, with 0.5s crossfades. The plan is exact:
the rendered file comes out at the requested length to the frame (verified in the smoke test).

---

## Adding a ninth industry

Write one file and register it. Nothing else changes.

```ts
// src/industries/packs/real-estate.ts
import { defineIndustry } from "../define";
import { ALL_ENGINES, v } from "./shared";

export default defineIndustry({
  id: "real-estate",
  name: "Real Estate",
  emoji: "🏠",
  description: "Project launches, site visits and possession offers.",
  audience: "First-time home buyers and investors",
  tone: "Aspirational, trustworthy, specific.",
  visualStyle: "Golden-hour exteriors, wide architectural framing, warm interiors",
  characters: [{ id: "buyer-couple", name: "Buyer couple", description: "Couple in their 30s touring a new apartment" }],
  scenes: [{ id: "show-flat", name: "Show flat", description: "Furnished model apartment, large windows, afternoon light" }],
  templates: [
    {
      id: "project-launch",
      name: "Project launch",
      goal: "lead-generation",
      description: "Announce a new project and drive site visits.",
      brief: "Launch {{product}} in {{city}} for {{audience}}. Highlight: {{offer}}.",
      variables: [v.product("e.g. Skyline Residences"), v.city(), v.audience("e.g. first-time buyers"), v.offer("e.g. 2BHK from ₹65L")],
      structure: ["Hook: skyline reveal", "Lifestyle moments", "Key amenities", "Offer", "CTA"],
      defaultCta: "Book a site visit",
      engines: ALL_ENGINES,
      suggestedCharacterIds: ["buyer-couple"],
      suggestedSceneId: "show-flat",
    },
  ],
  compliance: {
    disclaimer: "RERA registration details available on request.",
    rules: ["Never state possession dates or prices not given in the offer text."],
  },
});
```

Then add it to the array in `src/industries/index.ts`. `defineIndustry()` validates the pack at
startup — a template referencing a character that does not exist, or using an undeclared `{{var}}`,
throws immediately rather than producing a broken storyboard hours later.

---

## Swapping in real models

Every generator sits behind an interface in `src/providers/types.ts`, so a new vendor is one
adapter plus one line in `src/providers/registry.ts`.

Copy `.env.example` to `.env.local`:

```ini
ANTHROPIC_API_KEY=...          # storyboards written by Claude; falls back to templates if absent
REPLICATE_API_TOKEN=...        # image + video generation
REPLICATE_TEXT_TO_IMAGE_MODEL=black-forest-labs/flux-schnell
REPLICATE_IMAGE_EDIT_MODEL=google/nano-banana        # used whenever reference images exist
REPLICATE_VIDEO_MODEL=bytedance/seedance-1-lite      # image-to-video
```

Each provider is `auto` by default: it uses the real service when its credentials are present and
the offline mock otherwise, so the app never hard-fails on a missing key. The header shows which
generator is actually live.

Seedance, Kling and MiniMax input shapes are already mapped in `src/providers/replicate/`; an
unknown model falls back to a generic shape. The script step degrades gracefully too — if Claude
errors or refuses, the deterministic template writer takes over and the render still completes.

---

## Layout

```
src/core/          types, output sizes, request validation
src/industries/    8 packs + the loader that validates them
src/providers/     script / image / video adapters (mock, replicate, anthropic)
src/media/         ffmpeg wrapper, text rendering, the compositor
src/pipeline/      shot planning, prompt construction, the orchestrator
src/storage/       assets, brand kits, job state (all under STORAGE_DIR)
src/app/           Next.js routes + API
scripts/smoke.ts   offline end-to-end check
```

`npm run smoke` runs four cases — video, GIF, image and a branded video with a logo and custom
font — and asserts every export exists and is non-trivial. `npm run typecheck` and `npm run build`
both pass clean.

---

## Known limits (Phase 1)

- **No audio.** `Shot.voiceover` is written and stored but there is no TTS or music track yet.
- **One master render.** All formats are reframed from a single generation (9:16 preferred when
  several are requested). Blur-pad is the safe default; centre-crop trims the edges hard when the
  orientation flips.
- **Jobs are in-process.** The job store is memory plus a `job.json` mirror, which is right for a
  single node but needs a real queue before horizontal scaling.
- **No auth or per-user separation.** Everything under `STORAGE_DIR` is shared.
- **SVG logos are rejected** — ffmpeg cannot composite them; upload a transparent PNG.
