import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**"],
        },
      },
      {
        test: {
          name: "browser-chromium",
          include: ["tests/browser/**"],
          exclude: ["tests/browser/smoke/**", "**/node_modules/**", "**/dist/**"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        test: {
          name: "browser-smoke",
          include: ["tests/browser/smoke/**"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
          },
        },
      },
    ],
  },
});
