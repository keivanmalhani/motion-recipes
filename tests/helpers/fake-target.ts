/**
 * A stand-in for a DOM element that records every animate() call.
 *
 * jsdom does not implement the Web Animations API, so testing the recipes
 * against a real DOM would only prove that `element.animate` is undefined.
 * This is the useful test instead: run each recipe against a target that
 * satisfies the same structural contract an HTMLElement does, then assert on
 * the exact keyframes and timing options the recipe produced.
 *
 * The selector engine is deliberately tiny. It understands "[attr]" and
 * "[attr=value]", which is all the recipes use, and it manufactures matching
 * children on demand so the tests do not have to hand-author fourteen stage
 * trees just to reach the animate() calls.
 */

import type { AnimationLike, RecipeTarget } from "../../src/core/target.ts";

export interface RecordedCall {
  selector: string;
  keyframes: Keyframe[] | PropertyIndexedKeyframes | null;
  options: number | KeyframeAnimationOptions | undefined;
  animation: FakeAnimation;
}

export interface FakeAnimation extends AnimationLike {
  playbackRate: number;
  playState: string;
  cancelled: boolean;
  finished: boolean;
  cancel(): void;
  finish(): void;
}

export interface FakeRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FakeTargetOptions {
  /** How many children each querySelectorAll call manufactures. Default 4. */
  fanout?: number;
  /** Attributes every node reports, on top of the one implied by its selector. */
  attributes?: Record<string, string>;
  /** Layout box every node reports. Default a plausible non-zero box. */
  rect?: FakeRect;
  /** SVG path length reported by getTotalLength. Default 34. */
  pathLength?: number;
  /** Shared call log. Provided automatically to manufactured children. */
  log?: RecordedCall[];
  /** Selector that produced this node, recorded alongside its calls. */
  selector?: string;
  /** Remaining depth for manufactured descendants, to bound recursion. */
  depth?: number;
}

const DEFAULT_RECT: FakeRect = {
  x: 24,
  y: 40,
  width: 180,
  height: 96,
  top: 40,
  right: 204,
  bottom: 136,
  left: 24,
};

export const ZERO_RECT: FakeRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export interface FakeTarget extends RecipeTarget {
  selector: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
  textContent: string;
  classes: Set<string>;
  /** Every animate() call made anywhere in this subtree, in order. */
  log: RecordedCall[];
  /** Direct log of calls made on this node only. */
  calls: RecordedCall[];
  classList: {
    add(name: string): void;
    remove(name: string): void;
    toggle(name: string, force?: boolean): boolean;
    contains(name: string): boolean;
  };
  querySelector(selector: string): FakeTarget | null;
  querySelectorAll(selector: string): FakeTarget[];
  getBoundingClientRect(): FakeRect;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getTotalLength(): number;
}

function attributeFromSelector(selector: string): { name: string; value: string } | null {
  const match = /^\[([a-zA-Z0-9_-]+)(?:=["']?([^\]"']*)["']?)?\]$/.exec(selector.trim());
  if (!match) return null;
  return { name: match[1] as string, value: match[2] ?? "" };
}

export function createFakeTarget(options: FakeTargetOptions = {}): FakeTarget {
  const fanout = options.fanout ?? 4;
  const depth = options.depth ?? 3;
  const rect = options.rect ?? DEFAULT_RECT;
  const totalLength = options.pathLength ?? 34;
  const log = options.log ?? [];
  const seeded = options.attributes ?? {};
  const selector = options.selector ?? ":root";

  const attributes: Record<string, string> = { ...seeded };
  const implied = attributeFromSelector(selector);
  if (implied) attributes[implied.name] = implied.value || "true";

  const cache = new Map<string, FakeTarget[]>();
  const calls: RecordedCall[] = [];
  const classes = new Set<string>();

  const node: FakeTarget = {
    selector,
    attributes,
    style: {},
    textContent: "",
    classes,
    log,
    calls,
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, force) {
        const next = force === undefined ? !classes.has(name) : force;
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
      contains(name) {
        return classes.has(name);
      },
    },
    animate(keyframes, animationOptions) {
      const animation: FakeAnimation = {
        playbackRate: 1,
        playState: "running",
        cancelled: false,
        finished: false,
        cancel() {
          this.cancelled = true;
          this.playState = "idle";
        },
        finish() {
          this.finished = true;
          this.playState = "finished";
        },
      };
      const record: RecordedCall = {
        selector,
        keyframes,
        options: animationOptions,
        animation,
      };
      calls.push(record);
      log.push(record);
      return animation;
    },
    querySelectorAll(childSelector) {
      const cached = cache.get(childSelector);
      if (cached) return cached;
      const made =
        depth <= 0
          ? []
          : Array.from({ length: fanout }, () =>
              createFakeTarget({
                fanout,
                attributes: seeded,
                rect,
                pathLength: totalLength,
                log,
                selector: childSelector,
                depth: depth - 1,
              }),
            );
      cache.set(childSelector, made);
      return made;
    },
    querySelector(childSelector) {
      return node.querySelectorAll(childSelector)[0] ?? null;
    },
    getBoundingClientRect() {
      return rect;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    getTotalLength() {
      return totalLength;
    },
  };

  return node;
}

/** The most minimal legal target: it can animate and nothing else. */
export function createBareTarget(): { target: RecipeTarget; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const target: RecipeTarget = {
    animate(keyframes, options) {
      const animation: FakeAnimation = {
        playbackRate: 1,
        playState: "running",
        cancelled: false,
        finished: false,
        cancel() {
          this.cancelled = true;
          this.playState = "idle";
        },
        finish() {
          this.finished = true;
          this.playState = "finished";
        },
      };
      calls.push({ selector: ":bare", keyframes, options, animation });
      return animation;
    },
  };
  return { target, calls };
}
