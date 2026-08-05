/** Tiny element helpers. Enough to build a page, not enough to be a framework. */

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === "class") node.className = value;
    else node.setAttribute(name, value);
  }
  append(node, children);
  return node;
}

export function append(parent: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

/** Query one element, typed, or throw. Used only for nodes this app just built. */
export function must<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected to find ${selector}`);
  return found;
}

/** Inline SVG icon from a path list. Marked aria-hidden; label the button instead. */
export function icon(paths: string[], size = 16): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

export const ICONS = {
  replay: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"],
  copy: ["M9 9h10v10H9z", "M5 15H4V4h11v1"],
  check: ["M4 12.5 9 17.5 20 6.5"],
  sun: ["M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6 4.5 4.5M19.5 19.5 18 18M18 6l1.5-1.5M4.5 19.5 6 18", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
  moon: ["M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"],
} as const;
