import { after, NextResponse } from "next/server";
import { generationRequestSchema } from "@/core/validation";
import { resolveTemplate } from "@/industries";
import { runGeneration, stepNamesFor } from "@/pipeline/run";
import { createJob } from "@/storage/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Generation is long-running; the request itself returns immediately, but keep headroom. */
export const maxDuration = 300;

/**
 * POST /api/generate - validates the brief, creates a job and starts the pipeline in the
 * background. The client then polls /api/jobs/<id>.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let parsed;
  try {
    parsed = generationRequestSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join(" ") },
      { status: 400 },
    );
  }

  const generationRequest = parsed.data;
  try {
    // Fail fast on an unknown industry or template rather than inside the pipeline.
    resolveTemplate(generationRequest.industryId, generationRequest.templateId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown template." }, { status: 400 });
  }

  const job = createJob(generationRequest, stepNamesFor(generationRequest.engine));
  // In serverless environments (Vercel), background promises freeze upon response return unless
  // scheduled with after() to keep the execution context alive until completion.
  after(async () => {
    try {
      await runGeneration(job.id, generationRequest);
    } catch (err) {
      console.error(`[generate] Job ${job.id} background execution error:`, err);
    }
  });
  return NextResponse.json({ job }, { status: 202 });
}
