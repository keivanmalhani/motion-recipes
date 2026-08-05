/**
 * recipes.ts - the registry.
 *
 * Every recipe is data: an id, a title, the paragraph explaining why the
 * timing works, a copy-paste snippet, and a `run()` that drives the live demo
 * through the Web Animations API.
 *
 * The registry is exported as a plain array so the UI and the test suite
 * iterate exactly the same source of truth. Adding a recipe adds a card to the
 * page and adds it to every registry assertion at the same time.
 *
 * `run()` never creates an element. It queries inside the stage the UI already
 * rendered, measures, and animates. That is what keeps this file importable
 * from a node test process.
 */

import { CSS_EASING, EASING, decayOscillation, solveSpring } from "./easing.ts";
import { animate, drive } from "./runtime.ts";
import {
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
} from "./target.ts";
import type { RecipeTarget } from "./target.ts";
import { stagger } from "./stagger.ts";

export type RecipeCategory = "feedback" | "entrance" | "state" | "transition";

export const RECIPE_CATEGORIES: readonly RecipeCategory[] = [
  "feedback",
  "entrance",
  "state",
  "transition",
];

export interface Recipe {
  /** Stable kebab-case identifier. Also the DOM id of the card. */
  id: string;
  /** Short human label. */
  title: string;
  /** One paragraph on why the timing works. This is the actual product. */
  blurb: string;
  category: RecipeCategory;
  /** Copy-paste JavaScript. Plain JS, no imports, under thirty lines. */
  snippet: string;
  /** Play the demo inside an already-rendered stage element. */
  run: (element: RecipeTarget) => void;
}

/* ------------------------------------------------------------------------- *
 * Shared pure helpers (exported so the tests can pin them down directly)
 * ------------------------------------------------------------------------- */

export interface MotionPhase {
  /** Length of this phase in ms. */
  duration: number;
  /** Values sampled evenly across the phase, first and last inclusive. */
  samples: number[];
}

export interface PhasedKeyframes {
  total: number;
  offsets: number[];
  values: number[];
}

/**
 * Concatenate several sampled phases into one offset/value pair of arrays.
 *
 * Springs are solved independently of the phase that leads into them, so
 * something has to splice "compress for 90 ms" onto "then spring back for 380"
 * and turn the pair into offsets in 0..1. Duplicate joint samples are dropped
 * so the resulting offsets are strictly usable by WAAPI.
 */
export function phaseKeyframes(phases: MotionPhase[]): PhasedKeyframes {
  const total = phases.reduce((sum, phase) => sum + Math.max(0, phase.duration), 0);
  const offsets: number[] = [];
  const values: number[] = [];
  let elapsed = 0;

  phases.forEach((phase, phaseIndex) => {
    const count = phase.samples.length;
    const duration = Math.max(0, phase.duration);
    for (let i = 0; i < count; i += 1) {
      // The last sample of phase N and the first of phase N+1 land on the same
      // instant. Keep one of them.
      if (phaseIndex > 0 && i === 0 && offsets.length > 0) continue;
      const local = count <= 1 ? duration : (i / (count - 1)) * duration;
      const offset = total > 0 ? (elapsed + local) / total : 1;
      offsets.push(Math.min(1, Math.max(0, offset)));
      values.push(phase.samples[i] as number);
    }
    elapsed += duration;
  });

  if (offsets.length > 0) {
    offsets[0] = 0;
    offsets[offsets.length - 1] = 1;
  }

  return { total, offsets, values };
}

/** Build WAAPI keyframes from a phased solve, formatting each value as CSS. */
function phasedTransform(
  phases: MotionPhase[],
  template: (value: number) => string,
): { frames: Keyframe[]; duration: number } {
  const { total, offsets, values } = phaseKeyframes(phases);
  const frames = values.map((value, i) => ({
    transform: template(value),
    offset: offsets[i] as number,
  }));
  return { frames, duration: Math.max(1, total) };
}

/**
 * Pointer pull with quadratic falloff, used by the magnetic hover recipe.
 *
 * Quadratic rather than linear because a linear falloff makes the element
 * twitch the instant the pointer enters the radius. Squaring it means the
 * effect starts at zero and builds, which is what reads as magnetism.
 */
export function magneticOffset(
  dx: number,
  dy: number,
  radius: number,
  strength: number,
): { x: number; y: number } {
  if (!(radius > 0)) return { x: 0, y: 0 };
  const distance = Math.hypot(dx, dy);
  const falloff = Math.max(0, 1 - distance / radius);
  const pull = falloff * falloff * strength;
  return { x: dx * pull, y: dy * pull };
}

export const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>[]{}$@";

/**
 * One frame of the text scramble.
 *
 * Resolves strictly left to right and always preserves spaces and length, so
 * the line never reflows mid-animation. A scramble that changes width is a
 * layout shift wearing a costume.
 */
export function scrambleText(text: string, progress: number, random: () => number): string {
  const p = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  const resolved = Math.floor(text.length * p + 1e-9);
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (i < resolved || char === " ") {
      out += char;
      continue;
    }
    const index = Math.floor(random() * SCRAMBLE_GLYPHS.length);
    out += SCRAMBLE_GLYPHS.charAt(index) || char;
  }
  return out;
}

/** Deterministic 32-bit PRNG (mulberry32). Same seed, same scramble, every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ASCII thousands separators, without depending on the host locale. */
export function formatThousands(value: number): string {
  const rounded = Math.round(value);
  const negative = rounded < 0;
  const digits = String(Math.abs(rounded));
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits.charAt(i);
  }
  return negative ? `-${out}` : out;
}

/* ------------------------------------------------------------------------- *
 * The recipes
 * ------------------------------------------------------------------------- */

export const RECIPES: Recipe[] = [
  {
    id: "spring-press",
    title: "Spring press",
    category: "feedback",
    blurb:
      "A press has two jobs: acknowledge the touch immediately, and prove the control is a physical thing. The compression is short and eased, then the release runs a solved spring baked into keyframes and played back with easing set to linear. Baking matters. If you leave a cubic-bezier on an animation whose values already describe a spring you ease the easing, the overshoot flattens, and the button feels mushy for reasons that are very hard to see in a diff.",
    snippet: [
      "// Solve the spring once, bake it into keyframes, play it linear.",
      "function springPress(el) {",
      "  const samples = [];",
      "  let x = 0.92, v = 0;",
      "  const dt = 1 / 240, k = 520, c = 17, m = 1.1;",
      "  for (let i = 0; i < 240; i++) {",
      "    v += ((-k * (x - 1) - c * v) / m) * dt;",
      "    x += v * dt;",
      "    samples.push(x);",
      "    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;",
      "  }",
      "  const frames = [",
      '    { transform: "scale(1)", offset: 0 },',
      '    { transform: "scale(0.92)", offset: 0.2 },',
      "  ];",
      "  samples.forEach((s, i) => {",
      "    frames.push({",
      '      transform: "scale(" + s.toFixed(4) + ")",',
      "      offset: 0.2 + (0.8 * (i + 1)) / samples.length,",
      "    });",
      "  });",
      "  const settle = (samples.length / 240) * 1000;",
      '  el.animate(frames, { duration: 90 + settle, easing: "linear" });',
      "}",
    ].join("\n"),
    run: (element) => {
      const button = childTarget(element, "[data-press]") ?? element;
      const spring = solveSpring({ stiffness: 520, damping: 17, mass: 1.1, from: 0.92, to: 1 });
      const { frames, duration } = phasedTransform(
        [
          { duration: 90, samples: [1, 0.92] },
          { duration: spring.duration, samples: spring.keyframes },
        ],
        (value) => `scale(${value.toFixed(4)})`,
      );
      animate(button, frames, { duration, easing: "linear", fill: "none" });

      const glow = childTarget(element, "[data-press-glow]");
      animate(
        glow,
        [
          { opacity: 0, transform: "scale(0.6)" },
          { opacity: 0.55, transform: "scale(1)", offset: 0.25 },
          { opacity: 0, transform: "scale(1.35)" },
        ],
        { duration: Math.round(duration * 0.9), easing: CSS_EASING.decelerate, fill: "none" },
      );
    },
  },

  {
    id: "magnetic-hover",
    title: "Magnetic hover",
    category: "feedback",
    blurb:
      "The element follows the pointer at a fraction of its actual travel, with the pull falling off as the square of the distance so it starts from nothing instead of snapping on at the radius edge. Never let it travel more than about a third of its own width: past that it stops reading as attraction and starts reading as a bug. The release is a spring, because a linear return makes the element feel like it was dragged rather than pulled.",
    snippet: [
      "// Quadratic falloff, capped travel, spring on release.",
      "function magnetic(el, radius, strength) {",
      '  el.addEventListener("pointermove", (event) => {',
      "    const r = el.getBoundingClientRect();",
      "    const dx = event.clientX - (r.left + r.width / 2);",
      "    const dy = event.clientY - (r.top + r.height / 2);",
      "    const falloff = Math.max(0, 1 - Math.hypot(dx, dy) / radius);",
      "    const pull = falloff * falloff * strength;",
      '    el.style.transform = "translate3d(" + dx * pull +',
      '      "px," + dy * pull + "px,0)";',
      "  });",
      '  el.addEventListener("pointerleave", () => {',
      '    const last = el.style.transform || "none";',
      '    el.style.transform = "";',
      '    el.animate([{ transform: last }, { transform: "none" }], {',
      "      duration: 520,",
      '      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",',
      "    });",
      "  });",
      "}",
    ].join("\n"),
    run: (element) => {
      const magnet = childTarget(element, "[data-magnet]") ?? element;
      const pull = magneticOffset(64, -40, 160, 0.42);
      const release = solveSpring({ stiffness: 240, damping: 15, mass: 1, from: 1, to: 0 });
      const { total, offsets, values } = phaseKeyframes([
        { duration: 260, samples: [0, 0.45, 0.8, 1] },
        { duration: release.duration, samples: release.keyframes },
      ]);
      const frames: Keyframe[] = values.map((value, i) => ({
        transform: `translate3d(${(pull.x * value).toFixed(2)}px, ${(pull.y * value).toFixed(2)}px, 0)`,
        offset: offsets[i] as number,
      }));
      animate(magnet, frames, { duration: Math.max(1, total), easing: "linear", fill: "none" });

      const halo = childTarget(element, "[data-magnet-field]");
      animate(
        halo,
        [
          { opacity: 0, transform: "scale(0.85)" },
          { opacity: 0.9, transform: "scale(1)", offset: 0.3 },
          { opacity: 0, transform: "scale(1.1)" },
        ],
        { duration: Math.max(1, total), easing: CSS_EASING.standard, fill: "none" },
      );
    },
  },

  {
    id: "stagger-reveal",
    title: "Stagger reveal",
    category: "entrance",
    blurb:
      "The delay is a function of distance from the middle of the list, not of index, so the list blooms outward instead of unrolling like a receipt. The total span is capped rather than the per-item delay: twenty rows at sixty milliseconds each is a one-second wait before the last row moves, and users read that as a slow page, not a considered one. Cap the span, scale the per-item delay to fit, and the effect survives contact with real data.",
    snippet: [
      "// Delay by distance from the middle, and cap the total span.",
      "function revealFromCenter(rows, each, maxSpan) {",
      "  const centre = (rows.length - 1) / 2;",
      "  const distance = rows.map((_, i) => Math.abs(i - centre));",
      "  const peak = Math.max(...distance, 1) * each;",
      "  const scale = peak > maxSpan ? maxSpan / peak : 1;",
      "  rows.forEach((row, i) => {",
      "    row.animate(",
      "      [",
      '        { opacity: 0, transform: "translateY(14px) scale(0.985)" },',
      '        { opacity: 1, transform: "none" },',
      "      ],",
      "      {",
      "        duration: 420,",
      "        delay: distance[i] * each * scale,",
      '        easing: "cubic-bezier(0.05, 0.7, 0.1, 1)",',
      '        fill: "backwards",',
      "      }",
      "    );",
      "  });",
      "}",
    ].join("\n"),
    run: (element) => {
      const rows = childTargets(element, "[data-row]");
      const delays = stagger(rows.length, { mode: "from-center", each: 55, max: 260 });
      rows.forEach((row, i) => {
        animate(
          row,
          [
            { opacity: 0, transform: "translateY(14px) scale(0.985)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: 420,
            delay: Math.round(delays[i] ?? 0),
            easing: CSS_EASING.decelerate,
            fill: "backwards",
          },
        );
      });
    },
  },

  {
    id: "shared-element-morph",
    title: "Shared element morph",
    category: "transition",
    blurb:
      "This is FLIP, done properly: measure the element in its first position, let the layout change land, measure it again, apply the inverse transform so it appears not to have moved, then animate that transform away. The browser only ever composites a transform, so a card growing from a thumbnail to a full panel costs the same as sliding it. The measure-mutate-measure order is the whole trick, and getting it wrong is the difference between sixty frames and a repaint storm.",
    snippet: [
      "// FLIP: First, Last, Invert, Play.",
      "function flip(el, mutate) {",
      "  const first = el.getBoundingClientRect();",
      "  mutate();",
      "  const last = el.getBoundingClientRect();",
      "  const ratio = (a, b) => (Math.abs(b) < 1e-6 ? 1 : a / b);",
      "  const dx = first.left - last.left;",
      "  const dy = first.top - last.top;",
      "  const sx = ratio(first.width, last.width);",
      "  const sy = ratio(first.height, last.height);",
      "  return el.animate(",
      "    [",
      "      {",
      '        transformOrigin: "top left",',
      '        transform: "translate(" + dx + "px," + dy + "px) " +',
      '          "scale(" + sx + "," + sy + ")",',
      "      },",
      '      { transformOrigin: "top left", transform: "none" },',
      "    ],",
      '    { duration: 460, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }',
      "  );",
      "}",
    ].join("\n"),
    run: (element) => {
      const card = childTarget(element, "[data-flip-card]");
      if (!card) return;

      const first = rectOf(card);
      toggleClass(element, "is-expanded");
      const last = rectOf(card);

      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const sx = safeRatio(first.width, last.width);
      const sy = safeRatio(first.height, last.height);

      animate(
        card,
        [
          {
            transformOrigin: "top left",
            transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
          },
          { transformOrigin: "top left", transform: "translate(0px, 0px) scale(1, 1)" },
        ],
        { duration: 460, easing: CSS_EASING.standard, fill: "none" },
      );

      // The body is counter-scaled by the parent, so fade it rather than
      // letting it stretch. Text that scales non-uniformly looks broken.
      const body = childTarget(card, "[data-flip-body]");
      animate(
        body,
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 280, delay: 180, easing: CSS_EASING.decelerate, fill: "both" },
      );
    },
  },

  {
    id: "elastic-drawer",
    title: "Elastic drawer",
    category: "transition",
    blurb:
      "The panel rides a solved spring so it arrives with a little weight instead of stopping dead on a bezier. The contents do not ride the same spring. They start about a hundred and twenty milliseconds later on a plain decelerate curve, which is what sells the illusion that the panel is a surface and the rows are sitting on it. Animate them together and you get a sticker; animate them apart and you get a drawer.",
    snippet: [
      "// Panel on a spring, contents on a delayed linear stagger.",
      "function openDrawer(panel, items, springSamples, springMs) {",
      "  panel.animate(",
      '    springSamples.map((v) => ({ transform: "translateX(" + v + "%)" })),',
      '    { duration: springMs, easing: "linear", fill: "both" }',
      "  );",
      "  items.forEach((item, i) => {",
      "    item.animate(",
      "      [",
      '        { opacity: 0, transform: "translateX(18px)" },',
      '        { opacity: 1, transform: "none" },',
      "      ],",
      "      {",
      "        duration: 340,",
      "        delay: 120 + i * 45,",
      '        easing: "cubic-bezier(0.05, 0.7, 0.1, 1)",',
      '        fill: "backwards",',
      "      }",
      "    );",
      "  });",
      "}",
    ].join("\n"),
    run: (element) => {
      const panel = childTarget(element, "[data-drawer]");
      const spring = solveSpring({ stiffness: 190, damping: 21, mass: 1.2, from: 100, to: 0 });
      animate(
        panel,
        spring.keyframes.map((value) => ({ transform: `translateX(${value.toFixed(3)}%)` })),
        { duration: spring.duration, easing: "linear", fill: "both" },
      );

      const scrim = childTarget(element, "[data-drawer-scrim]");
      animate(scrim, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 260,
        easing: CSS_EASING.standard,
        fill: "both",
      });

      const items = childTargets(element, "[data-drawer-item]");
      const delays = stagger(items.length, { mode: "linear", each: 45, max: 220 });
      items.forEach((item, i) => {
        animate(
          item,
          [
            { opacity: 0, transform: "translateX(18px)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: 340,
            delay: 120 + Math.round(delays[i] ?? 0),
            easing: CSS_EASING.decelerate,
            fill: "backwards",
          },
        );
      });
    },
  },

  {
    id: "number-ticker",
    title: "Number ticker",
    category: "state",
    blurb:
      "Two clocks, deliberately. The digit columns roll on the compositor as transforms, which is free, and each column starts sixty milliseconds after the one to its left so the number settles right to left like a mechanical counter. The percentage underneath is a string, which no compositor can interpolate, so it runs on a requestAnimationFrame loop shaped by the same decelerate curve. Use ease-out, never linear: a counter that ticks at constant speed reads as a progress bar, not a result.",
    snippet: [
      "// Digits roll on the compositor, the caption counts on rAF.",
      "function tick(columns, caption, ms) {",
      "  columns.forEach((col, i) => {",
      '    const strip = col.querySelector("[data-strip]");',
      '    const digit = Number(col.getAttribute("data-final"));',
      "    strip.animate(",
      '      [{ transform: "translateY(0)" },',
      '       { transform: "translateY(" + -(10 + digit) + "em)" }],',
      "      { duration: ms, delay: i * 60, fill: \"both\",",
      '        easing: "cubic-bezier(0.05, 0.7, 0.1, 1)" }',
      "    );",
      "  });",
      "  const start = performance.now();",
      "  const step = (now) => {",
      "    const p = Math.min(1, (now - start) / ms);",
      "    const eased = 1 - Math.pow(1 - p, 3);",
      '    caption.textContent = "+" + (18.2 * eased).toFixed(1) + "%";',
      "    if (p < 1) requestAnimationFrame(step);",
      "  };",
      "  requestAnimationFrame(step);",
      "}",
    ].join("\n"),
    run: (element) => {
      const columns = childTargets(element, "[data-roll]");
      const delays = stagger(columns.length, { mode: "linear", each: 60, max: 280 });
      columns.forEach((column, i) => {
        const strip = childTarget(column, "[data-strip]");
        const digit = readNumber(column, "data-final", 0);
        animate(
          strip,
          [
            { transform: "translateY(0em)" },
            { transform: `translateY(${-(10 + digit)}em)` },
          ],
          {
            duration: 900,
            delay: Math.round(delays[i] ?? 0),
            easing: CSS_EASING.decelerate,
            fill: "both",
          },
        );
      });

      const caption = childTarget(element, "[data-ticker-delta]");
      if (caption) {
        const to = readNumber(caption, "data-to", 18.2);
        drive(
          1000,
          (progress) => setText(caption, `+${(to * progress).toFixed(1)}%`),
          EASING.decelerate,
        );
      }
    },
  },

  {
    id: "skeleton-to-content",
    title: "Skeleton to content",
    category: "entrance",
    blurb:
      "Never hard-swap a skeleton for its content. The eye reads an instant substitution as a failure and a reload, even when the data arrived perfectly. Overlap them: the placeholder fades and blurs out over three hundred and eighty milliseconds while the real content rises into place on a decelerate curve starting eighty milliseconds before the placeholder is gone. The overlap is the entire point, and it is the part people skip.",
    snippet: [
      "// Cross-fade with an overlap. Never hard-swap.",
      "function reveal(skeleton, content, lines) {",
      "  lines.forEach((line, i) => {",
      "    line.animate(",
      '      [{ backgroundPositionX: "-140%" },',
      '       { backgroundPositionX: "140%" }],',
      '      { duration: 900, delay: i * 90, easing: "linear",',
      "        iterations: 2 }",
      "    );",
      "  });",
      "  skeleton.animate(",
      '    [{ opacity: 1, filter: "blur(0px)" },',
      '     { opacity: 0, filter: "blur(6px)" }],',
      "    { duration: 380, delay: 620, fill: \"forwards\",",
      '      easing: "cubic-bezier(0.3, 0, 0.8, 0.15)" }',
      "  );",
      "  content.animate(",
      '    [{ opacity: 0, transform: "translateY(8px)" },',
      '     { opacity: 1, transform: "none" }],',
      "    { duration: 520, delay: 700, fill: \"both\",",
      '      easing: "cubic-bezier(0.05, 0.7, 0.1, 1)" }',
      "  );",
      "}",
    ].join("\n"),
    run: (element) => {
      const lines = childTargets(element, "[data-skeleton-line]");
      lines.forEach((line, i) => {
        animate(
          line,
          [{ backgroundPositionX: "-140%" }, { backgroundPositionX: "140%" }],
          { duration: 900, delay: i * 90, easing: "linear", iterations: 2 },
        );
      });

      animate(
        childTarget(element, "[data-skeleton]"),
        [
          { opacity: 1, filter: "blur(0px)" },
          { opacity: 0, filter: "blur(6px)" },
        ],
        { duration: 380, delay: 620, easing: CSS_EASING.accelerate, fill: "forwards" },
      );

      animate(
        childTarget(element, "[data-content]"),
        [
          { opacity: 0, transform: "translateY(8px) scale(0.99)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 520, delay: 700, easing: CSS_EASING.decelerate, fill: "both" },
      );
    },
  },

  {
    id: "icon-state-morph",
    title: "Icon state morph",
    category: "state",
    blurb:
      "Hamburger to close, with three divs and no SVG morphing library. The important detail is the order: the outer bars translate to the centre first and only then rotate. Doing both at once is what produces that cheap smeared X you see everywhere. Splitting it across two keyframes at the forty-five percent mark costs nothing and is the difference between an icon that transforms and an icon that glitches.",
    snippet: [
      "// Translate first, rotate second. Both at once reads as a smear.",
      "function toggleIcon(bars, open) {",
      "  const plan = [",
      '    ["translateY(0) rotate(0deg)", "translateY(7px) rotate(0deg)",',
      '     "translateY(7px) rotate(45deg)"],',
      '    ["scaleX(1)", "scaleX(0.3)", "scaleX(0)"],',
      '    ["translateY(0) rotate(0deg)", "translateY(-7px) rotate(0deg)",',
      '     "translateY(-7px) rotate(-45deg)"],',
      "  ];",
      "  bars.forEach((bar, i) => {",
      "    const steps = open ? plan[i] : plan[i].slice().reverse();",
      "    bar.animate(",
      "      [",
      "        { transform: steps[0], offset: 0 },",
      "        { transform: steps[1], offset: 0.45 },",
      "        { transform: steps[2], offset: 1 },",
      "      ],",
      '      { duration: 380, fill: "both",',
      '        easing: "cubic-bezier(0.2, 0.9, 0.2, 1)" }',
      "    );",
      "  });",
      "}",
    ].join("\n"),
    run: (element) => {
      const bars = childTargets(element, "[data-bar]");
      const wasOpen = getAttr(element, "data-open") === "true";
      const open = !wasOpen;
      setAttr(element, "data-open", open ? "true" : "false");

      const plan = [
        ["translateY(0px) rotate(0deg)", "translateY(7px) rotate(0deg)", "translateY(7px) rotate(45deg)"],
        ["scaleX(1)", "scaleX(0.3)", "scaleX(0)"],
        [
          "translateY(0px) rotate(0deg)",
          "translateY(-7px) rotate(0deg)",
          "translateY(-7px) rotate(-45deg)",
        ],
      ];

      bars.forEach((bar, i) => {
        const lane = plan[i % plan.length] as string[];
        const steps = open ? lane : lane.slice().reverse();
        animate(
          bar,
          [
            { transform: steps[0] as string, offset: 0 },
            { transform: steps[1] as string, offset: 0.45 },
            { transform: steps[2] as string, offset: 1 },
          ],
          { duration: 380, easing: CSS_EASING.snappy, fill: "both" },
        );
      });
    },
  },

  {
    id: "success-checkmark",
    title: "Success checkmark",
    category: "feedback",
    blurb:
      "Draw the stroke, do not fade the icon in. A path that draws itself reads as a completed action, because the motion has a direction and an end; a checkmark that fades in reads as a thing that was always there. Set stroke-dasharray to the measured path length, animate stroke-dashoffset from that length down to zero, and delay it just behind the ring pop so the two do not compete for attention.",
    snippet: [
      "// Stroke-dashoffset is the only honest way to draw a path.",
      "function drawCheck(path, ring) {",
      "  const length = path.getTotalLength();",
      "  path.style.strokeDasharray = String(length);",
      "  path.animate(",
      "    [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],",
      "    { duration: 460, delay: 120, fill: \"both\",",
      '      easing: "cubic-bezier(0.05, 0.7, 0.1, 1)" }',
      "  );",
      "  ring.animate(",
      "    [",
      '      { transform: "scale(0.6)", opacity: 0 },',
      '      { transform: "scale(1.06)", opacity: 1, offset: 0.6 },',
      '      { transform: "scale(1)", opacity: 1 },',
      "    ],",
      "    { duration: 420, fill: \"both\",",
      '      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }',
      "  );",
      "}",
    ].join("\n"),
    run: (element) => {
      const path = childTarget(element, "[data-check-path]");
      const length = pathLength(path, 34);
      // Both values inline, so cancelling the animation returns the path to
      // "not drawn yet" rather than to whatever the stylesheet last said.
      setStyle(path, "strokeDasharray", `${length}`);
      setStyle(path, "strokeDashoffset", `${length}`);
      animate(
        path,
        [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
        { duration: 460, delay: 140, easing: CSS_EASING.decelerate, fill: "both" },
      );

      const ring = childTarget(element, "[data-check-ring]");
      const pop = solveSpring({ stiffness: 340, damping: 16, mass: 1, from: 0.6, to: 1 });
      const { total, offsets, values } = phaseKeyframes([
        { duration: pop.duration, samples: pop.keyframes },
      ]);
      animate(
        ring,
        values.map((value, i) => ({
          transform: `scale(${value.toFixed(4)})`,
          opacity: i === 0 ? 0 : 1,
          offset: offsets[i] as number,
        })),
        { duration: Math.max(1, total), easing: "linear", fill: "both" },
      );
    },
  },

  {
    id: "attention-shake",
    title: "Attention shake",
    category: "feedback",
    blurb:
      "A shake with constant amplitude reads as a stuck animation. Decay it exponentially and it reads as an object that hit a wall and lost energy, which is what an invalid field actually did. Keep the travel small, around eight or nine pixels, keep it on one axis, and keep the whole thing under six hundred milliseconds. Anything longer stops being feedback and starts being punishment.",
    snippet: [
      "// Exponential decay so it lands instead of just stopping.",
      "function shake(el, amplitude, cycles, samples) {",
      "  const frames = [];",
      "  for (let i = 0; i < samples; i++) {",
      "    const t = i / (samples - 1);",
      "    const edge = i === 0 || i === samples - 1;",
      "    const x = edge",
      "      ? 0",
      "      : amplitude *",
      "        Math.exp(-3.4 * t) *",
      "        Math.sin(t * Math.PI * 2 * cycles);",
      "    frames.push({",
      '      transform: "translate3d(" + x.toFixed(3) + "px,0,0)",',
      "    });",
      "  }",
      '  el.animate(frames, { duration: 520, easing: "linear" });',
      "}",
    ].join("\n"),
    run: (element) => {
      const field = childTarget(element, "[data-field]") ?? element;
      const offsets = decayOscillation(9, 3, 15, 3.4);
      animate(
        field,
        offsets.map((value) => ({ transform: `translate3d(${value.toFixed(3)}px, 0, 0)` })),
        { duration: 520, easing: "linear", fill: "none" },
      );

      const flash = childTarget(element, "[data-field-flash]");
      animate(
        flash,
        [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }],
        { duration: 900, easing: CSS_EASING.standard, fill: "none" },
      );

      const message = childTarget(element, "[data-field-message]");
      animate(
        message,
        [
          { opacity: 0, transform: "translateY(-4px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, delay: 80, easing: CSS_EASING.decelerate, fill: "both" },
      );
    },
  },

  {
    id: "progress-arc",
    title: "Progress arc",
    category: "state",
    blurb:
      "The arc is a stroked circle with stroke-dasharray set to its own circumference, so filling it is one animated number and no masks. It fills on a decelerate curve, which makes the last ten percent feel like arrival rather than a stall, and then the whole ring gets a short spring pop at the exact moment it completes. That pop is doing real work: it is the difference between a value that finished loading and a value that is confirmed.",
    snippet: [
      "// One dash, one offset. The arc is the stroke, not a mask.",
      "function fillArc(circle, wrapper, radius, to) {",
      "  const circumference = 2 * Math.PI * radius;",
      "  circle.style.strokeDasharray = String(circumference);",
      "  circle.animate(",
      "    [",
      "      { strokeDashoffset: circumference },",
      "      { strokeDashoffset: circumference * (1 - to) },",
      "    ],",
      "    { duration: 1000, fill: \"both\",",
      '      easing: "cubic-bezier(0.05, 0.7, 0.1, 1)" }',
      "  );",
      "  wrapper.animate(",
      "    [",
      '      { transform: "scale(1)" },',
      '      { transform: "scale(1.05)", offset: 0.25 },',
      '      { transform: "scale(1)" },',
      "    ],",
      "    { duration: 420, delay: 1000,",
      '      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }',
      "  );",
      "}",
    ].join("\n"),
    run: (element) => {
      const arc = childTarget(element, "[data-arc]");
      const radius = readNumber(arc, "r", 52);
      const circumference = 2 * Math.PI * radius;
      const to = readNumber(element, "data-arc-to", 0.78);
      const duration = 1000;

      setStyle(arc, "strokeDasharray", `${circumference.toFixed(3)}`);
      animate(
        arc,
        [
          { strokeDashoffset: circumference.toFixed(3) },
          { strokeDashoffset: (circumference * (1 - to)).toFixed(3) },
        ],
        { duration, easing: CSS_EASING.decelerate, fill: "both" },
      );

      const wrapper = childTarget(element, "[data-arc-wrap]");
      const settle = solveSpring({ stiffness: 620, damping: 17, mass: 1, from: 1.05, to: 1 });
      const { frames, duration: popDuration } = phasedTransform(
        [
          { duration: 90, samples: [1, 1.05] },
          { duration: settle.duration, samples: settle.keyframes },
        ],
        (value) => `scale(${value.toFixed(4)})`,
      );
      animate(wrapper, frames, {
        duration: popDuration,
        delay: duration,
        easing: "linear",
        fill: "none",
      });

      const label = childTarget(element, "[data-arc-label]");
      if (label) {
        drive(
          duration,
          (progress) => setText(label, `${Math.round(to * progress * 100)}%`),
          EASING.decelerate,
        );
      }
    },
  },

  {
    id: "card-lift",
    title: "Card lift",
    category: "feedback",
    blurb:
      "Two things make a hover lift look expensive. First, never animate box-shadow: it repaints every frame. Put the shadow on its own absolutely positioned layer and animate that layer's opacity instead, which the compositor handles for free. Second, move the inner content slightly further than the card itself. That tiny parallax, three or four pixels of disagreement between the layers, is what your eye reads as depth.",
    snippet: [
      "// Animate a shadow layer's opacity, never box-shadow itself.",
      "function lift(card, shadow, layers, up) {",
      "  const to = up ? 1 : 0;",
      '  const ease = "cubic-bezier(0.2, 0.9, 0.2, 1)";',
      "  card.animate(",
      '    [{ transform: "translateY(" + -10 * (1 - to) + "px)" },',
      '     { transform: "translateY(" + -10 * to + "px)" }],',
      '    { duration: 420, easing: ease, fill: "both" }',
      "  );",
      "  shadow.animate([{ opacity: 1 - to }, { opacity: to }],",
      '    { duration: 420, easing: ease, fill: "both" });',
      "  layers.forEach((layer) => {",
      '    const depth = Number(layer.getAttribute("data-depth"));',
      "    layer.animate(",
      '      [{ transform: "translate3d(0,0,0)" },',
      '       { transform: "translate3d(" + depth * 3 * to + "px," +',
      '         depth * -5 * to + "px,0)" }],',
      '      { duration: 420, easing: ease, fill: "both" }',
      "    );",
      "  });",
      "}",
    ].join("\n"),
    run: (element) => {
      const card = childTarget(element, "[data-lift]") ?? element;
      const duration = 1100;
      animate(
        card,
        [
          { transform: "translateY(0px) scale(1)" },
          { transform: "translateY(-10px) scale(1.012)", offset: 0.3 },
          { transform: "translateY(-10px) scale(1.012)", offset: 0.66 },
          { transform: "translateY(0px) scale(1)" },
        ],
        { duration, easing: CSS_EASING.snappy, fill: "none" },
      );

      animate(
        childTarget(element, "[data-lift-shadow]"),
        [
          { opacity: 0, transform: "scale(0.92)" },
          { opacity: 1, transform: "scale(1)", offset: 0.3 },
          { opacity: 1, transform: "scale(1)", offset: 0.66 },
          { opacity: 0, transform: "scale(0.92)" },
        ],
        { duration, easing: CSS_EASING.snappy, fill: "none" },
      );

      const layers = childTargets(element, "[data-depth]");
      layers.forEach((layer) => {
        const depth = readNumber(layer, "data-depth", 1);
        const shift = `translate3d(${(depth * 3).toFixed(2)}px, ${(depth * -5).toFixed(2)}px, 0)`;
        animate(
          layer,
          [
            { transform: "translate3d(0, 0, 0)" },
            { transform: shift, offset: 0.3 },
            { transform: shift, offset: 0.66 },
            { transform: "translate3d(0, 0, 0)" },
          ],
          { duration, easing: CSS_EASING.snappy, fill: "none" },
        );
      });
    },
  },

  {
    id: "text-scramble",
    title: "Text scramble",
    category: "entrance",
    blurb:
      "Characters resolve strictly left to right, never at random, so the eye always has a stable edge to read from. Two rules keep this from being obnoxious: preserve the string length and the spaces on every frame, so the line never reflows, and keep it under a second. A scramble is a garnish on a headline, and the moment it becomes something the reader has to wait for you have made your own page slower to comprehend.",
    snippet: [
      "// Resolve left to right; never change the string length.",
      "function scramble(el, text, ms) {",
      '  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>[]{}";',
      "  const start = performance.now();",
      "  const step = (now) => {",
      "    const p = Math.min(1, (now - start) / ms);",
      "    const resolved = Math.floor(text.length * p);",
      '    let out = "";',
      "    for (let i = 0; i < text.length; i++) {",
      "      const settled = i < resolved || text[i] === \" \";",
      "      out += settled",
      "        ? text[i]",
      "        : glyphs[Math.floor(Math.random() * glyphs.length)];",
      "    }",
      "    el.textContent = out;",
      "    if (p < 1) requestAnimationFrame(step);",
      "  };",
      "  el.animate([{ opacity: 0.55 }, { opacity: 1 }], {",
      "    duration: ms,",
      '    easing: "cubic-bezier(0.4, 0, 0.2, 1)",',
      "  });",
      "  requestAnimationFrame(step);",
      "}",
    ].join("\n"),
    run: (element) => {
      const label = childTarget(element, "[data-scramble]");
      if (!label) return;
      const text = getAttr(label, "data-text") ?? getText(label);
      const duration = 900;
      animate(
        label,
        [
          { opacity: 0.55, filter: "blur(0.4px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration, easing: CSS_EASING.standard, fill: "none" },
      );
      const random = seededRandom(0x9e3779b9);
      drive(duration, (progress) => setText(label, scrambleText(text, progress, random)));
    },
  },

  {
    id: "page-transition-wipe",
    title: "Page transition wipe",
    category: "transition",
    blurb:
      "One animation, not two. It is tempting to run a cover animation and then a reveal animation on the same mask, but the second one's backwards fill snaps the mask into view the instant you start it, and you get a flash you will spend an afternoon failing to reproduce. Put the whole sweep in a single keyframe list with a hold in the middle, swap the pages during that hold, and use per-keyframe easing so the cover accelerates in and the reveal decelerates out.",
    snippet: [
      "// One keyframe list with a hold. Two animations will flash.",
      "function wipe(mask, outgoing, incoming) {",
      "  mask.animate(",
      "    [",
      '      { transform: "translateX(-101%)", offset: 0,',
      '        easing: "cubic-bezier(0.3, 0, 0.8, 0.15)" },',
      '      { transform: "translateX(0%)", offset: 0.42 },',
      '      { transform: "translateX(0%)", offset: 0.5,',
      '        easing: "cubic-bezier(0.05, 0.7, 0.1, 1)" },',
      '      { transform: "translateX(101%)", offset: 1 },',
      "    ],",
      '    { duration: 900, easing: "linear" }',
      "  );",
      "  outgoing.animate(",
      "    [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.44 },",
      "     { opacity: 0, offset: 0.46 }],",
      '    { duration: 900, easing: "linear", fill: "both" }',
      "  );",
      "  incoming.animate(",
      "    [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.44 },",
      "     { opacity: 1, offset: 0.46 }],",
      '    { duration: 900, easing: "linear", fill: "both" }',
      "  );",
      "}",
    ].join("\n"),
    run: (element) => {
      const duration = 900;
      const mask = childTarget(element, "[data-wipe]");
      animate(
        mask,
        [
          { transform: "translateX(-101%)", offset: 0, easing: CSS_EASING.accelerate },
          { transform: "translateX(0%)", offset: 0.42 },
          { transform: "translateX(0%)", offset: 0.5, easing: CSS_EASING.decelerate },
          { transform: "translateX(101%)", offset: 1 },
        ],
        { duration, easing: "linear", fill: "none" },
      );

      const flipped = getAttr(element, "data-flipped") === "true";
      setAttr(element, "data-flipped", flipped ? "false" : "true");
      const pageA = childTarget(element, "[data-page-a]");
      const pageB = childTarget(element, "[data-page-b]");
      const outgoing = flipped ? pageB : pageA;
      const incoming = flipped ? pageA : pageB;

      animate(
        outgoing,
        [
          { opacity: 1, transform: "none", offset: 0 },
          { opacity: 1, transform: "none", offset: 0.44 },
          { opacity: 0, transform: "translateY(-6px)", offset: 0.46 },
          { opacity: 0, transform: "translateY(-6px)", offset: 1 },
        ],
        { duration, easing: "linear", fill: "both" },
      );

      animate(
        incoming,
        [
          { opacity: 0, transform: "translateY(6px)", offset: 0 },
          { opacity: 0, transform: "translateY(6px)", offset: 0.44 },
          { opacity: 1, transform: "none", offset: 0.6 },
          { opacity: 1, transform: "none", offset: 1 },
        ],
        { duration, easing: "linear", fill: "both" },
      );
    },
  },
];

/** Look up a recipe by id. */
export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}

/** Recipes grouped by category, in the canonical category order. */
export function recipesByCategory(): Array<{ category: RecipeCategory; recipes: Recipe[] }> {
  return RECIPE_CATEGORIES.map((category) => ({
    category,
    recipes: RECIPES.filter((recipe) => recipe.category === category),
  }));
}
