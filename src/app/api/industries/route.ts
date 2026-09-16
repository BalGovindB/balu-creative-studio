import { NextResponse } from "next/server";
import { getIndustry, listIndustries } from "@/industries";

export const runtime = "nodejs";

/**
 * GET /api/industries            -> summaries for the picker
 * GET /api/industries?id=<id>    -> one full pack (templates, characters, scenes, compliance)
 */
export function GET(request: Request): NextResponse {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ industries: listIndustries() });

  const pack = getIndustry(id);
  if (!pack) return NextResponse.json({ error: `Unknown industry "${id}"` }, { status: 404 });
  return NextResponse.json({ industry: pack });
}
