/**
 * Scroll-stitched screenshots of every page at every breakpoint width in content/tokens.json.
 *
 *   node scripts/capture-baseline.ts --base https://zavocreates.com --out tests/visual/baseline
 *
 * Used once against the live Framer site (the baseline); tests/visual/*.spec.ts render the rebuild
 * with the same routine (tests/visual/capture.ts). Optional: --pages home,pricing  --breakpoints desktop
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { capture, captureContextOptions, PAGES, readBreakpoints } from "../tests/visual/capture.ts";

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
    const context = await browser.newContext(captureContextOptions(bp.frameWidth));
    for (const p of pages) {
      const page = await context.newPage();
      const file = join(out, `${p.name}-${bp.name}.png`);
      const { png, notes } = await capture(browser, page, base + p.path, bp.frameWidth);
      await writeFile(file, png);
      await page.close();
      console.log(`${file}  (${notes.join("; ")})`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
