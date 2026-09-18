export interface UploadedAsset {
  id: string;
  path: string;
  originalName: string;
  bytes: number;
}

/** URL for anything stored under the storage root. */
export function fileUrl(storagePath: string, download = false): string {
  if (storagePath.startsWith("data:") || storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }
  return `/api/files/${storagePath.split("/").map(encodeURIComponent).join("/")}${download ? "?download=1" : ""}`;
}

export async function uploadImages(files: File[]): Promise<UploadedAsset[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  const body = (await response.json()) as { assets?: UploadedAsset[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Upload failed.");
  return body.assets ?? [];
}
