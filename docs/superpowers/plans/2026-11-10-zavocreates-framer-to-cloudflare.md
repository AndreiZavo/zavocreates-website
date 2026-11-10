# zavocreates.com Framer → Cloudflare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild zavocreates.com in code, visually and in motion identical to the Framer site, served free from one Cloudflare Worker, with an AI-triaged contact form and a repo that reads as an AI-engineering case study.

**Architecture:** Astro builds static pages into `./dist` from JSON content extracted from the Framer project through the Framer MCP connector. Small vanilla modules (Motion + Lenis) reproduce Framer's animations from the extracted values. One Worker serves `./dist` as static assets and handles `POST /api/contact` (Turnstile → Workers AI triage → Resend email).

**Tech Stack:** Node 22 LTS, Astro (latest stable, static output), TypeScript strict, zod, motion (motion.dev), lenis, @fontsource Antonio + Inter, Wrangler, Vitest + @cloudflare/vitest-pool-workers, Playwright, linkinator, @lhci/cli, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-10-zavocreates-framer-to-cloudflare-design.md`

## Global Constraints

- Content rule: the site shows exactly what a visitor sees on the live Framer site today. Text comes from Framer node/control values, never from scraped HTML; hidden layers and template defaults are excluded.
- Pages: `/`, `/pricing`, `/pricing-ro`, `404`. `/timeline-demo` is not built.
- `/pricing-ro` has `<html lang="ro">`, Romanian title/description; `/pricing` and `/pricing-ro` link each other with `hreflang` (`en`, `ro`, `x-default` → `/pricing`).
- Fonts: Antonio and Inter only, self-hosted. No Palmore, Inkbleed, STRUKO, no "Logo Crystal" shader.
- Every animation value comes from `content/motion.json`; no hand-tuned numbers in components.
- All motion is disabled under `prefers-reduced-motion: reduce`, and content is fully visible without JavaScript.
- Free plans only: Workers Free, Workers AI free allowance, Turnstile, Cloudflare DNS Free, Resend free tier.
- No secrets in the repo. Worker secrets: `TURNSTILE_SECRET`, `RESEND_API_KEY`. Vars: `CONTACT_TO = "zavocreates@gmail.com"`, `CONTACT_FROM = "Zavo Website <onboarding@resend.dev>"` (switch to a domain sender later; config only).
- Form submissions are never stored.
- `wrangler.jsonc` assets block exactly: `"directory": "./dist"`, `"html_handling": "auto-trailing-slash"`, `"not_found_handling": "404-page"`.
- Execution style (Andrei's request): for each task, list every file the task needs and read them all in one pass, then make all edits, then run that task's tests once. If that run fails, fix and re-run.
- Commit after every task on a branch; merge to `main` only with CI green.

## Review Focus

1. **JavaScript off or a crawler visiting** → counters show their real final values, accordion text is in the HTML, nothing is stuck at `opacity: 0`. Test added to Task 6.
2. **`prefers-reduced-motion: reduce`** → no transforms or scroll-linked motion run, all content visible on load. Test added to Task 5.
3. **Romanian diacritics, emoji and a 5,000-character message** in the form → arrive intact in the email; triage still runs or falls back. Test added to Task 8.
4. **Double click on Submit, or the network failing** → one request only, the button shows sending, an error message appears and the typed text is kept. Test added to Task 9.
5. **Old or odd URLs** (`/timeline-demo`, `/pricing/`, `/PRICING`, `/nope`) → `/pricing/` serves pricing, the others get the styled 404 page with a link home. Test added to Task 7.

---

## File Structure

```
content/                    extracted from Framer (Task 2), validated by src/content/schema.ts
  home.json  pricing.en.json  pricing.ro.json  tokens.json  motion.json  site.json
public/images/              downloaded Framer images (originals)
public/lottie/              exported Lottie JSON
src/content/schema.ts       zod schemas + exported types
src/content/load.ts         typed loaders (parse at build, throw on invalid)
src/styles/tokens.css       generated from tokens.json (Task 4)
src/styles/global.css
src/layouts/Base.astro      <head> (SEO, fonts, analytics), page transition, scripts
src/components/*.astro      one per Framer component
src/motion/*.ts             one module per effect type
src/pages/index.astro  pricing.astro  pricing-ro.astro  404.astro  sitemap.xml.ts  robots.txt.ts
worker/index.ts             fetch handler: /api/contact, else assets
worker/validate.ts  turnstile.ts  triage.ts  email.ts
tests/unit/                 Vitest (schema, motion mapping)
tests/worker/               Vitest workers pool
tests/e2e/                  Playwright (pages, form, no-JS, reduced motion, 404)
tests/visual/               Playwright visual tests + baseline/ from Framer
evals/triage/               cases.json, run.ts, results.md
scripts/gen-tokens.ts  capture-baseline.ts
docs/extraction/  docs/decisions.md  docs/results/
.github/workflows/ci.yml  lighthouserc.json  wrangler.jsonc  CLAUDE.md  README.md
```

---

### Task 1: Project scaffold and Worker shell

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.jsonc`, `worker/index.ts`, `vitest.config.ts`, `vitest.workers.config.ts`, `playwright.config.ts`, `.gitignore`, `.nvmrc`, `CLAUDE.md`, `src/pages/index.astro` (placeholder), `tests/e2e/smoke.spec.ts`
- Test: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build` (`astro build`), `preview` (`wrangler dev`, serves `./dist` + worker on `http://localhost:8787`), `test:unit`, `test:worker`, `test:e2e`, `test:visual`, `check:links`, `lhci`. Playwright `baseURL` = `http://localhost:8787`, `webServer` runs `npm run build && npm run preview`.
- Produces: `worker/index.ts` default export `{ fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> }` where `Env = { ASSETS: Fetcher; AI: Ai; TURNSTILE_SECRET: string; RESEND_API_KEY: string; CONTACT_TO: string; CONTACT_FROM: string }`. For now it returns `env.ASSETS.fetch(req)` for everything.

- [ ] **Step 1:** `git init`, `.gitignore` (`node_modules`, `dist`, `.wrangler`, `.dev.vars`, `.env*`, `test-results`, `playwright-report`, `.lighthouseci`), `.nvmrc` = `22`.
- [ ] **Step 2:** Create the Astro project (static output, TypeScript strict) and install dev deps listed in Tech Stack.
- [ ] **Step 3:** `wrangler.jsonc`: `name: "zavocreates"`, `main: "worker/index.ts"`, `compatibility_date: "2025-10-01"`, assets block from Global Constraints plus `"binding": "ASSETS"`, `"ai": { "binding": "AI" }`, `vars` `CONTACT_TO` / `CONTACT_FROM` with the values from Global Constraints. `.dev.vars.example` lists the two secrets with dummy values.
- [ ] **Step 4:** `CLAUDE.md`: the Global Constraints above, the content rule, how to run tests.
- [ ] **Step 5: Write test** `smoke.spec.ts`: `GET /` returns 200 and `<html>` has `lang="en"`.
- [ ] **Step 6:** Run `npm run test:e2e -- smoke` → PASS.
- [ ] **Step 7:** Commit `chore: scaffold Astro + Worker project`.

---

### Task 2: Extract content, tokens and motion from Framer

Run by the agent through the Framer MCP connector (project id `zmfPMMI2Y6hkElhFQePk`), read-only. Resolves spec open items 1 and 4.

**Files:**
- Create: `src/content/schema.ts`, `src/content/load.ts`, `content/*.json`, `public/images/*`, `public/lottie/*`, `docs/extraction/README.md`, `docs/extraction/programs/*.js`, `tests/unit/content.test.ts`

**Interfaces:**
- Produces (from `schema.ts`, all zod with inferred types):
  - `Site = { url: "https://zavocreates.com", title, description, ogImage, favicon, phone: "+40 799 853 625", email: "zavocreates@gmail.com", instagram? }`
  - `HomeContent = { hero, services: Service[4], about: { word, phonetic, definition, line, counters: Counter[3] }, collaborators: Image[], projects: Project[6], contact: ContactCopy }` with `Service = { title, bullets: [string, string, string] }`, `Counter = { value: number, suffix: string, label }`, `Project = { href, image: Image, badge?: Image }`, `ContactCopy = { heading, text, fields: { name, email, service, message, submit }, serviceOptions: string[5], success: string, error: string }` (success/error copy taken from the Framer form's states)
  - `PricingContent = { lang: "en"|"ro", title, description, intro, points: Point[3], process: Step[5], faq: Faq[4], packages: Package[4], footnote, cta: { heading, text, label, href } }` with `Faq = { q, lines: [string, string, string] }`, `Package = { name, videos, price, blurb, cta, href, badge? }`
  - `Tokens = { breakpoints: { name, minWidth, frameWidth }[], colors: Record<string,string>, text: Record<string, TextStyle per breakpoint>, space, radii }`
  - `Motion = Record<string, Effect>`, `Effect = { kind: "appear"|"scroll"|"hover"|"variant"|"marquee"|"counter"|"page"|"smoothScroll", trigger?, threshold?, replay?, from?, to?, sections?, transition: Transition, ...kind-specific }`, `Transition = { type: "spring", stiffness?, damping?, mass?, duration?, bounce?, delay? } | { type: "tween", duration, ease: [n,n,n,n], delay? }`. Keys are stable effect ids (e.g. `home.avatar.appear`, `pricing.timeline.lineFill`) that components reference.
  - `load.ts`: `getSite(): Site`, `getHome(): HomeContent`, `getPricing(lang: "en"|"ro"): PricingContent`, `getTokens(): Tokens`, `getMotion(id: string): Effect` (throws `Unknown motion id: <id>`).

- [ ] **Step 1: Write tests** in `content.test.ts`: every `content/*.json` parses; `getHome().services[3].bullets` equals `["Craft a smooth, story-driven edit", "Enhance with color, sound, and motion", "Deliver polished content, platform-ready"]`; no string anywhere in `content/` contains `"Interaction design and micro-animations"`, `"Brand strategy"` or `"UI/UX design"`; `getPricing("en").packages.map(p => p.price)` equals `["450 RON","1400 RON","2400 RON","3300 RON"]`; `getPricing("ro").faq[3].lines[2]` equals `"Construim ceva împreună"`; `getMotion("nope")` throws; a malformed fixture fails `HomeContent.parse`.
- [ ] **Step 2:** Write `schema.ts` and `load.ts`.
- [ ] **Step 3:** Extract with read-only exec programs (save each in `docs/extraction/programs/`): visible text from page nodes and component instance `$control__*` values, skipping nodes with a hidden ancestor; text-style presets, colours, breakpoints; every `appearEffect`, `styleTransformEffect`, `hoverEffect`, `pageEffects`, variant transitions, Smooth Scroll and Logo Carousel controls, Number Card values. Check whether Framer's Server API could run these headless and record the answer in `docs/extraction/README.md`.
- [ ] **Step 4:** Download every referenced image at its original size from `framerusercontent.com` into `public/images/` (stable names) and export the Lottie JSON; rewrite references in content JSON to local paths.
- [ ] **Step 5:** Run `npm run test:unit -- content` → PASS.
- [ ] **Step 6:** Commit `feat: extract Framer content, tokens and motion`.

---

### Task 3: Capture Framer baselines (before anything can change on Framer)

**Files:**
- Create: `scripts/capture-baseline.ts`, `tests/visual/baseline/<page>-<breakpoint>.png`, `docs/results/framer-lighthouse.json`, `docs/results/README.md`

**Interfaces:**
- Consumes: `getTokens().breakpoints` (widths).
- Produces: baseline PNGs named `home-desktop.png`, `pricing-tablet.png`, … for pages `home`, `pricing`, `pricing-ro` and every breakpoint; `scripts/capture-baseline.ts --base <url> --out <dir>` (reused in Task 6 to render the new site identically).

- [ ] **Step 1:** Write `capture-baseline.ts`: for each page × breakpoint width, open the URL, wait for fonts, scroll to the bottom in steps (to trigger reveals and fill the timeline), scroll back to top, wait 1.5 s, full-page screenshot. Hide the contact form's Turnstile/caret and the logo marquee (`visibility:hidden` on its track) so moving parts don't cause diffs.
- [ ] **Step 2:** Run against `https://zavocreates.com` → PNGs written for all pages × breakpoints.
- [ ] **Step 3:** Run `npx lhci collect --url=https://zavocreates.com/ --url=https://zavocreates.com/pricing` (mobile + desktop) and save medians to `docs/results/framer-lighthouse.json`; record total transfer size per page in `docs/results/README.md`.
- [ ] **Step 4:** Commit `test: capture Framer visual and Lighthouse baselines`.

---

### Task 4: Tokens, fonts and base layout with SEO

**Files:**
- Create: `scripts/gen-tokens.ts`, `src/styles/tokens.css`, `src/styles/global.css`, `src/layouts/Base.astro`, `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts`, `tests/e2e/seo.spec.ts`

**Interfaces:**
- Consumes: `getTokens`, `getSite`.
- Produces: `Base.astro` props `{ lang: "en"|"ro"; title: string; description: string; path: string; alternates?: { lang: string; path: string }[] }`. CSS custom properties `--color-<name>`, `--text-<style>-size|line|tracking|weight|family`, `--space-<n>`, `--radius-<n>`, with breakpoint overrides as media queries. `npm run build` runs `gen-tokens` first.

- [ ] **Step 1: Write tests** in `seo.spec.ts`: for `/`, `/pricing`, `/pricing-ro`: title and description match content JSON; `og:image`, `twitter:card="summary_large_image"`, canonical `https://zavocreates.com<path>`; `/pricing-ro` has `lang="ro"` and `hreflang` links `en`→`/pricing`, `ro`→`/pricing-ro`, `x-default`→`/pricing`; `/sitemap.xml` lists exactly the 3 URLs; `/robots.txt` contains `Sitemap: https://zavocreates.com/sitemap.xml`.
- [ ] **Step 2:** Implement `gen-tokens.ts`, CSS, `Base.astro` (self-hosted Antonio 400/700 and Inter 300/600 with `font-display: swap` and preload of the hero weights; cross-document page fade with `@view-transition { navigation: auto }` using `getMotion("page")` duration and easing), sitemap, robots.
- [ ] **Step 3:** Run `npm run test:e2e -- seo` → PASS.
- [ ] **Step 4:** Commit `feat: tokens, fonts and SEO layout`.

---

### Task 5: Motion runtime

**Files:**
- Create: `src/motion/transition.ts`, `appear.ts`, `scrollTransform.ts`, `hover.ts`, `variant.ts`, `counter.ts`, `smoothScroll.ts`, `index.ts`, `tests/unit/transition.test.ts`, `tests/e2e/reduced-motion.spec.ts`

**Interfaces:**
- Consumes: `Effect`, `Transition` types; `getMotion`.
- Produces:
  - `toMotionOptions(t: Transition): AnimationOptions` (motion.dev).
  - Markup contract: elements carry `data-motion="<effect id>"`; `index.ts` exports `initMotion(effects: Record<string, Effect>): void`, which the layout calls with the effects used on the page (serialised into a `<script type="application/json" id="motion-config">`).
  - `appear` uses IntersectionObserver with the effect's `threshold` and `replay`; `scrollTransform` uses motion's `scroll()` with the effect's `sections`/viewport; `hover` uses motion's `hover()`; `variant` toggles `data-state="open|closed"` and animates height; `counter` animates from 0 to the value already in the HTML; `smoothScroll` starts Lenis with the extracted intensity.
  - Initial hidden states are applied by JS only (class `motion-ready` on `<html>`), so no-JS shows everything.

- [ ] **Step 1: Write tests** in `transition.test.ts`: `toMotionOptions({type:"spring",stiffness:500,damping:60,mass:1})` → `{type:"spring",stiffness:500,damping:60,mass:1}`; `{type:"spring",duration:"1s",bounce:0}` → `{type:"spring",duration:1,bounce:0}` (seconds as number); `{type:"tween",duration:"0.2s",ease:[0.27,0,0.51,1]}` → `{duration:0.2,ease:[0.27,0,0.51,1]}`; `delay:"0s"` → `delay:0`. In `reduced-motion.spec.ts` (Review Focus 2): with `reducedMotion: "reduce"`, on `/` and `/pricing` no element with `data-motion` has computed `opacity` < 1 or a non-`none` transform after load, and `<html>` lacks `motion-ready`.
- [ ] **Step 2:** Implement the modules.
- [ ] **Step 3:** Run `npm run test:unit -- transition` and `npm run test:e2e -- reduced-motion` → PASS (the e2e test runs against the placeholder page with one `data-motion` element until Task 6 fills the pages).
- [ ] **Step 4:** Commit `feat: motion runtime driven by Framer values`.

---

### Task 6: Home page

**Files:**
- Create: `src/components/Hero.astro`, `ServiceAccordion.astro`, `About.astro`, `NumberCard.astro`, `InfoCard.astro`, `LogoCarousel.astro`, `FeaturedProjects.astro`, `ContactForm.astro` (markup only; behaviour in Task 9), `CircleBadge.astro`, `src/pages/index.astro`, `tests/visual/home.spec.ts`, `tests/e2e/no-js.spec.ts`
- Modify: `src/pages/index.astro` (replace placeholder)

**Interfaces:**
- Consumes: `getHome`, `getSite`, `Base.astro`, `data-motion` contract, effect ids from `content/motion.json`.
- Produces: `ContactForm.astro` with `<form id="contact-form" action="/api/contact" method="post">`, inputs `name`, `email`, `service` (select, options from content), `message`, a `div.cf-turnstile` placeholder, `button[type=submit]`, and status region `[data-form-status]` (`role="status"`).

- [ ] **Step 1: Write tests.** `home.spec.ts`: render `/` with the same routine as `capture-baseline.ts` at every breakpoint and `expect(page).toHaveScreenshot` against `tests/visual/baseline/home-<bp>.png` with `maxDiffPixelRatio: 0.02`. `no-js.spec.ts` (Review Focus 1): with `javaScriptEnabled: false`, the three counters show `getHome().about.counters` values with suffix, all four service titles and their bullets are in the DOM, every `[data-motion]` element has opacity 1, and the 6 project links point to their Instagram URLs.
- [ ] **Step 2:** Build the components and page (sticky hero container `position: sticky; top: 0`; accordions as `<details>`-based markup enhanced by `variant.ts`; logo carousel as a duplicated track with a CSS keyframe loop at the extracted speed, paused on reduced motion; Phosphor icons as inline SVG; the Lottie icon via `lottie-web` light player loading `public/lottie/*.json`, showing its first frame under reduced motion).
- [ ] **Step 3:** Run `npm run test:visual -- home` and `npm run test:e2e -- no-js` → PASS. If a diff exceeds tolerance, fix the markup/CSS; only change the tolerance with a note in `docs/decisions.md`.
- [ ] **Step 4:** Commit `feat: home page`.

---

### Task 7: Pricing pages (EN/RO) and 404

**Files:**
- Create: `src/components/PricingPage.astro`, `Timeline.astro`, `FaqAccordion.astro`, `PricingCard.astro`, `PrimaryButton.astro`, `src/pages/pricing.astro`, `src/pages/pricing-ro.astro`, `src/pages/404.astro`, `tests/visual/pricing.spec.ts`, `tests/e2e/routes.spec.ts`

**Interfaces:**
- Consumes: `getPricing(lang)`, `Base.astro`, motion ids `pricing.*`.
- Produces: `PricingPage.astro` props `{ content: PricingContent }`; both pricing pages are one-line wrappers.

- [ ] **Step 1: Write tests.** `pricing.spec.ts`: screenshots of `/pricing` and `/pricing-ro` at every breakpoint vs baselines, `maxDiffPixelRatio: 0.02`; each package button `href` equals its Calendly URL from content. `routes.spec.ts` (Review Focus 5): `/pricing/` → 200 pricing; `/timeline-demo`, `/PRICING`, `/nope` → status 404, body contains the 404 heading and a link to `/`.
- [ ] **Step 2:** Implement components and pages (timeline line fill via `scrollTransform`, rows/dots via `appear` with `replay: true`, hover effects via `hover`).
- [ ] **Step 3:** Run `npm run test:visual -- pricing` and `npm run test:e2e -- routes` → PASS.
- [ ] **Step 4:** Commit `feat: pricing pages and 404`.

---

### Task 8: Contact Worker with AI triage

**Files:**
- Create: `worker/validate.ts`, `worker/turnstile.ts`, `worker/triage.ts`, `worker/email.ts`, `tests/worker/contact.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Consumes: `Env` from Task 1.
- Produces:
  - `validate(body: unknown): { ok: true; data: Contact } | { ok: false; error: string }`, `Contact = { name: string (1–100), email: string (valid, ≤254), service: one of the 5 options, message: string (1–5000), turnstileToken: string }`.
  - `verifyTurnstile(token: string, ip: string | null, secret: string): Promise<boolean>` (POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`).
  - `Triage = { category: "scripting"|"filming"|"editing"|"production"|"full-package"|"spam"|"other"; language: "en"|"ro"|"other"; urgency: "low"|"normal"|"high"; budget_hint: string|null; summary: string; suggested_reply: string }`; `triage(ai: Ai, c: Contact, model?: string): Promise<Triage | null>` uses JSON-mode output, validates with zod, retries once, returns `null` on failure. `TRIAGE_MODEL` constant set from the Task 10 eval.
  - `sendEmail(env: Env, c: Contact, t: Triage | null): Promise<void>` via `POST https://api.resend.com/emails`; subject `[<category or "untriaged">] <name> – <service>`; `reply_to` = visitor email; body: summary + suggested reply (or "Triage unavailable"), then the original message, plain text and escaped HTML.
  - `POST /api/contact` with `application/x-www-form-urlencoded` (no-JS fallback): same pipeline, then 303 redirect to `/?sent=1#contact` or `/?sent=0#contact`.
  - `POST /api/contact` JSON in, JSON out: 200 `{ ok: true }`, 400 `{ ok:false, error }`, 403 Turnstile, 405 non-POST, 413 body > 20 KB, 502 if Resend fails. Everything else → `env.ASSETS.fetch`.

- [ ] **Step 1: Write tests** in `contact.test.ts` (fetch to Turnstile/Resend mocked, `env.AI.run` stubbed): valid request → 200 and one Resend call with `reply_to` = visitor email; missing email → 400; bad Turnstile → 403 and no AI or email call; `GET /api/contact` → 405; 25 KB body → 413; AI throws → 200, email body contains "Triage unavailable" and the original message; AI returns invalid JSON twice → same fallback, `AI.run` called exactly 2 times; Resend 500 → 502; (Review Focus 3) message `"Bună ziua! Ne trebuie 8 videoclipuri pe lună 🎬 ăâîșț"` padded to 5,000 chars → 200 and email text contains `"ăâîșț"` and `"🎬"`; a message containing `<script>` appears escaped in the HTML part; a valid form-encoded POST → 303 with `Location` `/?sent=1#contact`.
- [ ] **Step 2:** Implement the four modules and route in `worker/index.ts`.
- [ ] **Step 3:** Run `npm run test:worker` → PASS.
- [ ] **Step 4:** Commit `feat: contact worker with Turnstile, AI triage and Resend`.

---

### Task 9: Contact form behaviour

**Files:**
- Create: `src/scripts/contact-form.ts`, `tests/e2e/contact-form.spec.ts`
- Modify: `src/components/ContactForm.astro` (load Turnstile widget with `PUBLIC_TURNSTILE_SITE_KEY`, test key `1x00000000000000000000AA` in dev)

**Interfaces:**
- Consumes: form markup contract from Task 6; `/api/contact` responses from Task 8.

- [ ] **Step 1: Write tests** in `contact-form.spec.ts` (route `/api/contact` mocked): success → status region shows the Framer success text from content, fields reset; 400 → shows the server `error`, fields kept; (Review Focus 4) double-click Submit → exactly one request, button `disabled` with sending label while pending; request aborted (offline) → error text shown, typed message kept, button enabled again.
- [ ] **Step 2:** Implement `contact-form.ts` (progressive enhancement: without JS the native POST reaches the Worker, which redirects back with `?sent=1|0`; the page shows the matching success/error copy from that query).
- [ ] **Step 3:** Run `npm run test:e2e -- contact-form` → PASS.
- [ ] **Step 4:** Commit `feat: contact form client`.

---

### Task 10: Triage eval and model choice

**Files:**
- Create: `evals/triage/cases.json`, `evals/triage/run.ts`, `evals/triage/results.md`
- Modify: `worker/triage.ts` (`TRIAGE_MODEL`)

**Interfaces:**
- Consumes: `triage()` prompt and schema from Task 8 (imported, not copied).
- Produces: `npm run eval:triage -- --model <id>` calling Workers AI over its REST API (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` from env; not run in CI).

- [ ] **Step 1:** Write 20 cases: 8 English, 8 Romanian, 4 spam/off-topic, covering every category, with expected `category`, `language`, `urgency`.
- [ ] **Step 2:** Implement `run.ts`: per case, call the model through `triage()`; report per-field accuracy, schema-valid rate, median latency; append a table to `results.md`.
- [ ] **Step 3:** Run it for three small instruct models from the current Workers AI catalogue (check names on the catalogue page at run time). Expected: one model reaches ≥ 90% category accuracy and 100% schema-valid; set `TRIAGE_MODEL` to it and write the reasoning in `results.md`.
- [ ] **Step 4:** Run `npm run test:worker` → PASS (model constant change only).
- [ ] **Step 5:** Commit `feat: triage eval and model choice`.

---

### Task 11: CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`, `lighthouserc.json`, `.linkinator.config.json`

- [ ] **Step 1:** `ci.yml` on push and PR: Node 22, `npm ci`, `npm run build`, `test:unit`, `test:worker`, `npx playwright install --with-deps chromium`, `test:e2e`, `test:visual`, `check:links` (linkinator over `dist`, external links checked, Instagram/Calendly allowed to rate-limit with retry), `lhci autorun`.
- [ ] **Step 2:** `lighthouserc.json` asserts on `/` and `/pricing`, mobile: performance ≥ 0.90, accessibility ≥ 0.95, best-practices ≥ 0.95, SEO = 1.0; and each must be ≥ the Framer medians in `docs/results/framer-lighthouse.json` (fail if lower).
- [ ] **Step 3:** Run the same commands locally in order → all PASS; record new Lighthouse medians in `docs/results/README.md` next to Framer's.
- [ ] **Step 4:** Commit `ci: build, tests, links and Lighthouse`.

---

### Task 12: Case-study docs and analytics

**Files:**
- Create: `README.md`, `docs/decisions.md`, `docs/architecture.svg`
- Modify: `src/layouts/Base.astro` (Cloudflare Web Analytics beacon, token from `PUBLIC_CF_ANALYTICS_TOKEN`, omitted when unset)

- [ ] **Step 1:** `docs/decisions.md`: one short record each for Astro, Motion + Lenis, Framer values over scraping (with the hidden-text example), Resend over Email Routing (gmail now, domain mailbox later without code changes), one Worker for assets + API, model choice (link to eval), any visual-tolerance change.
- [ ] **Step 2:** `README.md`: problem and result (cost before/after, Lighthouse table, screenshots), architecture diagram, "How AI was used and verified" (MCP extraction, visual regression against Framer, worker tests, triage eval table), how to run locally, and an empty "UX / frontend" section marked to be written with Andrei.
- [ ] **Step 3:** Run `npm run build && npm run test:e2e -- seo` → PASS (analytics change doesn't break the head).
- [ ] **Step 4:** Commit `docs: case-study README and decisions`.

---

### Task 13: Go-live (Andrei, guided; no code)

Follows the pasted migration guide; the agent prepares, Andrei clicks.

- [ ] **Step 1:** GitHub Desktop: add the existing local repository (it is already a git repo), publish as public, push `main`.
- [ ] **Step 2:** Andrei creates a free Resend account with zavocreates@gmail.com and an API key. Cloudflare: create the Worker from the repo (build `npm run build`, deploy `npx wrangler deploy`), add secrets `TURNSTILE_SECRET`, `RESEND_API_KEY`, build var `PUBLIC_TURNSTILE_SITE_KEY`; enable the Production `workers.dev` URL; run the visual and e2e suites against it with `BASE_URL=<workers.dev url>` → PASS.
- [ ] **Step 3:** Move DNS from GoDaddy to Cloudflare per guide steps 3a–3e (domain stays registered at GoDaddy), attach the bare domain, www → root 301 rule, Always Use HTTPS.
- [ ] **Step 4:** Turnstile widget for `zavocreates.com`; Web Analytics token as build var; retry build. (No Resend DNS records now; that comes with the later mailbox project.)
- [ ] **Step 5:** Send a real message through the live form → email arrives at zavocreates@gmail.com with triage. Then remove the domain in Framer and cancel the plan.
- [ ] **Step 6:** Search Console verification, submit `sitemap.xml`, request indexing, check LinkedIn post inspector (guide step 4).
