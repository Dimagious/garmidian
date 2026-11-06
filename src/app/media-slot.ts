import { setIcon, type App } from "obsidian";

export interface MediaSlotOptions {
  /** Path relative to the plugin folder, for example "media/help-key.gif". */
  file: string;
  /** Plugin folder inside the vault, for example ".obsidian/plugins/garmidian". */
  pluginDir: string;
  caption: string;
  alt: string;
  playLabel: string;
  stopLabel: string;
  /** Drawn in the empty state. */
  illustration: "key" | "plugin";
  /** With no media file the whole slot is removed instead of showing the placeholder. */
  hideWhenMissing?: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(parent: Element, tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
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
 * A reserved place for a short help clip. It always renders at once with the placeholder,
 * then swaps in the file from the plugin folder when that file exists.
 * With prefers-reduced-motion the clip does not autoplay: it waits for a click on a play button.
 */
export function mountMediaSlot(app: App, parent: HTMLElement, o: MediaSlotOptions): HTMLElement {
  const fig = parent.createEl("figure", { cls: "garmy-media is-empty" });
  const stage = fig.createDiv({ cls: "garmy-media-stage" });
  drawIllustration(stage, o.illustration);
  fig.createEl("figcaption", { cls: "garmy-media-caption", text: o.caption });
  if (o.hideWhenMissing) fig.addClass("is-hidden");

  const path = `${o.pluginDir}/${o.file}`;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const show = (src: string): void => {
    fig.removeClass("is-empty");
    fig.removeClass("is-hidden");
    const img = stage.createEl("img", { cls: "garmy-media-clip", attr: { alt: o.alt } });
    const btn = stage.createEl("button", { cls: "garmy-media-toggle clickable-icon", attr: { type: "button" } });
    const setPlaying = (on: boolean): void => {
      img.toggleClass("is-off", !on);
      btn.setAttr("aria-label", on ? o.stopLabel : o.playLabel);
      btn.setAttr("aria-pressed", String(on));
      btn.empty();
      setIcon(btn, on ? "pause" : "play");
      if (on) img.src = src; else img.removeAttribute("src");
    };
    img.addEventListener("error", () => { fig.addClass("is-empty"); img.remove(); btn.remove(); if (o.hideWhenMissing) fig.addClass("is-hidden"); });
    btn.addEventListener("click", () => setPlaying(img.hasClass("is-off")));
    setPlaying(!reduced);
  };

  void app.vault.adapter.exists(path).then((found) => {
    if (found) show(app.vault.adapter.getResourcePath(path));
  }).catch((e: unknown) => { console.error(`Garmy: could not check ${path}`, e); });
  return fig;
}
