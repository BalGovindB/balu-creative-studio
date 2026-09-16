import { NextResponse } from "next/server";
import { z } from "zod";
import { createBrandKit, listBrandKits } from "@/storage/brand-kits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Colours must be 6-digit hex, e.g. #1f3cff");

const brandKitSchema = z.object({
  name: z.string().trim().min(1, "Give the brand kit a name.").max(80),
  colors: z.object({ primary: hex, secondary: hex, accent: hex, text: hex }),
  tagline: z.string().trim().max(120).optional(),
  website: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});

export function GET(): NextResponse {
  return NextResponse.json({ brandKits: listBrandKits() });
}

/** POST /api/brand-kits - multipart form: "kit" (JSON), plus optional "logo" and "font" files. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const form = await request.formData();
    const raw = form.get("kit");
    if (typeof raw !== "string") return NextResponse.json({ error: 'Missing the "kit" field.' }, { status: 400 });

    const parsed = brandKitSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(" ") }, { status: 400 });
    }

    const logo = form.get("logo");
    const font = form.get("font");
    const kit = await createBrandKit(parsed.data, {
      logo: logo instanceof File ? logo : null,
      font: font instanceof File ? font : null,
    });
    return NextResponse.json({ brandKit: kit }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the brand kit." }, { status: 400 });
  }
}
