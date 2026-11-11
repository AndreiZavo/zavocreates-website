import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Motion, type Transition } from "../../src/content/schema";
import { toMotionOptions, toSpringOptions } from "../../src/motion/transition";
import { poseAt, scrollStops } from "../../src/motion/scrollTransform";

const motion = Motion.parse(JSON.parse(readFileSync(join(__dirname, "..", "..", "content", "motion.json"), "utf8")));

/** Every Transition object in motion.json, wherever it sits (transition, enter/exit, returnTransition). */
function transitionsIn(v: unknown, out: Transition[] = []): Transition[] {
  if (Array.isArray(v)) v.forEach((x) => transitionsIn(x, out));
  else if (v && typeof v === "object") {
    for (const [key, value] of Object.entries(v)) {
      if (key === "transition" || key === "returnTransition") out.push(value as Transition);
      else transitionsIn(value, out);
    }
  }
  return out;
}

describe("toMotionOptions", () => {
  it("passes a physics spring through unchanged", () => {
    expect(toMotionOptions({ type: "spring", stiffness: 500, damping: 60, mass: 1 })).toEqual({
      type: "spring",
      stiffness: 500,
      damping: 60,
      mass: 1,
    });
  });

  it("passes a duration spring through with seconds as numbers", () => {
    expect(toMotionOptions({ type: "spring", duration: 1, bounce: 0 })).toEqual({ type: "spring", duration: 1, bounce: 0 });
    expect(toMotionOptions({ type: "spring", duration: 0.5, bounce: 0.2, delay: 0.15 })).toEqual({
      type: "spring",
      duration: 0.5,
      bounce: 0.2,
      delay: 0.15,
    });
  });

  it("maps a tween to duration and cubic-bezier ease", () => {
    expect(toMotionOptions({ type: "tween", duration: 0.2, ease: [0.27, 0, 0.51, 1] })).toEqual({
      duration: 0.2,
      ease: [0.27, 0, 0.51, 1],
    });
  });

  it("keeps a zero delay", () => {
    expect(toMotionOptions({ type: "tween", duration: 0.2, ease: [0.27, 0, 0.51, 1], delay: 0 })).toEqual({
      duration: 0.2,
      ease: [0.27, 0, 0.51, 1],
      delay: 0,
    });
    expect(toMotionOptions({ type: "spring", stiffness: 500, damping: 60, mass: 1, delay: 0 })).toMatchObject({ delay: 0 });
  });

  it("maps an instant transition to a zero-length animation", () => {
    expect(toMotionOptions({ type: "instant" })).toEqual({ duration: 0 });
  });

  it("never emits undefined keys", () => {
    const options = toMotionOptions({ type: "spring", duration: 1, bounce: 0 });
    expect(Object.values(options)).not.toContain(undefined);
  });

  it("converts every transition that occurs in motion.json without losing a value", () => {
    const all = transitionsIn(motion);
    expect(new Set(all.map((t) => t.type))).toEqual(new Set(["spring", "tween", "instant"]));
    for (const t of all) {
      const options = toMotionOptions(t) as Record<string, unknown>;
      if (t.type === "instant") {
        expect(options).toEqual({ duration: 0 });
        continue;
      }
      // Every Framer value arrives unchanged; a tween only drops its "type" (motion's default).
      const { type, ...values } = t;
      expect(options).toEqual(type === "spring" ? t : values);
    }
  });

  it("has no stagger in motion.json (toMotionOptions does not map one)", () => {
    expect(transitionsIn(motion).filter((t) => t.type === "spring" && t.stagger !== undefined)).toEqual([]);
  });
});

describe("toSpringOptions", () => {
  it("returns the physics values of a spring", () => {
    expect(toSpringOptions({ type: "spring", stiffness: 500, damping: 60, mass: 1, delay: 0 })).toEqual({
      stiffness: 500,
      damping: 60,
      mass: 1,
    });
  });

  it("returns undefined for transitions that are not physics springs", () => {
    expect(toSpringOptions({ type: "instant" })).toBeUndefined();
    expect(toSpringOptions({ type: "spring", duration: 1, bounce: 0 })).toBeUndefined();
    expect(toSpringOptions({ type: "tween", duration: 0.2, ease: [0, 0, 1, 1] })).toBeUndefined();
  });
});

describe("scroll section maths (Framer 'Scroll Section' transform)", () => {
  const start = { at: "start" as const, pose: { x: 0, rotateY: 0 } };
  const a = { at: "target" as const, target: { framerNodeId: "A", description: "a" }, pose: { x: 340, rotateY: 150 } };
  const b = { at: "target" as const, target: { framerNodeId: "B", description: "b" }, pose: { x: 340, rotateY: 340 } };
  const boxes: Record<string, { top: number; height: number }> = { A: { top: 1000, height: 800 }, B: { top: 1800, height: 800 } };
  const measure = (id: string): { top: number; height: number } | undefined => boxes[id];

  it("starts each section when its target reaches the viewport line and ends after the target's height", () => {
    // viewport line at the bottom edge of an 800px viewport
    const stops = scrollStops([start, a, b], measure, 800);
    expect(stops.map((s) => s.y)).toEqual([200, 1000, 1000, 1800]);
    expect(stops.map((s) => s.pose["rotateY"])).toEqual([0, 150, 150, 340]);
  });

  it("interpolates between stops and clamps outside them", () => {
    const stops = scrollStops([start, a, b], measure, 800);
    expect(poseAt(0, stops)).toEqual({ x: 0, rotateY: 0 });
    expect(poseAt(600, stops)).toEqual({ x: 170, rotateY: 75 });
    expect(poseAt(1000, stops)).toEqual({ x: 340, rotateY: 150 });
    expect(poseAt(1400, stops)).toEqual({ x: 340, rotateY: 245 });
    expect(poseAt(9999, stops)).toEqual({ x: 340, rotateY: 340 });
  });

  it("skips a section whose target is not on the page (the hero badge never reappears)", () => {
    const stops = scrollStops([start, a, { ...b, target: { framerNodeId: "MISSING", description: "gone" } }], measure, 800);
    expect(stops.map((s) => s.y)).toEqual([200, 1000]);
    expect(poseAt(5000, stops)).toEqual({ x: 340, rotateY: 150 });
  });

  it("returns no stops when no target exists", () => {
    expect(scrollStops([start], measure, 800)).toEqual([]);
    expect(poseAt(10, [])).toBeUndefined();
  });
});
