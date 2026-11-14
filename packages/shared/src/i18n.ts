import { createInstance } from "i18next";
import { parse } from "yaml";

// The one language the app speaks for now; Intl formatting uses it too.
export const LOCALE = "en";

// Values for a message's {{placeholders}}; `count` also picks the plural form.
export type TranslationValues = Record<string, string | number>;

// Renders a catalogue key as text. `has` asks whether the catalogue has the key (for `count`, if given).
export type Translate = ((key: string, values?: TranslationValues) => string) & {
  has: (key: string, values?: TranslationValues) => boolean;
};

export type TranslatorOptions = {
  // Throw on a missing key or placeholder value instead of warning. Defaults to on in tests.
  strict?: boolean;
};

// Whether this runs under a test runner, where a missing key should fail the test.
function inTests(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.VITEST !== undefined || env?.NODE_ENV === "test";
}

// Turns a YAML catalogue's text into a ready, synchronous translate function.
export function createTranslator(
  catalogue: string,
  { strict = inTests() }: TranslatorOptions = {},
): Translate {
  const problem = (message: string) => {
    if (strict) throw new Error(message);
    console.warn(message);
  };

  const i18n = createInstance();
  void i18n.init({
    lng: LOCALE,
    fallbackLng: false,
    initAsync: false,
    resources: { [LOCALE]: { translation: parse(catalogue) } },
    // React escapes what it renders; HTML emails escape their values themselves.
    interpolation: { escapeValue: false },
    missingInterpolationHandler: (text, match) => {
      problem(`No value for ${match[0]} in "${text}"`);
      return match[0];
    },
  });

  const t = (key: string, values?: TranslationValues) => {
    if (!i18n.exists(key, values)) problem(`Missing catalogue key: ${key}`);
    return i18n.t(key, values ?? {});
  };
  const has = (key: string, values?: TranslationValues) => i18n.exists(key, values);
  return Object.assign(t, { has });
}
