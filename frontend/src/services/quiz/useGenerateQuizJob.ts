import { isJobActive, type GenerateQuizJob } from "@quizqrafter/shared";
import { useEffect, useRef, useState } from "react";
import { useQuizAPI } from "./context";

const POLL_INTERVAL_MS = 1_500;

// Follows a GenerateQuizJob: polls it while it is queued or running, and calls `onFinish`
// once when it succeeds or fails. Returns the job's latest known state.
export function useGenerateQuizJob(
  job: GenerateQuizJob | null,
  onFinish: (job: GenerateQuizJob) => void,
): GenerateQuizJob | null {
  const { getJob } = useQuizAPI();
  const [tracked, setTracked] = useState({ source: job, current: job });
  // Start over whenever the caller passes a different job.
  if (tracked.source !== job) setTracked({ source: job, current: job });
  const current = tracked.source === job ? tracked.current : job;

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const id = current?.id ?? null;
  const active = isJobActive(current);

  useEffect(() => {
    if (id === null || !active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const next = await getJob(id);
        if (cancelled) return;
        setTracked((state) => (state.current?.id === id ? { ...state, current: next } : state));
        if (!isJobActive(next)) {
          onFinishRef.current(next);
          return;
        }
      } catch (error) {
        // Keep polling: a dropped request shouldn't lose track of the job.
        console.error("Checking the GenerateQuizJob failed:", error);
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, active, getJob]);

  return current;
}
