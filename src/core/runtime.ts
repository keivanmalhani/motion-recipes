/**
 * runtime.ts - the one place that actually starts an animation.
 *
 * Every recipe goes through `animate()` here rather than calling
 * `element.animate()` directly. That buys three things for about forty lines:
 *
 *  - a global playbackRate, so the speed slider retimes running animations
 *    instead of only affecting the next one
 *  - a registry of in-flight animations, so a replay can cancel the previous
 *    run cleanly instead of stacking transforms on top of each other
 *  - a single choke point where a missing or broken `animate()` degrades to a
 *    no-op instead of throwing halfway through a recipe
 *
 * There is no DOM access in this file and no imports outside src/core.
 */

import type { EasingFunction } from "./easing.ts";
import type { AnimateOptions, AnimationLike, RecipeTarget } from "./target.ts";

const MIN_RATE = 0.05;
const MAX_RATE = 4;

let playbackRate = 1;
const active = new Set<AnimationLike>();

/** Current global speed multiplier. */
export function getPlaybackRate(): number {
  return playbackRate;
}

/**
 * Set the global speed multiplier and retime everything already running.
 *
 * Returns the clamped value that was actually applied.
 */
export function setPlaybackRate(rate: number): number {
  const next = Number.isFinite(rate) ? Math.min(MAX_RATE, Math.max(MIN_RATE, rate)) : 1;
  playbackRate = next;
  prune();
  for (const animation of active) {
    try {
      animation.playbackRate = next;
    } catch {
      /* animation was detached between prune and here */
    }
  }
  return next;
}

/** Number of animations the runtime believes are still in flight. */
export function activeCount(): number {
  prune();
  return active.size;
}

/** Cancel every tracked animation. Used before a replay. */
export function cancelActive(): void {
  for (const animation of active) {
    try {
      animation.cancel();
    } catch {
      /* already finished or detached */
    }
  }
  active.clear();
}

/**
 * Start an animation on `target`.
 *
 * `options` requires an explicit duration and easing, which is enforced by the
 * type and asserted across the whole recipe registry in the test suite.
 * Returns null when the target cannot animate, so callers can keep going.
 */
export function animate(
  target: RecipeTarget | null,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: AnimateOptions,
): AnimationLike | null {
  if (!target || typeof target.animate !== "function") return null;
  prune();
  let animation: AnimationLike | null = null;
  try {
    animation = target.animate(keyframes, options) ?? null;
  } catch {
    return null;
  }
  if (!animation) return null;
  try {
    animation.playbackRate = playbackRate;
  } catch {
    /* some implementations expose playbackRate read-only; not fatal */
  }
  active.add(animation);
  return animation;
}

function prune(): void {
  for (const animation of active) {
    if (animation.playState === "finished" || animation.playState === "idle") {
      active.delete(animation);
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Frame driver
 * ------------------------------------------------------------------------- */

/** Cancels a running `drive()` loop. Safe to call more than once. */
export type DriveHandle = () => void;

/**
 * Drive a per-frame callback for `durationMs`, honouring the global speed.
 *
 * Two recipes (the counter and the text scramble) animate a value the
 * compositor cannot interpolate: a string. They still need a clock, and it has
 * to be the same clock the speed slider controls.
 *
 * When there is no frame clock at all (node, a test runner, SSR) this calls
 * `onFrame(1)` once and returns. Jumping to the resolved state is the correct
 * degradation: a scrambled label that never unscrambles is a broken page.
 */
export function drive(
  durationMs: number,
  onFrame: (progress: number) => void,
  easing?: EasingFunction,
): DriveHandle {
  const shape = easing ?? ((t: number) => t);
  const total = Math.max(1, durationMs);

  const raf = globalThis.requestAnimationFrame;
  if (typeof raf !== "function") {
    onFrame(1);
    return () => {};
  }

  let cancelled = false;
  let handle = 0;
  let startedAt = -1;

  const tick = (now: number): void => {
    if (cancelled) return;
    if (startedAt < 0) startedAt = now;
    const elapsed = (now - startedAt) * playbackRate;
    const progress = Math.min(1, elapsed / total);
    onFrame(shape(progress));
    if (progress < 1) handle = globalThis.requestAnimationFrame(tick);
  };

  handle = globalThis.requestAnimationFrame(tick);

  return () => {
    if (cancelled) return;
    cancelled = true;
    const cancelFrame = globalThis.cancelAnimationFrame;
    if (typeof cancelFrame === "function" && handle) cancelFrame(handle);
  };
}

/** Test and teardown helper: forget every tracked animation without cancelling. */
export function resetRuntime(): void {
  active.clear();
  playbackRate = 1;
}
