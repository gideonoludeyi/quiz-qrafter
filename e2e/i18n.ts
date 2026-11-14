import { createTranslator } from "@quizqrafter/shared";
import { readCatalogue } from "../backend/src/i18n";

// The app's wording, so tests find text as users see it. A missing key fails the test.
export const t = createTranslator(readCatalogue(), { strict: true });

// A message with any number in place of its count, e.g. for progress that keeps changing.
export function anyCount(key: string): RegExp {
  const SAMPLE = 9_876_543;
  const escaped = t(key, { count: SAMPLE }).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(String(SAMPLE), "\\d+"));
}
