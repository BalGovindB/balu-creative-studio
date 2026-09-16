import { existsSync, writeFileSync } from "node:fs";
import { ensureDir, storagePath, toStorageRelative } from "./paths";
import { isSafeId, newId } from "./ids";

/** Image types the generators and ffmpeg can both read. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export interface StoredAsset {
  /** Includes the extension, e.g. "k3f8s0d1q7zb.png" - it *is* the file name. */
  id: string;
  /** Storage-relative path for /api/files. */
  path: string;
  originalName: string;
  bytes: number;
}

export function assetsDir(): string {
  return ensureDir(storagePath("assets"));
}

export async function saveUploadedImage(file: File): Promise<StoredAsset> {
  const extension = EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    throw new Error(`Unsupported image type "${file.type || "unknown"}". Use PNG, JPEG or WebP.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  const id = `${newId()}${extension}`;
  const absolute = `${assetsDir()}/${id}`;
  writeFileSync(absolute, Buffer.from(await file.arrayBuffer()));
  return { id, path: toStorageRelative(absolute), originalName: file.name, bytes: file.size };
}

/** Absolute path of a stored asset, or undefined if the id is unsafe or unknown. */
export function assetFilePath(id: string): string | undefined {
  if (!isSafeId(id)) return undefined;
  const absolute = storagePath("assets", id);
  return existsSync(absolute) ? absolute : undefined;
}

/** Resolve many ids at once, skipping any that no longer exist. */
export function assetFilePaths(ids: string[]): string[] {
  return ids.map(assetFilePath).filter((p): p is string => Boolean(p));
}
