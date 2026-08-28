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
