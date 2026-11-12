/**
 * Scroll-direction variant (floating nav pill), Framer "Variant on scroll direction".
 *
 * Desktop (the tokens' desktop media query): starts in the variant named by the desktop diff's root
 * ("Desktop / Open" -> data-state="open"); scrolling in `direction` switches to the other state and,
 * with `replay`, scrolling back switches back. Clicking [data-motion-trigger] (the avatar) reopens.
 * Tablet & phone: no scroll effect (motion.json note). The menu toggle script in Nav.astro owns the
 * open/closed state (it also runs under reduced motion) and dispatches "nav-toggle" on the element;
 * this module only animates the tabletPhone diff to the announced state. Diffs animate on the
 * element and its data-motion-layer descendants; properties motion can't animate are CSS on [data-state].
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

const kebab = (p: string): string => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const TRANSFORMS = new Set(["x", "y", "scale", "rotate", "rotateX", "rotateY", "skewX", "skewY"]);

/**
 * Target keyframes with every "auto" replaced by the size the layer will have once all of the
 * variant's other values have arrived. Motion measures "auto" against the layout at the start, while
 * gaps and paddings are still animating, so the pill would land a few px off and then snap.
 */
function resolveAuto(layers: LayerFrames[], next: 0 | 1): Record<string, string | number>[] {
  if (!layers.some((l) => Object.values(l.frames[next]).includes("auto"))) return layers.map((l) => l.frames[next]);
  const saved = layers.map((l) => l.el.style.cssText);
  for (const { el, frames } of layers) {
    for (const [property, value] of Object.entries(frames[next])) {
      if (!TRANSFORMS.has(property)) el.style.setProperty(kebab(property), String(value));
    }
  }
  const resolved = layers.map(({ el, frames }) =>
    Object.fromEntries(
      Object.entries(frames[next]).map(([property, value]) => {
        if (value !== "auto") return [property, value];
        const box = el.getBoundingClientRect();
        return [property, `${property === "height" ? box.height : box.width}px`];
      }),
    ),
  );
  layers.forEach((l, i) => (l.el.style.cssText = saved[i] ?? ""));
  return resolved;
}

export function scrollVariant(effect: ScrollVariant, elements: HTMLElement[], media: BreakpointMedia): void {
  const options = toMotionOptions(effect.transition);
  const desktop = media.desktop ? window.matchMedia(media.desktop) : undefined;

  for (const el of elements) {
    let layers: LayerFrames[] = [];
    let names: [string, string] = ["open", "closed"];
    let tracker = initialDirection();
    const isDesktop = (): boolean => desktop?.matches ?? false;
    const play = (next: 0 | 1): Promise<unknown> => {
      const frames = resolveAuto(layers, next);
      return Promise.all(
        layers.map((layer, i) =>
          animate(layer.el, frames[i] ?? layer.frames[next], options).finished.then(() => {
            // Hand "auto" values back to layout once they have arrived.
            for (const [property, value] of Object.entries(layer.frames[next])) {
              if (value === "auto") layer.el.style.setProperty(kebab(property), "auto");
            }
          }),
        ),
      );
    };
    const set = (next: 0 | 1): void => {
      el.dataset["state"] = names[next];
      void play(next);
    };
    const setup = (): void => {
      clearFrames(layers);
      const diff = effect.states[isDesktop() ? "desktop" : "tabletPhone"];
      layers = layerFrames(el, diff);
      names = stateNames(diff);
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

    // Desktop: clicking the avatar reopens the pill.
    el.querySelector<HTMLElement>("[data-motion-trigger]")?.addEventListener("click", () => {
      if (isDesktop()) set(0);
    });

    // Tablet & phone: animate to the state the menu toggle already set (names: [closed, open]).
    // While closing, data-closing keeps the open layout's CSS (menu shown) so the pill visibly folds
    // shut; it is dropped when the animation ends, or at once if the menu is reopened meanwhile.
    let closing = 0;
    el.addEventListener("nav-toggle", (event) => {
      if (isDesktop()) return;
      const open = (event as CustomEvent<{ open: boolean }>).detail.open;
      const next = names.indexOf(open ? "open" : "closed");
      if (next !== 0 && next !== 1) return;
      const run = ++closing;
      if (open) delete el.dataset["closing"];
      else el.dataset["closing"] = "";
      if (open && !el.style.width) {
        // First open: nothing inline yet and the open CSS already applies, so start each layer from
        // the closed layout, measured with the state briefly taken back.
        const state = el.dataset["state"];
        delete el.dataset["state"];
        const from = resolveAuto(layers, next === 1 ? 0 : 1);
        if (state !== undefined) el.dataset["state"] = state;
        layers.forEach((layer, i) => {
          for (const [property, value] of Object.entries(from[i] ?? {})) {
            if (!TRANSFORMS.has(property)) layer.el.style.setProperty(kebab(property), String(value));
          }
        });
      }
      void play(next).then(() => {
        if (run === closing && !open) delete el.dataset["closing"];
      });
    });
  }
}
