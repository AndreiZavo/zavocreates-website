/**
 * Framer variant diffs (content/motion.json: layer path -> property -> [variant A, variant B]) turned
 * into motion keyframes on the matching DOM layers. Shared by hover, timer and scrollVariant.
 *
 * A layer path is "<variant name>/<layer>/<layer>…". Variant names use " / " (with spaces), layer
 * separators are a bare "/". The variant root is the effect's element; deeper layers are its
 * descendants with data-motion-layer="<full layer path>".
 */
import type { EffectOf } from "./transition";

export type StateDiff = NonNullable<EffectOf<"hover">["states"]>;
export type Keyframes = Record<string, string | number>;
/** frames[0] = variant A (rest), frames[1] = variant B (active). */
export type LayerFrames = { el: HTMLElement; frames: [Keyframes, Keyframes] };

/** Framer property -> motion / CSS property. Unlisted properties are left to CSS on data-state / data-hover. */
export const PROPERTY: Record<string, string> = {
  opacity: "opacity",
  x: "x",
  y: "y",
  scale: "scale",
  rotate: "rotate",
  rotation: "rotate",
  rotateZ: "rotate",
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
  gap: "gap",
  padding: "padding",
  paddingTop: "paddingTop",
  paddingRight: "paddingRight",
  paddingBottom: "paddingBottom",
  paddingLeft: "paddingLeft",
};
/** Resting value of a transform an effect does not state: the identity transform. */
export const IDENTITY: Keyframes = { x: 0, y: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0 };

const LAYER_SEPARATOR = /(?<! )\/(?! )/;
/** "Desktop / Open/Scroll Hide Wrap" -> "Desktop / Open" */
export const variantOf = (path: string): string => path.split(LAYER_SEPARATOR)[0] ?? path;
/** True when the path names the variant root itself ("Desktop / Open", "Desktop"). */
export const isRootPath = (path: string): boolean => !LAYER_SEPARATOR.test(path);

const kebab = (p: string): string => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const computedOf = (el: HTMLElement, property: string): string | number =>
  IDENTITY[property] ?? getComputedStyle(el).getPropertyValue(kebab(property));

/** Values motion can animate: numbers and CSS strings, not grid fractions or booleans. */
const usable = (v: unknown): v is string | number =>
  typeof v === "number" || (typeof v === "string" && v !== "" && !v.endsWith("fr"));

export function layerOf(root: HTMLElement, path: string): HTMLElement | null {
  if (isRootPath(path) || root.dataset["motionLayer"] === path) return root;
  return root.querySelector<HTMLElement>(`[data-motion-layer="${CSS.escape(path)}"]`);
}

export function layerFrames(root: HTMLElement, diff: StateDiff): LayerFrames[] {
  const out: LayerFrames[] = [];
  for (const [path, props] of Object.entries(diff)) {
    const el = layerOf(root, path);
    if (!el) continue;
    const rest: Keyframes = {};
    const active: Keyframes = {};
    for (const [name, [from, to]] of Object.entries(props)) {
      const property = PROPERTY[name];
      if (!property || !usable(to) || (from !== null && !usable(from))) continue;
      rest[property] = from === null ? computedOf(el, property) : from;
      active[property] = to;
    }
    pinEdges(el, rest, active);
    if (Object.keys(active).length > 0) out.push({ el, frames: [rest, active] });
  }
  return out;
}

/**
 * A Framer layer pinned on both sides (left and right set) takes its width from its parent, not from
 * its `width` value (Primary Button "Color BG": left -26px, right -27px stretches the circle across the
 * whole button). Motion can't animate to an edge-derived width, so it becomes px from the parent's size.
 */
function pinEdges(el: HTMLElement, rest: Keyframes, active: Keyframes): void {
  const left = parseFloat(String(active["left"]));
  const right = parseFloat(String(active["right"]));
  const parent = el.offsetParent ?? el.parentElement;
  if (Number.isNaN(left) || Number.isNaN(right) || !parent) return;
  active["width"] = `${parent.clientWidth - left - right}px`;
  delete active["right"];
  delete rest["right"];
}

/** Drop the inline values the runtime wrote for these layers (used when the breakpoint changes). */
export function clearFrames(layers: LayerFrames[]): void {
  for (const { el, frames } of layers) {
    for (const property of Object.keys(frames[1])) {
      if (property in IDENTITY) el.style.transform = "";
      else el.style.removeProperty(kebab(property));
    }
  }
}
