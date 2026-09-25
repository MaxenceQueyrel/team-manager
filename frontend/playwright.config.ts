import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Specs share one backend and its file-based data store, so run them
  // sequentially to avoid cross-test data races.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // Ports 3001/8001 keep the e2e stack apart from the dev app on 3000/8000
    // (see scripts/test-e2e.sh).
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    launchOptions: {
      // Headless Chromium needs this in sandboxed dev containers / CI that
      // lack the user namespaces its own sandbox requires.
      args: ["--no-sandbox"],
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "bun run dev --port 3001 --strictPort",
    url: "http://localhost:3001",
    env: { API_PROXY_TARGET: "http://localhost:8001" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
