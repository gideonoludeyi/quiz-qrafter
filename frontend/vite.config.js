// vite.config.js

import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Compile the shared package from source, so the frontend never depends on its
      // dist/ folder, which each shared build deletes and rewrites.
      "@quizqrafter/shared": path.resolve(import.meta.dirname, "../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 3000,
    // Fail instead of moving to another port: the backend's CORS setting (FRONTEND_URL)
    // only allows http://localhost:3000, so any other port breaks every API call.
    strictPort: true,
    open: false,
  },
});
