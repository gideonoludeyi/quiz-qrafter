import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { parse } from "yaml";
import { readCatalogue, t } from "../src/i18n";

const ROOT = path.resolve(import.meta.dirname, "../..");
// Where user-facing wording is asked for by key. Each key must be in the shared catalogue.
const SOURCE_DIRS = [
  "frontend/src",
  "backend/src",
  "backend/scripts",
  "backend/test",
  "packages/shared/src",
  "e2e",
];
// Tests of the translator itself, which ask for made-up keys.
const NOT_SCANNED = [import.meta.filename, path.join(ROOT, "packages/shared/src/i18n.test.ts")];
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

// The catalogue as dotted keys, e.g. "errors.jobs.tooManyActive_one", each with its text.
function flatten(tree: unknown, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [name, value] of Object.entries(tree as Record<string, unknown>)) {
    const key = prefix + name;
    if (typeof value === "string") flat.set(key, value);
    else for (const entry of flatten(value, `${key}.`)) flat.set(...entry);
  }
  return flat;
}

const messages = flatten(parse(readCatalogue()));

// The texts a key resolves to: itself, or each of its plural forms.
function textsOf(key: string): string[] {
  const exact = messages.get(key);
  if (exact !== undefined) return [exact];
  return [...messages]
    .filter(([name]) => name.replace(PLURAL_SUFFIX, "") === key && PLURAL_SUFFIX.test(name))
    .map(([, text]) => text);
}

const placeholdersOf = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]);

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !file.includes("node_modules") && !NOT_SCANNED.includes(file));
}

type Use = { key: string; where: string; values: string[] | null };

// Literal keys passed to t(), with the names in a plain `{ … }` values object, if any.
// Server error codes are catalogue keys too, so any "errors.…" literal counts.
function usesIn(file: string): Use[] {
  const source = readFileSync(file, "utf-8");
  const where = path.relative(ROOT, file);
  const uses: Use[] = [];
  for (const match of source.matchAll(/\bt\(\s*"([^"]+)"\s*(?:,\s*\{([^{}]*)\})?/g)) {
    const [, key, body] = match;
    const names =
      body === undefined || body.includes("...")
        ? null
        : [...body.matchAll(/(?:^|,)\s*(\w+)\s*(?=:|,|$)/g)].map((m) => m[1]);
    uses.push({ key, where, values: names });
  }
  for (const match of source.matchAll(/"((?:auth\.)?errors\.[\w.]+)"/g)) {
    uses.push({ key: match[1], where, values: null });
  }
  return uses;
}

const uses = SOURCE_DIRS.flatMap(sourceFiles).flatMap(usesIn);

describe("the catalogue", () => {
  it("has every key the code asks for", () => {
    const missing = uses.filter((use) => textsOf(use.key).length === 0);
    expect(missing.map((use) => `${use.key} (${use.where})`)).toEqual([]);
  });

  it("is given a value for each placeholder, and only those", () => {
    const mismatched = uses.flatMap(({ key, where, values }) => {
      const texts = textsOf(key);
      if (values === null || texts.length === 0) return [];
      const expected = new Set(texts.flatMap(placeholdersOf));
      // A plural message is chosen by count, whether or not it shows the number.
      if (texts.length > 1 || messages.has(`${key}_other`)) expected.add("count");
      const given = new Set(values);
      const same = expected.size === given.size && [...expected].every((name) => given.has(name));
      return same
        ? []
        : [`${key} (${where}): needs {${[...expected].join()}}, given {${values.join()}}`];
    });
    expect(mismatched).toEqual([]);
  });
});

describe("the backend's translator", () => {
  it("reads the catalogue from the shared package and picks the plural form by count", () => {
    expect(t("common.appName")).toBe("Quiz Qrafter");
    expect(t("errors.jobs.tooManyActive", { count: 1 })).toMatch(/at most 1 quiz in progress/);
    expect(t("errors.jobs.tooManyActive", { count: 3 })).toMatch(/at most 3 quizzes in progress/);
  });
});
