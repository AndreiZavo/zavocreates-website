import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { HomeContent } from "../../src/content/schema";

const home = HomeContent.parse(JSON.parse(readFileSync(new URL("../../content/home.json", import.meta.url), "utf8")));

test("home responds 200 with html lang=en", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("home has one h1 with the whole hero heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(`${home.hero.headingLeft} ${home.hero.headingRight}`);
});
