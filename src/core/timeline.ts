/**
 * timeline.ts - a sequencing primitive with no clock attached.
 *
 * The trick that makes this testable: a Timeline never animates anything and
 * never asks what time it is. You hand it a time and it folds every step into
 * a state value. requestAnimationFrame, if you want it, lives somewhere else
 * and calls `at(t)` once per frame.
 *
 * Because it is a pure function of t, you can assert on the exact state at
 * t = 0, at 137 ms, at the end, and past the end, without a browser.
 */

import type { EasingFunction } from "./easing.ts";

export interface TimelineStep<S> {
  /** Optional label, useful for debugging and for asserting order in tests. */
  id?: string;
  /** Start time in ms, relative to the timeline origin. */
  at: number;
  /** Length in ms. Zero means "apply instantly at `at`". */
  duration: number;
  /** Optional shaping applied to this step's local progress before `apply`. */
  easing?: EasingFunction;
  /** Fold the step's contribution into the state. Must be pure. */
  apply: (state: S, progress: number) => S;
}

/**
 * Local progress of a step at absolute time t, clamped to 0..1.
 *
 * Steps that have not started yet report 0 rather than being skipped. That is
 * deliberate: it means `at(0)` returns a fully initialized state with every
 * step's starting value applied, so there is no "first frame flash".
 */
export function stepProgress<S>(step: TimelineStep<S>, t: number): number {
  if (t <= step.at) return 0;
  if (step.duration <= 0) return 1;
  const raw = (t - step.at) / step.duration;
  if (raw >= 1) return 1;
  return raw;
}

export class Timeline<S> {
  private readonly initial: S;
  private readonly entries: TimelineStep<S>[];
  private dirty: boolean;

  constructor(initial: S) {
    this.initial = initial;
    this.entries = [];
    this.dirty = false;
  }

  /** Add a step. Insertion order does not matter; steps resolve in time order. */
  add(step: TimelineStep<S>): this {
    this.entries.push(step);
    this.dirty = true;
    return this;
  }

  /** Convenience for chaining a step that starts when the timeline currently ends. */
  then(step: Omit<TimelineStep<S>, "at">, gap = 0): this {
    return this.add({ ...step, at: this.duration + gap });
  }

  /** How many steps are registered. */
  get size(): number {
    return this.entries.length;
  }

  /** End time of the last step to finish. An empty timeline lasts 0 ms. */
  get duration(): number {
    let end = 0;
    for (const step of this.entries) {
      const stepEnd = step.at + Math.max(0, step.duration);
      if (stepEnd > end) end = stepEnd;
    }
    return end;
  }

  /**
   * Steps in resolution order: ascending `at`, ties broken by insertion order.
   *
   * Exposed because "later step wins on overlap" is a contract worth asserting
   * rather than a coincidence of Array.prototype.sort being stable.
   */
  ordered(): readonly TimelineStep<S>[] {
    if (this.dirty) {
      const indexed = this.entries.map((step, index) => ({ step, index }));
      indexed.sort((a, b) => (a.step.at === b.step.at ? a.index - b.index : a.step.at - b.step.at));
      this.entries.length = 0;
      for (const item of indexed) this.entries.push(item.step);
      this.dirty = false;
    }
    return this.entries;
  }

  /** Fold every step into the state as of time `t`. Pure: same t, same result. */
  at(t: number): S {
    let state = this.initial;
    for (const step of this.ordered()) {
      const raw = stepProgress(step, t);
      const eased = step.easing ? step.easing(raw) : raw;
      state = step.apply(state, eased);
    }
    return state;
  }

  /** Sample the timeline at `count` evenly spaced times, inclusive of both ends. */
  sample(count: number): S[] {
    const n = Math.max(1, Math.round(count));
    if (n === 1) return [this.at(0)];
    const total = this.duration;
    const out: S[] = [];
    for (let i = 0; i < n; i += 1) out.push(this.at((i / (n - 1)) * total));
    return out;
  }
}

/** Build a timeline from an initial state and a list of steps in any order. */
export function timeline<S>(initial: S, steps: TimelineStep<S>[] = []): Timeline<S> {
  const tl = new Timeline<S>(initial);
  for (const step of steps) tl.add(step);
  return tl;
}
