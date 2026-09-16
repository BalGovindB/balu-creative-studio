/**
 * Runs once when the server process starts.
 *
 * Generation happens in the process that accepted the request, so a restart - a redeploy, a
 * crash, a host putting the container to sleep - abandons anything mid-render. Those jobs are
 * cleared here, otherwise they sit at a half-finished percentage in the UI forever.
 */
export async function register(): Promise<void> {
  // Next.js also runs this in its edge runtime, where the filesystem does not exist.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { failInterruptedJobs } = await import("./storage/jobs");
  const recovered = failInterruptedJobs();
  if (recovered > 0) {
    console.log(`[balu] marked ${recovered} interrupted job(s) as failed after restart`);
  }
}
