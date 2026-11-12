/**
 * Visual parity with the live Framer site for /pricing and /pricing-ro: each page is captured with
 * the same scroll-stitched routine that made tests/visual/baseline/<page>-<breakpoint>.png
 * (tests/visual/capture.ts) and compared with Playwright's image comparator. On failure the expected,
 * actual and diff images are written to the test output directory.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PricingContent } from "../../src/content/schema";
import { PAGES, capture, captureContextOptions, readBreakpoints } from "./capture";

const MAX_DIFF_PIXEL_RATIO = 0.02;

// Read like src/content/load.ts does (Node needs an import attribute for JSON modules; Astro does not).
const pricing = (lang: "en" | "ro"): PricingContent =>
  PricingContent.parse(JSON.parse(readFileSync(new URL(`../../content/pricing.${lang}.json`, import.meta.url), "utf8")));

const pages = PAGES.filter((p) => p.name === "pricing" || p.name === "pricing-ro").map((p) => ({
  ...p,
  content: pricing(p.name === "pricing" ? "en" : "ro"),
}));

for (const p of pages) {
  for (const bp of await readBreakpoints()) {
    test(`${p.name} matches the Framer baseline at ${bp.name} (${bp.frameWidth}px)`, async ({ browser, baseURL }, testInfo) => {
      const context = await browser.newContext(captureContextOptions(bp.frameWidth));
      try {
        const page = await context.newPage();
        const { png, notes } = await capture(browser, page, `${baseURL}${p.path}`, bp.frameWidth);
        testInfo.annotations.push({ type: "capture", description: notes.join("; ") });
        expect(png).toMatchSnapshot(`${p.name}-${bp.name}.png`, { maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO });
      } finally {
        await context.close();
      }
    });
  }

  test(`${p.name}: every package button links to its Calendly URL`, async ({ page }) => {
    await page.goto(p.path);
    const buttons = page.locator(".card__btn");
    await expect(buttons).toHaveCount(p.content.packages.length);
    for (const [i, pkg] of p.content.packages.entries()) {
      await expect(buttons.nth(i)).toHaveText(pkg.cta);
      await expect(buttons.nth(i)).toHaveAttribute("href", pkg.href);
    }
  });
}
