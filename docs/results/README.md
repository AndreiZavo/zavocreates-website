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

Two consecutive captures of all 9 files were byte-identical. How the script gets there:

- Parts that never stop moving are hidden with `visibility: hidden` (their space is kept):
  the logo marquee track, the avatar badge content that cycles between "Hi" and a waving
  hand, the pulsing "available" dot, and the Turnstile widget on the rebuild.
- The pricing pages are captured with the viewport grown to the full page height, so the
  timeline cards (which hide again when they leave the viewport) are all revealed.
- The home page layout depends on viewport height, so it is captured with a 900 px viewport
  at scroll position 0. In that state the three "About me" counters read 0 and the sticky
  image beside "What I can do for you" is not shown; both only appear while their section is
  in the viewport.
