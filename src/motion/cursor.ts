/**
 * Custom cursor (desktop breakpoint, fine hover-capable pointers only). A dot follows the pointer
 * with the effect's spring at its offset and placement; over [data-cursor="blend"] it switches to the
 * blending style. The native cursor is hidden (html.motion-cursor) only while the dot is shown.
 */
import { motionValue, springValue, styleEffect } from "motion";
import { toSpringOptions, type EffectOf } from "./transition";

type Cursor = EffectOf<"cursor">;
type Point = { x: number; y: number };

/** Top-left corner of a `size` px dot placed next to the pointer per Framer's placement/alignment/offsets. */
export function cursorPosition(pointer: Point, effect: Pick<Cursor, "placement" | "alignment" | "offsetX" | "offsetY">, size: number): Point {
  const along = (alignment: string): number => (alignment === "start" ? 0 : alignment === "end" ? -size : -size / 2);
  switch (effect.placement) {
    case "left":
      return { x: pointer.x - effect.offsetX - size, y: pointer.y + effect.offsetY + along(effect.alignment) };
    case "top":
      return { x: pointer.x + effect.offsetX + along(effect.alignment), y: pointer.y - effect.offsetY - size };
    case "bottom":
      return { x: pointer.x + effect.offsetX + along(effect.alignment), y: pointer.y + effect.offsetY };
    default:
      return { x: pointer.x + effect.offsetX, y: pointer.y + effect.offsetY + along(effect.alignment) };
  }
}

export function cursor(effect: Cursor, desktopMedia: string | undefined): void {
  if (!desktopMedia || !effect.follow) return;
  const query = window.matchMedia(`${desktopMedia} and (hover: hover) and (pointer: fine)`);
  if (!query.matches) return;

  const dot = document.createElement("div");
  dot.setAttribute("data-motion-cursor", "");
  dot.setAttribute("aria-hidden", "true");
  Object.assign(dot.style, {
    position: "fixed",
    left: "0",
    top: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
    display: "none",
    borderRadius: effect.default.radius,
  });
  document.body.appendChild(dot);

  const spring = toSpringOptions(effect.transition);
  const x = motionValue(0);
  const y = motionValue(0);
  styleEffect(dot, { x: spring ? springValue(x, spring) : x, y: spring ? springValue(y, spring) : y });

  let blend: boolean | undefined;
  const style = (next: boolean): void => {
    if (next === blend) return;
    blend = next;
    const s = next ? effect.blending : effect.default;
    Object.assign(dot.style, {
      width: `${s.size}px`,
      height: `${s.size}px`,
      background: s.fill,
      mixBlendMode: next ? effect.blending.blendMode : "normal",
    });
  };
  const hide = (): void => {
    dot.style.display = "none";
    document.documentElement.classList.remove("motion-cursor");
  };

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || !query.matches) return hide();
    const target = event.target instanceof Element ? event.target : null;
    style(Boolean(target?.closest('[data-cursor="blend"]')));
    const size = blend ? effect.blending.size : effect.default.size;
    const at = cursorPosition({ x: event.clientX, y: event.clientY }, effect, size);
    if (dot.style.display === "none") {
      x.jump(at.x);
      y.jump(at.y);
      dot.style.display = "block";
      document.documentElement.classList.add("motion-cursor");
    }
    x.set(at.x);
    y.set(at.y);
  });
  document.documentElement.addEventListener("pointerleave", hide);
  query.addEventListener("change", () => !query.matches && hide());
}
