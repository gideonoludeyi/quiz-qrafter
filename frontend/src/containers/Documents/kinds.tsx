import { type Document, LOCALE } from "@quizqrafter/shared";
import {
  type RemixiconComponentType,
  RiFile3Line,
  RiFilePdf2Line,
  RiFileTextLine,
  RiFileWord2Line,
  RiImageLine,
  RiMarkdownLine,
} from "@remixicon/react";
import { t } from "@/i18n";

export type DocumentKind = "pdf" | "image" | "markdown" | "text" | "word" | "other";

const ICONS: Record<DocumentKind, RemixiconComponentType> = {
  pdf: RiFilePdf2Line,
  image: RiImageLine,
  markdown: RiMarkdownLine,
  text: RiFileTextLine,
  word: RiFileWord2Line,
  other: RiFile3Line,
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

export function kindLabel(kind: DocumentKind): string {
  switch (kind) {
    case "pdf":
      return t("documents.kind.pdf");
    case "image":
      return t("documents.kind.image");
    case "markdown":
      return t("documents.kind.markdown");
    case "text":
      return t("documents.kind.text");
    case "word":
      return t("documents.kind.word");
    case "other":
      return t("documents.kind.other");
  }
}

export function KindIcon({ kind, className }: { kind: DocumentKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden className={className} />;
}

// A size in bytes, kB or MB, worded for the app's locale.
export function formatSize(bytes: number): string {
  const [unit, value, digits] =
    bytes < 1024
      ? ["byte", bytes, 0]
      : bytes < 1024 * 1024
        ? ["kilobyte", bytes / 1024, 0]
        : ["megabyte", bytes / (1024 * 1024), 1];
  return new Intl.NumberFormat(LOCALE, {
    style: "unit",
    unit,
    maximumFractionDigits: digits,
  }).format(value);
}

// "Nov 12", or with the year when it isn't this year.
export function formatDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(LOCALE, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}
