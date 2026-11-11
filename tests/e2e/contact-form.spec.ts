/**
 * Contact form behaviour (src/scripts/contact-form.ts) with /api/contact mocked via page.route, and
 * the no-JS fallback (Ruling R2/R10) against the real Worker. The Turnstile script is replaced by a
 * small fake so the tests never depend on Cloudflare's network.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { HomeContent, Site } from "../../src/content/schema";

const read = (file: string): unknown => JSON.parse(readFileSync(new URL(`../../content/${file}`, import.meta.url), "utf8"));
const home = HomeContent.parse(read("home.json"));
const site = Site.parse(read("site.json"));
const copy = home.contact;

const TOKEN = "fake-turnstile-token";
const FAKE_TURNSTILE = `
  window.__turnstile = { renders: [], resets: 0 };
  window.turnstile = {
    render(container, options) {
      window.__turnstile.renders.push({ sitekey: options.sitekey, appearance: options.appearance });
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "cf-turnstile-response";
      input.value = ${JSON.stringify(TOKEN)};
      container.appendChild(input);
      return "widget-1";
    },
    getResponse() { return ${JSON.stringify(TOKEN)}; },
    reset() { window.__turnstile.resets += 1; },
  };
`;

const VISITOR = { name: "Ana Pop", email: "ana@example.com", service: copy.serviceOptions[1], message: "Hello, a reel please." };

async function stubTurnstile(page: Page): Promise<void> {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_TURNSTILE }),
  );
}

const turnstile = (page: Page) =>
  page.evaluate(() => (window as unknown as { __turnstile: { renders: { sitekey: string; appearance: string }[]; resets: number } }).__turnstile);

async function fill(page: Page): Promise<void> {
  const form = page.locator("#contact-form");
  await form.locator('[name="name"]').fill(VISITOR.name);
  await form.locator('[name="email"]').fill(VISITOR.email);
  await form.locator('[name="service"]').selectOption(VISITOR.service);
  await form.locator('[name="message"]').fill(VISITOR.message);
}

async function open(page: Page): Promise<void> {
  await stubTurnstile(page);
  await page.goto("/", { waitUntil: "load" });
  await expect.poll(async () => (await turnstile(page)).renders.length).toBe(1);
  await page.locator("#contact-form").scrollIntoViewIfNeeded();
}

const status = (page: Page) => page.locator("#contact-form [data-form-status]");
const submit = (page: Page) => page.locator('#contact-form button[type="submit"]');
const spinner = (page: Page) => page.locator("#contact-form [data-form-spinner]");

async function expectFieldsKept(page: Page): Promise<void> {
  const form = page.locator("#contact-form");
  await expect(form.locator('[name="name"]')).toHaveValue(VISITOR.name);
  await expect(form.locator('[name="email"]')).toHaveValue(VISITOR.email);
  await expect(form.locator('[name="service"]')).toHaveValue(VISITOR.service);
  await expect(form.locator('[name="message"]')).toHaveValue(VISITOR.message);
}

test.describe("contact form with JavaScript", () => {
  test("renders Turnstile into div.cf-turnstile with the page's sitekey, without adding height", async ({ page }) => {
    await open(page);
    const sitekey = await page.locator(".cf-turnstile").getAttribute("data-sitekey");
    expect(sitekey).toBeTruthy();
    expect((await turnstile(page)).renders).toEqual([{ sitekey, appearance: "interaction-only" }]);
  });

  test("success: one JSON request, success text, fields and Turnstile reset", async ({ page }) => {
    await open(page);
    const bodies: unknown[] = [];
    await page.route("**/api/contact", (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, json: { ok: true } });
    });
    await fill(page);
    await submit(page).click();

    await expect(status(page)).toHaveText(copy.success);
    await expect(submit(page)).toHaveAttribute("data-state", "success");
    await expect(submit(page)).toHaveAccessibleName(copy.success);
    await expect(submit(page)).toBeEnabled();
    expect(bodies).toEqual([{ ...VISITOR, turnstileToken: TOKEN }]);
    const form = page.locator("#contact-form");
    for (const name of ["name", "email", "service", "message"]) await expect(form.locator(`[name="${name}"]`)).toHaveValue("");
    expect((await turnstile(page)).resets).toBe(1);
    await expect(spinner(page)).toBeHidden();

    // Editing again restores the resting button.
    await form.locator('[name="name"]').fill("B");
    await expect(submit(page)).not.toHaveAttribute("data-state");
    await expect(submit(page)).toHaveAccessibleName(copy.fields.submit);
  });

  test("400: generic error copy, the named field marked and focused, fields kept", async ({ page }) => {
    await open(page);
    await page.route("**/api/contact", (route) => route.fulfill({ status: 400, json: { ok: false, error: "Email is not valid" } }));
    await fill(page);
    await submit(page).click();

    await expect(status(page)).toHaveText(copy.error);
    await expect(submit(page)).toHaveAttribute("data-state", "error");
    await expect(submit(page)).toBeEnabled();
    const email = page.locator('#contact-form [name="email"]');
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toBeFocused();
    await expectFieldsKept(page);
    // The token was not spent on an invalid request.
    expect((await turnstile(page)).resets).toBe(0);
  });

  test("double click: exactly one request; disabled, busy and spinning while pending", async ({ page }) => {
    await open(page);
    let requests = 0;
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/contact", async (route: Route) => {
      requests += 1;
      await held;
      await route.fulfill({ status: 200, json: { ok: true } });
    });
    await fill(page);
    await expect(spinner(page)).toBeHidden();
    await submit(page).dblclick();
    await page.keyboard.press("Enter"); // a third attempt from the keyboard while pending

    await expect(submit(page)).toBeDisabled();
    await expect(submit(page)).toHaveAttribute("aria-busy", "true");
    await expect(submit(page)).toHaveAttribute("data-state", "loading");
    // The button keeps its content label as its name (Framer's Loading variant shows only the spinner).
    await expect(submit(page)).toHaveAccessibleName(copy.fields.submit);
    await expect(spinner(page)).toBeVisible();
    const angle = () => spinner(page).evaluate((el) => `${getComputedStyle(el).transform} ${getComputedStyle(el).rotate}`);
    const first = await angle();
    await expect.poll(angle, { timeout: 2000 }).not.toBe(first);

    release?.();
    await expect(status(page)).toHaveText(copy.success);
    await expect(spinner(page)).toBeHidden();
    expect(requests).toBe(1);
  });

  for (const code of [403, 413, 415, 500, 502]) {
    test(`${code}: generic error, fields kept, button enabled, Turnstile reset`, async ({ page }) => {
      await open(page);
      await page.route("**/api/contact", (route) => route.fulfill({ status: code, json: { ok: false, error: "x" } }));
      await fill(page);
      await submit(page).click();
      await expect(status(page)).toHaveText(copy.error);
      await expect(submit(page)).toBeEnabled();
      await expectFieldsKept(page);
      expect((await turnstile(page)).resets).toBe(1);
    });
  }

  test("request aborted (offline): error shown, message kept, button enabled again", async ({ page }) => {
    await open(page);
    await page.route("**/api/contact", (route) => route.abort("internetdisconnected"));
    await fill(page);
    await submit(page).click();

    await expect(status(page)).toHaveText(copy.error);
    await expect(submit(page)).toHaveAttribute("data-state", "error");
    await expect(submit(page)).toBeEnabled();
    await expect(spinner(page)).toBeHidden();
    await expectFieldsKept(page);
    expect((await turnstile(page)).resets).toBe(1);

    // Retry works.
    await page.unroute("**/api/contact");
    await page.route("**/api/contact", (route) => route.fulfill({ status: 200, json: { ok: true } }));
    await submit(page).click();
    await expect(status(page)).toHaveText(copy.success);
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the spinner shows but does not rotate", async ({ page }) => {
      await open(page);
      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/api/contact", async (route) => {
        await held;
        await route.fulfill({ status: 200, json: { ok: true } });
      });
      await fill(page);
      await submit(page).click();
      await expect(spinner(page)).toBeVisible();
      await page.waitForTimeout(500);
      expect(await spinner(page).evaluate((el) => `${getComputedStyle(el).transform} ${getComputedStyle(el).rotate}`)).toBe("none none");
      release?.();
      await expect(status(page)).toHaveText(copy.success);
    });
  });

  test("the Turnstile script and the form script load only on the page with the form", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/pricing");
    await expect(page.locator('script[src*="challenges.cloudflare.com"]')).toHaveCount(0);
    await page.goto("/");
    await expect(page.locator('script[src*="challenges.cloudflare.com"]')).toHaveCount(1);
    await expect(page.locator('script[src*="challenges.cloudflare.com"]')).toHaveAttribute("async", "");
    await expect(page.locator('script[src*="challenges.cloudflare.com"]')).toHaveAttribute("defer", "");
  });
});

test.describe("contact form without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  const links = async (page: Page, scope: string) => {
    await expect(page.locator(`${scope} a[href="${site.footer.emailHref}"]`)).toHaveText(site.email);
    await expect(page.locator(`${scope} a[href="${site.footer.phoneHref}"]`)).toHaveText(site.phone);
  };

  test("/#contact-error shows the error message with email and phone links", async ({ page }) => {
    await page.goto("/#contact-error");
    await expect(page.locator("#contact-error")).toBeVisible();
    await expect(page.locator("#contact-error")).toContainText(copy.error);
    await links(page, "#contact-error");
    await expect(page.locator("#contact-sent")).toBeHidden();
  });

  test("/#contact-sent shows the success message", async ({ page }) => {
    await page.goto("/#contact-sent");
    await expect(page.locator("#contact-sent")).toBeVisible();
    await expect(page.locator("#contact-sent")).toHaveText(copy.success);
    await expect(page.locator("#contact-error")).toBeHidden();
  });

  test("/ hides both messages and shows the noscript note with email and phone", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#contact-sent")).toBeHidden();
    await expect(page.locator("#contact-error")).toBeHidden();
    await expect(page.locator("[data-form-noscript]")).toBeVisible();
    await links(page, "[data-form-noscript]");
  });

  // FIXME (reported in Task 9): a browser form post is a navigation request (Sec-Fetch-Mode: navigate),
  // and with compatibility_date 2025-10-01 Workers Assets answers navigation requests itself, so the
  // POST never reaches the Worker and the visitor gets a 405. Verified locally: the compatibility flag
  // "assets_navigation_has_no_effect" in wrangler.jsonc makes it reach the Worker (303). Worker config
  // is out of this task's scope; enable this test with that fix.
  test.fixme("a native post reaches the Worker and lands on #contact-error (no Turnstile without JS)", async ({ page }) => {
    await page.goto("/");
    await fill(page);
    await Promise.all([page.waitForURL(/\/#contact-error$/), page.locator('#contact-form button[type="submit"]').click()]);
    await expect(page.locator("#contact-error")).toBeVisible();
  });
});

test.describe("contact form markup", () => {
  test("the no-JS messages are hidden with JavaScript on", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/");
    await expect(page.locator("#contact-sent")).toBeHidden();
    await expect(page.locator("#contact-error")).toBeHidden();
    await expect(page.locator("[data-form-noscript]")).toHaveCount(0);
  });
});
