import { createTranslator } from "@quizqrafter/shared";
import en from "@quizqrafter/shared/locales/en.yml?raw";

// The app's wording, from the shared catalogue, bundled as text by Vite.
export const t = createTranslator(en);
