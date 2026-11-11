/**
 * Appear effects. The hidden `from` pose is applied here, by JS, so the page is fully visible without it.
 *
 * - trigger "load": plays as soon as the runtime starts (Framer "On Load"); threshold does not apply.
 * - trigger "inView": the element itself is observed; it is in view once the visible share of
 *   its height reaches the effect's threshold.
 * - trigger "sectionInView" (Framer "onScrollTarget" with no target section, used by the pricing
 *   timeline): the element's own layout box, without the appear transform, is in view once the visible
 *   share of its height reaches the threshold. Measured on scroll, because the `from` pose (x ±150px)
 *   can push the transformed box partly off screen, which an IntersectionObserver would count.
 *   Checked against the Framer baselines: on the phone /pricing capture the row-5 card (72% visible,
 *   threshold 0.8) stays hidden.
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

/** The same share for the element's layout box (offsets ignore transforms). */
function layoutShare(el: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  top -= window.scrollY;
  const height = el.offsetHeight;
  const visible = Math.min(top + height, window.innerHeight) - Math.max(top, 0);
  if (height === 0) return visible >= 0 ? 1 : 0;
  return Math.max(0, visible) / Math.min(height, window.innerHeight);
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
      let queued = false;
      const check = (): void => {
        queued = false;
        update(layoutShare(el) >= threshold);
      };
      const schedule = (): void => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(check);
      };
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      void document.fonts.ready.then(schedule); // web fonts can move the box
      check();
    } else {
      new IntersectionObserver(([entry]) => entry && update(visibleShare(entry) >= threshold), {
        threshold: [0, threshold],
      }).observe(el);
    }
  }
}
