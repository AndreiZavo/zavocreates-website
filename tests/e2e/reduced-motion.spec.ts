import { test, expect, type Page } from "@playwright/test";

const PATHS = ["/", "/pricing", "/pricing-ro"] as const;
const GLOW = "Desktop / Available/Status/Glowing";

/**
 * Test fixture: an availability-glow element (nav.status.glow, a looping timer effect on every page),
 * inserted after parsing and before the deferred runtime script runs. Tasks 6/7 add the real nav.
 */
async function addGlowFixture(page: Page): Promise<void> {
  await page.addInitScript((layer) => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      const root = document.createElement("div");
      root.setAttribute("data-motion", "nav.status.glow");
      root.id = "glow-fixture";
      const dot = document.createElement("span");
      dot.setAttribute("data-motion-layer", layer);
      dot.style.cssText = "display:block;height:6px;width:6px;opacity:0.5";
      root.appendChild(dot);
      document.body.appendChild(root);
    });
  }, GLOW);
}

const glowLayer = (page: Page): Promise<{ opacity: number; width: number; style: string }> =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("#glow-fixture > span")!;
    const cs = getComputedStyle(el);
    return { opacity: Number(cs.opacity), width: parseFloat(cs.width), style: el.getAttribute("style") ?? "" };
  });

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

  test("no custom cursor and no timer loop", async ({ page }) => {
    await addGlowFixture(page);
    await page.goto("/", { waitUntil: "load" });
    await page.mouse.move(400, 300);
    await page.mouse.move(420, 320);
    await page.waitForTimeout(2000); // longer than the glow's holdSeconds + transition
    await expect(page.locator("[data-motion-cursor]")).toHaveCount(0);
    expect(await glowLayer(page)).toEqual({ opacity: 0.5, width: 6, style: "display: block; height: 6px; width: 6px; opacity: 0.5;" });
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator("html")).not.toHaveClass(/motion-cursor/);
  });

  test("the noise layer shows the still frame, not the animated GIF (Ruling R11)", async ({ page }) => {
    const gifRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().endsWith(".gif")) gifRequests.push(req.url());
    });
    await page.goto("/", { waitUntil: "load" });
    const noise = page.locator(".noise");
    await expect(noise).toHaveCSS("background-image", /noise-still\.png/);
    await expect(noise).not.toHaveCSS("background-image", /\.gif/);
    // Tiling comes from content/site.json, as with motion allowed.
    await expect(noise).toHaveCSS("background-repeat", "repeat");
    await expect(noise).toHaveCSS("background-size", "250px auto");
    expect(gifRequests, "the GIF is neither preloaded nor painted").toEqual([]);
  });
});

test.describe("motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  for (const path of PATHS) {
    test(`${path} starts the runtime and ends with every element visible`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      await expect(page.locator("html")).toHaveClass(/motion-ready/);
      await expect(page.locator("html")).toHaveClass(/lenis/);
      // Scroll-triggered reveals (replaying appear effects) are hidden while out of view by design:
      // they are checked once scrolled into view, every other element right away.
      const scrollReveals = await page.evaluate(() => {
        const config = JSON.parse(document.getElementById("motion-config")?.textContent ?? "{}") as Record<string, { kind: string; trigger: string }>;
        return Object.entries(config)
          .filter(([, e]) => e.kind === "appear" && e.trigger !== "load")
          .map(([id]) => id);
      });
      await expect
        .poll(
          async () => (await motionState(page)).elements.every((el) => el.opacity === 1 || scrollReveals.includes(el.id ?? "")),
          { timeout: 5000 },
        )
        .toBe(true);
      for (const id of scrollReveals) {
        for (const el of await page.locator(`[data-motion="${id}"]`).all()) {
          await el.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
          await expect(el).toHaveCSS("opacity", "1", { timeout: 5000 });
        }
      }
    });
  }
});

test.describe("site-wide effects with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the availability glow loops from its rest state", async ({ page }) => {
    await addGlowFixture(page);
    await page.goto("/", { waitUntil: "load" });
    await expect
      .poll(async () => (await glowLayer(page)).width, { timeout: 4000, intervals: [50] })
      .toBeGreaterThan(6);
    await expect
      .poll(async () => (await glowLayer(page)).width, { timeout: 4000, intervals: [50] })
      .toBe(6);
  });

  test("the custom cursor follows the mouse and hides the native cursor on desktop", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("[data-motion-cursor]")).toHaveCount(1);
    await expect(page.locator("[data-motion-cursor]")).toBeHidden();
    await page.mouse.move(400, 300);
    await page.mouse.move(410, 310);
    await expect(page.locator("[data-motion-cursor]")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/motion-cursor/);
    await expect(page.locator("body")).toHaveCSS("cursor", "none");
  });

  test("the noise layer is the animated GIF", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator(".noise")).toHaveCSS("background-image", /noise\.gif/);
  });

  test("no custom cursor below the desktop breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("html")).toHaveClass(/motion-ready/);
    await expect(page.locator("[data-motion-cursor]")).toHaveCount(0);
  });
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
