import { MAX_RUNS, giveUpQuizJob, processQuizJob } from "../core/jobs";
import type { Deps, MessageState, QuizQueue } from "../core/types";

type RunDeps = Pick<Deps, "prisma" | "providers">;

// An in-process queue for tests and scripts. Holds jobs until told to deliver them, and retries at once.
export function createMemoryQueue() {
  const states = new Map<number, MessageState>();
  const runs = new Map<number, number>();

  // Gives a job its next run, as a worker would. Overlapping calls act like a takeover after a stall.
  async function deliver(deps: RunDeps, quizJobId: number): Promise<void> {
    const run = (runs.get(quizJobId) ?? 0) + 1;
    runs.set(quizJobId, run);
    const final = run >= MAX_RUNS;
    try {
      await processQuizJob(deps, quizJobId, { run, final });
      states.set(quizJobId, "finished");
    } catch {
      if (!final) return; // Still waiting, for a retry.
      states.set(quizJobId, "finished");
      await giveUpQuizJob(deps, quizJobId);
    }
  }

  const waiting = () => [...states].filter(([, state]) => state === "waiting").map(([id]) => id);

  return {
    async send(quizJobId: number) {
      if (!states.has(quizJobId)) states.set(quizJobId, "waiting");
    },
    async stateOf(quizJobId: number) {
      return states.get(quizJobId) ?? "gone";
    },
    deliver,
    // Delivers jobs until none are waiting, retrying failures at once.
    async deliverAll(deps: RunDeps) {
      for (let ids = waiting(); ids.length > 0; ids = waiting()) {
        for (const id of ids) await deliver(deps, id);
      }
    },
    // Drops a job's message, as if sending it had been lost.
    lose(quizJobId: number) {
      states.delete(quizJobId);
    },
  } satisfies QuizQueue & Record<string, unknown>;
}

export type MemoryQuizQueue = ReturnType<typeof createMemoryQueue>;
