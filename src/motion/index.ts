/**
 * Motion runtime entry. The layout serialises the effects a page uses (content/motion.json) into
 * <script type="application/json" id="motion-config"> and calls initMotion with them.
 *
 * Markup contract: an element carries data-motion="<effect id>" (one effect per element; nest a
 * wrapper to combine two). Nothing here runs under prefers-reduced-motion: reduce, and hidden
 * starting states are only ever applied by these modules, so without JS everything is visible.
 *
 * Kinds without a module: "page" (CSS view transition in global.css), "sticky" and "marquee" (CSS),
 * and "loop", "scrollVariant", "cursor" and timer-driven "variant" (not built yet).
 */
import type { Effect } from "../content/schema";
import { appear } from "./appear";
import { counter } from "./counter";
import { hover } from "./hover";
import { scrollTransform, type BreakpointMedia } from "./scrollTransform";
import { smoothScroll } from "./smoothScroll";
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
        variant(effect, elements);
        break;
      case "counter":
        counter(effect, elements);
        break;
      default:
        break;
    }
  }
}
