/**
 * Review Focus 5: routing through the Worker (`npm run preview` = wrangler dev serving ./dist with the
 * assets block of wrangler.jsonc: html_handling "auto-trailing-slash", not_found_handling "404-page"),
 * so these are the real status codes a visitor gets.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PricingContent, Site } from "../../src/content/schema";

const read = (file: string): unknown => JSON.parse(readFileSync(new URL(`../../content/${file}`, import.meta.url), "utf8"));
const site = Site.parse(read("site.json"));
const pricingEn = PricingContent.parse(read("pricing.en.json"));
const homeLabel = site.nav.links[0]?.label ?? "";

test("every sitemap URL answers 200 without a redirect", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? "").pathname);
  expect(paths.sort()).toEqual(["/", "/pricing", "/pricing-ro"]);
  for (const path of paths) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toContain("text/html");
  }
});

test("/pricing/ redirects to /pricing", async ({ request }) => {
  const res = await request.get("/pricing/", { maxRedirects: 0 });
  expect([301, 307, 308]).toContain(res.status());
  expect(new URL(res.headers()["location"] ?? "", "http://x").pathname).toBe("/pricing");
});

test("/pricing/ serves the pricing page", async ({ page }) => {
  const res = await page.goto("/pricing/");
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/pricing");
  await expect(page).toHaveTitle(pricingEn.title);
  await expect(page.locator("h1")).toHaveText(pricingEn.intro.heading);
});

for (const path of ["/timeline-demo", "/PRICING", "/nope"]) {
  test(`${path} answers 404 with the not-found page`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText("404");
    await expect(page.locator("main a[href='/']")).toHaveText(homeLabel);
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex");
  });
}
