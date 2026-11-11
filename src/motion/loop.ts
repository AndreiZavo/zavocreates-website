/** Always-running loops (submit button spinner): from the resting pose to `to`, repeated forever per `repeat`. */
import { animate, type AnimationOptions } from "motion";
import { computedOf } from "./states";
import { toMotionOptions, type EffectOf } from "./transition";

export function loop(effect: EffectOf<"loop">, elements: HTMLElement[]): void {
  const options = { ...toMotionOptions(effect.transition), repeat: Infinity, repeatType: effect.repeat } as AnimationOptions;
  for (const el of elements) {
    const keyframes = Object.fromEntries(
      Object.entries(effect.to)
        .filter((e): e is [string, string | number] => e[1] !== undefined)
        .map(([property, to]) => [property, [computedOf(el, property), to]]),
    );
    animate(el, keyframes, options);
  }
}
