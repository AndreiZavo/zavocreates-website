import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:8787";

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
  webServer: {
    command: "npm run build && npm run preview",
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
