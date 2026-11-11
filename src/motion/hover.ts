/**
 * Hover effects, using motion's hover() (which ignores touch-emulated hover).
 *
 * - `to`: the element animates to that pose and back to its resting style.
 * - `states`: Framer variant diffs, layer path -> property -> [rest, hover]. Each layer is the
 *   descendant with data-motion-layer="<layer path>" (or the element itself). Animatable properties
 *   are animated; the element also gets data-hover while hovered, for properties CSS has to switch.
 */
import { animate, hover as onHover } from "motion";
import { toMotionOptions, type EffectOf } from "./transition";

type Hover = EffectOf<"hover">;
type Keyframes = Record<string, string | number>;
type Layer = { el: HTMLElement; rest: Keyframes; hover: Keyframes };

/** Framer property -> CSS / motion property. Properties not listed are left to CSS ([data-hover]). */
const PROPERTY: Record<string, string> = {
  opacity: "opacity",
  x: "x",
  y: "y",
  scale: "scale",
  rotate: "rotate",
  rotation: "rotate",
  rotateX: "rotateX",
  rotateY: "rotateY",
  skewX: "skewX",
  skewY: "skewY",
  boxShadow: "boxShadow",
  backgroundColor: "backgroundColor",
  fill: "backgroundColor",
  color: "color",
  textColor: "color",
  borderColor: "borderColor",
  width: "width",
  height: "height",
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
};
/** Resting value of a transform that the effect does not state: the identity transform. */
const IDENTITY: Keyframes = { x: 0, y: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0 };

function restOf(el: HTMLElement, property: string): string | number {
  return IDENTITY[property] ?? getComputedStyle(el).getPropertyValue(property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
}

function layersOf(effect: Hover, el: HTMLElement): Layer[] {
  const layers: Layer[] = [];
  if (effect.to) {
    const hover: Keyframes = Object.fromEntries(Object.entries(effect.to).filter((e): e is [string, string | number] => e[1] !== undefined));
    layers.push({ el, hover, rest: Object.fromEntries(Object.keys(hover).map((p) => [p, restOf(el, p)])) });
  }
  for (const [path, diff] of Object.entries(effect.states ?? {})) {
    const layer = el.dataset["motionLayer"] === path ? el : el.querySelector<HTMLElement>(`[data-motion-layer="${CSS.escape(path)}"]`);
    if (!layer) continue;
    const rest: Keyframes = {};
    const hover: Keyframes = {};
    for (const [framerProperty, [from, to]] of Object.entries(diff)) {
      const property = PROPERTY[framerProperty];
      if (!property || (typeof to !== "string" && typeof to !== "number")) continue;
      hover[property] = to;
      rest[property] = typeof from === "string" || typeof from === "number" ? from : restOf(layer, property);
    }
    layers.push({ el: layer, rest, hover });
  }
  return layers;
}

export function hover(effect: Hover, elements: HTMLElement[]): void {
  const options = toMotionOptions(effect.transition);

  for (const el of elements) {
    const layers = layersOf(effect, el);
    onHover(el, () => {
      el.toggleAttribute("data-hover", true);
      for (const layer of layers) animate(layer.el, layer.hover, options);
      return () => {
        el.toggleAttribute("data-hover", false);
        for (const layer of layers) animate(layer.el, layer.rest, options);
      };
    });
  }
}
