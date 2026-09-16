import { MockImageProvider } from "./mock/mock-image";
import { MockVideoProvider } from "./mock/mock-video";
import { ReplicateClient } from "./replicate/client";
import { ReplicateImageProvider } from "./replicate/replicate-image";
import { ReplicateVideoProvider } from "./replicate/replicate-video";
import { AnthropicScriptProvider } from "./script/anthropic-script";
import { TemplateScriptProvider } from "./script/template-script";
import type { ImageProvider, ScriptProvider, VideoProvider } from "./types";

export interface Providers {
  script: ScriptProvider;
  image: ImageProvider;
  video: VideoProvider;
  /** Always available; used when the primary script provider fails. */
  scriptFallback: ScriptProvider;
}

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

/**
 * Resolves providers from environment variables. "auto" picks the real provider when its
 * credentials exist and the offline mock otherwise.
 */
export function getProviders(): Providers {
  const template = new TemplateScriptProvider();

  const scriptChoice = env("SCRIPT_PROVIDER", "auto");
  const hasAnthropic = Boolean(env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN"));
  const script =
    scriptChoice === "anthropic" || (scriptChoice === "auto" && hasAnthropic)
      ? new AnthropicScriptProvider(env("ANTHROPIC_MODEL", "claude-opus-5"))
      : template;

  const token = env("REPLICATE_API_TOKEN");
  const replicate = token ? new ReplicateClient(token) : undefined;
  const pick = (name: string) => {
    const choice = env(name, "auto");
    if (choice === "replicate" && !replicate) throw new Error(`${name}=replicate but REPLICATE_API_TOKEN is not set`);
    return choice === "replicate" || (choice === "auto" && replicate) ? "replicate" : "mock";
  };

  const image: ImageProvider =
    pick("IMAGE_PROVIDER") === "replicate"
      ? new ReplicateImageProvider(
          replicate!,
          env("REPLICATE_TEXT_TO_IMAGE_MODEL", "black-forest-labs/flux-schnell"),
          env("REPLICATE_IMAGE_EDIT_MODEL", "google/nano-banana"),
        )
      : new MockImageProvider();

  const video: VideoProvider =
    pick("VIDEO_PROVIDER") === "replicate"
      ? new ReplicateVideoProvider(replicate!, env("REPLICATE_VIDEO_MODEL", "bytedance/seedance-1-lite"))
      : new MockVideoProvider();

  return { script, image, video, scriptFallback: template };
}

export function describeProviders(): { script: string; image: string; video: string } {
  const p = getProviders();
  return { script: p.script.name, image: p.image.name, video: p.video.name };
}
