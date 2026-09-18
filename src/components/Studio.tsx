"use client";

import { useEffect, useState } from "react";
import { ASPECT_RATIOS, DURATION_LIMITS, FORMATS } from "@/core/formats";
import type { AspectRatio, BrandKit, CharacterSpec, Engine, InputMode, Job, ReframeMode, SceneSpec } from "@/core/types";
import type { IndustryPack, UseCaseTemplate } from "@/industries/types";
import BrandKitPanel from "./BrandKitPanel";
import JobPanel from "./JobPanel";
import { fileUrl, uploadImages, type UploadedAsset } from "./upload";

/** A character in the form: either dropped in from an industry preset or written by hand. */
interface EditableCharacter extends CharacterSpec {
  fromPreset: boolean;
  referenceAsset?: UploadedAsset;
}

type SceneSource = "preset" | "custom" | "upload";

const ENGINES: { id: Engine; label: string; hint: string }[] = [
  { id: "video", label: "Video ad", hint: "15-30s with an end card" },
  { id: "gif", label: "Looping GIF", hint: "2-6s, CTA burned in" },
  { id: "image", label: "Static creative", hint: "Single-frame post" },
];

const INPUT_MODES: { id: InputMode; label: string; hint: string }[] = [
  { id: "text", label: "Text brief", hint: "Describe the idea" },
  { id: "script", label: "Full script", hint: "Paste your own copy" },
  { id: "image", label: "Image upload", hint: "Bring a product photo" },
];

const MAX_CHARACTERS = 4;
const MAX_SOURCE_IMAGES = 4;

export default function Studio({
  industries,
  brandKits: initialBrandKits,
  providers,
}: {
  industries: IndustryPack[];
  brandKits: BrandKit[];
  providers: { script: string; image: string; video: string };
}) {
  const firstPack = industries[0];
  const firstTemplate = firstPack.templates[0];

  const [engine, setEngine] = useState<Engine>("video");
  const [industryId, setIndustryId] = useState(firstPack.id);
  const [templateId, setTemplateId] = useState(firstTemplate.id);
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [prompt, setPrompt] = useState("");
  const [script, setScript] = useState("");
  const [sourceAssets, setSourceAssets] = useState<UploadedAsset[]>([]);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [characters, setCharacters] = useState<EditableCharacter[]>(() => presetCast(firstPack, firstTemplate));
  const [sceneSource, setSceneSource] = useState<SceneSource>("preset");
  const [scenePresetId, setScenePresetId] = useState<string | undefined>(firstTemplate.suggestedSceneId ?? firstPack.scenes[0]?.id);
  const [sceneDescription, setSceneDescription] = useState("");
  const [backgroundAsset, setBackgroundAsset] = useState<UploadedAsset | undefined>();
  const [brandKits, setBrandKits] = useState<BrandKit[]>(initialBrandKits);
  const [brandKitId, setBrandKitId] = useState<string | undefined>();
  const [aspectRatios, setAspectRatios] = useState<AspectRatio[]>(["9:16"]);
  const [reframe, setReframe] = useState<ReframeMode>("blur-pad");
  const [durationSec, setDurationSec] = useState(DURATION_LIMITS.video.default);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);

  const pack = industries.find((p) => p.id === industryId) ?? firstPack;
  const template = pack.templates.find((t) => t.id === templateId) ?? pack.templates[0];
  const limits = DURATION_LIMITS[engine];

  // Each engine has its own sensible length; carrying a 20s video length into a GIF is never right.
  useEffect(() => {
    setDurationSec(DURATION_LIMITS[engine].default);
  }, [engine]);

  function applyTemplate(nextPack: IndustryPack, nextTemplate: UseCaseTemplate) {
    setTemplateId(nextTemplate.id);
    setCharacters(presetCast(nextPack, nextTemplate));
    setSceneSource("preset");
    setScenePresetId(nextTemplate.suggestedSceneId ?? nextPack.scenes[0]?.id);
    setSceneDescription("");
    setBackgroundAsset(undefined);
    setTemplateVars({});
  }

  function chooseIndustry(id: string) {
    const nextPack = industries.find((p) => p.id === id);
    if (!nextPack) return;
    setIndustryId(id);
    applyTemplate(nextPack, nextPack.templates.find((t) => t.engines.includes(engine)) ?? nextPack.templates[0]);
  }

  function toggleRatio(ratio: AspectRatio) {
    setAspectRatios((current) =>
      current.includes(ratio)
        ? current.length > 1
          ? current.filter((r) => r !== ratio)
          : current // never let the user deselect the last format
        : [...current, ratio],
    );
  }

  function updateCharacter(index: number, patch: Partial<EditableCharacter>) {
    setCharacters((current) => current.map((character, i) => (i === index ? { ...character, ...patch } : character)));
  }

  function addPresetCharacter(presetId: string) {
    const preset = pack.characters.find((c) => c.id === presetId);
    if (!preset || characters.some((c) => c.id === preset.id)) return;
    setCharacters((current) => [...current, { id: preset.id, name: preset.name, description: preset.description, fromPreset: true }]);
  }

  function addCustomCharacter() {
    const id = `custom-${characters.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    setCharacters((current) => [...current, { id, name: "New character", description: "", fromPreset: false }]);
  }

  async function handleUpload(files: FileList | null, onDone: (assets: UploadedAsset[]) => void) {
    if (!files || files.length === 0) return;
    setError(null);
    try {
      onDone(await uploadImages(Array.from(files)));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    }
  }

  function currentScene(): SceneSpec {
    if (sceneSource === "upload" && backgroundAsset) {
      return { description: "", backgroundAssetId: backgroundAsset.id };
    }
    if (sceneSource === "custom") return { description: sceneDescription };
    const preset = pack.scenes.find((s) => s.id === scenePresetId);
    return { presetId: preset?.id, description: preset?.description ?? "" };
  }

  async function generate() {
    setError(null);
    setSubmitting(true);
    setCurrentJob(null);
    setJobId(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream, application/json" },
        body: JSON.stringify({
          engine,
          inputMode,
          industryId,
          templateId,
          prompt,
          script: inputMode === "script" ? script : undefined,
          sourceAssetIds: sourceAssets.map((asset) => asset.id),
          templateVars,
          characters: characters.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            referenceAssetId: c.referenceAsset?.id,
          })),
          scene: currentScene(),
          brandKitId,
          aspectRatios,
          reframe,
          durationSec,
        }),
      });

      if (!response.ok) {
        let errMessage = "Generation could not be started.";
        try {
          const body = await response.json();
          if (body.error) errMessage = body.error;
        } catch {}
        throw new Error(errMessage);
      }

      // Check if response is an SSE stream
      const contentType = response.headers.get("content-type") ?? "";
      if (response.body && contentType.includes("text/event-stream")) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.startsWith("data: ")) {
              try {
                const liveJob = JSON.parse(trimmed.slice(6)) as Job;
                setCurrentJob(liveJob);
                setJobId(liveJob.id);
              } catch {}
            }
          }
        }
      } else {
        const body = (await response.json()) as { job?: Job; error?: string };
        if (!body.job) throw new Error(body.error ?? "Generation could not be started.");
        setCurrentJob(body.job);
        setJobId(body.job.id);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Generation could not be started.");
    } finally {
      setSubmitting(false);
    }
  }

  const usingMock = providers.image === "mock" || providers.video === "mock";

  return (
    <div className="shell">
      <header className="masthead">
        <h1>Balu Creative Studio</h1>
        <span className="tag">AI ad creatives for {industries.length} industries</span>
        <div className="providers">
          <span className={`pill ${providers.script === "template" ? "mock" : "live"}`}>script: {providers.script}</span>
          <span className={`pill ${providers.image === "mock" ? "mock" : "live"}`}>image: {providers.image}</span>
          <span className={`pill ${providers.video === "mock" ? "mock" : "live"}`}>video: {providers.video}</span>
        </div>
      </header>

      {usingMock && (
        <div className="notice">
          Running with offline mock generators, so renders are placeholders that prove the pipeline end to end. Add
          <code> REPLICATE_API_TOKEN</code> (and <code>ANTHROPIC_API_KEY</code> for scripts) to <code>.env.local</code> for real output.
        </div>
      )}

      <div className="columns">
        <div>
          <section className="card">
            <h2>1 · Engine</h2>
            <div className="choices">
              {ENGINES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`choice ${engine === option.id ? "selected" : ""}`}
                  onClick={() => setEngine(option.id)}
                >
                  {option.label}
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>2 · Industry &amp; use case</h2>
            <p className="hint">{pack.description}</p>
            <div className="choices" style={{ marginBottom: 14 }}>
              {industries.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`choice ${option.id === industryId ? "selected" : ""}`}
                  onClick={() => chooseIndustry(option.id)}
                >
                  {option.emoji} {option.name}
                </button>
              ))}
            </div>

            <label className="field">
              <span>Use case</span>
              <select
                value={template.id}
                onChange={(event) => {
                  const next = pack.templates.find((t) => t.id === event.target.value);
                  if (next) applyTemplate(pack, next);
                }}
              >
                {pack.templates.map((option) => (
                  <option key={option.id} value={option.id} disabled={!option.engines.includes(engine)}>
                    {option.name} · {option.goal}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint" style={{ marginBottom: 14 }}>{template.description}</p>

            <div className="row">
              {template.variables.map((variable) => (
                <label className="field" key={variable.key}>
                  <span>
                    {variable.label}
                    {variable.required ? " *" : ""}
                  </span>
                  <input
                    type="text"
                    placeholder={variable.placeholder}
                    value={templateVars[variable.key] ?? ""}
                    onChange={(event) => setTemplateVars((current) => ({ ...current, [variable.key]: event.target.value }))}
                  />
                </label>
              ))}
            </div>

            <details>
              <summary className="hint" style={{ cursor: "pointer" }}>
                Beat structure &amp; compliance rules applied to this brief
              </summary>
              <ol className="hint" style={{ paddingLeft: 18, marginTop: 8 }}>
                {template.structure.map((beat) => (
                  <li key={beat}>{beat}</li>
                ))}
              </ol>
              <ul className="hint" style={{ paddingLeft: 18 }}>
                {pack.compliance.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </details>
          </section>

          <section className="card">
            <h2>3 · Your input</h2>
            <div className="choices" style={{ marginBottom: 14 }}>
              {INPUT_MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`choice ${inputMode === option.id ? "selected" : ""}`}
                  onClick={() => setInputMode(option.id)}
                >
                  {option.label}
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>

            {inputMode === "script" ? (
              <label className="field">
                <span>Script *</span>
                <textarea
                  rows={7}
                  placeholder="Paste your voiceover or on-screen copy. It is split across the shots in order."
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                />
              </label>
            ) : (
              <label className="field">
                <span>{inputMode === "text" ? "Creative brief *" : "Creative direction (optional)"}</span>
                <textarea
                  rows={4}
                  placeholder="e.g. Show a young family enjoying a weekend, then reveal the cashless hospital benefit."
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </label>
            )}

            {inputMode === "image" && (
              <label className="field">
                <span>
                  Product / source images * ({sourceAssets.length}/{MAX_SOURCE_IMAGES})
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => {
                    void handleUpload(event.target.files, (assets) =>
                      setSourceAssets((current) => [...current, ...assets].slice(0, MAX_SOURCE_IMAGES)),
                    );
                    event.target.value = "";
                  }}
                />
              </label>
            )}
            {sourceAssets.length > 0 && (
              <div className="thumbs">
                {sourceAssets.map((asset) => (
                  <figure key={asset.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(asset.path)} alt={asset.originalName} />
                    <figcaption>
                      <button
                        type="button"
                        className="btn link"
                        onClick={() => setSourceAssets((current) => current.filter((a) => a.id !== asset.id))}
                      >
                        remove
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>4 · Cast</h2>
            <p className="hint">
              Each character gets one reference image that every shot reuses, which is what keeps faces and wardrobe consistent.
              Upload a photo to lock in a real person or product ambassador.
            </p>

            {characters.map((character, index) => (
              <div className="character" key={character.id}>
                <header>
                  <strong>{character.fromPreset ? character.name : `Custom ${index + 1}`}</strong>
                  {character.referenceAsset && <span className="pill live">photo</span>}
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => setCharacters((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </header>
                {!character.fromPreset && (
                  <input
                    type="text"
                    placeholder="Name, e.g. Brand ambassador"
                    value={character.name}
                    onChange={(event) => updateCharacter(index, { name: event.target.value })}
                    style={{ marginBottom: 6 }}
                  />
                )}
                <textarea
                  rows={2}
                  placeholder="Appearance, age, wardrobe, mood"
                  value={character.description}
                  onChange={(event) => updateCharacter(index, { description: event.target.value })}
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ marginTop: 6 }}
                  onChange={(event) => {
                    void handleUpload(event.target.files, (assets) => {
                      if (assets[0]) updateCharacter(index, { referenceAsset: assets[0] });
                    });
                    event.target.value = "";
                  }}
                />
              </div>
            ))}

            {characters.length < MAX_CHARACTERS && (
              <div className="generate-bar" style={{ marginTop: 10 }}>
                <select
                  value=""
                  onChange={(event) => {
                    addPresetCharacter(event.target.value);
                    event.target.value = "";
                  }}
                  style={{ maxWidth: 260 }}
                >
                  <option value="">Add a preset character…</option>
                  {pack.characters
                    .filter((preset) => !characters.some((c) => c.id === preset.id))
                    .map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                </select>
                <button type="button" className="btn small" onClick={addCustomCharacter}>
                  + Custom character
                </button>
              </div>
            )}
          </section>

          <section className="card">
            <h2>5 · Scene</h2>
            <div className="choices" style={{ marginBottom: 12 }}>
              <button type="button" className={`choice ${sceneSource === "preset" ? "selected" : ""}`} onClick={() => setSceneSource("preset")}>
                Preset location
              </button>
              <button type="button" className={`choice ${sceneSource === "custom" ? "selected" : ""}`} onClick={() => setSceneSource("custom")}>
                Describe your own
              </button>
              <button type="button" className={`choice ${sceneSource === "upload" ? "selected" : ""}`} onClick={() => setSceneSource("upload")}>
                Upload a background
              </button>
            </div>

            {sceneSource === "preset" && (
              <div className="choices">
                {pack.scenes.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    className={`choice block ${scene.id === scenePresetId ? "selected" : ""}`}
                    onClick={() => setScenePresetId(scene.id)}
                  >
                    {scene.name}
                    <small>{scene.description}</small>
                  </button>
                ))}
              </div>
            )}

            {sceneSource === "custom" && (
              <label className="field">
                <span>Background description</span>
                <textarea
                  rows={3}
                  placeholder="e.g. Rooftop cafe at sunset, string lights, city skyline behind"
                  value={sceneDescription}
                  onChange={(event) => setSceneDescription(event.target.value)}
                />
              </label>
            )}

            {sceneSource === "upload" && (
              <>
                <label className="field">
                  <span>Background plate</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      void handleUpload(event.target.files, (assets) => setBackgroundAsset(assets[0]));
                      event.target.value = "";
                    }}
                  />
                </label>
                {backgroundAsset && (
                  <div className="thumbs">
                    <figure>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileUrl(backgroundAsset.path)} alt={backgroundAsset.originalName} />
                      <figcaption>{backgroundAsset.originalName}</figcaption>
                    </figure>
                  </div>
                )}
              </>
            )}
          </section>

          <BrandKitPanel
            brandKits={brandKits}
            selectedId={brandKitId}
            onSelect={setBrandKitId}
            onCreated={(kit) => {
              setBrandKits((current) => [kit, ...current]);
              setBrandKitId(kit.id);
            }}
          />

          <section className="card">
            <h2>7 · Export</h2>
            <div className="choices" style={{ marginBottom: 14 }}>
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  className={`choice ${aspectRatios.includes(ratio) ? "selected" : ""}`}
                  onClick={() => toggleRatio(ratio)}
                >
                  {FORMATS[ratio].label}
                  <small>{FORMATS[ratio].platforms}</small>
                </button>
              ))}
            </div>

            {aspectRatios.length > 1 && (
              <label className="field">
                <span>How other formats are adapted from the master render</span>
                <select value={reframe} onChange={(event) => setReframe(event.target.value as ReframeMode)}>
                  <option value="blur-pad">Fit with a blurred backdrop (keeps the whole frame)</option>
                  <option value="crop">Centre crop (fills the frame, trims the edges)</option>
                </select>
              </label>
            )}

            {engine !== "image" && (
              <label className="field">
                <span>
                  Duration: {durationSec}s ({limits.min}-{limits.max}s)
                </span>
                <input
                  type="range"
                  min={limits.min}
                  max={limits.max}
                  step={1}
                  value={durationSec}
                  onChange={(event) => setDurationSec(Number(event.target.value))}
                />
              </label>
            )}
          </section>

          {error && <div className="error">{error}</div>}

          <div className="generate-bar">
            <button type="button" className="btn primary" disabled={submitting} onClick={() => void generate()}>
              {submitting ? "Starting…" : `Generate ${engine === "image" ? "creative" : engine}`}
            </button>
            <span className="summary">
              {pack.name} · {template.name} · {aspectRatios.join(", ")}
              {engine !== "image" ? ` · ${durationSec}s` : ""}
            </span>
          </div>
        </div>

        <div className="sticky">
          <JobPanel jobId={jobId} liveJob={currentJob} />
        </div>
      </div>
    </div>
  );
}

function presetCast(pack: IndustryPack, template: UseCaseTemplate): EditableCharacter[] {
  return template.suggestedCharacterIds
    .map((id) => pack.characters.find((character) => character.id === id))
    .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset))
    .map((preset) => ({ id: preset.id, name: preset.name, description: preset.description, fromPreset: true }));
}
