# zavocreates.com

Astro static site (built to `./dist`) served by one Cloudflare Worker (`worker/index.ts`). Rebuild of a Framer site.

## Global Constraints

- Content rule: the site shows exactly what a visitor sees on the live Framer site today. Text comes from Framer node/control values, never from scraped HTML; hidden layers and template defaults are excluded.
- Pages: `/`, `/pricing`, `/pricing-ro`, `404`. `/timeline-demo` is not built.
- `/pricing-ro` has `<html lang="ro">`, Romanian title/description; `/pricing` and `/pricing-ro` link each other with `hreflang` (`en`, `ro`, `x-default` -> `/pricing`).
- Fonts: Antonio and Inter only, self-hosted. No Palmore, Inkbleed, STRUKO, no "Logo Crystal" shader.
- Every animation value comes from `content/motion.json`; no hand-tuned numbers in components.
- All motion is disabled under `prefers-reduced-motion: reduce`, and content is fully visible without JavaScript.
- Free plans only: Workers Free, Workers AI free allowance, Turnstile, Cloudflare DNS Free, Resend free tier.
- No secrets in the repo. Worker secrets: `TURNSTILE_SECRET`, `RESEND_API_KEY`. Vars: `CONTACT_TO = "zavocreates@gmail.com"`, `CONTACT_FROM = "Zavo Website <onboarding@resend.dev>"` (switch to a domain sender later; config only).
- Form submissions are never stored.
- `wrangler.jsonc` assets block exactly: `"directory": "./dist"`, `"html_handling": "auto-trailing-slash"`, `"not_found_handling": "404-page"`.
- Execution style: for each task, list every file the task needs and read them all in one pass, then make all edits, then run that task's tests once. If that run fails, fix and re-run.
- Commit after every task on a branch; merge to `main` only with CI green.

## Setup

- Node 22+ (`.nvmrc`). `npm install`, `npx playwright install chromium`.
- Local secrets: `cp .dev.vars.example .dev.vars` (git-ignored, dummy values).

## Commands

- `npm run dev` Astro dev server.
- `npm run build` build static site into `./dist`.
- `npm run preview` `wrangler dev` on http://localhost:8787 (serves `./dist` + Worker). Run `npm run build` first.
- `npm run test:unit` Vitest, `tests/unit/`.
- `npm run test:worker` Vitest in the Workers runtime, `tests/worker/`.
- `npm run test:e2e` Playwright, `tests/e2e/` (builds and starts preview itself). Filter: `npm run test:e2e -- smoke`.
- `npm run test:visual` Playwright visual tests, `tests/visual/`.
- `npm run check:links` linkinator over `./dist`.
- `npm run lhci` Lighthouse CI.
