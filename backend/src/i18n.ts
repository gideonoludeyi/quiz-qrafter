import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createTranslator } from "@quizqrafter/shared";

// require.resolve, since Vitest's module runner doesn't support import.meta.resolve.
const require = createRequire(import.meta.url);

// The shared catalogue's text, read from the installed shared package; the bundle doesn't include it.
export function readCatalogue(): string {
  return readFileSync(require.resolve("@quizqrafter/shared/locales/en.yml"), "utf-8");
}

// The server's wording: emails, exports, and the English beside each error code.
export const t = createTranslator(readCatalogue());
