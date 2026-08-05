/**
 * stagger.ts - per-index delays for a list of elements.
 *
 * A stagger is the cheapest way to make a list feel authored instead of
 * dumped. The distribution matters more than the amount: linear reads as a
 * queue, from-center reads as a bloom, from-edges reads as a closing gate.
 *
 * Pure integer and float math. No DOM, no timers.
 */

export type StaggerMode = "linear" | "from-center" | "from-edges" | "grid-distance";

export const STAGGER_MODES: readonly StaggerMode[] = [
  "linear",
  "from-center",
  "from-edges",
  "grid-distance",
];

export interface StaggerOptions {
  /** Distribution shape. Default "linear". */
  mode?: StaggerMode;
  /** Milliseconds of delay per unit of distance. Default 40. */
  each?: number;
  /**
   * Hard ceiling on the total stagger span in ms. When the computed delays
   * would exceed it, every delay is scaled down proportionally.
   *
   * This exists because staggers are the single most common way to make a UI
   * feel slow: 24 rows at 60 ms each is a 1.4 second wait before the last row
   * even starts moving. Default 320.
   */
  max?: number;
  /** Columns for "grid-distance". Ignored by the other modes. Default 1. */
  columns?: number;
  /**
   * Grid origin as [column, row], both zero-based. Defaults to the geometric
   * centre of the grid. Only used by "grid-distance".
   */
  origin?: [number, number];
}

const DEFAULT_EACH = 40;
const DEFAULT_MAX = 320;

/**
 * Compute the delay, in ms, for every index in a list of `count` items.
 *
 * Guarantees, all covered by tests:
 *  - length always equals max(count, 0)
 *  - every delay is >= 0
 *  - the largest delay never exceeds `max`
 *  - a single item is always 0, whatever the mode
 */
export function stagger(count: number, options: StaggerOptions = {}): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  if (n === 1) return [0];

  const mode = options.mode ?? "linear";
  const each = Math.max(0, options.each ?? DEFAULT_EACH);
  const max = Math.max(0, options.max ?? DEFAULT_MAX);

  const distances = distanceProfile(n, mode, options);

  let peak = 0;
  for (const d of distances) if (d > peak) peak = d;

  const raw = distances.map((d) => d * each);
  const rawPeak = peak * each;

  // Scale down rather than clip, so the shape of the distribution survives.
  const factor = rawPeak > max && rawPeak > 0 ? max / rawPeak : 1;
  return raw.map((value) => value * factor);
}

/** Unitless distance from the stagger origin for each index. */
function distanceProfile(n: number, mode: StaggerMode, options: StaggerOptions): number[] {
  switch (mode) {
    case "linear": {
      return Array.from({ length: n }, (_, i) => i);
    }
    case "from-center": {
      const centre = (n - 1) / 2;
      return Array.from({ length: n }, (_, i) => Math.abs(i - centre));
    }
    case "from-edges": {
      const centre = (n - 1) / 2;
      // The exact complement of from-center, so center[i] + edges[i] is
      // constant across i. That invariant is asserted in the tests.
      return Array.from({ length: n }, (_, i) => centre - Math.abs(i - centre));
    }
    case "grid-distance": {
      const columns = Math.max(1, Math.floor(options.columns ?? 1));
      const rows = Math.ceil(n / columns);
      const originCol = options.origin ? options.origin[0] : (columns - 1) / 2;
      const originRow = options.origin ? options.origin[1] : (rows - 1) / 2;
      return Array.from({ length: n }, (_, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        return Math.hypot(col - originCol, row - originRow);
      });
    }
    default: {
      // Unknown modes fall back to linear rather than throwing. A stagger is
      // decoration; it should never be the reason a page fails to render.
      return Array.from({ length: n }, (_, i) => i);
    }
  }
}

/** Total span of a delay list: the largest delay in it. */
export function staggerSpan(delays: readonly number[]): number {
  let peak = 0;
  for (const d of delays) if (d > peak) peak = d;
  return peak;
}
