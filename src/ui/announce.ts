/**
 * A single polite live region for the whole page.
 *
 * The copy button changes its own label to "Copied", but a label change on a
 * button the user just activated is not reliably announced. A dedicated
 * role=status region is.
 */

let region: HTMLElement | null = null;

export function mountAnnouncer(parent: HTMLElement): void {
  region = document.createElement("div");
  region.id = "announcer";
  region.className = "visually-hidden";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  parent.append(region);
}

export function announce(message: string): void {
  if (!region) return;
  // Clearing first guarantees the same message twice in a row is re-announced.
  region.textContent = "";
  window.setTimeout(() => {
    if (region) region.textContent = message;
  }, 40);
}
