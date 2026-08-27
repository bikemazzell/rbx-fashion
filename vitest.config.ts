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
          exclude: [
            "tests/browser/smoke/**",
            "**/node_modules/**",
            "**/dist/**",
            "**/__screenshots__/**",
          ],
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
          include: [
            "tests/browser/smoke/compose-smoke.test.ts",
            "tests/browser/smoke/smoke.test.ts",
          ],
          exclude: ["**/node_modules/**", "**/dist/**", "**/__screenshots__/**"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
          },
        },
      },
      {
        test: {
          name: "browser-preview-smoke",
          include: ["tests/browser/smoke/preview-smoke.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**", "**/__screenshots__/**"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // GitHub's headless Firefox runner cannot create a WebGL context.
            // Keep its portable canvas smoke coverage above; run the real WebGL
            // rendering checks in the two CI engines that support them.
            instances: [{ browser: "chromium" }, { browser: "webkit" }],
          },
        },
      },
    ],
  },
});
