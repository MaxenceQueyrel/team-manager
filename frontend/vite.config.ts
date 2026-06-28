import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
