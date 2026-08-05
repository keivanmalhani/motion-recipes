import { describe, expect, it } from "vitest";

import { STAGGER_MODES, stagger, staggerSpan } from "../src/core/stagger.ts";
import type { StaggerMode } from "../src/core/stagger.ts";

describe("stagger", () => {
  it("handles empty and single-item lists in every mode", () => {
    for (const mode of STAGGER_MODES) {
      expect(stagger(0, { mode })).toEqual([]);
      expect(stagger(-3, { mode })).toEqual([]);
      expect(stagger(1, { mode })).toEqual([0]);
    }
  });

  it("returns one delay per item", () => {
    for (const mode of STAGGER_MODES) {
      for (const count of [2, 5, 9, 24]) {
        expect(stagger(count, { mode, columns: 4 })).toHaveLength(count);
      }
    }
  });

  it("never produces a negative delay", () => {
    for (const mode of STAGGER_MODES) {
      for (const delay of stagger(13, { mode, columns: 4, each: 30 })) {
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("increases strictly with index in linear mode", () => {
    const delays = stagger(6, { mode: "linear", each: 40, max: 10000 });
    expect(delays[0]).toBe(0);
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i] as number).toBeGreaterThan(delays[i - 1] as number);
    }
    expect(delays[5]).toBeCloseTo(200, 10);
  });

  it("is symmetric about the middle in from-center mode", () => {
    for (const count of [5, 6, 11, 12]) {
      const delays = stagger(count, { mode: "from-center", each: 30, max: 10000 });
      for (let i = 0; i < count; i += 1) {
        expect(delays[i] as number).toBeCloseTo(delays[count - 1 - i] as number, 10);
      }
    }
  });

  it("starts the middle item first in from-center mode", () => {
    const odd = stagger(7, { mode: "from-center", each: 30, max: 10000 });
    expect(odd[3]).toBe(0);
    expect(odd[0]).toBeGreaterThan(odd[3] as number);

    const even = stagger(8, { mode: "from-center", each: 30, max: 10000 });
    expect(even[3]).toBeCloseTo(even[4] as number, 10);
    expect(even[0]).toBeGreaterThan(even[3] as number);
  });

  it("from-edges is the exact complement of from-center", () => {
    const options = { each: 30, max: 100000 } as const;
    for (const count of [4, 7, 10]) {
      const centre = stagger(count, { ...options, mode: "from-center" });
      const edges = stagger(count, { ...options, mode: "from-edges" });
      const constant = (centre[0] as number) + (edges[0] as number);
      for (let i = 0; i < count; i += 1) {
        expect((centre[i] as number) + (edges[i] as number)).toBeCloseTo(constant, 10);
      }
      // Edges move first, centre moves last. The peak of one distribution is
      // the constant minus the trough of the other, which for an even count
      // is strictly less than the peak of from-center.
      expect(edges[0]).toBe(0);
      expect(edges.at(-1)).toBe(0);
      expect(Math.max(...edges)).toBeCloseTo(constant - Math.min(...centre), 10);
    }
  });

  it("uses the column count to build a real grid in grid-distance mode", () => {
    const delays = stagger(9, { mode: "grid-distance", columns: 3, each: 40, max: 100000 });
    // Centre of a 3x3 grid is index 4.
    expect(delays[4]).toBe(0);
    // The four corners are equidistant from the centre.
    const corners = [delays[0], delays[2], delays[6], delays[8]] as number[];
    for (const corner of corners) expect(corner).toBeCloseTo(corners[0] as number, 10);
    // Edge midpoints are closer than corners.
    expect(delays[1] as number).toBeLessThan(corners[0] as number);
    expect(Math.max(...delays)).toBeCloseTo(corners[0] as number, 10);
  });

  it("changes the distribution when the column count changes", () => {
    const threeWide = stagger(12, { mode: "grid-distance", columns: 3, each: 40, max: 100000 });
    const fourWide = stagger(12, { mode: "grid-distance", columns: 4, each: 40, max: 100000 });
    expect(threeWide).not.toEqual(fourWide);
    // A 3x4 grid and a 4x3 grid are transposes, so their spans happen to
    // match. The per-item delays are what actually differ.
    expect(threeWide[1] as number).not.toBeCloseTo(fourWide[1] as number, 6);
    expect(threeWide[4] as number).not.toBeCloseTo(fourWide[4] as number, 6);
  });

  it("accepts an explicit grid origin", () => {
    const topLeft = stagger(9, {
      mode: "grid-distance",
      columns: 3,
      each: 40,
      max: 100000,
      origin: [0, 0],
    });
    expect(topLeft[0]).toBe(0);
    expect(topLeft[8]).toBeCloseTo(Math.hypot(2, 2) * 40, 10);
  });

  it("never lets the total span exceed the configured max", () => {
    for (const mode of STAGGER_MODES) {
      for (const count of [2, 8, 25, 60]) {
        for (const max of [0, 120, 320]) {
          const delays = stagger(count, { mode, each: 90, max, columns: 5 });
          expect(staggerSpan(delays)).toBeLessThanOrEqual(max + 1e-9);
        }
      }
    }
  });

  it("preserves the shape of the distribution when scaling to fit max", () => {
    const loose = stagger(10, { mode: "from-center", each: 50, max: 100000 });
    const capped = stagger(10, { mode: "from-center", each: 50, max: 100 });
    expect(staggerSpan(capped)).toBeCloseTo(100, 10);
    const factor = 100 / staggerSpan(loose);
    for (let i = 0; i < 10; i += 1) {
      expect(capped[i] as number).toBeCloseTo((loose[i] as number) * factor, 8);
    }
  });

  it("collapses to zero when each is zero", () => {
    expect(stagger(6, { mode: "linear", each: 0 })).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("falls back to linear for an unrecognised mode instead of throwing", () => {
    const bogus = stagger(4, { mode: "spiral" as StaggerMode, each: 25, max: 100000 });
    expect(bogus).toEqual(stagger(4, { mode: "linear", each: 25, max: 100000 }));
  });
});

describe("staggerSpan", () => {
  it("reports the largest delay and 0 for an empty list", () => {
    expect(staggerSpan([])).toBe(0);
    expect(staggerSpan([0, 40, 12])).toBe(40);
  });
});
