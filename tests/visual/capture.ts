/**
 * Scroll-stitched page capture, shared by scripts/capture-baseline.ts (which made the Framer
 * baselines in tests/visual/baseline/) and the visual tests (which render the rebuild the same way).
 *
 * How a page is captured: the viewport stays at <breakpoint width> x 900. The page is
 * scrolled through once (lazy images, fonts), then visited again in 900 px steps. At each
 * step the capture waits until the viewport stops changing and keeps that frame; the frames
 * are stacked into one PNG as tall as the page. Each band of the image therefore shows what
 * a visitor sees with that part of the page on screen: count-ups finished, replaying reveals
 * revealed, scroll-linked effects at that scroll position. Fixed and sticky elements (the
 * nav pill, sticky columns) appear once per 900 px band for the same reason. That is expected.
 *
 * Reads tokens.json directly (not getTokens()) so it runs under plain `node` with no bundler.
 */
import { readFile } from "node:fs/promises";
import type { Browser, BrowserContextOptions, Page } from "@playwright/test";

export const PAGES = [
  { name: "home", path: "/" },
  { name: "pricing", path: "/pricing" },
  { name: "pricing-ro", path: "/pricing-ro" },
] as const;

export const VIEWPORT_HEIGHT = 900;
const SCROLL_PAUSE_MS = 250;
/** Wait at the top after the pre-scroll, before the first frame. */
const SETTLE_MS = 1500;
/** Minimum wait at each scroll position before frames are compared (count-ups, reveals). */
const FRAME_MIN_WAIT_MS = 1500;
const STABLE_INTERVAL_MS = 500;
/** A frame is kept once this many consecutive screenshots are identical. */
const STABLE_MATCHES = 3;
const STABLE_ATTEMPTS = 30;
/**
 * Upper bound for the "networkidle" waits. The Turnstile widget on the contact form starts a blob:
 * worker request that Playwright never sees finish, so the page never reports networkidle.
 */
const NETWORK_IDLE_TIMEOUT_MS = 10_000;

/**
 * Parts that never stop moving, so two captures of the same page would differ.
 * They keep their layout box (visibility, not display). Each selector may match
 * nothing: the list covers both the Framer site and the rebuild.
 */
export const HIDE_SELECTORS = [
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

/** Rebuild-only content the owner added after the Framer baselines (e.g. the VAT line): taken out of layout. */
const REMOVE_SELECTOR = "[data-baseline-remove]";

// Descendants are listed too: a child with its own `visibility: visible` would otherwise show.
const HIDE_CSS = `
${HIDE_SELECTORS.flatMap((s) => [s, `${s} *`]).join(",\n")} { visibility: hidden !important; }
*, *::before, *::after { caret-color: transparent !important; }
${REMOVE_SELECTOR} { display: none !important; }
`;

/**
 * Added after the pre-scroll. Elements left on their own compositor layer (will-change) at a
 * fractional offset get their text rasterised slightly differently on every load; dropping
 * the hint paints them with the rest of the page, the same way each time. It is only a
 * rendering hint: animations and reveals still run.
 */
const FLATTEN_CSS = "*, *::before, *::after { will-change: auto !important; }";

export type Breakpoint = { name: string; frameWidth: number };

export async function readBreakpoints(): Promise<Breakpoint[]> {
  const file = new URL("../../content/tokens.json", import.meta.url);
  const tokens = JSON.parse(await readFile(file, "utf8")) as { breakpoints: Breakpoint[] };
  return tokens.breakpoints.map(({ name, frameWidth }) => ({ name, frameWidth }));
}

const scrollTo = (page: Page, top: number) =>
  page.evaluate((y) => {
    window.scrollTo({ top: y, behavior: "instant" });
    return window.scrollY;
  }, top);

const pageHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);

/** Scroll down one step at a time so lazy images load, then return to the top. */
async function preScroll(page: Page): Promise<void> {
  const step = Math.round(VIEWPORT_HEIGHT * 0.6);
  for (let y = 0; ; y += step) {
    await scrollTo(page, y);
    await page.waitForTimeout(SCROLL_PAUSE_MS);
    if (y >= (await pageHeight(page)) - VIEWPORT_HEIGHT) break;
  }
  await page.waitForTimeout(SCROLL_PAUSE_MS * 2);
  await scrollTo(page, 0);
}

/** Screenshot the viewport until it stops changing. */
async function stableFrame(page: Page): Promise<{ frame: Buffer; stable: boolean }> {
  // A hidden element that keeps animating (Framer restarts its loops) still repaints its
  // surroundings and can flicker a pixel or two of the nav outline, so the animations on the
  // hidden parts are cancelled right before every shot.
  const shoot = async () => {
    await page.evaluate((selector) => {
      for (const el of document.querySelectorAll(selector)) {
        for (const animation of el.getAnimations({ subtree: true })) animation.cancel();
      }
    }, HIDE_SELECTORS.join(","));
    return page.screenshot({ animations: "disabled", caret: "hide", scale: "css" });
  };
  await page.waitForTimeout(FRAME_MIN_WAIT_MS);
  let frame = await shoot();
  let matches = 1;
  for (let attempt = 0; attempt < STABLE_ATTEMPTS && matches < STABLE_MATCHES; attempt++) {
    await page.waitForTimeout(STABLE_INTERVAL_MS);
    const next = await shoot();
    matches = next.equals(frame) ? matches + 1 : 1;
    frame = next;
  }
  return { frame, stable: matches >= STABLE_MATCHES };
}

type Slice = { png: string; y: number; crop: number };

/** Stack the frames on a canvas in a blank page (no image library needed). `crop` rows are cut from the top of a frame. */
async function stitch(browser: Browser, slices: Slice[], width: number, height: number): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    const dataUrl = await page.evaluate(
      async ({ slices, width, height }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        for (const s of slices) {
          const blob = await (await fetch(`data:image/png;base64,${s.png}`)).blob();
          const bitmap = await createImageBitmap(blob);
          const h = bitmap.height - s.crop;
          ctx.drawImage(bitmap, 0, s.crop, bitmap.width, h, 0, s.y, bitmap.width, h);
          bitmap.close();
        }
        return canvas.toDataURL("image/png");
      },
      { slices, width, height },
    );
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  } finally {
    await page.close();
  }
}

/**
 * Capture one page: returns the stitched PNG and notes (frame count, size, any instability).
 * The page must belong to a context made with captureContextOptions(width).
 */
export async function capture(browser: Browser, page: Page, url: string, width: number): Promise<{ png: Buffer; notes: string[] }> {
  const notes: string[] = [];
  const response = await page.goto(url, { waitUntil: "load" });
  if (!response || !response.ok()) throw new Error(`${url} returned ${response?.status() ?? "no response"}`);
  await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});
  await page.addStyleTag({ content: HIDE_CSS });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  await preScroll(page);

  await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Images with no layout box (display: none at this breakpoint) are never shown, and a lazy one
    // never loads, so only rendered images are waited for.
    await Promise.all(
      [...document.images].map((img) =>
        img.complete || img.getClientRects().length === 0
          ? undefined
          : new Promise((done) => { img.onload = img.onerror = done; }),
      ),
    );
  });
  await page.addStyleTag({ content: FLATTEN_CSS });
  await page.waitForTimeout(SETTLE_MS);

  const height = await pageHeight(page);
  const last = Math.max(0, height - VIEWPORT_HEIGHT);
  const slices: Slice[] = [];
  for (let y = 0; y < height; y += VIEWPORT_HEIGHT) {
    const top = Math.min(y, last); // the last frame is clamped; the rows it repeats are cropped
    const actual = await scrollTo(page, top);
    if (actual !== top) notes.push(`scroll position ${actual} instead of ${top}`);
    const { frame, stable } = await stableFrame(page);
    if (!stable) notes.push(`NOT STABLE at y=${top} after ${STABLE_ATTEMPTS} attempts`);
    slices.push({ png: frame.toString("base64"), y, crop: y - top });
  }
  const heightAfter = await pageHeight(page);
  if (heightAfter !== height) notes.push(`page height changed during capture: ${height} -> ${heightAfter}`);

  const png = await stitch(browser, slices, width, height);
  notes.unshift(`${slices.length} frames, ${width}x${height}`);
  return { png, notes };
}

/** Browser context settings every capture uses (baseline and rebuild alike). */
export function captureContextOptions(width: number): BrowserContextOptions {
  return {
    viewport: { width, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
  };
}
