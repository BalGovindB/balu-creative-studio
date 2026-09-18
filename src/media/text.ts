import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_FONT_BASE64 } from "../assets/fonts/defaultFontBase64";

const SYSTEM_FONTS = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/Library/Fonts/Arial.ttf",
];

let embeddedFontPath: string | null = null;

export function resolveFont(preferred?: string): string {
  const candidates = [preferred, process.env.DEFAULT_FONT_PATH?.trim(), ...SYSTEM_FONTS];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }

  // Guaranteed serverless fallback: materialize embedded base64 font into tmpdir
  if (embeddedFontPath && existsSync(embeddedFontPath)) {
    return embeddedFontPath;
  }

  try {
    const dest = path.join(tmpdir(), "balu-default-font.ttf");
    if (!existsSync(dest)) {
      writeFileSync(dest, Buffer.from(DEFAULT_FONT_BASE64, "base64"));
    }
    embeddedFontPath = dest;
    return dest;
  } catch (err) {
    console.error("[balu] Failed to write embedded font to tmp:", err);
  }

  return "";
}

/** "#1a2b3c" -> "0x1a2b3c" for ffmpeg colour options. */
export function ffColor(hex: string, alpha = 1): string {
  const clean = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = clean ? clean[1] : "ffffff";
  return alpha >= 1 ? `0x${rgb}` : `0x${rgb}@${alpha.toFixed(2)}`;
}

export function wrapText(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if ((line + " " + word).length <= maxChars) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface TextBlock {
  text: string;
  fontSize: number;
  color: string;
  /** Top of the block in pixels. Use `anchor: "bottom"` to treat it as the bottom edge. */
  y: number;
  anchor?: "top" | "bottom";
  /** Width available for wrapping. */
  maxWidth: number;
  maxLines?: number;
  box?: { color: string; opacity: number; padding: number };
  /** Visible window in seconds. */
  enable?: [number, number];
}

/**
 * Builds drawtext filters for a text block inside a work directory. Every line is its own
 * drawtext so lines stay individually centred; text goes through files so no escaping
 * of quotes, colons or commas is needed.
 */
import { hasDrawtextSupport } from "./ffmpeg";

export class TextRenderer {
  private counter = 0;
  readonly fontFile: string;

  constructor(private readonly workDir: string, fontPath?: string, key = "font") {
    if (fontPath && existsSync(fontPath)) {
      this.fontFile = `${key}${path.extname(fontPath) || ".ttf"}`;
      try {
        copyFileSync(fontPath, path.join(workDir, this.fontFile));
      } catch {
        this.fontFile = "";
      }
    } else {
      this.fontFile = "";
    }
  }

  block(b: TextBlock): string[] {
    if (!hasDrawtextSupport() || !this.fontFile) {
      return [];
    }

    // Average glyph width is roughly half the font size for Latin sans-serif faces.
    const maxChars = Math.max(8, Math.floor(b.maxWidth / (b.fontSize * 0.55)));
    let lines = wrapText(b.text, maxChars);
    if (b.maxLines && lines.length > b.maxLines) {
      lines = lines.slice(0, b.maxLines);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/[\s.,;:!?-]*$/, "") + "…";
    }
    const lineHeight = Math.round(b.fontSize * 1.25 + (b.box ? b.box.padding : 0));
    const top = b.anchor === "bottom" ? b.y - lineHeight * lines.length : b.y;

    return lines.map((line, i) => {
      const file = `text_${this.counter++}.txt`;
      writeFileSync(path.join(this.workDir, file), line, "utf8");
      const opts = [
        `fontfile=${this.fontFile}`,
        `textfile=${file}`,
        "expansion=none",
        `fontsize=${b.fontSize}`,
        `fontcolor=${ffColor(b.color)}`,
        "x=(w-text_w)/2",
        `y=${top + i * lineHeight}`,
      ];
      if (b.box) {
        opts.push("box=1", `boxcolor=${ffColor(b.box.color, b.box.opacity)}`, `boxborderw=${b.box.padding}`);
      }
      if (b.enable) {
        opts.push(`enable='between(t,${b.enable[0].toFixed(2)},${b.enable[1].toFixed(2)})'`);
      }
      return `drawtext=${opts.join(":")}`;
    });
  }
}

/** Pick black or white for legible text on a given background. */
export function contrastText(bgHex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bgHex.trim());
  if (!m) return "#ffffff";
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}
