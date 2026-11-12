# Decisions

Short records of the choices that shaped this rebuild. Each has the context, the decision and its consequences. Rulings (R2, R7, …) are numbered as in the build log kept during the work.

## 1. Astro for the site

**Context.** The site is three pages plus a 404, with no logged-in state and no CMS. Content comes from JSON extracted from Framer. Pages must work without JavaScript.

**Decision.** Astro with static output into `./dist`. Pages are built from components and `content/*.json`. `/pricing` and `/pricing-ro` share one component fed by two content files.

**Consequences.** Every page is plain HTML at build time, so crawlers and no-JS visitors see all text, including counter end values and accordion bullets. The zod schemas in `src/content/schema.ts` run during the build, so a malformed content file fails the build instead of shipping. JavaScript is limited to the motion runtime and the contact form.

## 2. Motion and Lenis for animation

**Context.** Framer animations are springs (stiffness, damping, mass, or duration and bounce) and tweens with cubic-bezier easing. The rebuild must reproduce them from the values in the Framer project, without a React runtime.

**Decision.** Motion (motion.dev, vanilla JS), which uses the same spring parameters as Framer, and Lenis for Framer's Smooth Scroll component. Every value comes from `content/motion.json`.

**Consequences.** Framer's values transfer one to one, with no hand-tuned numbers in components. The runtime does not start under `prefers-reduced-motion: reduce`, and elements are visible by default, so nothing depends on JavaScript to appear.

## 3. Framer values over scraping

**Context.** The published HTML of a Framer site contains text that visitors never see: hidden layers, template defaults and collapsed accordion states.

**Decision.** Text, links, tokens and motion values are read from the Framer project through the Framer MCP connector, with read-only programs (`docs/extraction/programs/`). `transform.py` reads each string by node id or component control and exits if a node it reads is hidden. The live HTML was used only to cross-check.

**Example.** On `/pricing-ro`, FAQ 3 line 1 is "Nu prea — voi veniți cu povestea voastră" in the scraped HTML. That is the collapsed (Closed) variant. The open variant, which is what a visitor reads, overrides it to "Nu chiar. Voi veniți cu povestea voastră". "Nu chiar" does not appear anywhere in the HTML. A scrape would have shipped the wrong line. Details: [`docs/extraction/README.md`](extraction/README.md).

**Consequences.** The extraction is repeatable from the raw dumps in `docs/extraction/raw/`. It needs an MCP session today; a headless run through Framer's Server API would need the programs ported (described in the extraction README).

## 4. Resend instead of Cloudflare Email Routing

**Context.** A Worker cannot send email on its own. Form messages must keep arriving at zavocreates@gmail.com. Andrei plans a mailbox on the domain later.

**Decision.** Resend free tier (3,000 emails a month, 100 a day). For now it sends from Resend's `onboarding@resend.dev` address to the account owner's address, zavocreates@gmail.com, so no DNS records are needed. The API key is a Worker secret (`RESEND_API_KEY`).

**Consequences.** Moving to a domain mailbox later is a configuration change: `CONTACT_FROM` and `CONTACT_TO` in `wrangler.jsonc`, plus a verified sending subdomain in Resend. No code changes. Resend's records live on a subdomain, so they can coexist with a future mailbox provider's MX records. Email Routing would have to be turned off once a mailbox takes over the domain's MX.

## 5. One Worker for static assets and the API

**Context.** The site needs static hosting and one endpoint, `POST /api/contact`.

**Decision.** One Worker (`worker/index.ts`) with Workers static assets (`./dist`). The Worker handles `/api/contact` and passes every other request to the `ASSETS` binding. `wrangler.jsonc` sets the compatibility flag `assets_navigation_has_no_effect`.

**Why the flag.** Since compatibility date 2025-04-01, navigation requests (`Sec-Fetch-Mode: navigate`) are answered by asset serving before the Worker runs. A form POST without JavaScript is a navigation, so it got a 405 from the assets layer and never reached the Worker. The flag restores the older rule: the Worker runs for any request that is not an exact asset match.

**Consequences.** One deploy, one config file, one place for tests. Side effect of the flag: a browser visit to an unknown URL now invokes the Worker before the 404 page is served. That counts against the Workers Free request allowance.

## 6. Scroll-stitched visual baselines

**Context.** A single full-page screenshot of the Framer site shows counters at 0, unrevealed timeline cards and missing sticky images, because those only change when that part of the page is on screen.

**Decision.** `tests/visual/capture.ts` keeps the viewport at the breakpoint width by 900 px, visits the page in 900 px steps, waits at each step until three screenshots in a row are identical, and stacks the frames. The same routine captured the Framer baselines and captures the rebuild. Parts that never stop moving (logo marquee, cycling badge, pulsing dot, Turnstile) are hidden with `visibility: hidden`.

**Consequences.** Each 900 px band shows what a visitor sees with that part of the page on screen. Fixed and sticky elements repeat once per band, which is expected. A full capture of the 9 baselines takes about 5 minutes. The baselines were captured on macOS, so the visual job runs on macOS.

## 7. Triage model (provisional)

**Context.** The contact Worker asks a Workers AI model for a structured label (category, language, urgency, budget hint, summary, suggested reply). The model must return valid JSON and handle English and Romanian.

**Decision.** Provisional `TRIAGE_MODEL = "@cf/ibm-granite/granite-4.0-h-micro"` in `worker/triage.ts`, the cheapest text model in the catalogue with JSON mode. The final choice comes from the eval in [`evals/triage/`](../evals/triage/results.md): 20 cases, at least 90% category accuracy and 100% schema-valid output.

**Consequences.** The eval has not been run yet. It needs a Cloudflare account and runs at go-live. Romanian is not in Granite's advertised languages, so it may be replaced by one of the two other candidates. Changing the model is a one-line change.

## 8. Visual tolerance

**Context.** The visual tests compare the rebuild with the Framer baselines. Between two captures of the Framer site, `home-tablet.png` differed by 1 to 4 pixels.

**Decision.** `maxDiffPixelRatio: 0.02` in `tests/visual/home.spec.ts` and `tests/visual/pricing.spec.ts`, set when each page was built. It has not been changed since. Baselines are never regenerated (`updateSnapshots: "none"`).

**Consequences.** Measured diffs when the pages were built: 0.35%, 0.37% and 0.52% for the three home captures, under 0.09% for the six pricing captures.

## 9. Rulings that interpret or deviate from Framer

These were decided during the build and surfaced to Andrei. Each is small to reverse.

- **R2. No-JS form result.** Without JavaScript the form posts normally. The Worker answers with a 303 redirect to `/#contact-sent` or `/#contact-error`, and the page shows the matching message with CSS `:target`. No query string, because a static page cannot read one without JavaScript.
- **R7. Footer phone link.** Framer's footer link is `tel:+1 (555) 123-4567`, a template default, while the text shows "+40 799 853 625". A visitor tapping it would call a placeholder US number. The rebuild links `tel:+40799853625`. The visible text is unchanged.
- **R8. Copy per breakpoint.** Framer's tablet and phone accordion variants contain slightly different copy (for example "4. Post-Production", "Capture supporting b-roll"). They look like unfinished edits. The pages render the desktop copy at every breakpoint and keep the variants in content as `tabletPhone`. One exception: on phone, FAQ 2 uses its `tabletPhone` title, because with the desktop title the phone page height no longer matched Framer's. Open question for Andrei.
- **R10. No-JS form and Turnstile.** Turnstile needs JavaScript, so a post without JavaScript always fails the spam check and lands on `#contact-error`. That message, and a `<noscript>` note next to the form, point to the email address and phone number already on the page. There is no Turnstile bypass.
- **R12. Noise under reduced motion.** The film-grain background is an animated GIF, and Framer keeps it animating under reduced motion. The project rule is that all motion stops under `prefers-reduced-motion: reduce`. Under that setting the layer shows `public/images/noise-still.png`, the GIF's first frame (pixel-identical, written once with sharp), with the same tiling. The GIF is not preloaded for those visitors.
- **R13. Owner fixes after the first review (2026-11-12).** Checked against the live Framer site before changing anything:
  - Menu X: Framer moves the top line from `top: 16px` to `19px` when the menu opens. The extraction missed it, so the X crossed off-centre. Added to `nav.scroll` in `content/motion.json`.
  - Menu links close the open tablet/phone menu when tapped. This is an owner request; Framer leaves the menu open.
  - Primary button fill: on hover Framer moves the circle's left edge from `-19px` to `-26px`, and with both edges pinned the circle spans the whole button. Added `left` to `button.primary.hover`. The runtime turns a two-edge pin into a px width (`pinEdges` in `src/motion/states.ts`).
  - Hand-wave Lottie: the colours were applied in reverse. The hand was drawn in the badge's own green, so it disappeared, most visibly on phone.
  - Accordion: the open item's 20px bottom padding sits inside the animated panel, so closing no longer snaps 20px at the end.
  - Cursor: the native cursor stays visible and the dot follows it, as on Framer, which never hides the cursor.
  - VAT line ("Prices do not include VAT." / "Prețurile nu includ TVA.") under the package footnote, an owner addition. Visual tests take it out of layout (`data-baseline-remove`) so the Framer baselines still apply.
