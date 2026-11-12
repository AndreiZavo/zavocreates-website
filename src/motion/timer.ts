/**
 * Timer variants (Framer "After delay" variant switches).
 *
 * - `cycle` (Circle Badge "Hi" / waving hand): each step holds for its holdSeconds, then the next step
 *   is shown with the effect's transition; `loop` starts over. The element gets data-state="<variant>"
 *   and data-shows="text|lottie"; its [data-motion-track] child slides to the step's stackDistribution
 *   (start = top, center, end = bottom of the track inside the element's window).
 * - `states` + `holdSeconds` (availability glow): rest state A, after holdSeconds animate to B with
 *   `transition`, then back to A with `returnTransition`; `loop` repeats.
 */
import { animate } from "motion";
import { layerFrames, type StateDiff } from "./states";
import { toMotionOptions, type EffectOf } from "./transition";

type Variant = EffectOf<"variant">;
type Step = NonNullable<Variant["cycle"]>[number];

const ms = (seconds: number): number => seconds * 1000;
const wait = (seconds: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms(seconds)));

/** Index of the step after `index`, or undefined when a non-looping cycle has ended. */
export function nextStep(count: number, index: number, loop: boolean): number | undefined {
  const next = index + 1;
  if (next < count) return next;
  return loop && count > 0 ? 0 : undefined;
}

function trackOffset(el: HTMLElement, track: HTMLElement, distribution: string): number {
  const free = el.clientHeight - track.offsetHeight;
  if (distribution === "end") return free;
  if (distribution === "center") return free / 2;
  return 0;
}

function cycle(effect: Variant, steps: Step[], elements: HTMLElement[]): void {
  const options = toMotionOptions(effect.transition);
  const instant = toMotionOptions({ type: "instant" });
  for (const el of elements) {
    const track = el.querySelector<HTMLElement>("[data-motion-track]");
    const show = (step: Step, opts: typeof options): void => {
      el.dataset["state"] = step.variant;
      el.dataset["shows"] = step.shows;
      if (track) animate(track, { y: trackOffset(el, track, step.stackDistribution) }, opts);
    };
    let index = 0;
    const first = steps[0];
    if (!first) continue;
    show(first, instant);
    const tick = (): void => {
      const next = nextStep(steps.length, index, effect.loop ?? false);
      const step = next === undefined ? undefined : steps[next];
      if (next === undefined || !step) return;
      index = next;
      show(step, options);
      window.setTimeout(tick, ms(step.holdSeconds));
    };
    window.setTimeout(tick, ms(first.holdSeconds));
  }
}

function pulse(effect: Variant, diff: StateDiff, hold: number, elements: HTMLElement[]): void {
  const forward = toMotionOptions(effect.transition);
  const back = toMotionOptions(effect.returnTransition ?? { type: "instant" });
  for (const el of elements) {
    const layers = layerFrames(el, diff);
    const run = async (): Promise<void> => {
      await wait(hold);
      await Promise.all(layers.map((l) => animate(l.el, l.frames[1], forward).finished));
      await Promise.all(layers.map((l) => animate(l.el, l.frames[0], back).finished));
      if (effect.loop) void run();
    };
    void run();
  }
}

export function timer(effect: Variant, elements: HTMLElement[]): void {
  if (effect.trigger !== "timer") return;
  if (effect.cycle) return cycle(effect, effect.cycle, elements);
  const states = effect.states;
  if (!states || effect.holdSeconds === undefined) return;
  const diff = "desktop" in states && "tabletPhone" in states ? (states["desktop"] as StateDiff) : (states as StateDiff);
  pulse(effect, diff, effect.holdSeconds, elements);
}
