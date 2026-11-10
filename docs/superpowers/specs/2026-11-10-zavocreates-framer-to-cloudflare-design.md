# zavocreates.com: Framer → code on Cloudflare

Date: 2026-11-10
Status: approved 2026-11-10

## 1. Goal

Rebuild zavocreates.com as code, pixel- and motion-faithful to the current Framer site, and host it for free on Cloudflare so the Framer subscription can be cancelled. The only remaining cost is the yearly domain renewal.

The GitHub repository doubles as a portfolio case study aimed at recruiters hiring **AI engineers**, and secondarily **UX / frontend** roles (the README covers both angles; its UX/frontend section is written together with Andrei later).

### Success criteria

1. The new site looks and moves like the Framer site at every breakpoint, verified by automated screenshot comparison against baselines captured from the live Framer site.
2. It runs entirely on free plans (Cloudflare Workers Free, Workers AI free allowance, Turnstile, DNS Free plan; Resend free tier for email).
3. The contact form works without Framer, with spam protection and AI triage.
4. Lighthouse scores on the new site beat the Framer site's (numbers recorded before and after).
5. A recruiter can read the README in five minutes and understand how AI was used, and how its output was verified.

## 2. What is being moved (source of truth: Framer project "Zavo Videographer Portfolio")

Content comes from the values set in the Framer project (read through the Framer MCP connector), **not** from scraping published HTML. Hidden layers and template defaults are excluded. Rule: the new site shows exactly what a visitor sees today.

| Page | Moves? | Notes |
|---|---|---|
| `/` | Yes | Hero, services, about + counters, contact info, collaborator logos, featured projects (link to Instagram), contact form |
| `/pricing` | Yes | Why me, 5-step timeline, FAQ, 4 packages with Calendly links, CTA |
| `/pricing-ro` | Yes | Same as `/pricing` in Romanian; gets `lang="ro"`, Romanian `<title>`/description, and `hreflang` links with `/pricing` |
| `/timeline-demo` | No | Unfinished test page; returns the 404 page |

Visible text already confirmed in Framer (examples of the rule):
- Services show 3 bullets each; the 4th ("Interaction design and micro-animations") is hidden in Framer and is not moved.
- Post-Production & Delivery: "Craft a smooth, story-driven edit", "Enhance with color, sound, and motion", "Deliver polished content, platform-ready".
- Pricing FAQ: 3 visible lines per question (same accordion pattern).

Fonts: **Antonio** and **Inter** (Google Fonts, OFL), self-hosted. The unused custom fonts (Palmore, Inkbleed, STRUKO) and the unused "Logo Crystal" shader are not moved.

Images: downloaded from `framerusercontent.com` into the repo and served optimised (AVIF/WebP, correct sizes).

Calendly links stay as they are.

### Motion inventory (all must be reproduced)

| Where | Effect | Framer setting to copy |
|---|---|---|
| All pages | Page enter/exit fade | tween 0.2s, ease `[0.27, 0, 0.51, 1]` |
| All pages | Smooth Scroll component | its intensity setting |
| Home | Sticky hero container | `position: sticky; top: 0` |
| Home | Avatar flips in on load (rotateX −180° → 0, scale 0 → 1) | spring, 1s, bounce 0 |
| Home | Avatar transform tied to scroll position | spring stiffness 500, damping 60, mass 1 |
| Home | Scroll-in reveals (9 elements) | per-element appear effect values |
| Home | Number counters (count up when visible) | Number Card component; real final values rendered in HTML so no-JS and crawlers see them |
| Home | Service accordion (open/close) | component variant transition |
| Home | Logo carousel (infinite marquee) | speed and direction from the component |
| Pricing (EN/RO) | Timeline line fills with scroll | scroll-linked transform, viewport "middle" |
| Pricing (EN/RO) | Rows slide in from x −150, dots scale 0.5 → 1, replay on scroll back | spring 0.5s / 0.4s, bounce 0.2 |
| Pricing (EN/RO) | 24 hover effects (cards, buttons) | per-element hover values |
| Pricing (EN/RO) | FAQ accordion | component variant transition |
| Anywhere used | Lottie icon, Phosphor icons | Lottie JSON exported; Phosphor as inline SVG |

Exact values for every row are extracted into `content/motion.json` (section 4.1) so they are copied, not eyeballed. All motion respects `prefers-reduced-motion`.

## 3. Architecture

```
GitHub repo ──push──▶ Cloudflare Workers Builds ──▶ one Worker
                                                    ├─ static assets (./dist, built by Astro)
                                                    └─ POST /api/contact
                                                         ├─ Turnstile verify
                                                         ├─ Workers AI triage
                                                         └─ email to Andrei
```

- **Astro** (static output to `./dist`). Pages are built from components and the JSON in `content/`. EN/RO pricing share one component fed by two content files.
- **Motion** (motion.dev, vanilla JS): uses the same spring model as Framer (stiffness/damping/mass, duration/bounce), so Framer's values transfer one to one. **Lenis** for smooth scroll. Shipped as small scripts on the pages that need them, not a React runtime.
- **One Cloudflare Worker** serves the assets and the contact endpoint, configured by `wrangler.jsonc` as in the migration guide (`assets.directory: ./dist`, `html_handling: auto-trailing-slash`, `not_found_handling: 404-page`) plus a `main` script for `/api/contact`.
- **Cloudflare Web Analytics** (free, cookieless) replaces Framer's analytics.

## 4. Components

### 4.1 Framer extraction (AI-engineering showcase #1)

The agent reads the Framer project through the Framer MCP connector and writes:
- `content/home.json`, `content/pricing.en.json`, `content/pricing.ro.json`: visible text, links, image references.
- `content/tokens.json`: colours, text styles (font, size, line height, letter spacing per breakpoint), spacing, radii, breakpoints.
- `content/motion.json`: every effect in the motion inventory with its exact values.
- `docs/extraction/`: the read-only programs that were run and a short log, so the extraction is repeatable.

A schema (zod) validates every JSON file at build time; a missing or malformed field fails the build.

To check during planning: whether Framer's Server API allows running the extraction as a standalone script (fully reproducible) instead of through the agent session.

### 4.2 Site (Astro)

`src/pages/` (index, pricing, pricing-ro, 404), `src/components/` (one per Framer component: ServiceAccordion, NumberCard, LogoCarousel, FaqAccordion, Timeline, PricingCard, ContactForm, …), `src/motion/` (small modules per effect, driven by `motion.json`), `src/styles/` (tokens as CSS custom properties).

SEO carried over and completed: titles, descriptions, og/twitter images, canonical URLs, `sitemap.xml` (3 pages), `robots.txt`, `hreflang`, favicon.

### 4.3 Contact Worker with AI triage (AI-engineering showcase #2)

Form fields stay as today: Name, Email, Service Needed (Scripting / Filming / Video Editing / Video Production / All of the above), message.

Flow for `POST /api/contact`:
1. Validate fields (lengths, email format). Bad input → 400 with a message the form shows.
2. Verify the Turnstile token. Failure → 403.
3. Ask a Workers AI text model for **structured JSON**: `{ category, language (en/ro), urgency, budget_hint, summary, suggested_reply }`, validated against a schema. One retry on invalid output.
4. Email Andrei: subject with category and name, the AI summary and drafted reply on top, the original message below.
5. Return 200; the form shows its success state (same look as Framer's).

Failure handling: if the AI call fails or its output stays invalid, the email still goes out with the raw message and a "triage unavailable" note. The visitor never sees an AI error. Messages are not stored anywhere.

Email delivery: form messages keep arriving at **zavocreates@gmail.com**, as today. A Worker can't send email on its own, so it uses **Resend** free tier (3,000 emails/month, 100/day) as the sender. For now no domain setup is needed: the Resend account is created with zavocreates@gmail.com and sends from Resend's own `onboarding@resend.dev` address, which may only send to the account owner's address (exactly the one we need). When the domain mailbox is set up later, Resend gets a verified sending subdomain such as `send.zavocreates.com` and the recipient changes; both are config values, not code. Chosen over Cloudflare Email Routing because Andrei plans a mailbox on the domain later: Resend's DNS records live on the subdomain and coexist with any future mailbox provider's MX records, while Email Routing would have to be turned off when a mailbox takes over the domain's MX. The domain is registered at GoDaddy (separate from Framer); only its DNS moves to Cloudflare. The Resend API key is stored as a Worker secret.

Model choice: a small instruct model from the Workers AI catalogue, chosen in planning by running the eval below on two or three candidates, staying inside the free daily allowance.

### 4.4 Triage eval (AI-engineering showcase #3)

`evals/triage/`: about 20 hand-written sample enquiries (English and Romanian, real-looking and spam-like) with expected `category`, `language` and `urgency`. A script runs them through the model and reports accuracy per field and schema-valid rate. The README shows the result table and which model was chosen and why.

### 4.5 Tests and CI

- **Visual regression (Playwright):** before Framer is cancelled, baseline screenshots of every page are captured from the live Framer site at each breakpoint, after scrolling to trigger reveals, and committed. The new site is compared to them with a small pixel-difference tolerance. Motion is checked separately by screenshotting fixed points in key animations.
- **Worker tests (Vitest + Cloudflare's Workers test pool):** validation, Turnstile failure, AI failure fallback, email sent.
- **Content schema check** (part of the build).
- **Link check** (internal links, Calendly, Instagram, mailto/tel).
- **Lighthouse CI** with minimum scores; Framer's scores recorded once for the before/after table.
- **GitHub Actions** runs all of the above on every push. Cloudflare builds and deploys `main` on its own; its build includes the content schema check, so a broken content file never deploys, and a failed build leaves the previous version live. Work happens on branches and is merged to `main` only when Actions is green.

### 4.6 Case-study documentation

- `README.md`: the problem (paying for Framer), result (cost, Lighthouse before/after, screenshots), architecture diagram, how the AI agent was directed (extraction through MCP, verification by tests and evals), the triage feature and its eval table, and a UX/frontend section written later with Andrei.
- `CLAUDE.md`: project rules for AI agents working in the repo.
- `docs/decisions.md`: short records of key decisions (Astro, Motion + Lenis, content from Framer instead of scraping, email provider, model choice).

## 5. Go-live

Follows the pasted migration guide (GitHub Desktop → Cloudflare Worker from GitHub → test on the `workers.dev` address → move DNS → www redirect → Always HTTPS → Search Console + sitemap). Additions:
- Capture Framer baselines and Lighthouse scores **before** touching DNS.
- Turnstile site key set up for the real domain; Resend account created with zavocreates@gmail.com.
- Framer is cancelled only after the new site is live on zavocreates.com and the form has delivered a real test message.

The repository is public (no secrets in it; Turnstile secret and email settings live in Cloudflare).

## 6. Out of scope

Redesign or copy changes, a CMS, a blog, `/timeline-demo`, new pages, storing form submissions, paid Cloudflare features.

## 7. Open items to settle in planning

1. Framer Server API for a standalone extraction script (4.1).
2. None for email now: messages go to zavocreates@gmail.com via Resend's default sender. A mailbox on the domain, and Resend domain records, are a later, separate project.
3. Workers AI model shortlist (4.3, 4.4).
4. Exact breakpoint widths and the Smooth Scroll / Logo Carousel settings (pulled during extraction).
