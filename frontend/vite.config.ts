import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 3000,
    // Mirror the production nginx setup: forward /api to the backend so the
    // browser stays same-origin and import.meta.env.VITE_API_URL can be empty.
    // The e2e suite overrides the target to reach its isolated backend.
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:8000",
    },
  },
});
