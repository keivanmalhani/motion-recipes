import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activeCount,
  animate,
  cancelActive,
  drive,
  getPlaybackRate,
  resetRuntime,
  setPlaybackRate,
} from "../src/core/runtime.ts";
import { EASING } from "../src/core/easing.ts";
import {
  EMPTY_RECT,
  childTarget,
  childTargets,
  getAttr,
  getText,
  pathLength,
  readNumber,
  rectOf,
  safeRatio,
  setAttr,
  setStyle,
  setText,
  toggleClass,
} from "../src/core/target.ts";
import type { RecipeTarget } from "../src/core/target.ts";
import { createBareTarget, createFakeTarget } from "./helpers/fake-target.ts";

afterEach(() => {
  resetRuntime();
});

describe("runtime.animate", () => {
  it("returns null instead of throwing for targets that cannot animate", () => {
    expect(animate(null, [{ opacity: 0 }], { duration: 100, easing: "linear" })).toBeNull();
    const notAnimatable = {} as unknown as RecipeTarget;
    expect(animate(notAnimatable, [{ opacity: 0 }], { duration: 100, easing: "linear" })).toBeNull();
  });

  it("swallows an animate() that throws", () => {
    const hostile: RecipeTarget = {
      animate() {
        throw new Error("no compositor for you");
      },
    };
    expect(() => animate(hostile, [{ opacity: 0 }], { duration: 10, easing: "linear" })).not.toThrow();
    expect(animate(hostile, [{ opacity: 0 }], { duration: 10, easing: "linear" })).toBeNull();
  });

  it("passes keyframes and options straight through", () => {
    const { target, calls } = createBareTarget();
    const keyframes = [{ opacity: 0 }, { opacity: 1 }];
    const options = { duration: 250, easing: "linear", delay: 40 };
    animate(target, keyframes, options);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keyframes).toBe(keyframes);
    expect(calls[0]?.options).toBe(options);
  });
});

describe("runtime playback rate", () => {
  it("defaults to 1 and clamps out-of-range values", () => {
    expect(getPlaybackRate()).toBe(1);
    expect(setPlaybackRate(0)).toBe(0.05);
    expect(setPlaybackRate(99)).toBe(4);
    expect(setPlaybackRate(Number.NaN)).toBe(1);
    expect(setPlaybackRate(2)).toBe(2);
    expect(getPlaybackRate()).toBe(2);
  });

  it("stamps the current rate onto newly started animations", () => {
    const { target, calls } = createBareTarget();
    setPlaybackRate(0.25);
    animate(target, [{ opacity: 0 }], { duration: 100, easing: "linear" });
    expect(calls[0]?.animation.playbackRate).toBe(0.25);
  });

  it("retimes animations that are already running", () => {
    const { target, calls } = createBareTarget();
    animate(target, [{ opacity: 0 }], { duration: 100, easing: "linear" });
    animate(target, [{ opacity: 1 }], { duration: 100, easing: "linear" });
    expect(calls[0]?.animation.playbackRate).toBe(1);
    setPlaybackRate(1.75);
    expect(calls[0]?.animation.playbackRate).toBe(1.75);
    expect(calls[1]?.animation.playbackRate).toBe(1.75);
  });

  it("tracks and cancels in-flight animations", () => {
    const { target, calls } = createBareTarget();
    animate(target, [{ opacity: 0 }], { duration: 100, easing: "linear" });
    animate(target, [{ opacity: 1 }], { duration: 100, easing: "linear" });
    expect(activeCount()).toBe(2);
    cancelActive();
    expect(activeCount()).toBe(0);
    expect(calls.every((c) => c.animation.cancelled)).toBe(true);
  });

  it("stops tracking animations that have finished", () => {
    const { target, calls } = createBareTarget();
    animate(target, [{ opacity: 0 }], { duration: 100, easing: "linear" });
    expect(activeCount()).toBe(1);
    calls[0]?.animation.finish();
    expect(activeCount()).toBe(0);
  });
});

describe("runtime.drive", () => {
  it("jumps straight to the resolved state when there is no frame clock", () => {
    // Node has no requestAnimationFrame. A half-scrambled label that never
    // finishes is worse than no animation, so drive() resolves immediately.
    expect(globalThis.requestAnimationFrame).toBeUndefined();
    const frames: number[] = [];
    const cancel = drive(500, (p) => frames.push(p));
    expect(frames).toEqual([1]);
    expect(typeof cancel).toBe("function");
    expect(() => cancel()).not.toThrow();
  });

  it("runs on the frame clock when one exists, and honours the easing", () => {
    let now = 0;
    const queue: FrameRequestCallback[] = [];
    const raf = vi.fn((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
    const caf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", caf);
    try {
      const frames: number[] = [];
      drive(1000, (p) => frames.push(p), EASING.decelerate);
      for (const step of [0, 250, 500, 1000]) {
        now = step;
        queue.shift()?.(now);
      }
      expect(frames).toHaveLength(4);
      expect(frames[0]).toBe(0);
      expect(frames.at(-1)).toBe(1);
      // Decelerate is ahead of linear at the quarter mark.
      expect(frames[1] as number).toBeGreaterThan(0.25);
      // Once progress hits 1 no further frame is requested.
      expect(queue).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops calling back after it is cancelled", () => {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    try {
      const frames: number[] = [];
      const cancel = drive(1000, (p) => frames.push(p));
      cancel();
      cancel();
      queue.shift()?.(0);
      expect(frames).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("target accessors", () => {
  const bare: RecipeTarget = { animate: () => ({ playbackRate: 1, cancel() {}, finish() {} }) };

  it("degrade to empty values on a target with no DOM surface", () => {
    expect(childTargets(bare, "[data-row]")).toEqual([]);
    expect(childTarget(bare, "[data-row]")).toBeNull();
    expect(rectOf(bare)).toEqual(EMPTY_RECT);
    expect(rectOf(null)).toEqual(EMPTY_RECT);
    expect(getAttr(bare, "data-x")).toBeNull();
    expect(getText(bare)).toBe("");
    expect(readNumber(bare, "data-x", 7)).toBe(7);
    expect(pathLength(bare, 34)).toBe(34);
    expect(toggleClass(bare, "is-open")).toBe(false);
    expect(() => setStyle(bare, "opacity", "1")).not.toThrow();
    expect(() => setText(bare, "hello")).not.toThrow();
    expect(() => setAttr(bare, "data-x", "1")).not.toThrow();
  });

  it("read through to a target that does have one", () => {
    const node = createFakeTarget({ attributes: { "data-count": "12", bad: "oops" } });
    expect(childTargets(node, "[data-row]")).toHaveLength(4);
    expect(childTarget(node, "[data-row]")).not.toBeNull();
    expect(rectOf(node).width).toBe(180);
    expect(getAttr(node, "data-count")).toBe("12");
    expect(getAttr(node, "missing")).toBeNull();
    expect(readNumber(node, "data-count", 0)).toBe(12);
    expect(readNumber(node, "bad", 5)).toBe(5);
    expect(readNumber(node, "missing", 5)).toBe(5);
    expect(pathLength(node, 1)).toBe(34);

    setText(node, "hello");
    expect(getText(node)).toBe("hello");
    setAttr(node, "data-open", "true");
    expect(getAttr(node, "data-open")).toBe("true");
    setStyle(node, "strokeDasharray", "42");
    expect(node.style.strokeDasharray).toBe("42");
  });

  it("returns the same manufactured children for a repeated selector", () => {
    const node = createFakeTarget();
    expect(childTarget(node, "[data-row]")).toBe(childTarget(node, "[data-row]"));
  });

  it("toggles classes and reports the resulting state", () => {
    const node = createFakeTarget();
    expect(toggleClass(node, "is-expanded")).toBe(true);
    expect(node.classes.has("is-expanded")).toBe(true);
    expect(toggleClass(node, "is-expanded")).toBe(false);
    expect(toggleClass(node, "is-expanded", true)).toBe(true);
  });

  it("survives accessors that throw", () => {
    const hostile = {
      animate: () => ({ playbackRate: 1, cancel() {}, finish() {} }),
      querySelector() {
        throw new Error("detached");
      },
      querySelectorAll() {
        throw new Error("detached");
      },
      getBoundingClientRect() {
        throw new Error("detached");
      },
      getAttribute() {
        throw new Error("detached");
      },
      getTotalLength() {
        throw new Error("detached");
      },
    } as unknown as RecipeTarget;
    expect(childTarget(hostile, "[x]")).toBeNull();
    expect(childTargets(hostile, "[x]")).toEqual([]);
    expect(rectOf(hostile)).toEqual(EMPTY_RECT);
    expect(getAttr(hostile, "x")).toBeNull();
    expect(pathLength(hostile, 9)).toBe(9);
  });
});

describe("safeRatio", () => {
  it("divides normally when both sides are real numbers", () => {
    expect(safeRatio(10, 4)).toBe(2.5);
    expect(safeRatio(-10, 4)).toBe(-2.5);
  });

  it("falls back rather than emitting NaN or Infinity", () => {
    expect(safeRatio(0, 0)).toBe(1);
    expect(safeRatio(180, 0)).toBe(1);
    expect(safeRatio(Number.NaN, 4)).toBe(1);
    expect(safeRatio(4, Number.NaN)).toBe(1);
    // An infinite denominator is a nonsense measurement, not a legitimate
    // "scale to zero". Falling back to 1 means "do not scale", which is a
    // recoverable state; scaling to 0 would make the element vanish.
    expect(safeRatio(4, Number.POSITIVE_INFINITY)).toBe(1);
    expect(safeRatio(0, 0, 0.5)).toBe(0.5);
  });
});
