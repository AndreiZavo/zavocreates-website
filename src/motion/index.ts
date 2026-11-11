/**
 * Motion runtime entry. Base.astro serialises the effects a page uses (content/motion.json: every
 * page:"all" effect plus the ids the page passes in its `motion` prop) into
 * <script type="application/json" id="motion-config"> and calls initMotion with them.
 * Nothing runs under prefers-reduced-motion: reduce, and hidden starting states are only ever
 * applied by these modules, so without JS everything is visible.
 *
 * Markup hooks (the one place to look):
 * - data-motion="<effect id>"        element the effect drives (one effect per element; nest wrappers to combine)
 * - data-motion-row="<n>"            appear: use rows[n] from/threshold; scroll: use rows[n-1].sections
 * - data-motion-target="<framerId>"  scroll targets (scrollTransform)
 * - data-motion-layer="<layer path>" descendant layer of a Framer variant diff (hover states/pressed,
 *                                    timer glow, nav.scroll), e.g. "Desktop/Color BG"; the root path
 *                                    ("Desktop / Open") is the data-motion element itself
 * - data-motion-panel                accordion panel whose height animates (variant.ts)
 * - <summary> or data-motion-trigger accordion toggle (variant.ts); nav avatar / menu toggle (scrollVariant.ts)
 * - data-motion-group                groups accordion items (one open at a time); default: parent element
 * - data-motion-track                Circle Badge track that slides inside its window (timer.ts cycle)
 * - data-cursor="blend"              custom cursor switches to its blending style over this element
 * - data-form-spinner                submit button spinner: "button.submit.spinner" loop, started by
 *                                    src/scripts/contact-form.ts only while a submission is pending
 * Written by the runtime (style these in CSS):
 * - html.motion-ready                runtime started; html.lenis* (Lenis); html.motion-cursor (native cursor hidden)
 * - data-state                       accordions "open|closed"; nav "open|closed"; badge cycle "<variant name>"
 * - data-shows="text|lottie"         badge cycle: which face is showing (start/stop the Lottie on it)
 * - data-hover, data-pressed         hover effects, for properties CSS has to switch
 * - [data-motion-cursor]             the custom cursor element (appended to <body>)
 *
 * Kinds with no module: "page" (CSS view transition in global.css), "sticky" and "marquee" (CSS).
 */
import type { Effect } from "../content/schema";
import { appear } from "./appear";
import { counter } from "./counter";
import { cursor } from "./cursor";
import { hover } from "./hover";
import { loop } from "./loop";
import { scrollTransform, type BreakpointMedia } from "./scrollTransform";
import { scrollVariant } from "./scrollVariant";
import { smoothScroll } from "./smoothScroll";
import { timer } from "./timer";
import { variant } from "./variant";

export type { BreakpointMedia };

export function initMotion(effects: Record<string, Effect>, media: BreakpointMedia = {}): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("motion-ready");

  for (const [id, effect] of Object.entries(effects)) {
    const elements = [...document.querySelectorAll<HTMLElement>(`[data-motion="${CSS.escape(id)}"]`)];
    switch (effect.kind) {
      case "smoothScroll":
        smoothScroll(effect);
        break;
      case "appear":
        appear(effect, elements);
        break;
      case "scroll":
        scrollTransform(effect, elements, media);
        break;
      case "hover":
        hover(effect, elements);
        break;
      case "variant":
        if (effect.trigger === "timer") timer(effect, elements);
        else variant(effect, elements);
        break;
      case "scrollVariant":
        scrollVariant(effect, elements, media);
        break;
      case "counter":
        counter(effect, elements);
        break;
      case "loop":
        loop(effect, elements);
        break;
      case "cursor":
        cursor(effect, media.desktop);
        break;
      default:
        break;
    }
  }
}
