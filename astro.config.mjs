import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://zavocreates.com",
  trailingSlash: "ignore",
  build: { format: "directory" },
});
