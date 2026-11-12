/** Smooth Scroll: Lenis, configured the way Framer's "Smooth Scroll" component configures it. */
import Lenis from "lenis";
import type { EffectOf } from "./transition";

/**
 * The Framer component maps its Intensity control to Lenis as `duration: intensity / 10`
 * (read from the published site bundle). This divisor is the component's own unit conversion.
 */
const INTENSITY_PER_SECOND = 10;

let instance: Lenis | undefined;

export function smoothScroll(effect: EffectOf<"smoothScroll">): Lenis {
  instance = new Lenis({ duration: effect.intensity / INTENSITY_PER_SECOND, autoRaf: true });
  return instance;
}

/**
 * Scroll to `target` with the page's smooth scroll (same Lenis duration as wheel scrolling). Without
 * the motion runtime (reduced motion) there is no Lenis and the page jumps, like a plain anchor.
 */
export function scrollToElement(target: HTMLElement): void {
  if (instance) instance.scrollTo(target);
  else target.scrollIntoView();
}
