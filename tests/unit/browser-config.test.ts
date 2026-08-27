import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import config from "../../vitest.config";

type BrowserInstance = { browser: string };
type ProjectConfig = {
  test?: {
    name?: string;
    include?: string[];
    browser?: { instances?: BrowserInstance[] };
  };
};

function projectNamed(name: string): ProjectConfig {
  const projects = (config as { test?: { projects?: ProjectConfig[] } }).test?.projects ?? [];
  const project = projects.find((candidate) => candidate.test?.name === name);
  expect(project, `missing Vitest project ${name}`).toBeDefined();
  return project as ProjectConfig;
}

function browsers(project: ProjectConfig): string[] {
  return project.test?.browser?.instances?.map((instance) => instance.browser) ?? [];
}

test("runs portable smoke tests in all browsers and WebGL previews where CI supports them", () => {
  const smoke = projectNamed("browser-smoke");
  expect(smoke.test?.include).toEqual([
    "tests/browser/smoke/compose-smoke.test.ts",
    "tests/browser/smoke/smoke.test.ts",
  ]);
  expect(browsers(smoke)).toEqual(["chromium", "firefox", "webkit"]);

  const preview = projectNamed("browser-preview-smoke");
  expect(preview.test?.include).toEqual(["tests/browser/smoke/preview-smoke.test.ts"]);
  expect(browsers(preview)).toEqual(["chromium", "webkit"]);
});

test("the browser test command includes the WebGL preview project", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };
  expect(packageJson.scripts?.["test:browser"]).toContain("--project browser-preview-smoke");
});
