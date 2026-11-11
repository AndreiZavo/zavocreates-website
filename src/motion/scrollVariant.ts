/**
 * Scroll-direction variant (floating nav pill), Framer "Variant on scroll direction".
 *
 * Desktop (the tokens' desktop media query): starts in the variant named by the desktop diff's root
 * ("Desktop / Open" -> data-state="open"); scrolling in `direction` switches to the other state and,
 * with `replay`, scrolling back switches back. Clicking [data-motion-trigger] (the avatar) reopens.
 * Tablet & phone: no scroll effect (motion.json note); [data-motion-trigger] (the menu toggle)
 * toggles between the tabletPhone diff's two states. Diffs animate on the element and its
 * data-motion-layer descendants; properties motion can't animate are CSS on [data-state].
 */
import { animate, scroll } from "motion";
import type { BreakpointMedia } from "./scrollTransform";
import { clearFrames, isRootPath, layerFrames, variantOf, type LayerFrames, type StateDiff } from "./states";
import { toMotionOptions, type EffectOf } from "./transition";

type ScrollVariant = EffectOf<"scrollVariant">;
type Direction = "up" | "down";
export type DirectionState = { last: number | undefined; dir: Direction | undefined; anchor: number; matched: boolean };

/**
 * Framer's runtime ignores direction changes until the page has moved this many px from where the
 * direction last changed. A runtime constant, not a per-effect value, so it is not in motion.json.
 */
export const MIN_DISTANCE = 4;

export const initialDirection = (): DirectionState => ({ last: undefined, dir: undefined, anchor: 0, matched: false });

/** One scroll sample through Framer's direction tracker. `matched` = the page scrolls in `wanted`. */
export function stepDirection(s: DirectionState, y: number, wanted: Direction, replay: boolean, minDistance: number): DirectionState {
  if (!replay && s.matched) return s;
  const dir: Direction = s.last !== undefined && y < s.last ? "up" : "down";
  if (dir !== s.dir) return { last: y, dir, anchor: y, matched: s.matched };
  if (Math.abs(y - s.anchor) < minDistance) return { ...s, last: y };
  return { ...s, last: y, matched: dir === wanted };
}

/** [state of variant A, state of variant B] from the diff's root variant name ("Desktop / Open"). */
export function stateNames(diff: StateDiff): [string, string] {
  const paths = Object.keys(diff);
  const root = paths.find(isRootPath) ?? variantOf(paths[0] ?? "");
  const initial = (root.split(" / ").pop() ?? "").trim().toLowerCase();
  return [initial, initial === "open" ? "closed" : "open"];
}

export function scrollVariant(effect: ScrollVariant, elements: HTMLElement[], media: BreakpointMedia): void {
  const options = toMotionOptions(effect.transition);
  const desktop = media.desktop ? window.matchMedia(media.desktop) : undefined;

  for (const el of elements) {
    let layers: LayerFrames[] = [];
    let names: [string, string] = ["open", "closed"];
    let side: 0 | 1 = 0;
    let tracker = initialDirection();
    const isDesktop = (): boolean => desktop?.matches ?? false;
    const set = (next: 0 | 1): void => {
      side = next;
      el.dataset["state"] = names[next];
      for (const layer of layers) animate(layer.el, layer.frames[next], options);
    };
    const setup = (): void => {
      clearFrames(layers);
      const diff = effect.states[isDesktop() ? "desktop" : "tabletPhone"];
      layers = layerFrames(el, diff);
      names = stateNames(diff);
      side = 0;
      tracker = initialDirection();
      el.dataset["state"] = names[0];
    };
    setup();
    desktop?.addEventListener("change", setup);

    scroll((_progress, info) => {
      if (!isDesktop() || info.y.current < 0 || info.y.current > info.y.scrollLength) return;
      const next = stepDirection(tracker, info.y.current, effect.direction, effect.replay, MIN_DISTANCE);
      if (next.matched !== tracker.matched) set(next.matched ? 1 : 0);
      tracker = next;
    });

    el.querySelector<HTMLElement>("[data-motion-trigger]")?.addEventListener("click", () => {
      if (isDesktop()) set(0);
      else set(side === 0 ? 1 : 0);
    });
  }
}
