/** Smooth Scroll: Lenis, configured the way Framer's "Smooth Scroll" component configures it. */
import Lenis from "lenis";
import type { EffectOf } from "./transition";

/**
 * The Framer component maps its Intensity control to Lenis as `duration: intensity / 10`
 * (read from the published site bundle). This divisor is the component's own unit conversion.
 */
const INTENSITY_PER_SECOND = 10;

export function smoothScroll(effect: EffectOf<"smoothScroll">): Lenis {
  return new Lenis({ duration: effect.intensity / INTENSITY_PER_SECOND, autoRaf: true });
}
