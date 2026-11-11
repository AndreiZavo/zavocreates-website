/**
 * Visual parity with the live Framer site: `/` is captured with the same scroll-stitched routine
 * that made tests/visual/baseline/home-<breakpoint>.png (tests/visual/capture.ts) and compared with
 * Playwright's image comparator. On failure the expected, actual and diff images are written to
 * the test output directory.
 */
import { expect, test } from "@playwright/test";
import { capture, captureContextOptions, readBreakpoints } from "./capture";

const MAX_DIFF_PIXEL_RATIO = 0.02;

for (const bp of await readBreakpoints()) {
  test(`home matches the Framer baseline at ${bp.name} (${bp.frameWidth}px)`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext(captureContextOptions(bp.frameWidth));
    try {
      const page = await context.newPage();
      const { png, notes } = await capture(browser, page, `${baseURL}/`, bp.frameWidth);
      testInfo.annotations.push({ type: "capture", description: notes.join("; ") });
      expect(png).toMatchSnapshot(`home-${bp.name}.png`, { maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO });
    } finally {
      await context.close();
    }
  });
}
