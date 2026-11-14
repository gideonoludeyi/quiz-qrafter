import { describe, expect, it, vi } from "vite-plus/test";
import { createTranslator } from "./i18n";

const CATALOGUE = `
greeting: Hi {{name}}
inbox:
  unread_one: "{{count}} unread message"
  unread_other: "{{count}} unread messages"
`;

describe("createTranslator", () => {
  it("fills in placeholders and picks the plural form by count", () => {
    const t = createTranslator(CATALOGUE);
    expect(t("greeting", { name: "Ada" })).toBe("Hi Ada");
    expect(t("inbox.unread", { count: 1 })).toBe("1 unread message");
    expect(t("inbox.unread", { count: 4 })).toBe("4 unread messages");
    expect(t.has("inbox.unread", { count: 2 })).toBe(true);
    expect(t.has("inbox.read")).toBe(false);
  });

  it("throws on a missing key or placeholder value in tests", () => {
    const t = createTranslator(CATALOGUE);
    expect(() => t("inbox.read")).toThrow("Missing catalogue key: inbox.read");
    expect(() => t("greeting")).toThrow("No value for {{name}}");
  });

  it("only warns when not strict", () => {
    const t = createTranslator(CATALOGUE, { strict: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(t("inbox.read")).toBe("inbox.read");
      expect(t("greeting")).toBe("Hi {{name}}");
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});
