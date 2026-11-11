import { defineConfig, devices } from "@playwright/test";

const LOCAL_URL = "http://localhost:8787";
/**
 * BASE_URL points the e2e and visual suites at an already running site (a deployed workers.dev URL,
 * or a preview started by hand) and skips the local build + preview. Unset: build and start
 * `npm run preview` on :8787 as before.
 */
const remoteURL = process.env["BASE_URL"];
const baseURL = remoteURL || LOCAL_URL;

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL },
  // The only snapshots are the Framer baselines in tests/visual/baseline: a run must never rewrite them.
  updateSnapshots: "none",
  projects: [
    { name: "e2e", testDir: "tests/e2e", use: { ...devices["Desktop Chrome"] } },
    {
      name: "visual",
      testDir: "tests/visual",
      use: { ...devices["Desktop Chrome"] },
      // Scroll-stitched captures take about a minute per page and breakpoint.
      timeout: 300_000,
      // More parallel captures starve the CPU and the stable-frame waits retry for minutes.
      workers: 3,
      // The expected images are the Framer baselines (the top-level updateSnapshots "none" keeps them).
      snapshotPathTemplate: "{testDir}/baseline/{arg}{ext}",
    },
  ],
  ...(remoteURL
    ? {}
    : {
        webServer: {
          command: "npm run build && npm run preview",
          url: LOCAL_URL,
          reuseExistingServer: !process.env["CI"],
          timeout: 120_000,
        },
      }),
});
