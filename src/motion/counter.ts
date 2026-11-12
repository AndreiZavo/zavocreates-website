/**
 * Number counters. The HTML always holds the real final value ("100", "1,000", with any prefix or
 * suffix around it); when the element scrolls into view the number counts from the effect's `start`
 * up to that value. With `replay` it counts again each time it re-enters.
 */
import { animate, inView } from "motion";
import { toValueOptions, type EffectOf } from "./transition";

type Counter = EffectOf<"counter">;

export function counter(effect: Counter, elements: HTMLElement[]): void {
  const options = toValueOptions(effect.transition);
  const format = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: effect.decimals,
    maximumFractionDigits: effect.decimals,
    useGrouping: effect.commas,
  });

  for (const el of elements) {
    const original = el.textContent ?? "";
    const match = /\d[\d,]*(\.\d+)?/.exec(original);
    if (!match) continue;
    const target = Number(match[0].replaceAll(",", ""));
    const prefix = original.slice(0, match.index);
    const suffix = original.slice(match.index + match[0].length);
    let done = false;

    inView(el, () => {
      if (done && !effect.replay) return;
      done = true;
      const controls = animate(effect.start, target, {
        ...options,
        onUpdate: (value) => {
          el.textContent = `${prefix}${format.format(value)}${suffix}`;
        },
        onComplete: () => {
          el.textContent = original;
        },
      });
      return () => {
        controls.stop();
        el.textContent = original;
      };
    });
  }
}
