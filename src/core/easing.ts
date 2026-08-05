/**
 * easing.ts - named easing curves and a spring-to-keyframes solver.
 *
 * Pure math. No DOM, no imports, no side effects. Everything in this file is
 * unit testable in a plain node process, which is the whole point of keeping
 * src/core separate from src/ui.
 */

/** A normalized easing function: takes progress 0..1, returns eased 0..1. */
export type EasingFunction = (t: number) => number;

/** The four control-point coordinates of a CSS cubic-bezier() curve. */
export interface BezierPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Value of the cubic polynomial for one axis at parameter u. */
function bezierAxis(u: number, a1: number, a2: number): number {
  const c = 3 * a1;
  const b = 3 * (a2 - a1) - c;
  const a = 1 - c - b;
  return ((a * u + b) * u + c) * u;
}

/** Derivative of the cubic polynomial for one axis at parameter u. */
function bezierAxisSlope(u: number, a1: number, a2: number): number {
  const c = 3 * a1;
  const b = 3 * (a2 - a1) - c;
  const a = 1 - c - b;
  return (3 * a * u + 2 * b) * u + c;
}

const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_SLOPE = 1e-4;
const BISECTION_ITERATIONS = 24;
const SUBDIVISION_EPSILON = 1e-7;

/**
 * Build a CSS-equivalent cubic-bezier easing function.
 *
 * Solves x(u) = t for u with Newton-Raphson, falling back to bisection when
 * the curve is too flat for Newton to converge. This is the same strategy the
 * browsers use, so a JS-computed curve and a CSS `cubic-bezier()` string with
 * the same control points agree to within float noise.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  // A linear curve needs no solving, and dodges a divide-by-zero in Newton.
  if (x1 === y1 && x2 === y2) {
    return (t: number) => clamp(t, 0, 1);
  }

  const solveU = (t: number): number => {
    let u = t;
    for (let i = 0; i < NEWTON_ITERATIONS; i += 1) {
      const slope = bezierAxisSlope(u, x1, x2);
      if (Math.abs(slope) < NEWTON_MIN_SLOPE) break;
      const currentX = bezierAxis(u, x1, x2) - t;
      u -= currentX / slope;
    }
    if (u >= 0 && u <= 1 && Math.abs(bezierAxis(u, x1, x2) - t) < SUBDIVISION_EPSILON) {
      return u;
    }
    // Newton wandered off. Bisect on the guaranteed-monotonic x axis instead.
    let low = 0;
    let high = 1;
    let mid = t;
    for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
      mid = (low + high) / 2;
      const x = bezierAxis(mid, x1, x2);
      if (Math.abs(x - t) < SUBDIVISION_EPSILON) return mid;
      if (x < t) low = mid;
      else high = mid;
    }
    return mid;
  };

  return (t: number): number => {
    // Endpoints are exact by definition. Returning early keeps them free of
    // the solver's floating point residue.
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return bezierAxis(solveU(t), y1, y2);
  };
}

/**
 * The named curves used across the recipe set.
 *
 * These are deliberately few. A design system with fourteen easings has no
 * easing system at all; it has fourteen opinions.
 */
export const BEZIERS = {
  /** Symmetric, safe, boring. Good for things that move a short distance. */
  standard: { x1: 0.4, y1: 0.0, x2: 0.2, y2: 1.0 },
  /** Fast out of the gate, long tail. The default for entrances. */
  decelerate: { x1: 0.05, y1: 0.7, x2: 0.1, y2: 1.0 },
  /** Slow start, fast finish. The default for exits and dismissals. */
  accelerate: { x1: 0.3, y1: 0.0, x2: 0.8, y2: 0.15 },
  /** Overshoots past 1 then settles. Cheap personality without a spring. */
  overshoot: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1.0 },
  /** Anticipates backwards before moving forwards. Use sparingly. */
  anticipate: { x1: 0.5, y1: -0.4, x2: 0.5, y2: 1.0 },
  /** Near-instant response with a soft landing. For hover and press states. */
  snappy: { x1: 0.2, y1: 0.9, x2: 0.2, y2: 1.0 },
} as const satisfies Record<string, BezierPoints>;

export type EasingName = keyof typeof BEZIERS;

/** All named easings as ready-to-call functions. */
export const EASING: Record<EasingName, EasingFunction> = {
  standard: cubicBezier(BEZIERS.standard.x1, BEZIERS.standard.y1, BEZIERS.standard.x2, BEZIERS.standard.y2),
  decelerate: cubicBezier(
    BEZIERS.decelerate.x1,
    BEZIERS.decelerate.y1,
    BEZIERS.decelerate.x2,
    BEZIERS.decelerate.y2,
  ),
  accelerate: cubicBezier(
    BEZIERS.accelerate.x1,
    BEZIERS.accelerate.y1,
    BEZIERS.accelerate.x2,
    BEZIERS.accelerate.y2,
  ),
  overshoot: cubicBezier(
    BEZIERS.overshoot.x1,
    BEZIERS.overshoot.y1,
    BEZIERS.overshoot.x2,
    BEZIERS.overshoot.y2,
  ),
  anticipate: cubicBezier(
    BEZIERS.anticipate.x1,
    BEZIERS.anticipate.y1,
    BEZIERS.anticipate.x2,
    BEZIERS.anticipate.y2,
  ),
  snappy: cubicBezier(BEZIERS.snappy.x1, BEZIERS.snappy.y1, BEZIERS.snappy.x2, BEZIERS.snappy.y2),
};

/** The same curves as CSS strings, for the `easing` field of a WAAPI options bag. */
export function cssEasing(name: EasingName): string {
  const p = BEZIERS[name];
  return `cubic-bezier(${p.x1}, ${p.y1}, ${p.x2}, ${p.y2})`;
}

/** Easings named for the CSS string, so snippets can be copied without imports. */
export const CSS_EASING: Record<EasingName, string> = {
  standard: cssEasing("standard"),
  decelerate: cssEasing("decelerate"),
  accelerate: cssEasing("accelerate"),
  overshoot: cssEasing("overshoot"),
  anticipate: cssEasing("anticipate"),
  snappy: cssEasing("snappy"),
};

/* ------------------------------------------------------------------------- *
 * Spring solver
 * ------------------------------------------------------------------------- */

export interface SpringOptions {
  /** Spring constant. Higher is tighter and faster. Default 220. */
  stiffness?: number;
  /** Viscous damping. Higher settles sooner with less overshoot. Default 22. */
  damping?: number;
  /** Mass of the body. Higher is slower and heavier. Default 1. */
  mass?: number;
  /** Initial velocity in units per second. Default 0. */
  velocity?: number;
  /** Start value. Default 0. */
  from?: number;
  /** End value. Default 1. */
  to?: number;
  /** Position tolerance for "settled", as a fraction of the travel. Default 0.001. */
  restDelta?: number;
  /** Velocity tolerance for "settled", as a fraction of travel per second. Default 0.01. */
  restSpeed?: number;
  /** Hard ceiling on simulated time in ms. Default 6000. */
  maxDurationMs?: number;
  /** Integration steps per second. Default 480. */
  sampleRateHz?: number;
  /** Number of keyframes to emit. Default 0, meaning "pick a sensible count". */
  frameCount?: number;
}

export interface SpringSolution {
  /** Sampled values from `from` to `to`, evenly spaced in time. */
  keyframes: number[];
  /** Simulated settle time in ms. Always finite and positive. */
  duration: number;
  /**
   * Largest excursion past the target, as a fraction of the travel distance.
   * 0 means critically damped or slower. 0.12 means it went 12 percent past.
   */
  overshoot: number;
  /** False when the guard tripped before the spring came to rest. */
  settled: boolean;
  /** Integration steps actually taken. Compare against `maxSteps` in tests. */
  steps: number;
  /** The guard value the loop was allowed to reach. */
  maxSteps: number;
}

/** Smallest value we allow for parameters that would otherwise divide by zero. */
const MIN_POSITIVE = 1e-6;
/** Absolute ceiling on integration steps, independent of maxDurationMs. */
const HARD_STEP_LIMIT = 50000;
/**
 * Target for `rate * dt` inside the integrator.
 *
 * Semi-implicit Euler diverges once the step is large relative to the spring's
 * natural frequency. Rather than trusting the caller to pick a sane
 * sampleRateHz, the loop subdivides each recorded step until this holds.
 */
const STABILITY_TARGET = 0.2;
/** Ceiling on substeps per recorded step, so the total work stays bounded. */
const MAX_SUBSTEPS = 128;

/** Coerce a possibly missing or non-finite option to a usable number. */
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const DEFAULT_SPRING: Required<SpringOptions> = {
  stiffness: 220,
  damping: 22,
  mass: 1,
  velocity: 0,
  from: 0,
  to: 1,
  restDelta: 0.001,
  restSpeed: 0.01,
  maxDurationMs: 6000,
  sampleRateHz: 480,
  frameCount: 0,
};

/**
 * Numerically integrate a damped harmonic oscillator and emit WAAPI keyframes.
 *
 * Semi-implicit Euler, recorded at `sampleRateHz` and internally subdivided
 * until the step is small relative to the spring's natural frequency. The
 * subdivision is not academic: at a fixed 480 Hz step, a stiffness of 1e9
 * diverges to Infinity within a dozen iterations and every keyframe comes out
 * NaN. A NaN in a transform string kills the animation silently.
 *
 * Every loop in here is bounded twice: substeps per recorded step, and
 * recorded steps overall. A zero-damping spring never settles, so the step
 * guard is not decoration; it is the only reason this function returns.
 */
export function solveSpring(options: SpringOptions = {}): SpringSolution {
  const stiffness = Math.max(MIN_POSITIVE, finiteOr(options.stiffness, DEFAULT_SPRING.stiffness));
  const damping = Math.max(0, finiteOr(options.damping, DEFAULT_SPRING.damping));
  const mass = Math.max(MIN_POSITIVE, finiteOr(options.mass, DEFAULT_SPRING.mass));
  const velocity0 = finiteOr(options.velocity, DEFAULT_SPRING.velocity);
  const from = finiteOr(options.from, DEFAULT_SPRING.from);
  const to = finiteOr(options.to, DEFAULT_SPRING.to);
  const restDelta = Math.max(MIN_POSITIVE, finiteOr(options.restDelta, DEFAULT_SPRING.restDelta));
  const restSpeed = Math.max(MIN_POSITIVE, finiteOr(options.restSpeed, DEFAULT_SPRING.restSpeed));
  const maxDurationMs = Math.max(1, finiteOr(options.maxDurationMs, DEFAULT_SPRING.maxDurationMs));
  const sampleRateHz = Math.max(1, finiteOr(options.sampleRateHz, DEFAULT_SPRING.sampleRateHz));

  const travel = to - from;
  // A zero-travel spring has no meaningful trajectory. Return the shortest
  // legal answer rather than dividing by zero downstream.
  const scale = Math.abs(travel) < MIN_POSITIVE ? 1 : Math.abs(travel);

  const dt = 1 / sampleRateHz;
  const maxSteps = Math.min(HARD_STEP_LIMIT, Math.ceil((maxDurationMs / 1000) * sampleRateHz));

  // The two rates that can destabilise the integrator: the undamped natural
  // frequency and the viscous decay rate. Subdivide until the faster of them
  // is resolved.
  const naturalRate = Math.sqrt(stiffness / mass);
  const dampingRate = damping / mass;
  const fastest = Math.max(naturalRate, dampingRate);
  const substeps = Math.min(
    MAX_SUBSTEPS,
    Math.max(1, Math.ceil((fastest * dt) / STABILITY_TARGET)),
  );
  const h = dt / substeps;

  const trajectory: number[] = [from];
  let position = from;
  let velocity = velocity0;
  let steps = 0;
  let settled = false;
  let maxOvershoot = 0;

  while (steps < maxSteps) {
    for (let i = 0; i < substeps; i += 1) {
      const displacement = position - to;
      const springForce = -stiffness * displacement;
      const dampingForce = -damping * velocity;
      const acceleration = (springForce + dampingForce) / mass;
      velocity += acceleration * h;
      position += velocity * h;
    }
    steps += 1;

    // A spring that still blows up despite subdivision is not worth chasing
    // further; freeze it on target so callers get usable keyframes.
    if (!Number.isFinite(position) || !Number.isFinite(velocity)) {
      position = to;
      velocity = 0;
      trajectory.push(position);
      settled = true;
      break;
    }

    trajectory.push(position);

    // Track how far past the target we travelled, in the direction of travel.
    const past = travel >= 0 ? position - to : to - position;
    if (past > 0) maxOvershoot = Math.max(maxOvershoot, past / scale);

    if (Math.abs(position - to) / scale < restDelta && Math.abs(velocity) / scale < restSpeed) {
      settled = true;
      break;
    }
  }

  // Snap the final sample so consumers can rely on the animation landing
  // exactly on target, even when the guard tripped.
  trajectory[trajectory.length - 1] = to;

  const duration = Math.max(1, (steps / sampleRateHz) * 1000);

  const requestedFrames = options.frameCount ?? DEFAULT_SPRING.frameCount;
  const frameCount =
    requestedFrames > 0
      ? Math.max(2, Math.min(240, Math.round(requestedFrames)))
      : // Roughly one keyframe per 60 Hz display frame, clamped so short
        // springs still read as curves and long ones do not bloat the payload.
        Math.max(6, Math.min(120, Math.round((duration / 1000) * 60)));

  const keyframes = resampleTrajectory(trajectory, frameCount);

  return { keyframes, duration, overshoot: maxOvershoot, settled, steps, maxSteps };
}

/** Linearly resample a dense trajectory down to `count` evenly spaced values. */
function resampleTrajectory(trajectory: number[], count: number): number[] {
  const last = trajectory.length - 1;
  if (last <= 0) {
    const only = trajectory[0] ?? 0;
    return new Array<number>(count).fill(only);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const position = (i / (count - 1)) * last;
    const low = Math.floor(position);
    const high = Math.min(last, low + 1);
    const t = position - low;
    const a = trajectory[low] as number;
    const b = trajectory[high] as number;
    out.push(a + (b - a) * t);
  }
  return out;
}

/**
 * Map a spring solution onto CSS values.
 *
 * `template` receives each sampled value and returns a CSS string, so the same
 * solve can drive `scale()`, `translateX()`, or anything else.
 */
export function springKeyframes(
  solution: SpringSolution,
  template: (value: number) => string,
): string[] {
  return solution.keyframes.map(template);
}

/**
 * A decaying oscillation, used by the shake recipe.
 *
 * Returns `samples` values that start at 0, alternate sign, lose amplitude
 * exponentially, and end at exactly 0. Emitting the decay as keyframes rather
 * than looping a fixed shake is what makes an error state read as "physical
 * object hit a wall" instead of "CSS animation with iteration-count: 3".
 */
export function decayOscillation(
  amplitude: number,
  cycles: number,
  samples: number,
  decay = 3.2,
): number[] {
  const count = Math.max(2, Math.round(samples));
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    if (i === 0 || i === count - 1) {
      out.push(0);
      continue;
    }
    out.push(amplitude * Math.exp(-decay * t) * Math.sin(t * Math.PI * 2 * cycles));
  }
  return out;
}
