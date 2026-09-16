import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { resolveInStorage } from "@/storage/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

/**
 * GET /api/files/<storage-relative-path> - the only way anything under the storage root
 * reaches the browser. Serves byte ranges so <video> can seek, and `?download=1` forces
 * a save dialog for the export buttons.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path: segments } = await context.params;
  const absolute = resolveInStorage(segments.join("/"));
  if (!absolute) return new Response("Not found", { status: 404 });

  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stats.isFile()) return new Response("Not found", { status: 404 });

  const contentType = CONTENT_TYPES[path.extname(absolute).toLowerCase()] ?? "application/octet-stream";
  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  if (new URL(request.url).searchParams.has("download")) {
    headers.set("Content-Disposition", `attachment; filename="${path.basename(absolute)}"`);
  }

  const range = parseRange(request.headers.get("range"), stats.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${stats.size}`);
    return new Response(null, { status: 416, headers });
  }

  const { start, end } = range ?? { start: 0, end: stats.size - 1 };
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${stats.size}`);

  const stream = Readable.toWeb(createReadStream(absolute, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: range ? 206 : 200, headers });
}

function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return "invalid";

  // "bytes=-500" means the last 500 bytes.
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
  const end = rawStart ? (rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return "invalid";
  return { start, end };
}
