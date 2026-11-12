// vite.config.js

import react from "@vitejs/plugin-react-swc";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(() => [react()]),
  server: {
    port: 3000,
    open: false,
  },
});
