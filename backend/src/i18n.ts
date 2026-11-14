import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTranslator } from "@quizqrafter/shared";

// The shared catalogue's text, read from the installed shared package; the bundle doesn't include it.
export function readCatalogue(): string {
  const url = import.meta.resolve("@quizqrafter/shared/locales/en.yml");
  return readFileSync(fileURLToPath(url), "utf-8");
}

// The server's wording: emails, exports, and the English beside each error code.
export const t = createTranslator(readCatalogue());
