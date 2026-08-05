import { describe, expect, it } from "vitest";

import { EASING } from "../src/core/easing.ts";
import { Timeline, stepProgress, timeline } from "../src/core/timeline.ts";

interface Box {
  x: number;
  opacity: number;
  trail: string[];
}

const START: Box = { x: 0, opacity: 0, trail: [] };

/** A step that lerps `x` and records the order in which it ran. */
function slide(id: string, at: number, duration: number, to: number) {
  return {
    id,
    at,
    duration,
    apply: (state: Box, p: number): Box => ({
      ...state,
      x: to * p,
      trail: [...state.trail, id],
    }),
  };
}

describe("stepProgress", () => {
  const step = slide("s", 100, 200, 10);

  it("is 0 before and at the start", () => {
    expect(stepProgress(step, 0)).toBe(0);
    expect(stepProgress(step, 99)).toBe(0);
    expect(stepProgress(step, 100)).toBe(0);
  });

  it("is linear across the body of the step", () => {
    expect(stepProgress(step, 150)).toBeCloseTo(0.25, 10);
    expect(stepProgress(step, 200)).toBeCloseTo(0.5, 10);
    expect(stepProgress(step, 250)).toBeCloseTo(0.75, 10);
  });

  it("clamps to 1 at and past the end", () => {
    expect(stepProgress(step, 300)).toBe(1);
    expect(stepProgress(step, 100000)).toBe(1);
  });

  it("treats a zero-duration step as an instant switch, not a divide by zero", () => {
    const instant = slide("i", 50, 0, 1);
    expect(stepProgress(instant, 49)).toBe(0);
    expect(stepProgress(instant, 50)).toBe(0);
    expect(stepProgress(instant, 50.001)).toBe(1);
    expect(Number.isFinite(stepProgress(instant, 500))).toBe(true);
  });

  it("clamps negative times to the start", () => {
    expect(stepProgress(step, -900)).toBe(0);
  });
});

describe("Timeline", () => {
  it("is inert when empty", () => {
    const tl = new Timeline<Box>(START);
    expect(tl.size).toBe(0);
    expect(tl.duration).toBe(0);
    expect(tl.at(0)).toEqual(START);
    expect(tl.at(5000)).toEqual(START);
    expect(tl.at(-5000)).toEqual(START);
  });

  it("resolves a single step at the start, middle, end, and past the end", () => {
    const tl = timeline(START, [slide("a", 0, 400, 100)]);
    expect(tl.duration).toBe(400);
    expect(tl.at(0).x).toBe(0);
    expect(tl.at(200).x).toBeCloseTo(50, 10);
    expect(tl.at(400).x).toBe(100);
    expect(tl.at(9999).x).toBe(100);
  });

  it("applies not-yet-started steps at progress 0 so there is no first-frame flash", () => {
    const tl = timeline(START, [
      {
        id: "late",
        at: 500,
        duration: 200,
        apply: (state: Box, p: number): Box => ({ ...state, opacity: 0.2 + 0.8 * p, trail: state.trail }),
      },
    ]);
    // At t=0 the step has not started, but its starting value is already
    // applied. A timeline that skipped it would report opacity 0 and then
    // jump to 0.2 the instant the step began.
    expect(tl.at(0).opacity).toBeCloseTo(0.2, 10);
    expect(tl.at(600).opacity).toBeCloseTo(0.6, 10);
    expect(tl.at(700).opacity).toBeCloseTo(1, 10);
  });

  it("resolves steps in time order regardless of insertion order", () => {
    const tl = new Timeline<Box>(START);
    tl.add(slide("third", 300, 100, 3));
    tl.add(slide("first", 0, 100, 1));
    tl.add(slide("second", 100, 100, 2));

    expect(tl.ordered().map((s) => s.id)).toEqual(["first", "second", "third"]);
    expect(tl.at(1000).trail).toEqual(["first", "second", "third"]);
  });

  it("breaks ties on identical start times by insertion order", () => {
    const tl = new Timeline<Box>(START);
    tl.add(slide("b", 50, 10, 1));
    tl.add(slide("a", 50, 10, 2));
    expect(tl.ordered().map((s) => s.id)).toEqual(["b", "a"]);
    // Both write x; the later insertion wins because it is folded last.
    expect(tl.at(80).x).toBe(2);
  });

  it("lets a later overlapping step win on the properties they share", () => {
    const tl = timeline(START, [slide("under", 0, 400, 100), slide("over", 200, 400, -50)]);
    expect(tl.duration).toBe(600);
    // At t=200 "over" has just started, progress 0, so it writes x = -50 * 0,
    // which in IEEE 754 is negative zero. Numerically zero either way.
    expect(tl.at(200).x).toBeCloseTo(0, 12);
    expect(tl.at(600).x).toBe(-50);
    expect(tl.at(400).trail).toEqual(["under", "over"]);
  });

  it("shapes progress with a per-step easing", () => {
    const eased = timeline(START, [
      { id: "e", at: 0, duration: 100, easing: EASING.decelerate, apply: (s: Box, p: number) => ({ ...s, x: p }) },
    ]);
    const linear = timeline(START, [
      { id: "l", at: 0, duration: 100, apply: (s: Box, p: number) => ({ ...s, x: p }) },
    ]);
    expect(eased.at(0).x).toBe(0);
    expect(eased.at(100).x).toBe(1);
    // A decelerate curve is ahead of linear in the first half.
    expect(eased.at(25).x).toBeGreaterThan(linear.at(25).x);
  });

  it("chains steps end to end with then(), including an explicit gap", () => {
    const tl = new Timeline<Box>(START);
    tl.then({ id: "one", duration: 100, apply: (s: Box) => s });
    tl.then({ id: "two", duration: 100, apply: (s: Box) => s }, 50);
    const steps = tl.ordered();
    expect(steps[0]?.at).toBe(0);
    expect(steps[1]?.at).toBe(150);
    expect(tl.duration).toBe(250);
  });

  it("samples inclusively across the whole span", () => {
    const tl = timeline(START, [slide("a", 0, 1000, 10)]);
    const frames = tl.sample(5);
    expect(frames).toHaveLength(5);
    expect(frames[0]?.x).toBe(0);
    expect(frames[4]?.x).toBe(10);
    expect(frames[2]?.x).toBeCloseTo(5, 10);
    expect(tl.sample(1)).toHaveLength(1);
    expect(tl.sample(0)).toHaveLength(1);
  });

  it("is pure: the same time always yields the same state", () => {
    const tl = timeline(START, [slide("a", 0, 300, 9), slide("b", 100, 300, 4)]);
    expect(tl.at(217)).toEqual(tl.at(217));
    expect(tl.at(217)).not.toBe(tl.at(217));
    expect(tl.at(0)).toEqual(tl.at(0));
  });

  it("ignores negative durations when computing the total span", () => {
    const tl = timeline(START, [
      { id: "bad", at: 100, duration: -500, apply: (s: Box) => s },
      slide("good", 0, 200, 1),
    ]);
    expect(tl.duration).toBe(200);
  });
});
