import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const ORIGIN = "https://zavocreates.com";
const read = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../content/${file}`, import.meta.url)), "utf8")) as Record<string, unknown>;

const site = read("site.json");
const pricingEn = read("pricing.en.json");
const pricingRo = read("pricing.ro.json");
const privacyEn = read("privacy.en.json");
const privacyRo = read("privacy.ro.json");
const ogImage = site["ogImage"] as { src: string };

const pages = [
  { path: "/", lang: "en", title: site["title"], description: site["description"] },
  { path: "/pricing", lang: "en", title: pricingEn["title"], description: pricingEn["description"] },
  { path: "/pricing-ro", lang: "ro", title: pricingRo["title"], description: pricingRo["description"] },
  { path: "/privacy", lang: "en", title: privacyEn["title"], description: privacyEn["description"] },
  { path: "/privacy-ro", lang: "ro", title: privacyRo["title"], description: privacyRo["description"] },
] as const;

test("every page has its own title and description", () => {
  expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
  expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length);
});

const alternatesOf = (base: string) => [
  { hreflang: "en", href: `${ORIGIN}${base}` },
  { hreflang: "ro", href: `${ORIGIN}${base}-ro` },
  { hreflang: "x-default", href: `${ORIGIN}${base}` },
];

for (const p of pages) {
  test(`${p.path} has title, description, social and canonical tags`, async ({ page }) => {
    const res = await page.goto(p.path);
    expect(res?.status()).toBe(200);

    await expect(page.locator("html")).toHaveAttribute("lang", p.lang);
    await expect(page).toHaveTitle(p.title as string);
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute("content", p.description as string);
    await expect(page.locator('head meta[property="og:image"]')).toHaveAttribute("content", `${ORIGIN}${ogImage.src}`);
    await expect(page.locator('head meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}${p.path}`);
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
  });
}

for (const path of ["/pricing", "/pricing-ro", "/privacy", "/privacy-ro"]) {
  test(`${path} links the en, ro and x-default alternates`, async ({ page }) => {
    await page.goto(path);
    const links = await page
      .locator('head link[rel="alternate"][hreflang]')
      .evaluateAll((els) => els.map((el) => ({ hreflang: el.getAttribute("hreflang"), href: el.getAttribute("href") })));
    expect(links).toEqual(alternatesOf(path.replace(/-ro$/, "")));
  });
}

test("home has no hreflang alternates", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('head link[rel="alternate"][hreflang]')).toHaveCount(0);
});

test("the og:image file is served", async ({ request }) => {
  const res = await request.get(ogImage.src);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("home describes Andrei Zavo as schema.org Person data", async ({ page }) => {
  await page.goto("/");
  const json = await page.locator('script[type="application/ld+json"]').textContent();
  const data = JSON.parse(json ?? "{}") as Record<string, unknown>;
  expect(data["@type"]).toBe("Person");
  expect(data["url"]).toBe(`${ORIGIN}/`);
  expect(data["sameAs"]).toEqual((site["footer"] as { social: { href: string }[] }).social.map((s) => s.href));
});

test("every page links an apple-touch-icon that is served", async ({ page, request }) => {
  for (const path of ["/", "/pricing", "/privacy"]) {
    await page.goto(path);
    const href = await page.locator('head link[rel="apple-touch-icon"]').getAttribute("href");
    expect(href, path).toBeTruthy();
    const res = await request.get(href ?? "");
    expect(res.status(), path).toBe(200);
  }
});

test("the footer links the privacy page in the page language", async ({ page }) => {
  for (const [path, href] of [["/", "/privacy"], ["/pricing", "/privacy"], ["/pricing-ro", "/privacy-ro"], ["/privacy-ro", "/privacy-ro"]] as const) {
    await page.goto(path);
    await expect(page.locator(`footer a[href="${href}"]`), path).toHaveCount(1);
  }
});

test("sitemap.xml lists exactly the five pages", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.sort()).toEqual([`${ORIGIN}/`, `${ORIGIN}/pricing`, `${ORIGIN}/pricing-ro`, `${ORIGIN}/privacy`, `${ORIGIN}/privacy-ro`]);
});

test("robots.txt points at the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
});

// Cloudflare Web Analytics is rendered only when PUBLIC_CF_ANALYTICS_TOKEN is set at build time. The
// test environment states which build it expects: unset (local builds, CI) -> no beacon; set (e.g. when
// run with BASE_URL against production, with the same token exported) -> the beacon with that token.
const analyticsToken = process.env["PUBLIC_CF_ANALYTICS_TOKEN"];
for (const path of ["/", "/pricing", "/pricing-ro", "/privacy", "/nope"]) {
  if (analyticsToken) {
    test(`${path} loads the analytics beacon with PUBLIC_CF_ANALYTICS_TOKEN`, async ({ page }) => {
      await page.goto(path);
      const beacon = page.locator('script[src="https://static.cloudflareinsights.com/beacon.min.js"]');
      await expect(beacon).toHaveCount(1);
      expect(JSON.parse((await beacon.getAttribute("data-cf-beacon")) ?? "{}")).toEqual({ token: analyticsToken });
    });
  } else {
    test(`${path} has no analytics beacon when the token is unset`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("script[data-cf-beacon]")).toHaveCount(0);
      await expect(page.locator('script[src*="cloudflareinsights.com"]')).toHaveCount(0);
    });
  }
}
