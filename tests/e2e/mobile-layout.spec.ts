import { expect, test } from "@playwright/test";

test("phone landscape mounts both editors without pushing tools below the viewport", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Shirt", exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });

  await expect(page.locator(".workspace-stage")).toBeVisible();
  await expect(page.locator(".preview-stage")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tools" })).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Cut Out", exact: true }).click();
  const overlay = page.locator(".workspace-overlay");
  const box = await overlay.boundingBox();
  if (box === null) throw new Error("workspace overlay is missing");
  const start = { clientX: box.x + box.width * 0.3, clientY: box.y + box.height * 0.3 };
  const end = { clientX: box.x + box.width * 0.7, clientY: box.y + box.height * 0.7 };
  await overlay.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", ...start });
  await overlay.dispatchEvent("pointermove", { pointerId: 1, pointerType: "touch", ...end });
  await overlay.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", ...end });
  await expect(page.locator(".cutout-selection-label")).toHaveText("Cut Out");

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`missing ${selector}`);
      return element.getBoundingClientRect().toJSON();
    };
    return {
      viewportHeight: innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      bodyHeight: document.body.scrollHeight,
      workspace: rect(".workspace-stage"),
      preview: rect(".preview-stage"),
      toolbar: rect(".toolbar"),
    };
  });

  expect(layout.workspace.height).toBeGreaterThan(80);
  expect(layout.preview.height).toBeGreaterThan(80);
  expect(layout.toolbar.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(pageErrors.filter((message) => message.includes("ResizeObserver loop"))).toEqual([]);
});

test("phone portrait keeps the 2D and 3D stages bounded while switching views", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Shirt", exact: true }).click();

  const layout = async (selector: string) =>
    page.evaluate((stageSelector) => {
      const app = document.querySelector<HTMLElement>(".app");
      const stage = document.querySelector<HTMLElement>(stageSelector);
      if (app === null || stage === null) throw new Error("editor layout is missing");
      return {
        viewportHeight: innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        appHeight: app.getBoundingClientRect().height,
        appOverflowY: getComputedStyle(app).overflowY,
        stageHeight: stage.getBoundingClientRect().height,
      };
    }, selector);

  const edit = await layout(".workspace-stage");
  expect(edit.appHeight).toBeLessThanOrEqual(edit.viewportHeight + 1);
  expect(edit.documentHeight).toBeLessThanOrEqual(edit.viewportHeight + 1);
  expect(edit.appOverflowY).toBe("hidden");
  expect(edit.stageHeight).toBeGreaterThan(80);

  const viewNavigation = page.getByRole("navigation", { name: "View" });
  await viewNavigation.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".preview-stage")).toBeVisible();
  const previewHeights: number[] = [];
  for (let sample = 0; sample < 5; sample += 1) {
    await page.waitForTimeout(100);
    const preview = await layout(".preview-stage");
    expect(preview.appHeight).toBeLessThanOrEqual(preview.viewportHeight + 1);
    expect(preview.documentHeight).toBeLessThanOrEqual(preview.viewportHeight + 1);
    expect(preview.appOverflowY).toBe("hidden");
    previewHeights.push(preview.stageHeight);
  }
  expect(Math.max(...previewHeights) - Math.min(...previewHeights)).toBeLessThanOrEqual(1);

  await viewNavigation.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".workspace-stage")).toBeVisible();
  const editAgain = await layout(".workspace-stage");
  expect(editAgain.documentHeight).toBeLessThanOrEqual(editAgain.viewportHeight + 1);
  expect(editAgain.stageHeight).toBeGreaterThan(80);
});
