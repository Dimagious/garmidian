import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { Notice } from "obsidian-test-mocks/obsidian";
import type { TFile } from "obsidian";
import { readRegionMeta, withMeta, wrapRegion, type RegionMeta } from "../core/region";
import { SYNC_UI } from "../i18n";
import { makeHarness, type Harness } from "../test/mock-app";
import { rebuildActiveDashboard } from "./rebuild";

const sync = SYNC_UI.en;
const SRC = "Garmy/data";
const META: RegionMeta = { v: 1, source: SRC, groups: ["recovery", "activity", "training"], noSports: [], lang: "en", races: null };

const dayNote = (fields: Record<string, number>): string => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n`;
const day = (i: number): string => dayNote({ sleep_score: 70 + i, steps: 8000 + i, run_min: 30, run_km: 5, run_mi: 3.1 });
const DATA: Record<string, string> = Object.fromEntries(Array.from({ length: 9 }, (_, i) => i + 1).map((d) => [`${SRC}/2026-11-0${d}.md`, day(d)]));
const dashboard = (meta: RegionMeta = META, around = "# Mine\n\nBefore the dashboard.\n\n", after = "\n\nAfter it.\n"): string =>
  withMeta(`${around}${wrapRegion("OLD BODY")}${after}`, meta);

let h: Harness;
let notices: MockInstance<Notice["constructor__"]>;

/** Opens the note in the active leaf, as the user would have it in front of them. */
async function open(path: string): Promise<TFile> {
  const file = h.app.vault.getFileByPath(path);
  if (!file) throw new Error(`fixture note missing: ${path}`);
  const leaf = h.app.workspace.getLeaf(false);
  await leaf.openFile(file);
  h.app.workspace.setActiveLeaf(leaf, { focus: true });
  return file;
}
const texts = (): unknown[] => notices.mock.calls.map((c) => c[0]);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function setup(files: Record<string, string>): Promise<void> {
  h = await makeHarness(files);
  notices = vi.spyOn(Notice.prototype, "constructor__");
}

describe("rebuildActiveDashboard", () => {
  it("says so when no note is open", async () => {
    await setup(DATA);
    await rebuildActiveDashboard(h.app, "en");
    expect(texts()).toEqual([sync.rebuildNoNote]);
  });

  it("says so when the open note has no Garmy dashboard, and leaves it alone", async () => {
    await setup({ ...DATA, "Notes/Plain.md": "# Plain\n\nNothing here.\n" });
    const file = await open("Notes/Plain.md");
    await rebuildActiveDashboard(h.app, "en");
    expect(texts()).toEqual([sync.rebuildNoRegion]);
    expect(await h.app.vault.read(file)).toBe("# Plain\n\nNothing here.\n");
  });

  it("redraws the region from the data on disk and keeps the text around it", async () => {
    await setup({ ...DATA, "Notes/Dash.md": dashboard() });
    const file = await open("Notes/Dash.md");
    await rebuildActiveDashboard(h.app, "en");
    const text = await h.app.vault.read(file);
    expect(texts()).toEqual([sync.rebuildDone]);
    expect(text).not.toContain("OLD BODY");
    expect(text).toContain("```dashy-");
    expect(text).toContain("# Mine\n\nBefore the dashboard.");
    expect(text).toContain("After it.");
    expect(readRegionMeta(text)).toMatchObject({ source: SRC, lang: "en" });
  });

  it("writes a month goal of `usual` only when asked to", async () => {
    // 130 days of history, more than the 120 that `goal: usual` needs.
    const history = Object.fromEntries(Array.from({ length: 130 }, (_, i) => [`${SRC}/${new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10)}.md`, day(i)]));
    await setup({ ...history, "Notes/Dash.md": dashboard() });
    const file = await open("Notes/Dash.md");
    await rebuildActiveDashboard(h.app, "en");
    expect(await h.app.vault.read(file)).not.toContain("goal: usual");
    await h.app.vault.modify(file, dashboard());
    await rebuildActiveDashboard(h.app, "en", "metric", true);
    expect(await h.app.vault.read(file)).toContain("goal: usual");
  });

  it("follows the units it is given", async () => {
    await setup({ ...DATA, "Notes/Dash.md": dashboard() });
    const file = await open("Notes/Dash.md");
    await rebuildActiveDashboard(h.app, "en", "imperial");
    const miles = await h.app.vault.read(file);
    expect(miles).toMatch(/field: run_mi\b/);
    expect(miles).not.toMatch(/field: run_km\b/);
    await h.app.vault.modify(file, dashboard());
    await rebuildActiveDashboard(h.app, "en", "metric");
    const km = await h.app.vault.read(file);
    expect(km).toMatch(/field: run_km\b/);
    expect(km).not.toMatch(/field: run_mi\b/);
  });

  it("reads day notes named in the note's own format", async () => {
    const dotted = Object.fromEntries([1, 2, 3].map((d) => [`Fit/0${d}.11.2026.md`, day(d)]));
    await setup({ ...dotted, "Notes/Dash.md": dashboard({ ...META, source: "Fit", dayFormat: "DD.MM.YYYY" }) });
    const file = await open("Notes/Dash.md");
    await rebuildActiveDashboard(h.app, "en");
    expect(texts()).toEqual([sync.rebuildDone]);
    expect(await h.app.vault.read(file)).not.toContain("OLD BODY");
  });

  it("skips files in the data folder whose names are not dates", async () => {
    await setup({ ...DATA, [`${SRC}/README.md`]: "# not a day\n", "Notes/Dash.md": dashboard() });
    const file = await open("Notes/Dash.md");
    await rebuildActiveDashboard(h.app, "en");
    expect(texts()).toEqual([sync.rebuildDone]);
    expect(await h.app.vault.read(file)).toContain("```stats");
  });

  it("keeps a races folder that exists and drops one that was renamed", async () => {
    const withRaces = { ...META, races: "Races" };
    await setup({ ...DATA, "Races/2026-12-06 Marathon.md": "# race\n", "Notes/Dash.md": dashboard(withRaces) });
    const file = await open("Notes/Dash.md");
    await rebuildActiveDashboard(h.app, "en");
    expect(readRegionMeta(await h.app.vault.read(file))?.races).toBe("Races");

    await setup({ ...DATA, "Notes/Dash.md": dashboard(withRaces) });
    const other = await open("Notes/Dash.md");
    await rebuildActiveDashboard(h.app, "en");
    expect(readRegionMeta(await h.app.vault.read(other))?.races).toBeNull();
  });

  it("does not touch the note when there is no data to draw", async () => {
    const note = dashboard();
    await setup({ "Notes/Dash.md": note });
    const file = await open("Notes/Dash.md");
    await rebuildActiveDashboard(h.app, "en");
    expect(texts()).toEqual([sync.rebuildNoData]);
    expect(await h.app.vault.read(file)).toBe(note);
  });

  it("speaks the language it is given", async () => {
    await setup({});
    await rebuildActiveDashboard(h.app, "de");
    expect(texts()).toEqual([SYNC_UI.de.rebuildNoNote]);
    expect(SYNC_UI.de.rebuildNoNote).not.toBe(sync.rebuildNoNote);
  });
});
