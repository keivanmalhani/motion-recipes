# motion

[![CI](https://github.com/keivanmalhani/motion-recipes/actions/workflows/ci.yml/badge.svg)](https://github.com/keivanmalhani/motion-recipes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](./tsconfig.json)

**Most micro-interactions do not need a 70 KB animation library.**

[English](./README.md) | [Espanol](./README.es.md)

---

## What this is

A static site with fourteen production-ready micro-interaction recipes. Each one has a live demo
you can trigger, a copy-paste snippet under thirty lines, and a paragraph explaining why the timing
works rather than just what it does.

Everything runs on the Web Animations API (`element.animate`) and CSS. There are zero runtime
dependencies. Vite, vitest and TypeScript are development dependencies and none of them ship in the
bundle.

This is not an argument against GSAP. GSAP is excellent, and if you are building a scroll-driven
narrative or sequencing forty elements against a shared timeline you should use it. It is an
argument that the button press, the hover lift and the error shake in your product do not justify
the dependency, and that the reason most hand-rolled versions feel cheap is timing, not tooling.

## The recipes

| # | Recipe | Category | The idea |
| --- | --- | --- | --- |
| 01 | Spring press | feedback | A solved spring baked into keyframes and played back linear, so the overshoot survives |
| 02 | Magnetic hover | feedback | Pointer pull with quadratic falloff, spring on release |
| 03 | Stagger reveal | entrance | Delay by distance from the middle, with the total span capped |
| 04 | Shared element morph | transition | Real FLIP: measure first, mutate, measure last, invert, play |
| 05 | Elastic drawer | transition | Panel on a spring, contents on a delayed stagger behind it |
| 06 | Number ticker | state | Digit columns roll on the compositor, the caption counts on rAF |
| 07 | Skeleton to content | entrance | Cross-fade with an overlap, never a hard swap |
| 08 | Icon state morph | state | Hamburger to close in three divs: translate first, rotate second |
| 09 | Success checkmark | feedback | Stroke-dashoffset path draw, so the mark reads as an action completing |
| 10 | Attention shake | feedback | Exponentially decaying amplitude, so it lands instead of stopping |
| 11 | Progress arc | state | One dash, one offset, and a spring pop at the moment it completes |
| 12 | Card lift | feedback | A separate shadow layer plus a few pixels of inner parallax |
| 13 | Text scramble | entrance | Resolves left to right, never changes the string length |
| 14 | Page transition wipe | transition | One keyframe list with a hold, because two animations flash |

The whole set is defined as data in [`src/core/recipes.ts`](./src/core/recipes.ts). The UI and the
test suite both iterate that same array, so adding a recipe adds a card to the page and adds it to
every registry assertion at the same time.

## Architecture

```
src/core/     pure TypeScript, no DOM construction, no UI imports
  easing.ts     named cubic-beziers and a spring-to-keyframes solver
  timeline.ts   sequencing primitive: query the state at any time t
  stagger.ts    per-index delays: linear, from-center, from-edges, grid-distance
  recipes.ts    the registry, each recipe is data plus a run(element)
  runtime.ts    the single choke point that calls element.animate
  target.ts     the narrow structural contract a recipe may touch
src/ui/       builds the page from the registry
tests/        vitest, node environment, no browser
```

### Why core/ is separate

`src/core` never creates an element and never imports from `src/ui`. Recipes receive a
`RecipeTarget`, whose only required member is `animate()`. That has two consequences worth the
constraint:

- A real `HTMLElement` satisfies it structurally, so the UI passes elements straight through with
  no cast and no wrapper object.
- A short stub in a test file satisfies it too. jsdom does not implement the Web Animations API, so
  testing recipes against a real DOM would only prove that `element.animate` is undefined. Instead,
  every recipe is executed headlessly against a target that records its calls, and the suite asserts
  on the exact keyframes and timing options each one produced.

Everything else a recipe might want (children, layout boxes, styles, attributes) goes through
guarded accessors in `target.ts` that return a safe empty value instead of throwing. That is not
defensive padding; it is what makes the headless run meaningful, and it is what keeps a collapsed
or not-yet-laid-out element from putting `NaN` into a transform string and silently killing the
animation.

### The spring solver

`solveSpring()` numerically integrates a damped harmonic oscillator with semi-implicit Euler and
emits a keyframe array plus a duration. Two details matter:

- **It subdivides its own step.** A fixed 480 Hz step diverges to `Infinity` on a very stiff spring
  within a dozen iterations, and every resulting keyframe comes out `NaN`. The loop measures the
  spring's natural frequency and subdivides until the step is small relative to it. This was found
  by a test, not by inspection.
- **The result is played back with `easing: "linear"`.** The spring is already in the values. Leave
  a cubic-bezier on it and you ease the easing: the overshoot flattens and the motion feels mushy
  for reasons that are very hard to spot in a diff.

## Development

```bash
npm install
npm run dev      # vite dev server
npm test         # vitest, node environment
npm run build    # tsc --noEmit then vite build
npm run preview  # serve dist/
```

**Tests: 103, all passing.** Spread across five files, with 310 assertion sites that execute about
3,700 assertions, because most of them loop over all fourteen recipes.

| File | Covers |
| --- | --- |
| `tests/easing.test.ts` | Bezier endpoints, monotonicity, overshoot, spring settling, damping ordering, keyframe counts, and the guards that make degenerate parameters terminate |
| `tests/timeline.test.ts` | State at t=0, mid, end and past end; overlapping steps; out-of-order insertion; zero-duration steps; empty timelines |
| `tests/stagger.test.ts` | Distribution shapes, from-edges as the exact complement of from-center, grid geometry, and the span cap |
| `tests/recipes.test.ts` | Registry shape, unique ids, snippet compilation, and every recipe executed headlessly with assertions on its keyframes and options |
| `tests/runtime.test.ts` | Playback rate propagation, animation tracking, the frame driver's no-rAF fallback, and every guarded target accessor |

Build output is roughly 50 KB of JavaScript (17 KB gzipped) and 21 KB of CSS (5 KB gzipped). Most
of the JavaScript is the fourteen snippets and their explanatory paragraphs, which are about 16 KB
of string literals: the engine itself is small, the teaching material is not.

## Accessibility and motion preferences

- Every control is a real `<button>` or `<input>`. Focus-visible rings are never removed.
- Icon-only buttons carry `aria-label`. The copy button announces success through a polite live
  region, because a label change on a button you just activated is not reliably announced.
- Demo stages are `aria-hidden`, since everything you can do to a stage you can also do from a
  labelled button.
- `prefers-reduced-motion` is respected for real, and the user can override it in either direction.
  What it turns off is anything nobody asked for: autoplay on scroll and the ambient hero loop.
  Pressing Replay still plays the demo. A motion library that refuses to show motion on request is
  not accessible, it is broken.

## Limitations

Worth knowing before you copy anything out of here:

- **The recipes are demonstrations, not a package.** There is no npm module. Copy the snippet, keep
  what you need, delete the rest. That is the intended workflow.
- **No visual regression testing.** The suite proves that each recipe emits the keyframes and timing
  it claims to. It cannot prove the result looks good, and nothing here has been checked against a
  reference render.
- **The Web Animations API is assumed, not polyfilled.** `element.animate` with a keyframe array is
  broadly supported, but per-keyframe `easing` and `composite` are less consistent, and the runtime
  degrades to a no-op rather than falling back to CSS transitions.
- **`drive()` is a compromise.** Two recipes animate a string, which no compositor can interpolate,
  so they run on `requestAnimationFrame` instead. That loop honours the global speed setting but it
  is not on the compositor thread, and with no frame clock at all it jumps straight to the resolved
  state.
- **The FLIP demo animates within a fixed stage.** Real shared-element transitions usually cross a
  route boundary, which brings scroll restoration and element identity problems this does not have
  to solve.
- **Browser scope.** Developed against current Chromium, Firefox and WebKit. Not tested on older
  Safari, where WAAPI has known gaps around `fill` and `composite`.

## License

MIT. Copyright (c) 2026 Keivan Malhani.
