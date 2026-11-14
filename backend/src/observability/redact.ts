// Personal data that can turn up inside text such as error messages and stack traces.
const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]"],
  // Password reset links carry their token in the path.
  [/(reset-password\/)[^\s?#"'/]+/g, "$1[token]"],
  [/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g, "$1?[query]"],
  // Stored files are named <uuid>-<original filename>, which may contain spaces.
  [/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[^"'\n]+/g, "$1-[filename]"],
  // Long mixed letters and digits, such as session tokens and API keys.
  [/\b(?=\w*\d)(?=\w*[A-Za-z])\w{24,}\b/g, "[token]"],
];

// Replaces personal data in text with placeholders, keeping the rest readable.
export function redactText(text: string): string {
  return PATTERNS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}
