import { MAX_RUNS, giveUpGenerateQuizJob, processGenerateQuizJob } from "../core/jobs";
import type { Deps, MessageState, QuizQueue } from "../core/types";

type RunDeps = Pick<Deps, "prisma" | "providers">;

// An in-process queue for tests and scripts. Holds jobs until told to deliver them, and retries at once.
export function createMemoryQueue() {
  const states = new Map<number, MessageState>();
  const runs = new Map<number, number>();

  // Gives a job its next run, as a worker would. Overlapping calls act like a takeover after a stall.
  async function deliver(deps: RunDeps, generateQuizJobId: number): Promise<void> {
    const run = (runs.get(generateQuizJobId) ?? 0) + 1;
    runs.set(generateQuizJobId, run);
    const final = run >= MAX_RUNS;
    try {
      await processGenerateQuizJob(deps, generateQuizJobId, { run, final });
      states.set(generateQuizJobId, "finished");
    } catch {
      if (!final) return; // Still waiting, for a retry.
      states.set(generateQuizJobId, "finished");
      await giveUpGenerateQuizJob(deps, generateQuizJobId);
    }
  }

  const waiting = () => [...states].filter(([, state]) => state === "waiting").map(([id]) => id);

  return {
    async send(generateQuizJobId: number) {
      if (!states.has(generateQuizJobId)) states.set(generateQuizJobId, "waiting");
    },
    async stateOf(generateQuizJobId: number) {
      return states.get(generateQuizJobId) ?? "gone";
    },
    deliver,
    // Delivers jobs until none are waiting, retrying failures at once.
    async deliverAll(deps: RunDeps) {
      for (let ids = waiting(); ids.length > 0; ids = waiting()) {
        for (const id of ids) await deliver(deps, id);
      }
    },
    // Drops a job's message, as if sending it had been lost.
    lose(generateQuizJobId: number) {
      states.delete(generateQuizJobId);
    },
  } satisfies QuizQueue & Record<string, unknown>;
}

export type MemoryQuizQueue = ReturnType<typeof createMemoryQueue>;
