import { expect, test } from "@playwright/test";

test("phone landscape mounts both editors without pushing controls below the viewport", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Shirt", exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });

  await expect(page.locator(".workspace-stage")).toBeVisible();
  await expect(page.locator(".preview-stage")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tools" })).toHaveCount(0);
  const projectFiles = page.getByRole("navigation", { name: "Project files" });
  await expect(projectFiles).toBeVisible();
  const saveBox = await projectFiles.getByRole("button", { name: "Save", exact: true }).boundingBox();
  const exportBox = await projectFiles.getByRole("button", { name: "Export", exact: true }).boundingBox();
  if (saveBox === null || exportBox === null) throw new Error("file buttons are missing");
  expect(exportBox.x).toBeGreaterThan(saveBox.x);
  expect(exportBox.x - (saveBox.x + saveBox.width)).toBeLessThanOrEqual(8);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Add Layer", exact: true }).click();
  await page.getByRole("button", { name: "Cut Out", exact: true }).click();
  await page.getByRole("button", { name: "Oval", exact: true }).click();
  const overlay = page.locator(".workspace-overlay");
  const box = await overlay.boundingBox();
  if (box === null) throw new Error("workspace overlay is missing");
  const start = { clientX: box.x + box.width * 0.3, clientY: box.y + box.height * 0.3 };
  const end = { clientX: box.x + box.width * 0.7, clientY: box.y + box.height * 0.7 };
  await overlay.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", ...start });
  await overlay.dispatchEvent("pointermove", { pointerId: 1, pointerType: "touch", ...end });
  await overlay.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", ...end });
  await expect(page.locator(".cutout-selection-label")).toHaveText("Oval Cut Out");
  await expect(overlay).toHaveAttribute("data-selection-shape", "ellipse");

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
    };
  });

  expect(layout.workspace.height).toBeGreaterThan(80);
  expect(layout.preview.height).toBeGreaterThan(80);
  expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(pageErrors.filter((message) => message.includes("ResizeObserver loop"))).toEqual([]);
});

test("compact color and cutout More sheets do not create nested scrolling in phone landscape", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Shirt", exact: true }).click();

  const expectCompactMoreFits = async () => {
    const metrics = await page.locator('[role="dialog"][aria-label="More"]').evaluate((sheet) => {
      const form = sheet.querySelector<HTMLElement>(".more-form");
      if (form === null) throw new Error("More form is missing");
      return {
        sheetClientHeight: sheet.clientHeight,
        sheetScrollHeight: sheet.scrollHeight,
        formClientHeight: form.clientHeight,
        formScrollHeight: form.scrollHeight,
        formOverflowY: getComputedStyle(form).overflowY,
      };
    });
    expect(metrics.sheetScrollHeight).toBeLessThanOrEqual(metrics.sheetClientHeight);
    expect(metrics.formScrollHeight).toBeLessThanOrEqual(metrics.formClientHeight);
    expect(metrics.formOverflowY).not.toMatch(/auto|scroll/);
  };

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Add Layer", exact: true }).click();
  await page.getByRole("button", { name: "Choose Color", exact: true }).click();
  await page.getByRole("button", { name: "Red", exact: true }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expectCompactMoreFits();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Add Layer", exact: true }).click();
  await page.getByRole("button", { name: "Cut Out", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const overlay = page.locator(".workspace-overlay");
  const box = await overlay.boundingBox();
  if (box === null) throw new Error("workspace overlay is missing");
  await overlay.dispatchEvent("pointerdown", {
    pointerId: 2,
    pointerType: "touch",
    clientX: box.x + box.width * 0.3,
    clientY: box.y + box.height * 0.3,
  });
  await overlay.dispatchEvent("pointermove", {
    pointerId: 2,
    pointerType: "touch",
    clientX: box.x + box.width * 0.7,
    clientY: box.y + box.height * 0.7,
  });
  await overlay.dispatchEvent("pointerup", {
    pointerId: 2,
    pointerType: "touch",
    clientX: box.x + box.width * 0.7,
    clientY: box.y + box.height * 0.7,
  });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expectCompactMoreFits();
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
