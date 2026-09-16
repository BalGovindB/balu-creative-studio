import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BrandColors, BrandKit } from "@/core/types";
import { ensureDir, storagePath } from "./paths";
import { isSafeId, newId } from "./ids";

const LOGO_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};
const FONT_EXTENSIONS = new Set([".ttf", ".otf"]);
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_FONT_BYTES = 8 * 1024 * 1024;

export interface BrandKitInput {
  name: string;
  colors: BrandColors;
  tagline?: string;
  website?: string;
  phone?: string;
}

function rootDir(): string {
  return ensureDir(storagePath("brand-kits"));
}

/** Directory holding kit.json plus the logo and font files. */
export function brandKitDir(id: string): string | undefined {
  if (!isSafeId(id)) return undefined;
  const dir = storagePath("brand-kits", id);
  return existsSync(dir) ? dir : undefined;
}

export async function createBrandKit(input: BrandKitInput, files: { logo?: File | null; font?: File | null }): Promise<BrandKit> {
  const id = newId();
  const dir = ensureDir(storagePath("brand-kits", id));

  let logoFile: string | undefined;
  if (files.logo && files.logo.size > 0) {
    const extension = LOGO_EXTENSIONS[files.logo.type];
    if (!extension) throw new Error(`Unsupported logo type "${files.logo.type || "unknown"}". Use PNG, JPEG, WebP or SVG.`);
    if (files.logo.size > MAX_LOGO_BYTES) throw new Error("Logo must be under 5 MB.");
    // ffmpeg cannot overlay an SVG; a PNG with transparency is what the renderer wants.
    if (extension === ".svg") throw new Error("SVG logos cannot be composited yet - please upload a PNG with a transparent background.");
    logoFile = `logo${extension}`;
    writeFileSync(path.join(dir, logoFile), Buffer.from(await files.logo.arrayBuffer()));
  }

  let fontFile: string | undefined;
  if (files.font && files.font.size > 0) {
    const extension = path.extname(files.font.name).toLowerCase();
    if (!FONT_EXTENSIONS.has(extension)) throw new Error("Brand font must be a .ttf or .otf file.");
    if (files.font.size > MAX_FONT_BYTES) throw new Error("Font must be under 8 MB.");
    fontFile = `font${extension}`;
    writeFileSync(path.join(dir, fontFile), Buffer.from(await files.font.arrayBuffer()));
  }

  const kit: BrandKit = {
    id,
    name: input.name.trim(),
    colors: input.colors,
    logoFile,
    fontFile,
    tagline: input.tagline?.trim() || undefined,
    website: input.website?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(path.join(dir, "kit.json"), JSON.stringify(kit, null, 2), "utf8");
  return kit;
}

export function getBrandKit(id: string): BrandKit | undefined {
  const dir = brandKitDir(id);
  if (!dir) return undefined;
  const file = path.join(dir, "kit.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BrandKit;
  } catch {
    return undefined;
  }
}

export function listBrandKits(): BrandKit[] {
  const dir = rootDir();
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => getBrandKit(entry.name))
    .filter((kit): kit is BrandKit => Boolean(kit))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Absolute path of the kit's font file, if it has one. */
export function brandFontPath(kit: BrandKit | undefined): string | undefined {
  if (!kit?.fontFile) return undefined;
  const dir = brandKitDir(kit.id);
  if (!dir) return undefined;
  const file = path.join(dir, kit.fontFile);
  return existsSync(file) ? file : undefined;
}
