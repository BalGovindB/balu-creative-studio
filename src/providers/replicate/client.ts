import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const API = "https://api.replicate.com/v1";

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error: string | null;
  urls: { get: string };
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

export class ReplicateClient {
  constructor(
    private readonly token: string,
    private readonly timeoutMs = 15 * 60_000,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }

  /** Upload a local file and return a URL models can read. */
  async uploadFile(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    const form = new FormData();
    form.append("content", new Blob([readFileSync(filePath)], { type: MIME[ext] ?? "application/octet-stream" }), path.basename(filePath));
    const res = await fetch(`${API}/files`, { method: "POST", headers: this.headers(), body: form });
    if (!res.ok) throw new Error(`Replicate file upload failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { urls: { get: string } };
    return body.urls.get;
  }

  /**
   * Run a model and wait for its output. `model` is "owner/name" (latest version)
   * or "owner/name:version".
   */
  async run(model: string, input: Record<string, unknown>): Promise<unknown> {
    const [ref, version] = model.split(":");
    const url = version ? `${API}/predictions` : `${API}/models/${ref}/predictions`;
    const body = version ? { version, input } : { input };
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json", Prefer: "wait=60" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Replicate ${model} request failed (${res.status}): ${await res.text()}`);
    let prediction = (await res.json()) as Prediction;

    const deadline = Date.now() + this.timeoutMs;
    while (prediction.status === "starting" || prediction.status === "processing") {
      if (Date.now() > deadline) throw new Error(`Replicate ${model} timed out (prediction ${prediction.id})`);
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(prediction.urls.get, { headers: this.headers() });
      if (!poll.ok) throw new Error(`Replicate poll failed (${poll.status}): ${await poll.text()}`);
      prediction = (await poll.json()) as Prediction;
    }
    if (prediction.status !== "succeeded") {
      throw new Error(`Replicate ${model} ${prediction.status}: ${prediction.error ?? "no error message"}`);
    }
    return prediction.output;
  }

  /** Download the first URL in a model output to `outputBase` + detected extension. */
  async downloadOutput(output: unknown, outputBase: string, fallbackExt: string): Promise<string> {
    const url = firstUrl(output);
    if (!url) throw new Error(`Replicate returned no file output: ${JSON.stringify(output).slice(0, 300)}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Downloading Replicate output failed (${res.status})`);
    const ext = extensionFor(url, res.headers.get("content-type"), fallbackExt);
    const file = `${outputBase}${ext}`;
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  }
}

function firstUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.map(firstUrl).find(Boolean);
  if (output && typeof output === "object") {
    for (const key of ["url", "video", "image", "output"]) {
      const found = firstUrl((output as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return undefined;
}

function extensionFor(url: string, contentType: string | null, fallback: string): string {
  const byType = Object.entries(MIME).find(([, mime]) => contentType?.startsWith(mime))?.[0];
  if (byType) return byType === ".jpeg" ? ".jpg" : byType;
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  return MIME[fromUrl] ? fromUrl : fallback;
}
