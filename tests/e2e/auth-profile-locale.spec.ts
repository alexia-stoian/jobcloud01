import { test, expect } from "@playwright/test";

test("landing renders and language switcher is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Be at the heart of the swiss job market" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Create an account" })).toBeVisible();
  await expect(page.getByLabel("Language selector")).toBeVisible();
});
