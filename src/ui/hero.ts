/**
 * hero.ts - the thesis, and a demo you can hit immediately.
 *
 * The hero states the argument in one sentence and then proves it in the same
 * viewport. The ambient bar loop uses the same stagger and easing modules as
 * every card, and it is the first thing that stops when motion is reduced.
 */

import { CSS_EASING, solveSpring } from "../core/easing.ts";
import { getRecipe } from "../core/recipes.ts";
import { animate } from "../core/runtime.ts";
import { stagger } from "../core/stagger.ts";
import { cancelStage } from "./card.ts";
import { el } from "./dom.ts";
import { getReducedMotion, onReducedMotionChange } from "./prefs.ts";

const BAR_COUNT = 18;

interface Ambient {
  start(): void;
  stop(): void;
}

function createAmbient(container: HTMLElement): Ambient {
  const bars = Array.from({ length: BAR_COUNT }, () => el("i"));
  container.replaceChildren(...bars);

  const delays = stagger(BAR_COUNT, { mode: "from-center", each: 70, max: 620 });
  let running: Animation[] = [];

  return {
    start() {
      this.stop();
      running = bars.map((bar, i) => {
        const height = 22 + ((i * 37) % 58);
        return bar.animate(
          [
            { transform: "scaleY(0.28)", opacity: 0.35 },
            { transform: `scaleY(${(height / 34).toFixed(3)})`, opacity: 1 },
            { transform: "scaleY(0.28)", opacity: 0.35 },
          ],
          {
            duration: 2600,
            delay: Math.round(delays[i] ?? 0),
            easing: CSS_EASING.standard,
            iterations: Number.POSITIVE_INFINITY,
          },
        );
      });
    },
    stop() {
      for (const animation of running) animation.cancel();
      running = [];
      for (const bar of bars) bar.style.transform = "";
    },
  };
}

export function createHero(recipeCount: number, testCount: number): HTMLElement {
  const bars = el("div", { class: "hero__bars", "aria-hidden": "true" });
  const ambient = createAmbient(bars);

  const pressStage = el("div", { class: "hero__press stage stage--spring-press", "aria-hidden": "true" });
  pressStage.innerHTML = `
    <span class="press__glow" data-press-glow></span>
    <span class="press__btn" data-press>Press me</span>
  `;

  const pressRecipe = getRecipe("spring-press");
  const playPress = (): void => {
    cancelStage(pressStage);
    pressRecipe?.run(pressStage);
  };

  const pressButton = el(
    "button",
    { class: "btn btn--primary", type: "button" },
    ["Run the spring"],
  );
  pressButton.addEventListener("click", playPress);
  pressStage.addEventListener("pointerdown", playPress);

  const browseButton = el("a", { class: "btn", href: "#recipes" }, ["Browse all recipes"]);

  const hero = el("section", { class: "hero" }, [
    el("div", { class: "shell hero__inner" }, [
      el("div", {}, [
        el("p", { class: "eyebrow" }, ["Web Animations API, no dependencies"]),
        el("h1", { class: "hero__thesis" }, [
          "Most micro-interactions do not need a ",
          el("em", {}, ["70 KB"]),
          " animation library.",
        ]),
        el("p", { class: "hero__sub" }, [
          `${recipeCount} production-ready recipes, each under thirty lines, each with the reasoning ` +
            "behind its timing. Built on element.animate and a spring solver you can read in one sitting.",
        ]),
        el("div", { class: "hero__actions" }, [pressButton, browseButton]),
        el("div", { class: "hero__stats" }, [
          stat(String(recipeCount), "recipes"),
          stat("0", "runtime dependencies"),
          stat(String(testCount), "passing tests"),
        ]),
      ]),
      el("div", { class: "hero__demo" }, [
        el("div", { class: "hero__demo-head" }, [
          el("span", { class: "hero__demo-title" }, ["Live, not a screenshot"]),
          el("span", { class: "card__tag" }, ["spring"]),
        ]),
        bars,
        pressStage,
      ]),
    ]),
  ]);

  const applyMotionPreference = (reduced: boolean): void => {
    if (reduced) ambient.stop();
    else ambient.start();
  };

  applyMotionPreference(getReducedMotion());
  onReducedMotionChange(applyMotionPreference);

  // A gentle entrance for the hero itself, skipped entirely when reduced.
  if (!getReducedMotion()) {
    const spring = solveSpring({ stiffness: 210, damping: 26, from: 14, to: 0 });
    animate(
      hero.querySelector(".hero__demo"),
      spring.keyframes.map((value) => ({
        transform: `translateY(${value.toFixed(2)}px)`,
        opacity: Math.min(1, 1 - value / 28).toFixed(3),
      })),
      { duration: spring.duration, easing: "linear", fill: "backwards" },
    );
  }

  return hero;
}

function stat(value: string, label: string): HTMLElement {
  return el("div", { class: "stat" }, [
    el("span", { class: "stat__value" }, [value]),
    el("span", { class: "stat__label" }, [label]),
  ]);
}
