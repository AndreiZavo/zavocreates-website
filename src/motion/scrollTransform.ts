/**
 * Scroll-linked transforms (Framer "Scroll Transform" with section targets).
 *
 * Framer's rule, reproduced here: section k starts when its target's top reaches the viewport line
 * (`viewport`: start = top edge, middle, end = bottom edge) and ends once the target's own height has
 * scrolled past that line, or when the next section starts. Over that distance the pose goes from
 * section k-1's pose to section k's. A physics spring in the effect smooths the result.
 *
 * Markup: targets carry data-motion-target="<framerNodeId>"; data-motion-row="<n>" (1-based) picks
 * `rows[n-1].sections` instead of the effect's own sections.
 */
import { motionValue, scroll, springValue, styleEffect, type MotionValue } from "motion";
import { toSpringOptions, type EffectOf } from "./transition";

type Scroll = EffectOf<"scroll">;
type Section = Scroll["sections"][number];
type NumericPose = Record<string, number>;
export type Stop = { y: number; pose: NumericPose };
export type Box = { top: number; height: number };
/** Media queries of the breakpoints (content/tokens.json). */
export type BreakpointMedia = { desktop?: string; tablet?: string; phone?: string };

/** Share of the viewport height at which Framer places each viewport line. */
const VIEWPORT_LINE: Record<Scroll["viewport"], number> = { start: 0, middle: 1 / 2, end: 1 };

const numeric = (pose: Section["pose"]): NumericPose =>
  Object.fromEntries(Object.entries(pose).filter((e): e is [string, number] => typeof e[1] === "number"));

/**
 * Scroll positions and the pose at each. `measure` returns a target's document top and height,
 * or undefined when the target is not on the page (that section is skipped, as in Framer).
 * `lineOffset` is the viewport line's distance from the top of the viewport in px.
 */
export function scrollStops(sections: Section[], measure: (framerNodeId: string) => Box | undefined, lineOffset: number): Stop[] {
  const found = sections.flatMap((section, index) => {
    const box = section.target && measure(section.target.framerNodeId);
    const previous = sections[index - 1];
    return box && previous ? [{ start: box.top - lineOffset, height: box.height, from: previous.pose, to: section.pose }] : [];
  });
  return found.flatMap((s, i) => {
    const next = found[i + 1];
    const end = next ? Math.min(s.start + s.height, next.start) : s.start + s.height;
    return [
      { y: Math.max(s.start, 0), pose: numeric(s.from) },
      { y: Math.max(end, 0), pose: numeric(s.to) },
    ];
  });
}

/** Pose at scroll position `y`: linear between stops, clamped outside them. */
export function poseAt(y: number, stops: Stop[]): NumericPose | undefined {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return undefined;
  if (y <= first.y) return first.pose;
  if (y >= last.y) return last.pose;
  const i = stops.findIndex((s) => s.y > y);
  const a = stops[i - 1];
  const b = stops[i];
  if (!a || !b) return last.pose;
  const t = (y - a.y) / (b.y - a.y);
  return Object.fromEntries(Object.entries(b.pose).map(([key, to]) => [key, (a.pose[key] ?? to) + (to - (a.pose[key] ?? to)) * t]));
}

function sectionsFor(effect: Scroll, el: HTMLElement, media: BreakpointMedia): Section[] | null {
  const row = Number(el.dataset["motionRow"]);
  const rowSections = effect.rows?.[row - 1]?.sections;
  if (rowSections) return rowSections;
  for (const name of ["tablet", "phone"] as const) {
    const query = media[name];
    const override = effect.breakpointSections?.[name];
    if (override !== undefined && query && window.matchMedia(query).matches) return override;
  }
  return effect.sections;
}

function measure(framerNodeId: string): Box | undefined {
  const target = document.querySelector<HTMLElement>(`[data-motion-target="${CSS.escape(framerNodeId)}"]`);
  if (!target) return undefined;
  return { top: target.getBoundingClientRect().top + window.scrollY, height: target.clientHeight };
}

export function scrollTransform(effect: Scroll, elements: HTMLElement[], media: BreakpointMedia = {}): void {
  const spring = toSpringOptions(effect.transition);

  for (const el of elements) {
    const sources: Record<string, MotionValue<number>> = {};
    const write = (pose: NumericPose): void => {
      for (const [key, value] of Object.entries(pose)) {
        const source = sources[key];
        if (source) {
          source.set(value);
          continue;
        }
        const created = motionValue(value);
        sources[key] = created;
        styleEffect(el, { [key]: spring ? springValue(created, spring) : created });
      }
    };

    scroll((_progress, info) => {
      const sections = sectionsFor(effect, el, media);
      if (!sections) return; // this breakpoint has no scroll effect
      const stops = scrollStops(sections, measure, VIEWPORT_LINE[effect.viewport] * info.y.containerLength);
      const pose = poseAt(info.y.current, stops);
      if (pose) write(pose);
    });
  }
}
