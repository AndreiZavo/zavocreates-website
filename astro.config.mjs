import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://zavocreates.com",
  // Pages are files (pricing.html), so the Worker's auto-trailing-slash serves /pricing directly and
  // redirects /pricing/ to it: canonical, hreflang, sitemap and nav URLs never carry a trailing slash.
  trailingSlash: "never",
  build: { format: "file" },
});
