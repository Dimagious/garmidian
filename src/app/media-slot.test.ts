import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMediaSlot, type MediaSlotOptions } from "./media-slot";

// The test mocks draw no icon. This one leaves a marker child, so a button that fails to clear its old icon shows two.
vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<typeof import("obsidian")>();
  return { ...original, setIcon: (el: HTMLElement, id: string): void => { el.createSpan({ cls: "icon-marker", attr: { "data-icon": id } }); } };
});

const SRC = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const base: MediaSlotOptions = { src: SRC, animated: true, caption: "How to find the key", alt: "The settings page", playLabel: "Play clip", stopLabel: "Stop clip", illustration: "key" };

let parent: HTMLElement;
const mount = (o: Partial<MediaSlotOptions> = {}): HTMLElement => mountMediaSlot(parent, { ...base, ...o });
const img = (fig: HTMLElement): HTMLImageElement => fig.querySelector<HTMLImageElement>("img.garmy-media-clip") as HTMLImageElement;
const toggle = (fig: HTMLElement): HTMLButtonElement => fig.querySelector<HTMLButtonElement>("button.garmy-media-toggle") as HTMLButtonElement;

/** jsdom has no matchMedia; the slot asks for prefers-reduced-motion through activeWindow. */
function motion(reduce: boolean): void {
  const matchMedia = (query: string): MediaQueryList => ({ matches: reduce && query.includes("prefers-reduced-motion"), media: query }) as MediaQueryList;
  Object.defineProperty(activeWindow, "matchMedia", { value: matchMedia, configurable: true, writable: true });
}

beforeEach(() => { parent = createDiv(); motion(false); });
afterEach(() => { Reflect.deleteProperty(activeWindow, "matchMedia"); vi.restoreAllMocks(); });

describe("mountMediaSlot", () => {
  describe("without media", () => {
    it("draws the sketch and the caption and marks the slot empty", () => {
      const fig = mount({ src: null });
      expect(fig.classList.contains("is-empty")).toBe(true);
      expect(fig.classList.contains("is-hidden")).toBe(false);
      expect(fig.querySelector("svg.garmy-media-art")?.getAttribute("aria-hidden")).toBe("true");
      expect(fig.querySelector("figcaption")?.textContent).toBe(base.caption);
      expect(fig.querySelector("img")).toBeNull();
      expect(fig.querySelector("button")).toBeNull();
    });

    it("draws a key for the key help and a plug-in tile for the plugin help", () => {
      const key = mount({ src: null, illustration: "key" });
      const plugin = mount({ src: null, illustration: "plugin" });
      expect(key.querySelector("circle.garmy-art-key")).not.toBeNull();
      expect(key.querySelector("path.garmy-art-key-stroke")).not.toBeNull();
      expect(plugin.querySelector("circle")).toBeNull();
      expect(plugin.querySelector("rect.garmy-art-key")).not.toBeNull();
    });

    it("hides the whole slot when asked to", () => {
      const fig = mount({ src: null, hideWhenMissing: true });
      expect(fig.classList.contains("is-hidden")).toBe(true);
    });

    it("lets the caller put it in the parent it gave", () => {
      expect(mount({ src: null }).parentElement).toBe(parent);
    });
  });

  describe("a still picture", () => {
    it("shows the picture with its alt text and no toggle", () => {
      const fig = mount({ animated: false });
      expect(fig.classList.contains("is-empty")).toBe(false);
      expect(img(fig).src).toBe(SRC);
      expect(img(fig).getAttribute("alt")).toBe(base.alt);
      expect(img(fig).classList.contains("is-still")).toBe(true);
      expect(fig.querySelector(".garmy-media-stage")?.classList.contains("has-still")).toBe(true);
      expect(toggle(fig)).toBeNull();
    });

    it("shows a still even under reduced motion", () => {
      motion(true);
      expect(img(mount({ animated: false })).src).toBe(SRC);
    });
  });

  describe("a clip", () => {
    it("plays at once and offers to stop it", () => {
      const fig = mount();
      expect(img(fig).src).toBe(SRC);
      expect(img(fig).classList.contains("is-off")).toBe(false);
      expect(toggle(fig).getAttribute("aria-label")).toBe(base.stopLabel);
      expect(toggle(fig).getAttribute("aria-pressed")).toBe("true");
      expect(fig.querySelector(".garmy-media-stage")?.classList.contains("is-paused")).toBe(false);
    });

    it("stops on a click: no source, a paused stage, and an offer to play", () => {
      const fig = mount();
      toggle(fig).click();
      expect(img(fig).hasAttribute("src")).toBe(false);
      expect(img(fig).classList.contains("is-off")).toBe(true);
      expect(fig.querySelector(".garmy-media-stage")?.classList.contains("is-paused")).toBe(true);
      expect(toggle(fig).getAttribute("aria-label")).toBe(base.playLabel);
      expect(toggle(fig).getAttribute("aria-pressed")).toBe("false");
    });

    it("plays again from the start on the next click", () => {
      const fig = mount();
      toggle(fig).click();
      toggle(fig).click();
      expect(img(fig).src).toBe(SRC);
      expect(img(fig).classList.contains("is-off")).toBe(false);
      expect(toggle(fig).getAttribute("aria-label")).toBe(base.stopLabel);
      expect(toggle(fig).getAttribute("aria-pressed")).toBe("true");
    });

    it("keeps exactly one icon in the button however often it is toggled", () => {
      const fig = mount();
      for (let i = 0; i < 3; i++) toggle(fig).click();
      expect(toggle(fig).children).toHaveLength(1);
      expect(toggle(fig).children[0]?.getAttribute("data-icon")).toBe(toggle(fig).getAttribute("aria-pressed") === "true" ? "pause" : "play");
    });

    it("waits for a click under prefers-reduced-motion", () => {
      motion(true);
      const fig = mount();
      expect(img(fig).hasAttribute("src")).toBe(false);
      expect(toggle(fig).getAttribute("aria-label")).toBe(base.playLabel);
      expect(toggle(fig).getAttribute("aria-pressed")).toBe("false");
      toggle(fig).click();
      expect(img(fig).src).toBe(SRC);
      expect(toggle(fig).getAttribute("aria-pressed")).toBe("true");
    });

    it("gives the toggle a button type so a form around it is not submitted", () => {
      expect(toggle(mount()).getAttribute("type")).toBe("button");
    });
  });
});
