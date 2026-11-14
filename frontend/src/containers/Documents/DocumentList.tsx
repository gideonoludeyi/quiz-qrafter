import { type Document, isJobActive, type GenerateQuizJob } from "@quizqrafter/shared";
import {
  RiArrowDownSLine,
  RiCheckboxCircleFill,
  RiCircleLine,
  RiErrorWarningFill,
} from "@remixicon/react";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatDate, formatSize, KindIcon, kindLabel, kindOf } from "./kinds";

export type DocumentState = "in_progress" | "failed" | "ready" | "not_started";

// Where a document stands, from its freshest GenerateQuizJob and its quiz.
export function stateOf(document: Document, job: GenerateQuizJob | null): DocumentState {
  if (isJobActive(job)) return "in_progress";
  if (job?.status === "failed") return "failed";
  return document.quizId !== null ? "ready" : "not_started";
}

const GROUPS: { state: DocumentState; label: string }[] = [
  { state: "in_progress", label: "In progress" },
  { state: "failed", label: "Needs attention" },
  { state: "ready", label: "Ready" },
  { state: "not_started", label: "No quiz yet" },
];

const FILTERS = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In progress" },
  { value: "failed", label: "Needs attention" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export function StateIcon({ state, className }: { state: DocumentState; className?: string }) {
  switch (state) {
    case "in_progress":
      return <Spinner className={cn("text-amber-500", className)} aria-hidden />;
    case "failed":
      return <RiErrorWarningFill aria-hidden className={cn("text-destructive", className)} />;
    case "ready":
      return <RiCheckboxCircleFill aria-hidden className={cn("text-emerald-500", className)} />;
    default:
      return <RiCircleLine aria-hidden className={cn("text-muted-foreground", className)} />;
  }
}

// A short description of a document's quiz, for its row.
function quizSummary(state: DocumentState, job: GenerateQuizJob | null): string {
  if (state === "ready") return "Quiz ready";
  if (state === "failed") return "Failed";
  if (state === "not_started") return "No quiz";
  if (job?.status === "queued") return "Waiting…";
  if (job?.stage === "reading") return "Reading…";
  if (job?.stage === "writing" && job.questionsWritten > 0) {
    return `Writing… ${job.questionsWritten} so far`;
  }
  return "Writing…";
}

const Pill = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span
    className={cn(
      "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground",
      className,
    )}
  >
    {children}
  </span>
);

type DocumentListProps = {
  documents: Document[];
  // The freshest known GenerateQuizJob for a document.
  jobOf: (documentId: number) => GenerateQuizJob | null;
  selectedId: number | null;
  onSelect: (document: Document) => void;
  disabled: boolean;
};

// The user's documents, grouped by where their quiz stands, like an issue list.
const DocumentList = ({ documents, jobOf, selectedId, onSelect, disabled }: DocumentListProps) => {
  const [filter, setFilter] = useState<Filter>("all");

  const rows = documents.map((document) => {
    const job = jobOf(document.id);
    return { document, job, state: stateOf(document, job) };
  });
  const groups = GROUPS.filter((group) => filter === "all" || group.state === filter)
    .map((group) => ({ ...group, rows: rows.filter((row) => row.state === group.state) }))
    .filter((group) => group.rows.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col @container">
      <div className="flex shrink-0 flex-wrap gap-1.5 px-3 py-3" role="group" aria-label="Filter">
        {FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "secondary" : "ghost"}
            className={cn("h-7 rounded-full px-3", filter !== value && "text-muted-foreground")}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <nav aria-label="Your documents" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground">
            {documents.length === 0
              ? "Upload your notes to generate your first quiz."
              : "No documents match this filter."}
          </p>
        )}
        {groups.map((group) => (
          <Collapsible key={group.state} defaultOpen className="mb-1">
            <CollapsibleTrigger className="group/trigger flex h-9 w-full items-center gap-2 rounded-lg bg-muted/50 px-3 text-sm font-medium hover:bg-muted">
              <RiArrowDownSLine className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-0 -rotate-90" />
              <StateIcon state={group.state} className="size-4" />
              {group.label}
              <span className="text-muted-foreground">{group.rows.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="flex flex-col py-1">
                {group.rows.map(({ document, job, state }) => {
                  const kind = kindOf(document);
                  const selected = document.id === selectedId;
                  return (
                    <li key={document.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-current={selected ? "true" : undefined}
                        onClick={() => onSelect(document)}
                        className={cn(
                          "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
                          selected && "bg-muted hover:bg-muted",
                        )}
                      >
                        <KindIcon kind={kind} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {document.filename}
                        </span>
                        <Pill className={cn(state === "failed" && "text-destructive")}>
                          {state === "in_progress" && <Spinner className="size-3" aria-hidden />}
                          {quizSummary(state, job)}
                        </Pill>
                        <Pill className="hidden @xl:inline-flex">{kindLabel(kind)}</Pill>
                        <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground @2xl:inline">
                          {formatSize(document.size)}
                        </span>
                        <span className="hidden w-14 shrink-0 text-right text-xs text-muted-foreground @md:inline">
                          {formatDate(document.createdAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>
    </div>
  );
};

export default DocumentList;
