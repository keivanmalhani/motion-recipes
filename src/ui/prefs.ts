/**
 * prefs.ts - theme and reduced motion.
 *
 * Reduced motion here is a real preference, not a checkbox that dims the CSS.
 * It starts from prefers-reduced-motion, the user can override it, and the
 * override is what the rest of the app reads. What it switches off is
 * anything the visitor did not ask for: autoplay on scroll and the ambient
 * hero loop. Pressing Replay still plays the demo, because a motion library
 * that refuses to show motion on request is not accessible, it is broken.
 */

export type Theme = "dark" | "light";

const THEME_KEY = "motion-theme";
const REDUCED_KEY = "motion-reduced";

type Listener = (reduced: boolean) => void;
const listeners = new Set<Listener>();

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode, or storage disabled. The session still works. */
  }
}

export function getTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  writeStorage(THEME_KEY, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#fbfaf8" : "#0a0a0c");
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function systemPrefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let reducedMotion = false;

export function getReducedMotion(): boolean {
  return reducedMotion;
}

export function setReducedMotion(value: boolean): void {
  reducedMotion = value;
  document.documentElement.setAttribute("data-reduced-motion", value ? "true" : "false");
  writeStorage(REDUCED_KEY, value ? "true" : "false");
  for (const listener of listeners) listener(value);
}

export function onReducedMotionChange(listener: Listener): void {
  listeners.add(listener);
}

/** Seed the preference from storage, falling back to the OS setting. */
export function initPreferences(): void {
  setTheme(getTheme());
  const saved = readStorage(REDUCED_KEY);
  setReducedMotion(saved === null ? systemPrefersReducedMotion() : saved === "true");

  if (typeof matchMedia === "function") {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", (event) => {
      // The OS changing its mind overrides a stale in-page choice.
      setReducedMotion(event.matches);
    });
  }
}
