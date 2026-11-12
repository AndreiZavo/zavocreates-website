import type { APIRoute } from "astro";
import { getSite } from "../content/load";
import { PAGE_PATHS } from "../content/routes";

export const GET: APIRoute = () => {
  const { url } = getSite();
  const urls = PAGE_PATHS.map((path) => `  <url><loc>${new URL(path, url).href}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
