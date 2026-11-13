import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: "./test/globalSetup.ts",
    // Test files share one database and one job queue, so run them one at a time.
    fileParallelism: false,
  },
});
