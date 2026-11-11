/**
 * Framer transition (content/motion.json) -> motion.dev options.
 * Framer runs on the same engine, so every value is passed through unchanged:
 * times are already seconds, springs keep stiffness/damping/mass or duration/bounce.
 */
import type { AnimationOptions, SpringOptions, ValueAnimationTransition } from "motion";
import type { Effect, Transition } from "../content/schema";

/** One effect kind out of the Effect union. */
export type EffectOf<K extends Effect["kind"]> = Extract<Effect, { kind: K }>;

const defined = <T extends Record<string, unknown>>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };

function convert(t: Transition) {
  switch (t.type) {
    case "spring":
      return defined({
        type: "spring" as const,
        stiffness: t.stiffness,
        damping: t.damping,
        mass: t.mass,
        duration: t.duration,
        bounce: t.bounce,
        delay: t.delay,
      });
    case "tween":
      return defined({ duration: t.duration, ease: t.ease, delay: t.delay });
    case "instant":
      // Framer has no animated transition here: the value is applied at once.
      return { duration: 0 };
  }
}

/** Options for animate(element, keyframes, options). */
export const toMotionOptions = (t: Transition): AnimationOptions => convert(t);

/** The same values, typed for animating a plain number: animate(from, to, options). */
export const toValueOptions = (t: Transition): ValueAnimationTransition<number> => convert(t);

/**
 * Options for motion's springValue(), which smooths a scroll-linked value.
 * Only a physics spring (stiffness/damping/mass) qualifies; anything else means "follow the scroll directly".
 */
export function toSpringOptions(t: Transition): SpringOptions | undefined {
  if (t.type !== "spring" || t.stiffness === undefined) return undefined;
  return defined({ stiffness: t.stiffness, damping: t.damping, mass: t.mass });
}
