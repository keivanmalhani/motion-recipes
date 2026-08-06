/**
 * card.ts - one recipe, rendered.
 *
 * A card is: title, category, a live stage, two real buttons, the paragraph,
 * and the source behind a disclosure. The stage is aria-hidden because it is
 * decoration; everything you can do to it, you can do from a button.
 */

import type { Recipe } from "../core/recipes.ts";
import { STAGE_MARKUP, stageClass } from "./stages.ts";
import { announce } from "./announce.ts";
import { copyText } from "./clipboard.ts";
import { ICONS, el, icon } from "./dom.ts";
import { attachInteractions } from "./interactions.ts";
import { getReducedMotion } from "./prefs.ts";

export interface CardHandle {
  root: HTMLElement;
  recipe: Recipe;
  play(): void;
}

/** Cancel every animation inside one stage, leaving the rest of the page alone. */
export function cancelStage(stage: HTMLElement): void {
  if (typeof stage.getAnimations !== "function") return;
  for (const animation of stage.getAnimations({ subtree: true })) animation.cancel();
}

export function createCard(recipe: Recipe, index: number): CardHandle {
  const stage = el("div", {
    class: stageClass(recipe.id),
    "aria-hidden": "true",
  });
  stage.innerHTML = STAGE_MARKUP[recipe.id] ?? "";

  const play = (): void => {
    // Cancelling first is what makes replay idempotent: every stage declares
    // its resting state in CSS, so a cancelled animation snaps back to it
    // instead of leaving a half-applied transform for the next run to stack on.
    //
    // Scoped to this stage on purpose. A global cancel would mean that
    // scrolling past three cards at once leaves only the last one animating.
    cancelStage(stage);
    recipe.run(stage);
  };

  const replayButton = el(
    "button",
    { class: "btn btn--primary", type: "button" },
    [icon([...ICONS.replay], 14), "Replay"],
  );
  replayButton.addEventListener("click", play);

  const copyButton = el("button", { class: "btn btn--ghost", type: "button" }, [
    icon([...ICONS.copy], 14),
    el("span", { class: "btn__label" }, ["Copy code"]),
  ]);

  let resetLabel = 0;
  copyButton.addEventListener("click", () => {
    void copyText(recipe.snippet).then((ok) => {
      const label = copyButton.querySelector(".btn__label");
      if (label) label.textContent = ok ? "Copied" : "Copy failed";
      announce(ok ? `${recipe.title} snippet copied to the clipboard` : "Copy failed");
      window.clearTimeout(resetLabel);
      resetLabel = window.setTimeout(() => {
        if (label) label.textContent = "Copy code";
      }, 2200);
    });
  });

  const code = el("code");
  // textContent, not innerHTML: the snippet contains angle brackets.
  code.textContent = recipe.snippet;

  const root = el("article", { class: "card", id: `recipe-${recipe.id}`, "data-category": recipe.category }, [
    el("header", { class: "card__head" }, [
      el("div", {}, [
        el("span", { class: "card__index" }, [String(index + 1).padStart(2, "0")]),
        el("h3", { class: "card__title" }, [recipe.title]),
      ]),
      el("span", { class: "card__tag" }, [recipe.category]),
    ]),
    stage,
    el("div", { class: "card__actions" }, [replayButton, copyButton]),
    el("p", { class: "card__blurb" }, [recipe.blurb]),
    el("details", { class: "card__code" }, [
      el("summary", {}, ["View source"]),
      el("pre", { tabindex: "0", role: "region", "aria-label": `${recipe.title} source, scrollable` }, [code]),
    ]),
  ]);

  attachInteractions(recipe.id, stage, play);

  return { root, recipe, play };
}

/**
 * Play each card once as it scrolls into view, unless motion is reduced.
 *
 * This is the only autoplay on the page, and it is the first thing reduced
 * motion switches off.
 */
export function autoplayOnView(cards: CardHandle[]): void {
  if (typeof IntersectionObserver !== "function") return;

  const played = new WeakSet<Element>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (played.has(entry.target)) continue;
        // Only mark it played once it actually played, so turning reduced
        // motion off later still gives the remaining cards their entrance.
        if (getReducedMotion()) continue;
        played.add(entry.target);
        const card = cards.find((c) => c.root === entry.target);
        card?.play();
      }
    },
    { threshold: 0.35 },
  );

  for (const card of cards) observer.observe(card.root);
}
