import { claimNextJob, recoverStaleJobs, runQuizJob } from "./jobs";
import type { Deps } from "./types";

const STALE_CHECK_INTERVAL_MS = 30_000;
const SHUTDOWN_GRACE_MS = 30_000;

export type Worker = { stop(): Promise<void> };

// Polls for queued quiz jobs and runs up to `concurrency` at once.
export function startWorker(
  deps: Deps,
  { concurrency, pollIntervalMs = 1_000 }: { concurrency: number; pollIntervalMs?: number },
): Worker {
  const inFlight = new Set<Promise<void>>();
  let stopping = false;
  let polling = false;

  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      while (!stopping && inFlight.size < concurrency) {
        const jobId = await claimNextJob(deps.prisma);
        if (jobId === null) break;
        const run: Promise<void> = runQuizJob(deps, jobId)
          .catch((error) => console.error(`Quiz job ${jobId} crashed:`, error))
          .finally(() => inFlight.delete(run));
        inFlight.add(run);
      }
    } catch (error) {
      console.error("Polling for quiz jobs failed:", error);
    } finally {
      polling = false;
    }
  };

  const recover = () =>
    recoverStaleJobs(deps.prisma)
      .then((count) => count > 0 && console.log(`Recovered ${count} stale quiz job(s).`))
      .catch((error) => console.error("Recovering stale quiz jobs failed:", error));

  void recover();
  const pollTimer = setInterval(() => void poll(), pollIntervalMs);
  const recoverTimer = setInterval(() => void recover(), STALE_CHECK_INTERVAL_MS);

  return {
    // Stops taking new jobs and waits a while for running ones. Any still running
    // when time is up are picked up again once their heartbeat goes stale.
    async stop() {
      stopping = true;
      clearInterval(pollTimer);
      clearInterval(recoverTimer);
      await Promise.race([
        Promise.allSettled(inFlight),
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS).unref()),
      ]);
    },
  };
}
