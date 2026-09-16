import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

export function ffmpegPath(): string {
  const configured = process.env.FFMPEG_PATH?.trim();
  if (configured) return configured;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
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
    const child = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", ...args], {
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
