/**
 * Full-page screenshots of every page at every breakpoint width in content/tokens.json.
 *
 *   node scripts/capture-baseline.ts --base https://zavocreates.com --out tests/visual/baseline
 *
 * Used once against the live Framer site (the baseline) and again against the rebuild,
 * so both are rendered the same way. Optional: --pages home,pricing  --breakpoints desktop
 *
 * Reads tokens.json directly (not getTokens()) so it runs under plain `node` with no bundler.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";

const PAGES = [
  { name: "home", path: "/" },
  { name: "pricing", path: "/pricing" },
  { name: "pricing-ro", path: "/pricing-ro" },
] as const;

const VIEWPORT_HEIGHT = 900;
const SCROLL_PAUSE_MS = 250;
const SETTLE_MS = 1500;
const STABLE_INTERVAL_MS = 500;
const STABLE_ATTEMPTS = 20;

/**
 * Parts that never stop moving, so two captures of the same page would differ.
 * They keep their layout box (visibility, not display). Each selector may match
 * nothing: the list covers both the Framer site and the rebuild.
 */
const HIDE_SELECTORS = [
  // Logo marquee track
  '[data-framer-name="Client Logo Carrusel"] section > ul', // Framer ticker
  "[data-marquee-track]",
  ".marquee__track",
  // Looping animations: the avatar badge that cycles "Hi" <-> waving hand (its circle
  // stays, only the cycling content is hidden) and the pulsing "available" dot
  '[data-framer-name="Avatar Wrap"] [data-framer-name="Text"] > *',
  '[data-framer-name="Hand Waving"]',
  '[data-framer-name="Glowing"]',
  // Contact form: Turnstile widget
  ".cf-turnstile",
  'iframe[src*="challenges.cloudflare.com"]',
  // Framer's editor bar iframe
  "#__framer-editorbar",
  // Opt-in hook for the rebuild
  "[data-baseline-hide]",
];

// Descendants are listed too: a child with its own `visibility: visible` would otherwise show.
const HIDE_CSS = `
${HIDE_SELECTORS.flatMap((s) => [s, `${s} *`]).join(",\n")} { visibility: hidden !important; }
*, *::before, *::after { caret-color: transparent !important; }
`;

/**
 * Applied only once the page has settled. Elements left on their own compositor layer
 * (will-change) at a fractional offset get their text rasterised slightly differently on
 * every load; dropping the hint paints them with the rest of the page, the same way each time.
 */
const FLATTEN_CSS = "*, *::before, *::after { will-change: auto !important; }";

type Breakpoint = { name: string; frameWidth: number };

async function readBreakpoints(): Promise<Breakpoint[]> {
  const file = new URL("../content/tokens.json", import.meta.url);
  const tokens = JSON.parse(await readFile(file, "utf8")) as { breakpoints: Breakpoint[] };
  return tokens.breakpoints.map(({ name, frameWidth }) => ({ name, frameWidth }));
}

/** Scroll down one step at a time so appear effects fire and lazy images load, then return to the top. */
async function scrollThrough(page: Page): Promise<void> {
  const step = Math.round(VIEWPORT_HEIGHT * 0.6);
  for (let y = 0; ; y += step) {
    const max = await page.evaluate((top) => {
      window.scrollTo({ top, behavior: "instant" });
      return document.documentElement.scrollHeight - window.innerHeight;
    }, y);
    await page.waitForTimeout(SCROLL_PAUSE_MS);
    if (y >= max) break;
  }
  await page.waitForTimeout(SCROLL_PAUSE_MS * 2);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

/**
 * Some reveals replay: they hide again once their section leaves the viewport (the pricing
 * timeline cards, for example), so at scroll position 0 they would be captured empty.
 * Growing the viewport to the full page height puts every section in view at once.
 * That only works when the layout does not depend on viewport height; if the page height
 * changes after the resize (vh-based sections, as on the home page), the normal viewport
 * is restored and the page is captured as it looks at scroll position 0.
 */
async function expandViewport(page: Page, width: number): Promise<"tall" | "standard"> {
  const pageHeight = () => page.evaluate(() => document.documentElement.scrollHeight);
  const before = await pageHeight();
  await page.setViewportSize({ width, height: before });
  await page.waitForTimeout(SCROLL_PAUSE_MS * 2);
  if ((await pageHeight()) === before) return "tall";
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  return "standard";
}

async function capture(page: Page, url: string, file: string, width: number): Promise<string> {
  const response = await page.goto(url, { waitUntil: "load" });
  if (!response || !response.ok()) throw new Error(`${url} returned ${response?.status() ?? "no response"}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addStyleTag({ content: HIDE_CSS });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  await scrollThrough(page);

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? undefined : new Promise((done) => { img.onload = img.onerror = done; }),
      ),
    );
  });
  const mode = await expandViewport(page, width);
  await page.waitForTimeout(SETTLE_MS);
  await page.addStyleTag({ content: FLATTEN_CSS });

  // Reveal animations may still be running: shoot until two consecutive frames are identical.
  const shoot = () => page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
  let frame = await shoot();
  let stable = false;
  for (let attempt = 0; attempt < STABLE_ATTEMPTS && !stable; attempt++) {
    await page.waitForTimeout(STABLE_INTERVAL_MS);
    const next = await shoot();
    stable = next.equals(frame);
    frame = next;
  }
  await writeFile(file, frame);
  return stable ? mode : `${mode}, NOT STABLE after ${STABLE_ATTEMPTS} attempts`;
}

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    out: { type: "string" },
    pages: { type: "string" },
    breakpoints: { type: "string" },
  },
});
if (!values.base || !values.out) {
  console.error("Usage: node scripts/capture-baseline.ts --base <url> --out <dir> [--pages a,b] [--breakpoints a,b]");
  process.exit(2);
}
const base = values.base.replace(/\/+$/, "");
const out = values.out;
const only = (list: string | undefined) => (list ? new Set(list.split(",")) : null);
const onlyPages = only(values.pages);
const onlyBreakpoints = only(values.breakpoints);

const pages = PAGES.filter((p) => !onlyPages || onlyPages.has(p.name));
const breakpoints = (await readBreakpoints()).filter((b) => !onlyBreakpoints || onlyBreakpoints.has(b.name));
if (pages.length === 0 || breakpoints.length === 0) {
  console.error("Nothing to capture: --pages / --breakpoints matched nothing.");
  process.exit(2);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const bp of breakpoints) {
    const context = await browser.newContext({
      viewport: { width: bp.frameWidth, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "no-preference",
      locale: "en-US",
      timezoneId: "UTC",
    });
    for (const p of pages) {
      const page = await context.newPage();
      const file = join(out, `${p.name}-${bp.name}.png`);
      const mode = await capture(page, base + p.path, file, bp.frameWidth);
      await page.close();
      console.log(`${file}  (${bp.frameWidth}px, ${mode} viewport)`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
