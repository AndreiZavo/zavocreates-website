# Results

Measurements kept for comparing the rebuild against the Framer site it replaces.

## Framer baseline (captured 2026-11-10)

Source: the live Framer site at https://zavocreates.com, before the migration.

### Lighthouse

`npx lhci collect` (Lighthouse 13.6.0), 3 runs per URL and preset, run from a laptop with
Lighthouse's default simulated throttling. Each number is the median of the 3 runs.
Full data: [`framer-lighthouse.json`](framer-lighthouse.json).

| Page | Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed Index |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | mobile | 82 | 92 | 100 | 100 | 1.19 s | 1.19 s | 614 ms | 0.003 | 2.78 s |
| `/pricing` | mobile | 93 | 89 | 100 | 100 | 1.18 s | 1.18 s | 295 ms | 0 | 2.98 s |
| `/` | desktop | 100 | 92 | 100 | 100 | 0.50 s | 0.50 s | 12 ms | 0.002 | 0.99 s |
| `/pricing` | desktop | 100 | 89 | 100 | 100 | 0.48 s | 0.48 s | 12 ms | 0 | 0.54 s |

### Total transfer size

Lighthouse `total-byte-weight` (bytes over the network for the initial page load, compressed),
median of 3 runs.

| Page | Preset | Transfer size | Requests |
| --- | --- | --- | --- |
| `/` | mobile | 1,989,224 bytes (1.90 MiB) | 59 |
| `/` | desktop | 2,124,523 bytes (2.03 MiB) | 61 |
| `/pricing` | mobile | 1,741,809 bytes (1.66 MiB) | 43 |
| `/pricing` | desktop | 1,741,837 bytes (1.66 MiB) | 43 |

### Screenshots

`tests/visual/baseline/<page>-<breakpoint>.png`: pages `home`, `pricing`, `pricing-ro` at the
breakpoint widths in `content/tokens.json` (desktop 1200, tablet 810, phone 390).

    node scripts/capture-baseline.ts --base https://zavocreates.com --out tests/visual/baseline

Each image is scroll-stitched. The viewport stays at the breakpoint width x 900 px; the page
is visited in 900 px steps, and at each step the script waits until the viewport stops
changing (three identical screenshots in a row) and keeps that frame. The frames are stacked
into one image as tall as the page, so each 900 px band shows what a visitor sees with that
part of the page on screen: count-ups finished ("About me" reads 5 / 100+ / 20+), the pricing
timeline cards revealed, sticky images present.

Reading the images:

- Fixed and sticky elements repeat once per band. The "Available for work" nav pill appears
  every 900 px; that is expected, not a layout bug.
- Scroll-linked effects are frozen at each band's scroll position. The pricing timeline line,
  for example, is filled as far as it is at that position, so the fill can step at a band edge.
- Parts that never stop moving are hidden with `visibility: hidden` (their space is kept):
  the logo marquee track, the avatar badge content that cycles between "Hi" and a waving
  hand, the pulsing glow around the "available" dot, and the Turnstile widget on the rebuild.

Reproducibility: no frame hit the stability cap. Across two full captures, 8 of the 9 files
were byte-identical. `home-tablet.png` differs between some loads by 1 to 4 pixels, each by
1/255 in one colour channel, on the edges of the tilted project cards (y 3800 to 4950).
Comparisons against these baselines need a small tolerance for that reason.

## Rebuild (measured 2026-11-11)

Source: `./dist` served by the Worker preview (`npm run preview`, `wrangler dev --local` on
http://localhost:8787). The preview runs the same Worker and asset routing as production and
serves assets Brotli-compressed, so transfer sizes match what Cloudflare sends; a plain static
server over `./dist` would serve them uncompressed and skip the Worker. The Turnstile script
loads on `/` from challenges.cloudflare.com, as it does in production.

Same method as the Framer baseline: `@lhci/cli` (Lighthouse 13.6.0), 3 runs per URL and
preset, default simulated throttling, each number the median of the 3 runs taken per value.
Mobile is what `npm run lhci` collects (the CI run); desktop was collected separately with
`npx lhci collect --settings.preset=desktop`. Full data:
[`rebuild-lighthouse.json`](rebuild-lighthouse.json).

### Lighthouse: Framer vs rebuild

| Page | Preset | Site | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed Index |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | mobile | Framer | 82 | 92 | 100 | 100 | 1.19 s | 1.19 s | 614 ms | 0.003 | 2.78 s |
| `/` | mobile | rebuild | 92 | 100 | 100 | 100 | 0.92 s | 3.37 s | 0 ms | 0.001 | 0.92 s |
| `/pricing` | mobile | Framer | 93 | 89 | 100 | 100 | 1.18 s | 1.18 s | 295 ms | 0 | 2.98 s |
| `/pricing` | mobile | rebuild | 100 | 100 | 100 | 100 | 1.39 s | 1.39 s | 0 ms | 0 | 1.39 s |
| `/` | desktop | Framer | 100 | 92 | 100 | 100 | 0.50 s | 0.50 s | 12 ms | 0.002 | 0.99 s |
| `/` | desktop | rebuild | 100 | 100 | 100 | 100 | 0.26 s | 0.50 s | 0 ms | 0 | 0.28 s |
| `/pricing` | desktop | Framer | 100 | 89 | 100 | 100 | 0.48 s | 0.48 s | 12 ms | 0 | 0.54 s |
| `/pricing` | desktop | rebuild | 100 | 100 | 100 | 100 | 0.26 s | 0.26 s | 0 ms | 0 | 0.28 s |

Individual mobile performance runs for `/` were 91, 97 and 92: the margin over the 0.90 budget
is small. What remains on the LCP path is the 756 KB animated noise GIF (the same file Framer
serves). On localhost it finishes downloading before the hero portrait paints, so Lighthouse's
simulation counts it against LCP at slow-4G speed; on Framer's CDN it finishes after LCP and is
not counted.

### Total transfer size: Framer vs rebuild

| Page | Preset | Framer | Rebuild |
| --- | --- | --- | --- |
| `/` | mobile | 1,989,224 bytes (1.90 MiB), 59 requests | 1,421,970 bytes (1.36 MiB), 35 requests |
| `/` | desktop | 2,124,523 bytes (2.03 MiB), 61 requests | 1,382,702 bytes (1.32 MiB), 38 requests |
| `/pricing` | mobile | 1,741,809 bytes (1.66 MiB), 43 requests | 943,762 bytes (0.90 MiB), 14 requests |
| `/pricing` | desktop | 1,741,837 bytes (1.66 MiB), 43 requests | 942,590 bytes (0.90 MiB), 14 requests |

The noise GIF is 756 KB of each rebuild total.

### Fixes made to meet the budgets

The first CI run failed: `/` mobile performance 0.77 (LCP 5.7 s, 3.4 MB transferred).

- Favicon: the 2731 px, 2 MB original PNG was linked directly. It is now resized at build to a
  64 px PNG (11 KB), `src/layouts/Base.astro`.
- Noise layer: the GIF was fetched at High priority (an in-viewport image) next to the hero
  portrait, the LCP image. It now has `fetchpriority="low"`, `src/components/Noise.astro`.

### Budgets (`lighthouserc.json`, mobile, median of 3 runs)

Each minimum is the higher of the task's floor and the Framer mobile median above, so the
rebuild can never score below the site it replaces:

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| floor | 0.90 | 0.95 | 0.95 | 1.00 |
| `/` Framer median | 0.82 | 0.92 | 1.00 | 1.00 |
| `/` budget | **0.90** | **0.95** | **1.00** | **1.00** |
| `/pricing` Framer median | 0.93 | 0.89 | 1.00 | 1.00 |
| `/pricing` budget | **0.93** | **0.95** | **1.00** | **1.00** |
