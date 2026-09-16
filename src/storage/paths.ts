import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Everything the app writes - uploads, brand kits, job work dirs and renders - lives
 * under one storage root so it can be pointed at a volume in deployment and served
 * through a single guarded route (/api/files).
 */
export function storageRoot(): string {
  // The root is configurable at runtime, so the bundler cannot trace it - and must not try.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.STORAGE_DIR?.trim() || "./storage");
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
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
