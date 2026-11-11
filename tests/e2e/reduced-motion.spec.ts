import { test, expect, type Page } from "@playwright/test";

const PATHS = ["/", "/pricing", "/pricing-ro"] as const;

/** Computed opacity and transform of every [data-motion] element, plus the runtime's marks on <html>. */
async function motionState(page: Page): Promise<{
  elements: { id: string | null; opacity: number; transform: string }[];
  htmlClass: string;
  hasConfig: boolean;
}> {
  return page.evaluate(() => ({
    elements: [...document.querySelectorAll("[data-motion]")].map((el) => {
      const style = getComputedStyle(el);
      return { id: el.getAttribute("data-motion"), opacity: Number(style.opacity), transform: style.transform };
    }),
    htmlClass: document.documentElement.className,
    hasConfig: document.getElementById("motion-config")?.getAttribute("type") === "application/json",
  }));
}

test.describe("prefers-reduced-motion: reduce (Review Focus 2)", () => {
  test.use({ reducedMotion: "reduce" });

  for (const path of PATHS) {
    test(`${path} runs no motion and shows every element`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      // Give a (wrongly) started runtime time to apply a hidden state before checking.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      const state = await motionState(page);
      expect(state.hasConfig).toBe(true);
      expect(state.elements.length).toBeGreaterThan(0);
      for (const el of state.elements) {
        expect(el.opacity, `${el.id} opacity`).toBe(1);
        expect(el.transform, `${el.id} transform`).toBe("none");
      }
      expect(state.htmlClass).not.toContain("motion-ready");
      expect(state.htmlClass, "Lenis must not start").not.toContain("lenis");
    });
  }
});

test.describe("motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  for (const path of PATHS) {
    test(`${path} starts the runtime and ends with every element visible`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      await expect(page.locator("html")).toHaveClass(/motion-ready/);
      await expect(page.locator("html")).toHaveClass(/lenis/);
      await expect
        .poll(async () => (await motionState(page)).elements.every((el) => el.opacity === 1), { timeout: 5000 })
        .toBe(true);
    });
  }
});

test.describe("JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("/ shows every [data-motion] element untouched", async ({ page }) => {
    await page.goto("/");
    const elements = page.locator("[data-motion]");
    expect(await elements.count()).toBeGreaterThan(0);
    for (const el of await elements.all()) {
      await expect(el).toHaveCSS("opacity", "1");
      await expect(el).toHaveCSS("transform", "none");
    }
    await expect(page.locator("html")).not.toHaveClass(/motion-ready/);
  });
});
