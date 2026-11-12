/**
 * Hover effects, using motion's hover() (which ignores touch-emulated hover).
 *
 * - `to`: the element animates to that pose and back to its resting style.
 * - `states`: Framer variant diffs [rest, hover] on the element and its data-motion-layer descendants.
 * - `pressed`: diffs [rest, pressed], applied on pointer down and released on up, cancel or leave
 *   (back to the hover values while the pointer is still over the element).
 * The element also gets data-hover / data-pressed, for properties CSS has to switch.
 */
import { animate, hover as onHover } from "motion";
import { computedOf, layerFrames, type Keyframes, type LayerFrames } from "./states";
import { toMotionOptions, type EffectOf } from "./transition";

type Hover = EffectOf<"hover">;

function poseLayer(effect: Hover, el: HTMLElement): LayerFrames[] {
  if (!effect.to) return [];
  const active: Keyframes = Object.fromEntries(
    Object.entries(effect.to).filter((e): e is [string, string | number] => e[1] !== undefined),
  );
  const rest: Keyframes = Object.fromEntries(Object.keys(active).map((p) => [p, computedOf(el, p)]));
  return [{ el, frames: [rest, active] }];
}

export function hover(effect: Hover, elements: HTMLElement[]): void {
  const options = toMotionOptions(effect.transition);

  for (const el of elements) {
    const hoverLayers = [...poseLayer(effect, el), ...layerFrames(el, effect.states ?? {})];
    const pressLayers = layerFrames(el, effect.pressed ?? {});
    const play = (layers: LayerFrames[], side: 0 | 1): void => {
      for (const layer of layers) animate(layer.el, layer.frames[side], options);
    };

    onHover(el, () => {
      el.toggleAttribute("data-hover", true);
      // Hover targets are re-read now: edge-pinned widths (states.ts pinEdges) follow the element's
      // current size, which web fonts or the viewport may have changed since load.
      const fresh = [...poseLayer(effect, el), ...layerFrames(el, effect.states ?? {})];
      fresh.forEach((layer, i) => {
        const known = hoverLayers[i];
        if (known && known.el === layer.el) known.frames[1] = layer.frames[1];
      });
      play(hoverLayers, 1);
      return () => {
        el.toggleAttribute("data-hover", false);
        play(hoverLayers, 0);
      };
    });

    if (pressLayers.length === 0) continue;
    /** Pressed layer released: its rest values, or the hover values while still hovered. */
    const released = (layer: LayerFrames): Keyframes => {
      if (!el.hasAttribute("data-hover")) return layer.frames[0];
      const hovered = Object.assign({}, ...hoverLayers.filter((h) => h.el === layer.el).map((h) => h.frames[1])) as Keyframes;
      return Object.fromEntries(Object.entries(layer.frames[0]).map(([k, v]) => [k, hovered[k] ?? v]));
    };
    const release = (): void => {
      if (!el.hasAttribute("data-pressed")) return;
      el.toggleAttribute("data-pressed", false);
      for (const layer of pressLayers) animate(layer.el, released(layer), options);
    };
    el.addEventListener("pointerdown", () => {
      el.toggleAttribute("data-pressed", true);
      play(pressLayers, 1);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) el.addEventListener(type, release);
  }
}
