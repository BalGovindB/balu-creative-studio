import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Everything the app writes - uploads, brand kits, job work dirs and renders - lives
 * under one storage root so it can be pointed at a volume in deployment and served
 * through a single guarded route (/api/files).
 */
export function storageRoot(): string {
  // In serverless environments (Vercel, AWS Lambda), the workspace filesystem is read-only.
  // We MUST use /tmp (or an explicit path inside /tmp) so file creation succeeds.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const configured = process.env.STORAGE_DIR?.trim();
    if (configured && path.isAbsolute(configured) && configured.startsWith(tmpdir())) {
      return configured;
    }
    return path.join(tmpdir(), "balu-storage");
  }

  const configured = process.env.STORAGE_DIR?.trim();
  if (configured) {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
  }
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), "./storage");
}

export function ensureDir(dir: string): string {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Gracefully ignore if directory already exists or cannot be created
  }
  return dir;
}

export function storagePath(...segments: string[]): string {
  return path.join(storageRoot(), ...segments);
}

/** Storage-root-relative, forward-slashed - the form used in URLs and in Job.outputs. */
export function toStorageRelative(absolutePath: string): string {
  return path.relative(storageRoot(), absolutePath).split(path.sep).join("/");
}

/** Resolve a relative path inside the storage root, or undefined if it escapes it. */
export function resolveInStorage(relativePath: string): string | undefined {
  const root = storageRoot();
  const abs = path.resolve(root, relativePath);
  return abs === root || abs.startsWith(root + path.sep) ? abs : undefined;
}
