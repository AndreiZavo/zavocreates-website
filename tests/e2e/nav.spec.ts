/**
 * Tablet/phone menu (Nav.astro). The toggle script owns open/closed and runs with or without motion;
 * without JavaScript the menu is shown open. Phone width: 390 px, like the phone baselines.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Site } from "../../src/content/schema";

const site = Site.parse(JSON.parse(readFileSync(new URL("../../content/site.json", import.meta.url), "utf8")));
const PHONE = { width: 390, height: 844 };

const navLinks = (page: Page) => site.nav.links.map((link) => page.locator(`.nav__links a[href="${link.href}"]`));
const toggle = (page: Page) => page.locator(".nav__toggle");

async function expectToggleWorks(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(page)).toHaveAttribute("aria-controls", "nav-menu");
  await expect(toggle(page)).toHaveAccessibleName(site.nav.links.map((l) => l.label).join(", "));
  for (const link of navLinks(page)) await expect(link).toBeHidden();

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  for (const link of navLinks(page)) await expect(link).toBeVisible();
  await expect(page.locator(`#nav-menu a[href="${site.nav.cta.href}"]`)).toBeVisible();

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  for (const link of navLinks(page)) await expect(link).toBeHidden();
}

test.describe("phone menu, prefers-reduced-motion: reduce", () => {
  test.use({ viewport: PHONE, reducedMotion: "reduce" });

  test("the toggle opens and closes the menu without the motion runtime", async ({ page }) => {
    await expectToggleWorks(page);
    await expect(page.locator("html")).not.toHaveClass(/motion-ready/);
  });
});

test.describe("phone menu, motion allowed", () => {
  test.use({ viewport: PHONE, reducedMotion: "no-preference" });

  test("the toggle opens and closes the menu with the motion runtime", async ({ page }) => {
    await expectToggleWorks(page);
    await expect(page.locator("html")).toHaveClass(/motion-ready/);
  });
});

test.describe("phone menu without JavaScript", () => {
  test.use({ viewport: PHONE, javaScriptEnabled: false });

  for (const path of ["/", "/pricing", "/pricing-ro"]) {
    test(`${path}: every nav link and the Contact button are visible`, async ({ page }) => {
      await page.goto(path);
      for (const link of navLinks(page)) await expect(link).toBeVisible();
      await expect(page.locator(`#nav-menu a[href="${site.nav.cta.href}"]`)).toBeVisible();
      // The toggle needs JavaScript, so it is not offered.
      await expect(toggle(page)).toBeHidden();
    });
  }
});
