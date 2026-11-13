import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: "./test/globalSetup.ts",
  },
});
