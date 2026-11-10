import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // The Workers AI binding has no local simulator; never require a Cloudflare login in tests.
      remoteBindings: false,
    }),
  ],
  test: {
    include: ["tests/worker/**/*.test.ts"],
  },
});
