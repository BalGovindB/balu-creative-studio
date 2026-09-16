import { NextResponse } from "next/server";
import { saveUploadedImage, type StoredAsset } from "@/storage/assets";

export const runtime = "nodejs";

/**
 * POST /api/uploads - multipart form with one or more "files" entries.
 * Returns the stored assets; their ids are what generation requests refer to.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
    if (files.length > 4) return NextResponse.json({ error: "Upload at most 4 images at a time." }, { status: 400 });

    const assets: StoredAsset[] = [];
    for (const file of files) assets.push(await saveUploadedImage(file));
    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
