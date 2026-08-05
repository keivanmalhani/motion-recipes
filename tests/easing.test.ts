import { describe, expect, it } from "vitest";

import {
  BEZIERS,
  CSS_EASING,
  EASING,
  cssEasing,
  cubicBezier,
  decayOscillation,
  solveSpring,
  springKeyframes,
} from "../src/core/easing.ts";
import type { EasingName } from "../src/core/easing.ts";

const NAMES = Object.keys(BEZIERS) as EasingName[];

/** Sample an easing at `count + 1` evenly spaced points, inclusive of both ends. */
function samples(fn: (t: number) => number, count = 100): number[] {
  return Array.from({ length: count + 1 }, (_, i) => fn(i / count));
}

describe("cubicBezier", () => {
  it("pins both endpoints exactly, for every named curve", () => {
    for (const name of NAMES) {
      expect(EASING[name](0)).toBe(0);
      expect(EASING[name](1)).toBe(1);
    }
  });

  it("clamps input outside 0..1 to the endpoints", () => {
    expect(EASING.standard(-4)).toBe(0);
    expect(EASING.standard(1.7)).toBe(1);
  });

  it("is monotonically non-decreasing for the curves that should be", () => {
    for (const name of ["standard", "decelerate", "accelerate", "snappy"] as const) {
      const values = samples(EASING[name]);
      for (let i = 1; i < values.length; i += 1) {
        expect(values[i] as number).toBeGreaterThanOrEqual((values[i - 1] as number) - 1e-9);
      }
    }
  });

  it("overshoots past 1 for the overshoot curve and only that direction", () => {
    const values = samples(EASING.overshoot);
    const peak = Math.max(...values);
    expect(peak).toBeGreaterThan(1);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-1e-9);
  });

  it("dips below 0 for the anticipate curve", () => {
    expect(Math.min(...samples(EASING.anticipate))).toBeLessThan(0);
  });

  it("matches the identity for a linear control-point set", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(linear(t)).toBeCloseTo(t, 10);
    }
  });

  it("solves flat curves without leaving the unit interval", () => {
    // Control points that make Newton-Raphson stall, forcing the bisection path.
    const flat = cubicBezier(1, 0, 0, 1);
    for (const value of samples(flat, 40)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("emits CSS strings that agree with the numeric curves", () => {
    expect(cssEasing("standard")).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    for (const name of NAMES) {
      expect(CSS_EASING[name]).toBe(cssEasing(name));
      expect(CSS_EASING[name].startsWith("cubic-bezier(")).toBe(true);
    }
  });
});

describe("solveSpring", () => {
  it("settles on the target with a finite, positive duration", () => {
    const solution = solveSpring({ stiffness: 220, damping: 22, mass: 1 });
    expect(solution.settled).toBe(true);
    expect(Number.isFinite(solution.duration)).toBe(true);
    expect(solution.duration).toBeGreaterThan(0);
    expect(solution.keyframes.at(-1)).toBe(1);
    expect(solution.keyframes[0]).toBeCloseTo(0, 6);
  });

  it("lands within restDelta of the target before the guard trips", () => {
    const solution = solveSpring({ stiffness: 180, damping: 26, restDelta: 0.002 });
    expect(solution.steps).toBeLessThan(solution.maxSteps);
    // Second-to-last sample is the real trajectory; the last one is snapped.
    const nearEnd = solution.keyframes.at(-2) as number;
    expect(Math.abs(nearEnd - 1)).toBeLessThan(0.05);
  });

  it("overshoots less as damping increases", () => {
    const bouncy = solveSpring({ stiffness: 300, damping: 8, mass: 1 });
    const middling = solveSpring({ stiffness: 300, damping: 18, mass: 1 });
    const stiff = solveSpring({ stiffness: 300, damping: 40, mass: 1 });

    expect(bouncy.overshoot).toBeGreaterThan(middling.overshoot);
    expect(middling.overshoot).toBeGreaterThan(stiff.overshoot);
    expect(stiff.overshoot).toBeCloseTo(0, 3);
  });

  it("keeps the keyframe count in a range that is usable as WAAPI input", () => {
    for (const damping of [8, 14, 22, 40, 80]) {
      const solution = solveSpring({ stiffness: 300, damping });
      expect(solution.keyframes.length).toBeGreaterThanOrEqual(6);
      expect(solution.keyframes.length).toBeLessThanOrEqual(120);
      expect(solution.keyframes.every((v) => Number.isFinite(v))).toBe(true);
    }
  });

  it("honours an explicit frame count", () => {
    expect(solveSpring({ frameCount: 12 }).keyframes).toHaveLength(12);
    expect(solveSpring({ frameCount: 1 }).keyframes).toHaveLength(2);
    expect(solveSpring({ frameCount: 5000 }).keyframes).toHaveLength(240);
  });

  it("interpolates between arbitrary from and to values", () => {
    const solution = solveSpring({ from: 100, to: 0, damping: 30 });
    expect(solution.keyframes[0]).toBeCloseTo(100, 6);
    expect(solution.keyframes.at(-1)).toBe(0);
  });

  it("stops on the step guard when the spring can never settle", () => {
    // Zero damping is a perpetual oscillator. Without the guard this loops
    // forever; the guard is the only reason the function returns at all.
    const undamped = solveSpring({ stiffness: 200, damping: 0, maxDurationMs: 800 });
    expect(undamped.settled).toBe(false);
    expect(undamped.steps).toBe(undamped.maxSteps);
    expect(Number.isFinite(undamped.duration)).toBe(true);
    expect(undamped.duration).toBeLessThanOrEqual(800 + 1);
  });

  it("survives degenerate parameters without hanging or producing NaN", () => {
    const cases = [
      { stiffness: 0, damping: 0, mass: 0 },
      { stiffness: -50, damping: -50, mass: -1 },
      { stiffness: Number.NaN, damping: Number.NaN },
      { stiffness: 1e9, damping: 1e-9, maxDurationMs: 200 },
      { restDelta: 0, restSpeed: 0, maxDurationMs: 200 },
      { sampleRateHz: 0, maxDurationMs: 200 },
    ];
    for (const params of cases) {
      const solution = solveSpring(params);
      expect(Number.isFinite(solution.duration)).toBe(true);
      expect(solution.duration).toBeGreaterThan(0);
      expect(solution.steps).toBeLessThanOrEqual(solution.maxSteps);
      expect(solution.keyframes.length).toBeGreaterThanOrEqual(2);
      expect(solution.keyframes.some((v) => Number.isNaN(v))).toBe(false);
    }
  });

  it("does not divide by zero when from equals to", () => {
    const solution = solveSpring({ from: 0.5, to: 0.5 });
    expect(solution.keyframes.every((v) => Number.isFinite(v))).toBe(true);
    expect(solution.overshoot).toBeGreaterThanOrEqual(0);
  });

  it("respects maxDurationMs as a ceiling, not a target", () => {
    const capped = solveSpring({ stiffness: 40, damping: 1, maxDurationMs: 300 });
    expect(capped.duration).toBeLessThanOrEqual(301);
    const quick = solveSpring({ stiffness: 900, damping: 60, maxDurationMs: 5000 });
    expect(quick.duration).toBeLessThan(5000);
  });
});

describe("springKeyframes", () => {
  it("maps every sample through the template in order", () => {
    const solution = solveSpring({ frameCount: 6, damping: 40 });
    const css = springKeyframes(solution, (v) => `scale(${v.toFixed(3)})`);
    expect(css).toHaveLength(6);
    expect(css[0]).toBe("scale(0.000)");
    expect(css.at(-1)).toBe("scale(1.000)");
    expect(css.every((s) => s.startsWith("scale("))).toBe(true);
  });
});

describe("decayOscillation", () => {
  it("starts and ends at rest", () => {
    const values = decayOscillation(9, 3, 15);
    expect(values).toHaveLength(15);
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(0);
  });

  it("never exceeds the requested amplitude and loses energy over time", () => {
    const values = decayOscillation(10, 3, 41);
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(10);

    const firstHalf = Math.max(...values.slice(1, 20).map(Math.abs));
    const secondHalf = Math.max(...values.slice(20, 40).map(Math.abs));
    expect(secondHalf).toBeLessThan(firstHalf);
  });

  it("crosses zero at least twice per requested cycle", () => {
    const values = decayOscillation(10, 3, 61);
    let crossings = 0;
    for (let i = 1; i < values.length; i += 1) {
      if (Math.sign(values[i] as number) !== Math.sign(values[i - 1] as number)) crossings += 1;
    }
    expect(crossings).toBeGreaterThanOrEqual(6);
  });

  it("clamps a degenerate sample count instead of dividing by zero", () => {
    const values = decayOscillation(5, 2, 1);
    expect(values).toHaveLength(2);
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
  });
});
