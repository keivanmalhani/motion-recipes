/**
 * controls.ts - the top control strip.
 *
 * Speed is applied through Animation.playbackRate, which retimes animations
 * that are already running. Slowing the page down to 0.25x mid-demo is the
 * fastest way to see whether an overshoot is doing what you think it is.
 */

import { getPlaybackRate, setPlaybackRate } from "../core/runtime.ts";
import { ICONS, el, icon } from "./dom.ts";
import { getReducedMotion, getTheme, setReducedMotion, toggleTheme } from "./prefs.ts";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function formatSpeed(rate: number): string {
  return `${rate}x`;
}

export function createControls(): HTMLElement {
  /* Speed --------------------------------------------------------------- */
  const slider = el("input", {
    type: "range",
    min: "0",
    max: String(SPEEDS.length - 1),
    step: "1",
    value: String(SPEEDS.indexOf(1)),
    id: "speed",
    "aria-describedby": "speed-value",
  });
  const readout = el("span", { class: "control__value", id: "speed-value" }, [
    formatSpeed(getPlaybackRate()),
  ]);

  slider.addEventListener("input", () => {
    const rate = SPEEDS[Number(slider.value)] ?? 1;
    readout.textContent = formatSpeed(setPlaybackRate(rate));
  });

  const speed = el("div", { class: "control" }, [
    el("label", { class: "control__label", for: "speed" }, ["Speed"]),
    slider,
    readout,
  ]);

  /* Reduced motion ------------------------------------------------------- */
  const motionToggle = el(
    "button",
    {
      class: "toggle",
      type: "button",
      role: "switch",
      "aria-checked": String(getReducedMotion()),
    },
    [el("span", { class: "toggle__dot" }), "Reduce motion"],
  );

  const syncMotion = (): void => {
    motionToggle.setAttribute("aria-checked", String(getReducedMotion()));
  };

  motionToggle.addEventListener("click", () => {
    setReducedMotion(!getReducedMotion());
    syncMotion();
  });

  /* Theme ---------------------------------------------------------------- */
  const themeToggle = el("button", {
    class: "toggle toggle--icon",
    type: "button",
    "aria-label": "Switch to light theme",
    title: "Switch theme",
  });
  themeToggle.append(icon([...ICONS.moon], 16));

  const syncTheme = (): void => {
    const theme = getTheme();
    themeToggle.replaceChildren(icon(theme === "dark" ? [...ICONS.moon] : [...ICONS.sun], 16));
    themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
    );
  };

  themeToggle.addEventListener("click", () => {
    toggleTheme();
    syncTheme();
  });

  syncTheme();
  syncMotion();

  return el("div", { class: "controls" }, [speed, motionToggle, themeToggle]);
}

/** Keep the reduced-motion switch honest when the OS setting changes. */
export function syncControls(root: ParentNode): void {
  const toggle = root.querySelector('[role="switch"]');
  toggle?.setAttribute("aria-checked", String(getReducedMotion()));
}
