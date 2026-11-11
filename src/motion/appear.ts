/**
 * Appear effects. The hidden `from` pose is applied here, by JS, so the page is fully visible without it.
 *
 * - trigger "load": plays as soon as the runtime starts (Framer "On Load"); threshold does not apply.
 * - trigger "inView": the element itself is observed; it is in view once the visible share of
 *   its height reaches the effect's threshold.
 * - trigger "sectionInView": the element's scroll section (closest [data-motion-target], Framer's
 *   "Section in View") is observed; it is in view while the section crosses the line `threshold` of the
 *   way down the viewport.
 * - replay false: plays once. replay true: returns to `from` on leaving and plays again.
 * - data-motion-row="<n>" picks that row's `from` / `threshold` override from the effect's `rows`.
 */
import { animate } from "motion";
import type { Pose } from "../content/schema";
import { toMotionOptions, type EffectOf } from "./transition";

type Appear = EffectOf<"appear">;

function rowOf(effect: Appear, el: HTMLElement): NonNullable<Appear["rows"]>[number] | undefined {
  const row = Number(el.dataset["motionRow"]);
  return effect.rows?.find((r) => r.row === row);
}

/** Share of the element's height (or of the viewport, if the element is taller) that is visible. */
function visibleShare(entry: IntersectionObserverEntry): number {
  const height = entry.boundingClientRect.height;
  if (height === 0) return entry.isIntersecting ? 1 : 0;
  return entry.isIntersecting ? entry.intersectionRect.height / Math.min(height, window.innerHeight) : 0;
}

export function appear(effect: Appear, elements: HTMLElement[]): void {
  const options = toMotionOptions(effect.transition);

  for (const el of elements) {
    const row = rowOf(effect, el);
    const from: Pose = row?.from ?? effect.from;
    const threshold = row?.threshold ?? effect.threshold;
    let shown = false;
    let played = false;

    animate(el, from, toMotionOptions({ type: "instant" }));

    const update = (inView: boolean): void => {
      if (inView === shown) return;
      if (inView && played && !effect.replay) return;
      if (!inView && !effect.replay) return;
      shown = inView;
      played ||= inView;
      animate(el, inView ? effect.to : from, options);
    };

    if (effect.trigger === "load") {
      // Framer "On Load" (onMount): plays once the page has loaded, wherever the element is.
      update(true);
    } else if (effect.trigger === "sectionInView") {
      const section = el.closest<HTMLElement>("[data-motion-target]") ?? el;
      const above = `${-threshold * 100}%`;
      const below = `${-(1 - threshold) * 100}%`;
      new IntersectionObserver(([entry]) => entry && update(entry.isIntersecting), {
        rootMargin: `${above} 0px ${below} 0px`,
      }).observe(section);
    } else {
      new IntersectionObserver(([entry]) => entry && update(visibleShare(entry) >= threshold), {
        threshold: [0, threshold],
      }).observe(el);
    }
  }
}
