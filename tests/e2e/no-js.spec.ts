/**
 * Review Focus 1: with JavaScript off, `/` shows all of its content. Counters hold their real
 * values, every accordion's text is in the page, nothing waits for a reveal, links work.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { HomeContent } from "../../src/content/schema";

// Read like src/content/load.ts does (Node needs an import attribute for JSON modules; Astro does not).
const home = HomeContent.parse(JSON.parse(readFileSync(new URL("../../content/home.json", import.meta.url), "utf8")));

test.describe("home without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("the counters show their final values with suffix", async ({ page }) => {
    const values = await page.locator('[data-motion="home.counter"]').allTextContents();
    expect(values.map((v) => v.trim())).toEqual(home.about.counters.map((c) => `${c.value}${c.suffix}`));
  });

  test("all four service titles and their bullets are in the DOM", async ({ page }) => {
    const items = page.locator('[data-motion="home.services.accordion"]');
    await expect(items).toHaveCount(home.services.length);
    for (const [i, service] of home.services.entries()) {
      const item = items.nth(i);
      await expect(item.locator("summary")).toHaveText(service.title);
      const bullets = (await item.locator("li").allTextContents()).map((b) => b.trim());
      expect(bullets).toEqual([...service.bullets]);
    }
  });

  test("every [data-motion] element is fully opaque", async ({ page }) => {
    const opacities = await page.locator("[data-motion]").evaluateAll((els) =>
      els.map((el) => ({ id: el.getAttribute("data-motion"), opacity: getComputedStyle(el).opacity })),
    );
    expect(opacities.length).toBeGreaterThan(0);
    for (const el of opacities) expect(el.opacity, `${el.id}`).toBe("1");
  });

  test("the six project cards link to their Instagram posts", async ({ page }) => {
    const hrefs = await page.locator(".galley a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(hrefs).toHaveLength(6);
    expect(hrefs.sort()).toEqual(home.projects.map((p) => p.href).sort());
    for (const href of hrefs) expect(href).toMatch(/^https:\/\/www\.instagram\.com\//);
  });
});
