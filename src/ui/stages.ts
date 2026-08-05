/**
 * stages.ts - the markup each recipe animates.
 *
 * src/core never creates an element. The UI owns every node on the page, and
 * this file is where the demo scenery lives: one static HTML fragment per
 * recipe id, keyed to the data attributes that recipe queries for.
 *
 * These strings are authored here and contain no interpolated input, so
 * assigning them with innerHTML is safe. The stage is decorative, so it is
 * marked aria-hidden and driven by the card's real buttons.
 */

/** Two full 0-9 cycles, so a digit column can roll a whole extra rotation. */
function digitColumn(finalDigit: number): string {
  const cycle = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const rows = [...cycle, ...cycle].map((n) => `<span>${n}</span>`).join("");
  return `<span class="digit" data-roll data-final="${finalDigit}"><span class="digit__strip" data-strip>${rows}</span></span>`;
}

function skeletonLines(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `<span class="skeleton__line" data-skeleton-line style="width:${[92, 74, 58][i] ?? 70}%"></span>`,
  ).join("");
}

function rows(count: number): string {
  const labels = ["Deploy preview", "Type check", "Unit tests", "Bundle size", "Lighthouse"];
  return Array.from(
    { length: count },
    (_, i) =>
      `<span class="row" data-row><i class="row__dot"></i><span class="row__label">${labels[i] ?? "Step"}</span><i class="row__bar"></i></span>`,
  ).join("");
}

function drawerItems(count: number): string {
  const labels = ["Overview", "Members", "Billing", "Webhooks"];
  return Array.from(
    { length: count },
    (_, i) => `<span class="drawer__item" data-drawer-item>${labels[i] ?? "Item"}</span>`,
  ).join("");
}

export const STAGE_MARKUP: Record<string, string> = {
  "spring-press": `
    <span class="press__glow" data-press-glow></span>
    <span class="press__btn" data-press>Deploy</span>
  `,

  "magnetic-hover": `
    <span class="magnet__field" data-magnet-field></span>
    <span class="magnet__dot" data-magnet>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </span>
  `,

  "stagger-reveal": `<div class="rows">${rows(5)}</div>`,

  "shared-element-morph": `
    <div class="flip__card" data-flip-card>
      <span class="flip__thumb"></span>
      <div class="flip__body" data-flip-body>
        <strong>Nightly build</strong>
        <span>Passed in 42 seconds</span>
      </div>
    </div>
  `,

  "elastic-drawer": `
    <span class="drawer__scrim" data-drawer-scrim></span>
    <div class="drawer" data-drawer>
      <span class="drawer__handle"></span>
      ${drawerItems(4)}
    </div>
  `,

  "number-ticker": `
    <div class="ticker">
      <span class="ticker__unit">$</span>
      ${digitColumn(1)}${digitColumn(2)}<span class="ticker__sep">,</span>${digitColumn(4)}${digitColumn(8)}${digitColumn(0)}
    </div>
    <span class="ticker__delta" data-ticker-delta data-to="18.2">+0.0%</span>
  `,

  "skeleton-to-content": `
    <div class="skeleton" data-skeleton>
      <span class="skeleton__avatar"></span>
      <span class="skeleton__lines">${skeletonLines(3)}</span>
    </div>
    <div class="loaded" data-content>
      <span class="loaded__avatar">AL</span>
      <span class="loaded__text">
        <strong>Ada Lovelace</strong>
        <span>Merged 14 recipes into main</span>
      </span>
    </div>
  `,

  "icon-state-morph": `
    <span class="bars">
      <i class="bars__bar" data-bar></i>
      <i class="bars__bar" data-bar></i>
      <i class="bars__bar" data-bar></i>
    </span>
  `,

  "success-checkmark": `
    <svg class="check" viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <circle class="check__ring" data-check-ring cx="36" cy="36" r="27" />
      <path
        class="check__path"
        data-check-path
        d="M23 37.5 L32 46.5 L49.5 27"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,

  "attention-shake": `
    <div class="shake">
      <div class="field" data-field>
        <span class="field__flash" data-field-flash></span>
        <span class="field__label">Card number</span>
        <span class="field__value">4242 4242 4242 42</span>
      </div>
      <span class="field__message" data-field-message>Card number is incomplete</span>
    </div>
  `,

  "progress-arc": `
    <div class="arc" data-arc-wrap>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="arc__track" cx="60" cy="60" r="52" />
        <circle class="arc__value" data-arc cx="60" cy="60" r="52" />
      </svg>
      <span class="arc__label" data-arc-label>0%</span>
    </div>
  `,

  "card-lift": `
    <span class="lift__shadow" data-lift-shadow></span>
    <div class="lift__card" data-lift>
      <span class="lift__tag" data-depth="2.4">LIVE</span>
      <strong class="lift__title" data-depth="1.2">Atlas</strong>
      <span class="lift__meta" data-depth="0.5">12 layers, 0 repaints</span>
    </div>
  `,

  "text-scramble": `
    <span class="scramble" data-scramble data-text="SHIP IT FASTER">SHIP IT FASTER</span>
  `,

  "page-transition-wipe": `
    <div class="wipe">
      <div class="wipe__page" data-page-a>
        <span class="wipe__eyebrow">Inbox</span>
        <strong>12 unread</strong>
      </div>
      <div class="wipe__page wipe__page--b" data-page-b>
        <span class="wipe__eyebrow">Archive</span>
        <strong>1,204 items</strong>
      </div>
      <span class="wipe__mask" data-wipe></span>
    </div>
  `,
};

/** Stage modifier class, so each demo can be styled independently. */
export function stageClass(recipeId: string): string {
  return `card__stage stage stage--${recipeId}`;
}
