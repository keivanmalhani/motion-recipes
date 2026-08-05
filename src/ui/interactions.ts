/**
 * interactions.ts - the pointer behaviour a few stages need to be honest.
 *
 * Three recipes describe something a Replay button cannot show. Magnetic
 * hover is about tracking a pointer. Card lift is about a hover state. Spring
 * press is about a press. Those stages get real handlers here, using the same
 * pure math from src/core that the scripted demo uses.
 *
 * These are all user-initiated, so they stay enabled under reduced motion.
 * Reduced motion suppresses things nobody asked for; it does not disable the
 * page's controls.
 */

import { animate } from "../core/runtime.ts";
import { magneticOffset } from "../core/recipes.ts";
import { CSS_EASING, solveSpring } from "../core/easing.ts";

const MAGNET_RADIUS = 190;
const MAGNET_STRENGTH = 0.36;

function attachMagnet(stage: HTMLElement, replay: () => void): void {
  const dot = stage.querySelector<HTMLElement>("[data-magnet]");
  if (!dot) return;

  // The last offset the pointer produced, so the release spring knows where
  // it is springing from. Reading it back off the style string would mean
  // parsing CSS, and it would be wrong mid-animation anyway.
  let lastX = 0;
  let lastY = 0;
  let release: { cancel(): void } | null = null;

  stage.addEventListener("pointermove", (event) => {
    const box = dot.getBoundingClientRect();
    // The box already includes the current translation, so subtract it to get
    // the element's resting centre.
    const centreX = box.left + box.width / 2 - lastX;
    const centreY = box.top + box.height / 2 - lastY;
    const offset = magneticOffset(
      event.clientX - centreX,
      event.clientY - centreY,
      MAGNET_RADIUS,
      MAGNET_STRENGTH,
    );
    // Cancel only our own release animation, never the whole page.
    release?.cancel();
    release = null;
    lastX = offset.x;
    lastY = offset.y;
    dot.style.transform = `translate3d(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px, 0)`;
  });

  stage.addEventListener("pointerleave", () => {
    const fromX = lastX;
    const fromY = lastY;
    lastX = 0;
    lastY = 0;
    dot.style.transform = "";
    if (fromX === 0 && fromY === 0) return;
    const spring = solveSpring({ stiffness: 240, damping: 15, from: 1, to: 0 });
    release = animate(
      dot,
      spring.keyframes.map((value) => ({
        transform: `translate3d(${(fromX * value).toFixed(2)}px, ${(fromY * value).toFixed(2)}px, 0)`,
      })),
      { duration: spring.duration, easing: "linear", fill: "none" },
    );
  });

  // Keyboard users get the scripted version.
  stage.addEventListener("focusin", replay);
}

function attachLift(stage: HTMLElement): void {
  const card = stage.querySelector<HTMLElement>("[data-lift]");
  const shadow = stage.querySelector<HTMLElement>("[data-lift-shadow]");
  const layers = Array.from(stage.querySelectorAll<HTMLElement>("[data-depth]"));
  if (!card) return;

  const set = (up: boolean): void => {
    const to = up ? 1 : 0;
    const options = { duration: 380, easing: CSS_EASING.snappy, fill: "both" } as const;
    animate(
      card,
      [
        { transform: `translateY(${-10 * (1 - to)}px) scale(${1 + 0.012 * (1 - to)})` },
        { transform: `translateY(${-10 * to}px) scale(${1 + 0.012 * to})` },
      ],
      options,
    );
    animate(shadow, [{ opacity: 1 - to }, { opacity: to }], options);
    for (const layer of layers) {
      const depth = Number.parseFloat(layer.dataset.depth ?? "1") || 1;
      animate(
        layer,
        [
          {
            transform: `translate3d(${(depth * 3 * (1 - to)).toFixed(2)}px, ${(depth * -5 * (1 - to)).toFixed(2)}px, 0)`,
          },
          {
            transform: `translate3d(${(depth * 3 * to).toFixed(2)}px, ${(depth * -5 * to).toFixed(2)}px, 0)`,
          },
        ],
        options,
      );
    }
  };

  stage.addEventListener("pointerenter", () => set(true));
  stage.addEventListener("pointerleave", () => set(false));
}

/** Wire the stages whose point is a pointer gesture. Returns silently otherwise. */
export function attachInteractions(recipeId: string, stage: HTMLElement, replay: () => void): void {
  switch (recipeId) {
    case "magnetic-hover":
      attachMagnet(stage, replay);
      break;
    case "card-lift":
      attachLift(stage);
      break;
    case "spring-press":
    case "icon-state-morph":
    case "page-transition-wipe":
      stage.addEventListener("pointerdown", replay);
      break;
    default:
      break;
  }
}
