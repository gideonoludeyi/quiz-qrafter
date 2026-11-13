import { defineConfig } from "vite-plus";

export default defineConfig({
  // Bundles the server and the standalone worker as ES modules. Dependencies stay external,
  // except the shared package, which ships TypeScript source and is compiled in.
  pack: {
    entry: ["src/index.ts", "src/worker.ts"],
    format: ["esm"],
    platform: "node",
    dts: false,
    deps: { alwaysBundle: ["@quizqrafter/shared"] },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: "./test/globalSetup.ts",
    // Test files share one database and one job queue, so run them one at a time.
    fileParallelism: false,
  },
});
