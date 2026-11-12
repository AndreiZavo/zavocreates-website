# Go-live checklist

Task 13 of the [plan](superpowers/plans/2026-11-10-zavocreates-framer-to-cloudflare.md), plus every item deferred during the build. Andrei does the clicks; an agent can prepare each step. Framer stays live until the last section.

## 1. Repository and CI

- [ ] GitHub Desktop: add the existing local repository, publish it as **public** (macOS CI minutes are free only for public repos).
- [ ] Push `main` and `build`.
- [ ] Branch protection on `main`: require both checks, "Build, tests, links and Lighthouse" and "Visual regression (macOS)".
- [ ] Watch the first CI run:
  - [ ] Lighthouse: `/` mobile performance scored 94 locally against a budget of 0.90. A slower runner may get close. Fix the site, never lower the budget.
  - [ ] Visual job: the baselines were captured on Andrei's Mac. If macos-latest rasterises fonts differently, the diffs show it. Check the diff images in the uploaded report before changing anything.
  - [ ] Link check: Instagram and Calendly often answer CI with 429 or 999. Those are reported as warnings. A 404 or a dead host is still a failure.
- [ ] Merge `build` into `main` only with both checks green.

## 2. Accounts and secrets

- [ ] Resend: free account with zavocreates@gmail.com, create an API key.
- [ ] Cloudflare: create the Worker from the GitHub repo. Build command `npm run build`, deploy command `npx wrangler deploy`.
- [ ] Turnstile: add a widget for `zavocreates.com` (and the `workers.dev` hostname for testing). Widget mode: **Managed** (the form renders it with `appearance: "interaction-only"`, which applies to the visible modes, Managed and Non-Interactive: [widget configurations](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)).
- [ ] Worker secrets: `RESEND_API_KEY` (the Resend key) and `TURNSTILE_SECRET` = the widget's secret key, never the test secret from `.dev.vars.example`. The Worker answers 503 to every form submission if a secret is missing, or if the test secret is used on any host other than localhost.
- [ ] Build variable `PUBLIC_TURNSTILE_SITE_KEY` = the real sitekey. **Must be set.** Unset, the build ships Cloudflare's test key and every real submission gets 403.
- [ ] Web Analytics: add the site, copy the token, set build variable `PUBLIC_CF_ANALYTICS_TOKEN`.
- [ ] Retry the build. In the page source, check the real sitekey and the `static.cloudflareinsights.com/beacon.min.js` script are there.
- [ ] Enable the production `workers.dev` URL.

## 3. Triage eval and model

- [ ] Cloudflare API token with Workers AI permission.
- [ ] Check the [Workers AI catalogue](https://developers.cloudflare.com/workers-ai/models/?tasks=Text+Generation) for renamed or deprecated candidates.
- [ ] Run (token exported in the shell, not typed inline):

  ```sh
  export CLOUDFLARE_ACCOUNT_ID=<account id>
  export CLOUDFLARE_API_TOKEN=<workers ai token>
  npm run eval:triage -- --model @cf/ibm-granite/granite-4.0-h-micro --model @cf/zai-org/glm-4.7-flash --model @cf/google/gemma-4-26b-a4b-it
  ```

- [ ] Pick a model with at least 90% category accuracy and 100% schema-valid output (Romanian results first if several pass).
- [ ] Set `TRIAGE_MODEL` in `worker/triage.ts`, write the reasoning in `evals/triage/results.md`, update the model record in `docs/decisions.md` and the README, commit on a branch, merge with CI green.

## 4. Test on workers.dev

- [ ] Run the e2e and visual suites against the `workers.dev` URL. With `BASE_URL` set, Playwright uses that site and starts no local build or preview. Export the same analytics token the build used, so the seo test expects the beacon:

  ```sh
  export PUBLIC_CF_ANALYTICS_TOKEN=<web analytics token>
  BASE_URL=https://<name>.workers.dev npm run test:e2e
  BASE_URL=https://<name>.workers.dev npm run test:visual
  ```

  No spec sends a real message: the form tests mock `/api/contact` and Turnstile in the browser, and the API tests only hit paths that stop before Turnstile, Workers AI and Resend.
- [ ] Open `/`, `/pricing`, `/pricing-ro`, `/nope` on a phone and a desktop.

## 5. DNS and domain

- [ ] Move DNS from GoDaddy to Cloudflare (guide steps 3a–3e). The domain stays registered at GoDaddy.
- [ ] Attach `zavocreates.com` to the Worker.
- [ ] Redirect rule: `www.zavocreates.com` → `https://zavocreates.com` (301, keep the path).
- [ ] Always Use HTTPS on.
- [ ] Turnstile: remove the `workers.dev` hostname from the widget once `zavocreates.com` serves the site, so tokens are only issued for the real domain.
- [ ] Remove the `^https://zavocreates\.com/` skip from `.linkinator.config.json` (and its note in `scripts/check-links.ts`). Run `npm run check:links`.

## 6. Questions for Andrei

- [ ] Copy per breakpoint (Ruling R8): Framer's tablet/phone accordions say "4. Post-Production", "Capture supporting b-roll", a different FAQ 2 title, and two RO lines with dashes. The rebuild shows the desktop copy everywhere, except the phone FAQ 2 title. Keep this, or pick one version?
- [ ] 404 page wording: Framer has no 404 page. The rebuild shows "404" and a "Home" link. Keep or rewrite?
- [ ] Image alt texts: Framer has alt text on one image only ("Portrait of portfolio creator"). The others were written from layer and brand names during extraction. Check them in `content/home.json` and `content/site.json`.
- [ ] Favicon: the original is a 2731 px PNG, resized to 64 px at build. Is a 64 px PNG enough, or should there be an SVG or a 180 px Apple touch icon?
- [ ] `og:image:alt` is English on `/pricing-ro` too. Add a Romanian one?
- [ ] Footer phone link (Ruling R7): confirm `tel:+40799853625` is the right number.

## 7. Real message, then cancel Framer

- [ ] Send a real message through the live form on zavocreates.com, once in English and once in Romanian.
- [ ] Check each arrives at zavocreates@gmail.com as one conversation: private notes first, then the visitor's message. Reply (on the newest email) goes to the sender and quotes only their message.
- [ ] Search Console: verify the domain, submit `https://zavocreates.com/sitemap.xml`, request indexing. Check the link preview in LinkedIn's post inspector.
- [ ] Remove the domain from the Framer project, then cancel the Framer plan.
- [ ] Fill in the Framer plan cost in the README's cost table.
