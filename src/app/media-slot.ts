import { setIcon } from "obsidian";

export interface MediaSlotOptions {
  /** The picture or clip as a data URL bundled into the plugin, or null when there is none. */
  src: string | null;
  /** A clip (GIF) can be stopped; a still picture has no toggle. */
  animated: boolean;
  caption: string;
  alt: string;
  playLabel: string;
  stopLabel: string;
  /** Drawn in the empty state. */
  illustration: "key" | "plugin";
  /** With no media the whole slot is removed instead of showing the placeholder. */
  hideWhenMissing?: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(parent: Element, tag: string, attrs: Record<string, string>): SVGElement {
  const node = activeDocument.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.appendChild(node);
  return node;
}

/** A calm, theme-aware sketch of a settings page: used while no help clip is shipped. */
function drawIllustration(host: HTMLElement, kind: "key" | "plugin"): void {
  const root = svg(host, "svg", { viewBox: "0 0 240 140", class: "garmy-media-art", "aria-hidden": "true", focusable: "false" });
  svg(root, "rect", { x: "8", y: "8", width: "224", height: "124", rx: "10", class: "garmy-art-frame" });
  svg(root, "rect", { x: "8", y: "8", width: "56", height: "124", rx: "10", class: "garmy-art-side" });
  for (const y of [28, 46, 64, 82]) svg(root, "rect", { x: "20", y: String(y), width: "32", height: "6", rx: "3", class: "garmy-art-line" });
  svg(root, "rect", { x: "78", y: "22", width: "90", height: "8", rx: "4", class: "garmy-art-line" });
  svg(root, "rect", { x: "78", y: "40", width: "140", height: "6", rx: "3", class: "garmy-art-line" });
  svg(root, "rect", { x: "78", y: "60", width: "140", height: "34", rx: "8", class: "garmy-art-hit" });
  svg(root, "rect", { x: "90", y: "72", width: "70", height: "8", rx: "4", class: "garmy-art-hit-line" });
  if (kind === "key") {
    svg(root, "circle", { cx: "196", cy: "77", r: "9", class: "garmy-art-key" });
    svg(root, "path", { d: "M188 77h-18m6 0v6m-6-6v5", class: "garmy-art-key-stroke", fill: "none" });
  } else {
    svg(root, "rect", { x: "188", y: "68", width: "20", height: "18", rx: "5", class: "garmy-art-key" });
  }
  svg(root, "rect", { x: "78", y: "104", width: "60", height: "16", rx: "8", class: "garmy-art-btn" });
}

/**
 * A place for a help picture or short clip. Without media it shows a theme-aware sketch (or nothing, with
 * hideWhenMissing). A clip does not autoplay under prefers-reduced-motion: it waits for a click on a play button.
 */
export function mountMediaSlot(parent: HTMLElement, o: MediaSlotOptions): HTMLElement {
  const fig = parent.createEl("figure", { cls: "garmy-media is-empty" });
  const stage = fig.createDiv({ cls: "garmy-media-stage" });
  drawIllustration(stage, o.illustration);
  fig.createEl("figcaption", { cls: "garmy-media-caption", text: o.caption });
  if (!o.src) {
    if (o.hideWhenMissing) fig.addClass("is-hidden");
    return fig;
  }
  const src = o.src;
  fig.removeClass("is-empty");
  const img = stage.createEl("img", { cls: "garmy-media-clip", attr: { alt: o.alt } });
  if (!o.animated) {
    img.src = src;
    img.addClass("is-still");
    stage.addClass("has-still"); // a class instead of :has(), which Obsidian flags as slow
    return fig;
  }
  const reduced = activeWindow.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const btn = stage.createEl("button", { cls: "garmy-media-toggle clickable-icon", attr: { type: "button" } });
  const setPlaying = (on: boolean): void => {
    img.toggleClass("is-off", !on);
    stage.toggleClass("is-paused", !on);
    btn.setAttr("aria-label", on ? o.stopLabel : o.playLabel);
    btn.setAttr("aria-pressed", String(on));
    btn.empty();
    setIcon(btn, on ? "pause" : "play");
    if (on) img.src = src; else img.removeAttribute("src");
  };
  btn.addEventListener("click", () => setPlaying(img.hasClass("is-off")));
  setPlaying(!reduced);
  return fig;
}
