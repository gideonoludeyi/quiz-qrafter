import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["packages/*", "backend", "frontend"],
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["frontend/**"],
        plugins: ["react"],
        env: { browser: true },
      },
      {
        files: ["backend/**"],
        env: { node: true },
      },
    ],
  },
});
