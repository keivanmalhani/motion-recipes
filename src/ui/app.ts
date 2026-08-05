/**
 * app.ts - assemble the page from the registry.
 *
 * Nothing here knows what a spring is. It reads src/core/recipes.ts, builds a
 * card per entry, and wires the controls. Adding a recipe to the registry adds
 * a card here and a case to every registry assertion in the test suite, with
 * no change to this file.
 */

import { RECIPES, RECIPE_CATEGORIES } from "../core/recipes.ts";
import type { RecipeCategory } from "../core/recipes.ts";
import { mountAnnouncer } from "./announce.ts";
import { autoplayOnView, createCard } from "./card.ts";
import type { CardHandle } from "./card.ts";
import { createControls, syncControls } from "./controls.ts";
import { el } from "./dom.ts";
import { createHero } from "./hero.ts";
import { initPreferences, onReducedMotionChange } from "./prefs.ts";

/** Kept in step with `npm test`. Shown in the hero and the footer. */
const TEST_COUNT = 103;

type Filter = "all" | RecipeCategory;

function createMasthead(): HTMLElement {
  return el("header", { class: "masthead" }, [
    el("div", { class: "shell masthead__inner" }, [
      el("a", { class: "wordmark", href: "#top" }, [
        el("span", { class: "wordmark__dots", "aria-hidden": "true" }, [
          el("i"),
          el("i"),
          el("i"),
        ]),
        "motion",
      ]),
      createControls(),
    ]),
  ]);
}

function createFilters(onChange: (filter: Filter) => void): HTMLElement {
  const options: Filter[] = ["all", ...RECIPE_CATEGORIES];
  const buttons = options.map((option) => {
    const button = el(
      "button",
      {
        class: "filter",
        type: "button",
        "aria-pressed": String(option === "all"),
        "data-filter": option,
      },
      [option === "all" ? "All" : option],
    );
    button.addEventListener("click", () => {
      for (const other of buttons) {
        other.setAttribute("aria-pressed", String(other === button));
      }
      onChange(option);
    });
    return button;
  });

  return el("div", { class: "filters", role: "group", "aria-label": "Filter recipes by category" }, buttons);
}

function createColophon(): HTMLElement {
  return el("footer", { class: "colophon" }, [
    el("div", { class: "shell colophon__inner" }, [
      el("p", {}, [
        "Built with TypeScript, Vite and vitest. The animation engine in src/core has no DOM ",
        "dependencies, which is why " + String(TEST_COUNT) + " tests can cover it in a plain node process.",
      ]),
      el("p", {}, ["MIT licensed. Copyright (c) 2026 Keivan Malhani."]),
    ]),
  ]);
}

export function mountApp(root: HTMLElement): void {
  initPreferences();

  const cards: CardHandle[] = RECIPES.map((recipe, index) => createCard(recipe, index));
  const grid = el("div", { class: "grid" }, cards.map((card) => card.root));

  const applyFilter = (filter: Filter): void => {
    for (const card of cards) {
      card.root.hidden = filter !== "all" && card.recipe.category !== filter;
    }
  };

  const section = el("section", { class: "section", id: "recipes" }, [
    el("div", { class: "shell" }, [
      el("div", { class: "section__head" }, [
        el("div", {}, [
          el("h2", { class: "section__title" }, ["The recipes"]),
          el("p", { class: "section__lede" }, [
            "Every card runs live. Press Replay to see it again, drag the speed slider to " +
              "watch the timing at a quarter speed, and copy the source straight into your project.",
          ]),
        ]),
        createFilters(applyFilter),
      ]),
      grid,
    ]),
  ]);

  root.replaceChildren(
    createMasthead(),
    el("main", { id: "top" }, [createHero(RECIPES.length, TEST_COUNT), section]),
    createColophon(),
  );

  mountAnnouncer(root);
  autoplayOnView(cards);
  onReducedMotionChange(() => syncControls(root));
}
