import type { QuizJob } from "@quizqrafter/shared";
import { RiErrorWarningLine, RiRefreshLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";

// The prompt asks for about 10 questions; the bar only needs a rough scale.
const EXPECTED_QUESTIONS = 10;

// What the job is doing, in words, and roughly how far along it is (0–100).
function describe(job: QuizJob): { label: string; percent: number } {
  if (job.status === "queued") return { label: "Waiting to start…", percent: 5 };
  switch (job.stage) {
    case "reading":
      return { label: "Reading your document…", percent: 15 };
    case "writing": {
      const written = job.questionsWritten;
      const share = Math.min(written, EXPECTED_QUESTIONS) / EXPECTED_QUESTIONS;
      return {
        label:
          written === 0 ? "Writing questions…" : `Writing questions: ${written} written so far`,
        percent: 25 + Math.round(share * 65),
      };
    }
    default:
      return { label: "Starting…", percent: 10 };
  }
}

// Shows a quiz job in progress, or why it failed with a way to try again.
const JobStatus = ({
  job,
  filename,
  onRetry,
  retrying,
}: {
  job: QuizJob;
  filename: string;
  onRetry: () => void;
  retrying: boolean;
}) => {
  if (job.status === "failed") {
    return (
      <Card role="alert">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RiErrorWarningLine className="size-5 text-destructive" />
            The quiz for {filename} couldn't be made
          </CardTitle>
          <CardDescription>{job.error ?? "Something went wrong."}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RiRefreshLine data-icon="inline-start" />
            )}
            Try again
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const { label, percent } = describe(job);
  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Spinner className="size-5" />
          Making a quiz from {filename}
        </CardTitle>
        <CardDescription>
          This usually takes under a minute. You can leave this page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Progress value={percent} aria-label="Quiz progress" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
};

export default JobStatus;
