import { afterEach, describe, expect, it } from "vitest";

import {
  RECIPES,
  RECIPE_CATEGORIES,
  formatThousands,
  getRecipe,
  magneticOffset,
  phaseKeyframes,
  recipesByCategory,
  scrambleText,
  seededRandom,
} from "../src/core/recipes.ts";
import { getPlaybackRate, resetRuntime, setPlaybackRate } from "../src/core/runtime.ts";
import { ZERO_RECT, createBareTarget, createFakeTarget } from "./helpers/fake-target.ts";
import type { RecordedCall } from "./helpers/fake-target.ts";

/**
 * Attribute values every fake node reports, so the recipes read plausible
 * numbers instead of falling through to their defaults.
 */
const SEED_ATTRIBUTES: Record<string, string> = {
  "data-final": "4",
  "data-depth": "2",
  "data-to": "18.2",
  "data-text": "SHIP IT",
  "data-arc-to": "0.78",
  r: "52",
};

function runAgainstFake(recipeId: string): RecordedCall[] {
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new Error(`no recipe ${recipeId}`);
  const stage = createFakeTarget({ attributes: SEED_ATTRIBUTES });
  recipe.run(stage);
  return stage.log;
}

/** WAAPI accepts either an array of keyframes or one property-indexed object. */
function assertUsableKeyframes(call: RecordedCall, label: string): void {
  const { keyframes } = call;
  expect(keyframes, `${label}: keyframes must not be null`).not.toBeNull();
  if (Array.isArray(keyframes)) {
    expect(keyframes.length, `${label}: keyframe array must not be empty`).toBeGreaterThan(0);
    for (const frame of keyframes) {
      expect(Object.keys(frame).length, `${label}: empty keyframe`).toBeGreaterThan(0);
    }
  } else {
    expect(typeof keyframes, `${label}: keyframes must be an object`).toBe("object");
    expect(Object.keys(keyframes as object).length, `${label}: empty keyframes`).toBeGreaterThan(0);
  }
}

function assertUsableOptions(call: RecordedCall, label: string): void {
  const { options } = call;
  expect(typeof options, `${label}: options must be an object`).toBe("object");
  const bag = options as KeyframeAnimationOptions;
  expect(typeof bag.duration, `${label}: duration must be a number`).toBe("number");
  expect(bag.duration as number, `${label}: duration must be positive`).toBeGreaterThan(0);
  expect(Number.isFinite(bag.duration as number), `${label}: duration must be finite`).toBe(true);
  expect(typeof bag.easing, `${label}: easing must be a string`).toBe("string");
  expect((bag.easing as string).length, `${label}: easing must not be empty`).toBeGreaterThan(0);
}

/** Every CSS value a recipe emits, flattened, so we can scan for NaN. */
function cssValues(calls: RecordedCall[]): string[] {
  const out: string[] = [];
  for (const call of calls) {
    const frames = Array.isArray(call.keyframes) ? call.keyframes : [call.keyframes];
    for (const frame of frames) {
      if (!frame || typeof frame !== "object") continue;
      for (const value of Object.values(frame as Record<string, unknown>)) {
        if (typeof value === "string") out.push(value);
      }
    }
  }
  return out;
}

afterEach(() => {
  resetRuntime();
});

describe("registry shape", () => {
  it("ships fourteen recipes", () => {
    expect(RECIPES).toHaveLength(14);
  });

  it("gives every recipe a unique, url-safe id", () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });

  it("gives every recipe a title, a real paragraph, and a snippet", () => {
    for (const recipe of RECIPES) {
      expect(recipe.title.trim().length, recipe.id).toBeGreaterThan(0);
      // A blurb shorter than this is a caption, not an explanation.
      expect(recipe.blurb.trim().length, recipe.id).toBeGreaterThan(180);
      expect(recipe.snippet.trim().length, recipe.id).toBeGreaterThan(0);
    }
  });

  it("uses only categories from the allowed set, and uses all of them", () => {
    const used = new Set<string>();
    for (const recipe of RECIPES) {
      expect(RECIPE_CATEGORIES, recipe.id).toContain(recipe.category);
      used.add(recipe.category);
    }
    expect(used.size).toBe(RECIPE_CATEGORIES.length);
  });

  it("keeps every snippet under thirty lines", () => {
    for (const recipe of RECIPES) {
      expect(recipe.snippet.split("\n").length, recipe.id).toBeLessThanOrEqual(30);
    }
  });

  it("keeps every snippet, title and blurb to printable ASCII", () => {
    for (const recipe of RECIPES) {
      const text = `${recipe.title}\n${recipe.blurb}\n${recipe.snippet}`;
      // eslint-disable-next-line no-control-regex
      expect(/^[\x20-\x7e\n]*$/.test(text), `${recipe.id} contains non-ascii`).toBe(true);
    }
  });

  it("compiles every snippet as JavaScript", () => {
    for (const recipe of RECIPES) {
      // Balanced-delimiter check first, so a failure points at the shape of
      // the snippet rather than at a generic SyntaxError.
      const opens = (recipe.snippet.match(/[({[]/g) ?? []).length;
      const closes = (recipe.snippet.match(/[)}\]]/g) ?? []).length;
      expect(opens, `${recipe.id}: unbalanced delimiters`).toBe(closes);

      expect(() => new Function(recipe.snippet), `${recipe.id} failed to compile`).not.toThrow();
    }
  });

  it("exposes run() as a unary function on every recipe", () => {
    for (const recipe of RECIPES) {
      expect(typeof recipe.run, recipe.id).toBe("function");
      expect(recipe.run.length, recipe.id).toBe(1);
    }
  });

  it("looks recipes up by id and reports misses", () => {
    expect(getRecipe("spring-press")?.title).toBe("Spring press");
    expect(getRecipe("does-not-exist")).toBeUndefined();
  });

  it("groups by category without losing or duplicating a recipe", () => {
    const grouped = recipesByCategory();
    expect(grouped.map((g) => g.category)).toEqual([...RECIPE_CATEGORIES]);
    const total = grouped.reduce((sum, g) => sum + g.recipes.length, 0);
    expect(total).toBe(RECIPES.length);
  });
});

describe("every recipe, run headlessly", () => {
  it("does not throw when handed the most minimal legal target", () => {
    for (const recipe of RECIPES) {
      const { target } = createBareTarget();
      expect(() => recipe.run(target), `${recipe.id} threw on a bare target`).not.toThrow();
    }
  });

  it("emits usable keyframes and explicit timing on every animate() call", () => {
    for (const recipe of RECIPES) {
      const calls = runAgainstFake(recipe.id);
      expect(calls.length, `${recipe.id} produced no animation`).toBeGreaterThan(0);
      calls.forEach((call, i) => {
        const label = `${recipe.id}[${i}] on ${call.selector}`;
        assertUsableKeyframes(call, label);
        assertUsableOptions(call, label);
      });
    }
  });

  it("keeps keyframe offsets inside 0..1 and non-decreasing", () => {
    for (const recipe of RECIPES) {
      for (const call of runAgainstFake(recipe.id)) {
        if (!Array.isArray(call.keyframes)) continue;
        let previous = -1;
        for (const frame of call.keyframes) {
          const offset = (frame as Keyframe).offset;
          if (offset === undefined || offset === null) continue;
          expect(offset, recipe.id).toBeGreaterThanOrEqual(0);
          expect(offset, recipe.id).toBeLessThanOrEqual(1);
          expect(offset, `${recipe.id}: offsets went backwards`).toBeGreaterThanOrEqual(previous);
          previous = offset;
        }
      }
    }
  });

  it("never emits NaN or Infinity into a CSS value", () => {
    for (const recipe of RECIPES) {
      for (const value of cssValues(runAgainstFake(recipe.id))) {
        expect(value, `${recipe.id}: ${value}`).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it("survives a target that measures zero in every direction", () => {
    // This is the FLIP guard. A collapsed box divides by zero, and a NaN in a
    // transform silently drops the whole animation.
    for (const recipe of RECIPES) {
      const stage = createFakeTarget({ attributes: SEED_ATTRIBUTES, rect: ZERO_RECT });
      expect(() => recipe.run(stage), recipe.id).not.toThrow();
      for (const value of cssValues(stage.log)) {
        expect(value, `${recipe.id}: ${value}`).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it("applies the global playback rate to everything it starts", () => {
    expect(setPlaybackRate(0.5)).toBe(0.5);
    expect(getPlaybackRate()).toBe(0.5);
    for (const recipe of RECIPES) {
      const stage = createFakeTarget({ attributes: SEED_ATTRIBUTES });
      recipe.run(stage);
      for (const call of stage.log) {
        expect(call.animation.playbackRate, recipe.id).toBe(0.5);
      }
    }
  });

  it("is idempotent enough to replay without throwing", () => {
    for (const recipe of RECIPES) {
      const stage = createFakeTarget({ attributes: SEED_ATTRIBUTES });
      recipe.run(stage);
      const firstPass = stage.log.length;
      expect(() => recipe.run(stage), recipe.id).not.toThrow();
      expect(stage.log.length, recipe.id).toBeGreaterThan(firstPass);
    }
  });
});

describe("recipe-specific behaviour", () => {
  it("spring-press compresses before it releases", () => {
    const calls = runAgainstFake("spring-press");
    const frames = calls[0]?.keyframes as Keyframe[];
    expect(String(frames[0]?.transform)).toBe("scale(1.0000)");
    expect(String(frames[1]?.transform)).toBe("scale(0.9200)");
    expect(String(frames.at(-1)?.transform)).toBe("scale(1.0000)");
  });

  it("icon-state-morph flips its open state on each run", () => {
    const recipe = getRecipe("icon-state-morph");
    const stage = createFakeTarget({ attributes: SEED_ATTRIBUTES });
    recipe?.run(stage);
    expect(stage.getAttribute("data-open")).toBe("true");
    recipe?.run(stage);
    expect(stage.getAttribute("data-open")).toBe("false");
  });

  it("icon-state-morph translates before it rotates", () => {
    const calls = runAgainstFake("icon-state-morph");
    const frames = calls[0]?.keyframes as Keyframe[];
    expect(String(frames[0]?.transform)).toContain("rotate(0deg)");
    expect(String(frames[1]?.transform)).toContain("rotate(0deg)");
    expect(String(frames[1]?.transform)).not.toBe(String(frames[0]?.transform));
    expect(String(frames[2]?.transform)).toContain("rotate(45deg)");
  });

  it("page-transition-wipe uses one mask animation with a hold in the middle", () => {
    const calls = runAgainstFake("page-transition-wipe");
    const maskCalls = calls.filter((c) => c.selector === "[data-wipe]");
    // Two animations on one mask is the flash bug the blurb warns about.
    expect(maskCalls).toHaveLength(1);
    const frames = maskCalls[0]?.keyframes as Keyframe[];
    expect(frames).toHaveLength(4);
    expect(String(frames[1]?.transform)).toBe(String(frames[2]?.transform));
  });

  it("success-checkmark sets a dasharray before animating the offset", () => {
    const recipe = getRecipe("success-checkmark");
    const stage = createFakeTarget({ attributes: SEED_ATTRIBUTES, pathLength: 128 });
    recipe?.run(stage);
    const path = stage.querySelector("[data-check-path]");
    expect(path?.style.strokeDasharray).toBe("128");
    const frames = stage.log[0]?.keyframes as Keyframe[];
    expect(frames[0]?.strokeDashoffset).toBe(128);
    expect(frames[1]?.strokeDashoffset).toBe(0);
  });

  it("progress-arc derives the dasharray from the radius attribute", () => {
    const recipe = getRecipe("progress-arc");
    const stage = createFakeTarget({ attributes: { ...SEED_ATTRIBUTES, r: "10" } });
    recipe?.run(stage);
    const arc = stage.querySelector("[data-arc]");
    expect(Number(arc?.style.strokeDasharray)).toBeCloseTo(2 * Math.PI * 10, 3);
  });

  it("stagger-reveal delays the middle row least", () => {
    const calls = runAgainstFake("stagger-reveal").filter((c) => c.selector === "[data-row]");
    expect(calls.length).toBeGreaterThan(2);
    const delays = calls.map((c) => (c.options as KeyframeAnimationOptions).delay as number);
    const middle = Math.floor(delays.length / 2);
    expect(delays[middle] as number).toBeLessThanOrEqual(delays[0] as number);
    expect(delays[0]).toBe(delays.at(-1));
  });
});

describe("pure helpers", () => {
  it("phaseKeyframes concatenates phases into ascending offsets", () => {
    const result = phaseKeyframes([
      { duration: 100, samples: [0, 0.5, 1] },
      { duration: 300, samples: [1, 1.2, 0.9, 1] },
    ]);
    expect(result.total).toBe(400);
    expect(result.offsets).toHaveLength(result.values.length);
    expect(result.offsets[0]).toBe(0);
    expect(result.offsets.at(-1)).toBe(1);
    for (let i = 1; i < result.offsets.length; i += 1) {
      expect(result.offsets[i] as number).toBeGreaterThanOrEqual(result.offsets[i - 1] as number);
    }
    // The duplicated joint sample is dropped: 3 + 4 - 1 = 6.
    expect(result.values).toHaveLength(6);
  });

  it("phaseKeyframes tolerates empty and zero-length phases", () => {
    expect(phaseKeyframes([]).values).toEqual([]);
    const zero = phaseKeyframes([{ duration: 0, samples: [1, 2] }]);
    expect(zero.total).toBe(0);
    expect(zero.offsets).toEqual([0, 1]);
  });

  it("magneticOffset falls off quadratically and stops at the radius", () => {
    expect(magneticOffset(0, 0, 100, 0.5)).toEqual({ x: 0, y: 0 });
    expect(magneticOffset(200, 0, 100, 0.5)).toEqual({ x: 0, y: 0 });
    expect(magneticOffset(10, 0, 0, 0.5)).toEqual({ x: 0, y: 0 });

    const near = magneticOffset(10, 0, 100, 1);
    const far = magneticOffset(90, 0, 100, 1);
    expect(near.x).toBeGreaterThan(far.x);
    // Quadratic, so halving the distance more than doubles the pull ratio.
    expect(magneticOffset(50, 0, 100, 1).x).toBeCloseTo(50 * 0.25, 10);
  });

  it("scrambleText preserves length and spaces, and resolves left to right", () => {
    const text = "SHIP IT";
    const random = seededRandom(7);
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const out = scrambleText(text, p, random);
      expect(out).toHaveLength(text.length);
      expect(out.charAt(4)).toBe(" ");
    }
    expect(scrambleText(text, 1, random)).toBe(text);
    expect(scrambleText(text, 2, random)).toBe(text);
    expect(scrambleText(text, -1, random)).not.toBe(text);
    expect(scrambleText("", 0.5, random)).toBe("");
  });

  it("scrambleText resolves a monotonically growing prefix", () => {
    const text = "MOTION RECIPES";
    const random = seededRandom(11);
    let previous = -1;
    for (let i = 0; i <= 20; i += 1) {
      const p = i / 20;
      const out = scrambleText(text, p, random);
      let resolved = 0;
      while (resolved < text.length && out.charAt(resolved) === text.charAt(resolved)) resolved += 1;
      expect(resolved).toBeGreaterThanOrEqual(Math.floor(text.length * p));
      previous = Math.max(previous, resolved);
    }
    expect(previous).toBe(text.length);
  });

  it("seededRandom is deterministic and stays in range", () => {
    const a = seededRandom(1234);
    const b = seededRandom(1234);
    const c = seededRandom(4321);
    const first = Array.from({ length: 50 }, () => a());
    const second = Array.from({ length: 50 }, () => b());
    expect(first).toEqual(second);
    expect(first).not.toEqual(Array.from({ length: 50 }, () => c()));
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(new Set(first).size).toBeGreaterThan(40);
  });

  it("formatThousands groups digits without touching the host locale", () => {
    expect(formatThousands(0)).toBe("0");
    expect(formatThousands(999)).toBe("999");
    expect(formatThousands(1000)).toBe("1,000");
    expect(formatThousands(12480)).toBe("12,480");
    expect(formatThousands(1234567)).toBe("1,234,567");
    expect(formatThousands(-4200)).toBe("-4,200");
    expect(formatThousands(1499.6)).toBe("1,500");
  });
});
