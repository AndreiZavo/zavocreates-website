/**
 * Loops (submit button spinner): from the resting pose to `to`, repeated forever per `repeat`.
 * Returns the running animations so a caller that starts a loop on demand can stop it.
 */
import { animate, type AnimationOptions } from "motion";
import { computedOf } from "./states";
import { toMotionOptions, type EffectOf } from "./transition";

export type LoopControls = ReturnType<typeof animate>;

export function loop(effect: EffectOf<"loop">, elements: HTMLElement[]): LoopControls[] {
  const options = { ...toMotionOptions(effect.transition), repeat: Infinity, repeatType: effect.repeat } as AnimationOptions;
  return elements.map((el) => {
    const keyframes = Object.fromEntries(
      Object.entries(effect.to)
        .filter((e): e is [string, string | number] => e[1] !== undefined)
        .map(([property, to]) => [property, [computedOf(el, property), to]]),
    );
    return animate(el, keyframes, options);
  });
}
