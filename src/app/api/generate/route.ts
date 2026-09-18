import { after, NextResponse } from "next/server";
import { generationRequestSchema } from "@/core/validation";
import { resolveTemplate } from "@/industries";
import { runGeneration, stepNamesFor } from "@/pipeline/run";
import { createJob, subscribeToJob } from "@/storage/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Generation is long-running; keep headroom for video pipeline. */
export const maxDuration = 300;

/**
 * POST /api/generate - validates the brief and executes the creative generation pipeline.
 * If the client requests an event stream (Accept: text/event-stream), updates are streamed
 * in real-time over the persistent connection. Otherwise, returns a 202 response.
 */
export async function POST(request: Request): Promise<Response> {
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

  // If client requests streaming (SSE), stream progress directly over the open connection.
  // This completely eliminates multi-container serverless polling issues on Vercel.
  const wantsStream = request.headers.get("accept")?.includes("text/event-stream");
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Send the initial queued job state
    void writer.write(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));

    const unsubscribe = subscribeToJob(job.id, (updatedJob) => {
      try {
        void writer.write(encoder.encode(`data: ${JSON.stringify(updatedJob)}\n\n`));
      } catch {}
    });

    void (async () => {
      try {
        await runGeneration(job.id, generationRequest);
      } catch (err) {
        console.error(`[generate] Job ${job.id} execution error:`, err);
      } finally {
        unsubscribe();
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Job-Id": job.id,
      },
    });
  }

  // Non-streaming fallback
  after(async () => {
    try {
      await runGeneration(job.id, generationRequest);
    } catch (err) {
      console.error(`[generate] Job ${job.id} background execution error:`, err);
    }
  });
  return NextResponse.json({ job }, { status: 202 });
}
