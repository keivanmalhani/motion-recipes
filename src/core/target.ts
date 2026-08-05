/**
 * target.ts - the narrow surface a recipe is allowed to touch.
 *
 * A recipe receives a `RecipeTarget`: something that can `animate()`. That is
 * the only member the type requires, which has two useful consequences.
 *
 * 1. A real `HTMLElement` satisfies it structurally, so the UI passes elements
 *    straight through with no cast and no wrapper object.
 * 2. A twelve-line stub in a test file also satisfies it, so every recipe can
 *    be executed headlessly and the keyframes it produces can be asserted on.
 *    jsdom has no Web Animations API; this is how we test around that.
 *
 * Everything else a recipe might want (children, rects, styles, attributes) is
 * reached through the guarded accessors below, which return a safe empty value
 * instead of throwing when the member is missing. No DOM is ever constructed
 * here: recipes read and animate, the UI owns markup.
 */

/** The subset of `Animation` the engine uses. */
export interface AnimationLike {
  playbackRate: number;
  cancel(): void;
  finish(): void;
  playState?: string;
}

/** Anything animatable. `HTMLElement` and `SVGElement` both qualify. */
export interface RecipeTarget {
  animate(
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ): AnimationLike;
}

/**
 * WAAPI options with `duration` and `easing` promoted to required.
 *
 * Timing is not optional in this library. A recipe that forgets a duration
 * gets the 400 ms browser default and reads as an accident; the type makes
 * that impossible, and a test asserts it holds for all fourteen recipes.
 */
export interface AnimateOptions extends KeyframeAnimationOptions {
  duration: number;
  easing: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const EMPTY_RECT: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

/** All descendants of `el` matching `selector`, or [] if lookup is unavailable. */
export function childTargets(el: RecipeTarget, selector: string): RecipeTarget[] {
  const query = (el as { querySelectorAll?: (s: string) => ArrayLike<RecipeTarget> })
    .querySelectorAll;
  if (typeof query !== "function") return [];
  try {
    const list = query.call(el, selector);
    if (!list || typeof list.length !== "number") return [];
    return Array.prototype.slice.call(list) as RecipeTarget[];
  } catch {
    return [];
  }
}

/** First descendant of `el` matching `selector`, or null. */
export function childTarget(el: RecipeTarget, selector: string): RecipeTarget | null {
  const query = (el as { querySelector?: (s: string) => RecipeTarget | null }).querySelector;
  if (typeof query !== "function") return null;
  try {
    return query.call(el, selector) ?? null;
  } catch {
    return null;
  }
}

/** Layout box of `el`, or a zero rect when measurement is unavailable. */
export function rectOf(el: RecipeTarget | null): Rect {
  if (!el) return EMPTY_RECT;
  const measure = (el as { getBoundingClientRect?: () => Partial<Rect> }).getBoundingClientRect;
  if (typeof measure !== "function") return EMPTY_RECT;
  try {
    const r = measure.call(el);
    if (!r) return EMPTY_RECT;
    return {
      x: numberOr(r.x, 0),
      y: numberOr(r.y, 0),
      width: numberOr(r.width, 0),
      height: numberOr(r.height, 0),
      top: numberOr(r.top, 0),
      right: numberOr(r.right, 0),
      bottom: numberOr(r.bottom, 0),
      left: numberOr(r.left, 0),
    };
  } catch {
    return EMPTY_RECT;
  }
}

/** camelCase to the kebab-case name CSSOM's setProperty expects. */
function cssPropertyName(property: string): string {
  if (property.startsWith("--")) return property;
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Set one inline style property.
 *
 * Prefers setProperty over assigning the IDL attribute. Both work for common
 * properties, but setProperty is the only path guaranteed to accept custom
 * properties and the long tail of SVG presentation attributes, whose IDL
 * attributes are missing in more environments than you would expect.
 */
export function setStyle(el: RecipeTarget | null, property: string, value: string): void {
  if (!el) return;
  const style = (el as { style?: Record<string, string> }).style;
  if (!style || typeof style !== "object") return;

  const setProperty = (style as unknown as { setProperty?: (k: string, v: string) => void })
    .setProperty;
  if (typeof setProperty === "function") {
    try {
      setProperty.call(style, cssPropertyName(property), value);
      return;
    } catch {
      /* fall through to direct assignment */
    }
  }
  if (property.startsWith("--")) return;
  style[property] = value;
}

/** Read an attribute, or null when unavailable. */
export function getAttr(el: RecipeTarget | null, name: string): string | null {
  if (!el) return null;
  const get = (el as { getAttribute?: (n: string) => string | null }).getAttribute;
  if (typeof get !== "function") return null;
  try {
    return get.call(el, name);
  } catch {
    return null;
  }
}

/** Write an attribute. No-op when unavailable. */
export function setAttr(el: RecipeTarget | null, name: string, value: string): void {
  if (!el) return;
  const set = (el as { setAttribute?: (n: string, v: string) => void }).setAttribute;
  if (typeof set !== "function") return;
  try {
    set.call(el, name, value);
  } catch {
    /* attribute is not settable on this target; nothing to recover */
  }
}

/** Read a numeric attribute with a fallback for missing or unparsable values. */
export function readNumber(el: RecipeTarget | null, name: string, fallback: number): number {
  const raw = getAttr(el, name);
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Replace text content. No-op when unavailable. */
export function setText(el: RecipeTarget | null, text: string): void {
  if (!el) return;
  const holder = el as { textContent?: string | null };
  if (!("textContent" in holder)) return;
  holder.textContent = text;
}

/** Read text content, or "" when unavailable. */
export function getText(el: RecipeTarget | null): string {
  if (!el) return "";
  const holder = el as { textContent?: string | null };
  return typeof holder.textContent === "string" ? holder.textContent : "";
}

/** Toggle a class and report the resulting state. Returns false when unavailable. */
export function toggleClass(el: RecipeTarget | null, name: string, force?: boolean): boolean {
  if (!el) return false;
  const list = (el as { classList?: { toggle?: (n: string, f?: boolean) => boolean } }).classList;
  const toggle = list?.toggle;
  if (typeof toggle !== "function") return false;
  try {
    return force === undefined ? toggle.call(list, name) : toggle.call(list, name, force);
  } catch {
    return false;
  }
}

/** Total length of an SVG path, or `fallback` when the target is not a path. */
export function pathLength(el: RecipeTarget | null, fallback: number): number {
  if (!el) return fallback;
  const total = (el as { getTotalLength?: () => number }).getTotalLength;
  if (typeof total !== "function") return fallback;
  try {
    const value = total.call(el);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Divide two measured lengths without ever producing NaN or Infinity.
 *
 * FLIP is division by a measured box. A collapsed or not-yet-laid-out element
 * measures 0, and `0 / 0` in a transform string silently kills the whole
 * animation. Falling back to 1 degrades to "no scale", which is survivable.
 */
export function safeRatio(numerator: number, denominator: number, fallback = 1): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return fallback;
  if (Math.abs(denominator) < 1e-6) return fallback;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
