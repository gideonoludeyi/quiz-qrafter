import { type AppError, createTranslator } from "@quizqrafter/shared";
import en from "@quizqrafter/shared/locales/en.yml?raw";

// The app's wording, from the shared catalogue, bundled as text by Vite.
export const t = createTranslator(en);

// The words for an error code from the server, or null if this build doesn't know the code.
export function describeError(error: AppError | null): string | null {
  if (error === null || !t.has(error.code, error.values)) return null;
  return t(error.code, error.values);
}
