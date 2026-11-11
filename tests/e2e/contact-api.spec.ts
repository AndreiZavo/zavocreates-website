/**
 * /api/contact through the real Worker (wrangler dev): proves the main module loads in workerd
 * and the route is reached in front of the assets. Only paths that stop before any outbound
 * call (Turnstile, Workers AI, Resend) are exercised here; the full pipeline is in tests/worker.
 */
import { expect, test } from "@playwright/test";

test("GET /api/contact -> 405", async ({ request }) => {
  const res = await request.get("/api/contact", { maxRedirects: 0 });
  expect(res.status()).toBe(405);
  expect(res.headers()["allow"]).toBe("POST");
});

test("unsupported content type -> 415", async ({ request }) => {
  const res = await request.post("/api/contact", { headers: { "content-type": "text/plain" }, data: "hi" });
  expect(res.status()).toBe(415);
});

test("invalid JSON body -> 400", async ({ request }) => {
  const res = await request.post("/api/contact", { data: { name: "Ana" } });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ ok: false });
});

test("invalid no-JS form post -> 303 to /#contact-error", async ({ request }) => {
  const res = await request.post("/api/contact", { form: { name: "Ana", email: "nope" }, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toBe("/#contact-error");
});
