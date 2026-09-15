import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// NOTE: Freebuff requires HMR to remain disabled. Do not enable `hmr`.
export default defineConfig({
  plugins: [react()],
  server: {
    hmr: false,
    host: "0.0.0.0",
  },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
  },
});
