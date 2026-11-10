import type { APIRoute } from "astro";
import { getSite } from "../content/load";

export const GET: APIRoute = () => {
  const sitemap = new URL("/sitemap.xml", getSite().url).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
