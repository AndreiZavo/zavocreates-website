/**
 * Build-time access to the raster originals in public/images, so components can let Astro's image
 * service resize them (WebP, several widths). SVGs and the GIF are served as they are.
 */
import type { ImageMetadata } from "astro";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rasters = import.meta.glob<{ default: ImageMetadata }>("/public/images/*.{jpg,png}", { eager: true });

/** Image metadata for a content image path ("/images/x.jpg"), or undefined for SVG/GIF. */
export function rasterOf(src: string): ImageMetadata | undefined {
  return rasters[`/public${src}`]?.default;
}

/** Inline markup of an SVG in public/ (icons), read at build time. */
export function svgMarkup(publicPath: string): string {
  return readFileSync(join(process.cwd(), "public", publicPath), "utf8");
}
