# Framer extraction

How `content/*.json`, `public/images/`, `public/icons/` and `public/lottie/` were produced from the Framer project "Zavo Videographer Portfolio" (`zmfPMMI2Y6hkElhFQePk`), on 2026-11-10.

## Method

1. An agent session opened the project through the Framer MCP connector and ran the six programs in `programs/`. They only call read methods (`serialize`, `serializeNodes`, `getNodesOfTypes`, `walk`, `getAncestorsFor`, `toSVG`). Every run reported `tree.changedNodeCount: 0`, so nothing in the Framer project was changed.
2. The unmodified results are stored gzipped in `raw/` (about 150 KB):

   | Program | Raw dump | Contents |
   |---|---|---|
   | `01-pages-and-root.js` | `01-pages.json.gz` | pages, breakpoint frames, root SEO metadata |
   | `02-home-breakpoints.js` | `02-home-breakpoints.json.gz` | `/` Desktop, Tablet, Phone at full depth |
   | `03-pricing-breakpoints-and-template.js` | `03-pricing-breakpoints-and-template.json.gz` | `/pricing`, `/pricing-ro` (3 breakpoints each), the "Main" layout template |
   | `04-project-inventory.js` | `04-project-inventory.json.gz` | node counts, components, code files, text presets, colour tokens |
   | `05-components.js` | `05-components.json.gz` | all 18 components used by those pages, every variant |
   | `06-subcomponents-svg-icons.js` | `06-subcomponents-svg-icons.json.gz` | Avatar Status, Secondary Button, link presets, SVG exports, icon/Lottie usage |

3. `transform.py` turns the dumps into `content/*.json` (`python3 -I docs/extraction/transform.py`). It reads every visible string by Framer node id or component control, and refuses (exits) if a node it reads is hidden.
4. Images were downloaded with plain `curl` from `https://framerusercontent.com/images/<hash>.<ext>` (originals, no resize parameters), the Lottie file from `https://framerusercontent.com/assets/<hash>.json`. Icons are the matching SVGs from the Iconoir (`iconoir@7.11.0`) and Phosphor (`@phosphor-icons/core@2.1.1`) packages on unpkg, because Framer renders them from those libraries rather than storing them.
5. `tests/unit/content.test.ts` checks the files against the zod schemas in `src/content/schema.ts` and checks key values.

The live site (zavocreates.com) was fetched once, only to cross-check (prices, dark-mode CSS, the RO page meta). The live HTML contains hidden text too, for example "Interaction design and micro-animations" under every FAQ, so it was never used as a source.

## Hidden-content rule

A string counts as content only if a visitor sees it:

- the node and all its ancestors have `visible !== false` **on that breakpoint** (each breakpoint is checked separately, because replicas override visibility);
- for component instances, only the values that reach a visible slot in the variant actually shown count. Defaults that an instance control overrides are not content.

The standard example is the Service accordion. The `Service Accordion` component has four `Service Bullet Point` slots. Slot 4 has the literal text "Interaction design and micro-animations" and is `visible: false` in the Open variant, the only state in which bullets show. It is never read. The same applies to the FAQ (`Questions Accordion Wrap` / `… RO`), which reuses the same component.

Second case: bullet text belongs to the state in which it is visible. `Service Accordion Wrap` has one variant per open item. In "Desktop / Closed", service 4 has the template bullets "Brand strategy and identity development", "Visual style guide creation", "Typography and color scheme selection". Those are never shown, because the bullets are collapsed (height 1px, overflow hidden). Only "Desktop / Open - 4" shows service 4's bullets, and there they are "Craft a smooth, story-driven edit" and the others. So `transform.py` takes each item's **title from the Closed variant** and its **3 bullets from its own "Open - N" variant**.

## What was excluded

- `/timeline-demo` (`e2hAQE4wA`) and all its nodes.
- The hidden second Logo Carrousel on desktop and tablet (`tT5lG70z0`). On phone the other instance is hidden, and both use the same 8 logos.
- The hidden project frames: desktop/tablet Client #1's Demmers frame, phone Client #1's Envato thumbnail, and phone Clients #4, #5, #6. The phone shows only three projects (see `home.projectOrder.phone`).
- Custom Cursor variants "Project Hover" and "Service - 1…4", plus their three stock images ("Woman at Creative Workspace", "Casual Tablet Reader…", "Modern Workspace…"). No visible layer uses them: the Service accordion's cursor variables have no value on the home page.
- Hidden timeline lines (rows 2–5 each carry a hidden extra `Line`; row 5 has no visible line at all).
- Unused components (FAQ Accordion, Testimonial Card, Blog Card, …), the Logo Crystal shader, the fonts Palmore / Inkbleed / STRUKO / Poppins, the code files `Switch.tsx` and `Phosphor_1.tsx`, and the Star Ratings and Get Template Button Phosphor icons. They are not on the three pages.

## Code components and icons actually used

| Code / module | Where | What it needs |
|---|---|---|
| `Lottie_Icon.tsx` | Circle Badge Animate ("Hi" badge on the hero avatar card and the contact avatar) | `public/lottie/hand-wave.json` (Lottie 5.7.4, 1080×1080, 25 fps, 250 frames), loop, speed 1 |
| Phosphor (external module) | Footer social icons | `instagram-logo`, `tiktok-logo`, `threads-logo`, weight `fill`, 24px, white |
| Iconoir (external module) | Accordion chevron, bullet ticks, custom-cursor arrow | `nav-arrow-down` (30px), `check-circle` (20×27 desktop, 16×24 tablet/phone), `arrow-right` |
| Ticker | Logo Carrousel | `motion.json` → `home.logos.marquee` |
| Animated Number Counter | Number Card | `motion.json` → `home.counter` |
| Smooth Scroll | one instance per page | `motion.json` → `smoothScroll` (intensity 10) |
| Negative_Margin | hero name ("Andrei Zavo") | margin −10px on desktop/tablet, 0 on phone (recorded in `layout.json` as a component) |
| Layout Jump Preventer, Stop Scroll | accordion wraps, nav | no visual output |

Vectors drawn in Framer (Moft logo, Blitz logo, Blitz project badge, play icon) were exported with `tree.toSVG` into `public/images/*.svg`. Framer can't export the Blitz badge frame itself, because it holds a clipped frame. `badge-blitz.svg` rebuilds it from the exported wordmark exactly as the frame does: a white 80px circle at (5,1) and the wordmark clipped to 50×50 at (23,18).

## Output files

- `site.json`: SEO meta, contact data, the nav and footer from the layout template.
- `home.json`, `pricing.en.json`, `pricing.ro.json`: visible text, links and images. Where Framer's Tablet & Phone variants show different copy, it is under `tabletPhone` (services, FAQ) or `footnotePhone`. Project order per breakpoint is in `home.projectOrder`.
- `tokens.json`: breakpoints, colours (light **and** dark: the live site switches on `prefers-color-scheme: dark`), text presets per breakpoint, link styles, the gaps/paddings/radii in use, and shadows.
- `motion.json`: every effect, keyed by a stable id. Times are in seconds and distances in px/deg. Accordion, nav and button states are given as property diffs between Framer variants (`[from, to]`).
- `layout.json`: per page and breakpoint, the visible layer tree with layout values (sizes, stacks/grids, gaps, padding, fills, radii, borders, positions, z-index, sticky), plus every used component per variant. Colours are written as `var(--color-<token>)`.

## Content addition (intentional)

`pricing.ro.json` `title` / `description`: Framer serves the English site meta on `/pricing-ro` (pages have no own SEO settings, so all three use the site title). The spec requires Romanian meta, so these two strings are a faithful Romanian translation of the site title/description. Nothing else was written by hand except image `alt` text: Framer has alt text on one image only ("Portrait of portfolio creator"). The other alts come from the brand/layer name, or are empty for decorative images.

## Uncertainties

- **Breakpoint-specific copy.** Framer's Tablet & Phone accordion variants contain copy edits: "Capture supporting b-roll", "4. Post-Production" (closed title only), FAQ 2 "How does the schedule work?" (closed title only) with a double space in "your  package", and two RO lines with dashes. The files record these exactly, as visitors see them. They look like unfinished edits; the owner may want one version.
- **Title changes with state on tablet/phone.** There the title of service 4 / FAQ 2 differs between the Closed variant and the other variants, so it changes once another item is opened. The content keeps the initial (Closed) title.
- **Footer phone link** is `tel:+1 (555) 123-4567`, a template default. The visible text is "+40 799 853 625". It is copied as Framer has it (`site.footer.phoneHref`) and flagged for the owner.
- **Missing scroll target.** The hero badge's "Scroll Section In" target (`fsscpsFUj`) no longer exists in Framer, so the badge never reappears after shrinking at the Service section. On `/pricing-ro` the timeline line-fill targets still point at the EN page's rows. Both are noted in `motion.json`.
- **Scroll reveals.** The spec mentions "9 elements" for home scroll reveals. Framer has 3 appear effects on home (avatar flip, hero left, hero right), all on load, plus scroll-linked transforms on the avatar card and the badge. There are no other appear effects on `/`.
- Brief vs Framer: the Test package costs **500 RON** in Framer and on the live site, not 450.
- The submit button's loading spinner uses a mask SVG (`pGiXYozQ3mE4cilNOItfe2L2fUA.svg`) that the CDN refuses (403/404). It is only seen during submission and can be rebuilt as a CSS ring mask.
- "Body Large" (the "Hi" badge text) has no font family set in Framer. `tokens.json` uses Inter, Framer's default.

## Could this run headless (Framer Server API)?

Mostly yes, though it was not tried here (it needs an API key, and no account or key was created). Framer's Server API is the npm package `framer-api`. A Node script calls `connect(projectUrl, apiKey)` with an API key created in the project's Site Settings, then reads the project without the editor ([quick start](https://www.framer.com/developers/server-api-quick-start), [examples](https://github.com/framer/server-api-examples)). The client exposes the Plugin API's read methods (nodes, children, attributes, CMS), not the MCP connector's `api.tree` helper used in `programs/`. So the six programs would have to be ported to Plugin-API calls (`getNodesWithType`, `getChildren`, node attributes). After that, `transform.py` could run unchanged in CI on a schedule, to detect when the Framer project and `content/` drift apart. Until then, re-running means opening an MCP session, running `programs/01…06`, replacing `raw/`, and running `transform.py`.
