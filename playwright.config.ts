import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:5179/rbx-fashion/",
  },
  webServer: {
    command: "npm run dev -- --port 5179 --strictPort",
    url: "http://localhost:5179/rbx-fashion/",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
