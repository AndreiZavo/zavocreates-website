import { describe, expect, it } from "vitest";
import { getMotion } from "../../src/content/load";
import { cursorPosition } from "../../src/motion/cursor";
import { initialDirection, MIN_DISTANCE, stateNames, stepDirection, type DirectionState } from "../../src/motion/scrollVariant";
import { isRootPath, variantOf } from "../../src/motion/states";
import { nextStep } from "../../src/motion/timer";

describe("timer cycle schedule", () => {
  it("walks the steps in order and starts over when looping", () => {
    const seen: (number | undefined)[] = [];
    let i: number | undefined = 0;
    for (let n = 0; n < 5; n++) seen.push((i = nextStep(2, i ?? 0, true)));
    expect(seen).toEqual([1, 0, 1, 0, 1]);
  });

  it("stops after the last step without loop", () => {
    expect(nextStep(2, 0, false)).toBe(1);
    expect(nextStep(2, 1, false)).toBeUndefined();
    expect(nextStep(0, 0, true)).toBeUndefined();
  });

  it("holds each badge variant for its own holdSeconds", () => {
    const badge = getMotion("home.badge.cycle");
    if (badge.kind !== "variant" || !badge.cycle) throw new Error("home.badge.cycle must be a cycle");
    expect(badge.cycle.map((s) => [s.variant, s.holdSeconds])).toEqual([
      ["Hi", 2],
      ["Hand Waving", 4],
    ]);
    expect(badge.loop).toBe(true);
  });
});

describe("scroll direction tracker (Framer's rule)", () => {
  const run = (ys: number[], replay = true): boolean[] => {
    let s: DirectionState = initialDirection();
    return ys.map((y) => (s = stepDirection(s, y, "down", replay, MIN_DISTANCE)).matched);
  };

  it("matches once the page has moved MIN_DISTANCE px down", () => {
    expect(run([0, 2, 10])).toEqual([false, false, true]);
  });

  it("ignores a reversal until it has moved MIN_DISTANCE px from the first sample in the new direction", () => {
    expect(run([0, 10, 20, 18, 17, 15])).toEqual([false, true, true, true, true, true]);
    expect(run([0, 10, 20, 18, 17, 14])).toEqual([false, true, true, true, true, false]);
  });

  it("matches again on scrolling down after up (replay)", () => {
    expect(run([0, 10, 20, 15, 10, 12, 30])).toEqual([false, true, true, true, false, false, true]);
  });

  it("stays matched without replay", () => {
    expect(run([0, 10, 20, 0], false)).toEqual([false, true, true, true]);
  });

  it("names the nav states from the Framer variant roots", () => {
    const nav = getMotion("nav.scroll");
    if (nav.kind !== "scrollVariant") throw new Error("nav.scroll must be a scrollVariant");
    expect(stateNames(nav.states.desktop)).toEqual(["open", "closed"]);
    expect(stateNames(nav.states.tabletPhone)).toEqual(["closed", "open"]);
  });
});

describe("Framer layer paths", () => {
  it("tells the variant root from deeper layers", () => {
    expect(isRootPath("Desktop / Open")).toBe(true);
    expect(isRootPath("Desktop")).toBe(true);
    expect(isRootPath("Desktop / Open/Scroll Hide Wrap")).toBe(false);
    expect(isRootPath("Desktop/Color BG")).toBe(false);
    expect(variantOf("Tablet & Phone / Closed/Avatar & Button Wrap/Toggle Button")).toBe("Tablet & Phone / Closed");
  });
});

describe("custom cursor placement", () => {
  const cursor = getMotion("cursor");
  if (cursor.kind !== "cursor") throw new Error("cursor must be a cursor effect");

  it("puts the dot right of the pointer by offsetX, centred vertically and shifted by offsetY", () => {
    expect(cursor).toMatchObject({ placement: "right", alignment: "center", offsetX: 20, offsetY: 20 });
    expect(cursorPosition({ x: 100, y: 100 }, cursor, 16)).toEqual({ x: 120, y: 112 });
  });

  it("supports the other placements", () => {
    const base = { alignment: "start", offsetX: 10, offsetY: 5 };
    expect(cursorPosition({ x: 100, y: 100 }, { ...base, placement: "left" }, 16)).toEqual({ x: 74, y: 105 });
    expect(cursorPosition({ x: 100, y: 100 }, { ...base, placement: "top" }, 16)).toEqual({ x: 110, y: 79 });
    expect(cursorPosition({ x: 100, y: 100 }, { ...base, placement: "bottom" }, 16)).toEqual({ x: 110, y: 105 });
  });
});
