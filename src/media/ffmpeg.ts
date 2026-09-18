import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

let resolvedFfmpegPath: string | null = null;
let drawtextSupported: boolean | null = null;

export function hasDrawtextSupport(): boolean {
  if (drawtextSupported !== null) return drawtextSupported;
  try {
    const { execSync } = require("node:child_process");
    const out = execSync(`${ffmpegPath()} -filters`, { windowsHide: true, timeout: 5000 }).toString();
    drawtextSupported = out.includes("drawtext");
  } catch {
    drawtextSupported = false;
  }
  return drawtextSupported ?? false;
}

export function ffmpegPath(): string {
  if (resolvedFfmpegPath) return resolvedFfmpegPath;

  const configured = process.env.FFMPEG_PATH?.trim();
  if (configured) {
    resolvedFfmpegPath = configured;
    return configured;
  }

  if (ffmpegStatic && existsSync(ffmpegStatic)) {
    // In serverless environments (e.g. Vercel, AWS Lambda), binaries in node_modules may lack
    // execute permissions. Copying to /tmp and running chmod 0755 guarantees executable rights.
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      try {
        const dest = path.join(tmpdir(), "ffmpeg");
        if (!existsSync(dest)) {
          copyFileSync(ffmpegStatic, dest);
          chmodSync(dest, 0o755);
        }
        resolvedFfmpegPath = dest;
        return dest;
      } catch (err) {
        console.warn("[balu] Could not prepare ffmpeg in /tmp, using default binary:", err);
      }
    }
    resolvedFfmpegPath = ffmpegStatic;
    return ffmpegStatic;
  }

  return "ffmpeg"; // hope it's on PATH
}

export interface FfmpegOptions {
  /** Working directory. Filter graphs reference fonts/text files relative to it,
   *  which sidesteps Windows drive-letter escaping inside filter arguments. */
  cwd: string;
  timeoutMs?: number;
}

export function runFfmpeg(args: string[], { cwd, timeoutMs = 10 * 60_000 }: FfmpegOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      cwd,
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not start ffmpeg (${ffmpegPath()}): ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim() || "no output"}`));
    });
  });
}
