import type { Document } from "@quizqrafter/shared";
import {
  type RemixiconComponentType,
  RiFile3Line,
  RiFilePdf2Line,
  RiFileTextLine,
  RiFileWord2Line,
  RiImageLine,
  RiMarkdownLine,
} from "@remixicon/react";

export type DocumentKind = "pdf" | "image" | "markdown" | "text" | "word" | "other";

const KINDS: Record<DocumentKind, { label: string; Icon: RemixiconComponentType }> = {
  pdf: { label: "PDF", Icon: RiFilePdf2Line },
  image: { label: "Image", Icon: RiImageLine },
  markdown: { label: "Markdown", Icon: RiMarkdownLine },
  text: { label: "Text", Icon: RiFileTextLine },
  word: { label: "Word", Icon: RiFileWord2Line },
  other: { label: "File", Icon: RiFile3Line },
};

// How the viewer shows a document, from its stored MIME type.
export function kindOf(document: Pick<Document, "mimeType">): DocumentKind {
  const type = document.mimeType;
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type === "text/markdown") return "markdown";
  if (type === "text/plain") return "text";
  if (type.includes("wordprocessingml")) return "word";
  return "other";
}

export const kindLabel = (kind: DocumentKind) => KINDS[kind].label;

export function KindIcon({ kind, className }: { kind: DocumentKind; className?: string }) {
  const { Icon } = KINDS[kind];
  return <Icon aria-hidden className={className} />;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "Nov 12", or with the year when it isn't this year.
export function formatDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
