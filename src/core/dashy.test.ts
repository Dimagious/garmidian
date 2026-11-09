import { describe, expect, it } from "vitest";
import { dashyProblems } from "../test/dashy-schema";
import { compose } from "./compose";
import { brokenBlocks, readDashyApi, schemaAtLeast, wasNotChecked, USUAL_GOAL_MIN_DAYS, type DashyCheckedBlock } from "./dashy";
import { buildProfile } from "./profile";
import { rebuildNote } from "./rebuild";
import { wrapRegion, withMeta } from "./region";
import type { DayRecord } from "./types";

const rows = (n: number): DayRecord[] => Array.from({ length: n }, (_, i) => ({
  date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
  fields: { steps: 7000 + (i % 7) * 900, run_km: i % 3 === 0 ? 8 : 0, run_min: i % 3 === 0 ? 45 : 0, bike_km: i % 4 === 0 ? 40 : 0, bike_min: i % 4 === 0 ? 90 : 0, swim_km: i % 5 === 0 ? 1.5 : 0, swim_min: i % 5 === 0 ? 40 : 0 },
}));
const IDS = ["overview", "steps", "sport:run", "triathlon"];
const md = (n: number, template: string, goalUsual?: boolean): string => compose(buildProfile(rows(n)), { source: "Garmy/data", template, ...(goalUsual === undefined ? {} : { goalUsual }) }).markdown;

describe("schemaAtLeast", () => {
  it("compares part by part, not as text", () => {
    expect(schemaAtLeast("1.12.0", "1.12.0")).toBe(true);
    expect(schemaAtLeast("1.12.1", "1.12.0")).toBe(true);
    expect(schemaAtLeast("1.13.0", "1.12.0")).toBe(true);
    expect(schemaAtLeast("2.0.0", "1.12.0")).toBe(true);
    expect(schemaAtLeast("1.11.0", "1.12.0")).toBe(false);
    expect(schemaAtLeast("1.9.0", "1.12.0")).toBe(false);
  });
  it("treats a version it cannot read as too old", () => {
    expect(schemaAtLeast("", "1.12.0")).toBe(false);
    expect(schemaAtLeast("next", "1.12.0")).toBe(false);
  });
});

describe("readDashyApi", () => {
  const good = { apiVersion: 1, version: "2.2.0", schemaVersion: "1.12.0", fences: () => [], check: () => Promise.resolve([]) };
  it("returns the api of a Dashy that has one", () => expect(readDashyApi({ api: good })).toBe(good));
  it("is null for a Dashy before 2.2, which has no api", () => expect(readDashyApi({})).toBeNull());
  it("is null with no plugin at all", () => expect(readDashyApi(undefined)).toBeNull());
  it("is null for an apiVersion below 1 or a missing check", () => {
    expect(readDashyApi({ api: { ...good, apiVersion: 0 } })).toBeNull();
    expect(readDashyApi({ api: { ...good, check: undefined } })).toBeNull();
    expect(readDashyApi({ api: { ...good, schemaVersion: 12 } })).toBeNull();
  });
});

describe("what Dashy's check says", () => {
  const block = (over: Partial<DashyCheckedBlock>): DashyCheckedBlock => ({ line: 1, lang: "stats", status: "checked", findings: [], ...over });
  it("a clean block is fine", () => expect(brokenBlocks([block({})])).toEqual([]));
  it("an error finding is broken, a warning is not", () => {
    expect(brokenBlocks([block({ findings: [{ level: "error", message: "x" }] })])).toHaveLength(1);
    expect(brokenBlocks([block({ findings: [{ level: "warning", message: "x" }, { level: "notice", message: "y" }] })])).toEqual([]);
  });
  it("a dashy- name Dashy lacks is broken even with no findings", () => expect(brokenBlocks([block({ lang: "dashy-nope", status: "unknown" })])).toHaveLength(1));
  it("a block another plugin draws is left alone", () => expect(brokenBlocks([block({ lang: "chart", status: "elsewhere" })])).toEqual([]));
  it("one notice about indexing means the check has to run again", () => {
    expect(wasNotChecked([block({ findings: [{ level: "notice", message: "Obsidian is still indexing" }] })])).toBe(true);
    expect(wasNotChecked([block({ findings: [{ level: "notice", message: "No data for this period" }] })])).toBe(false);
    expect(wasNotChecked([block({})])).toBe(false);
  });
});

describe("a month goal that follows the user's own months", () => {
  it("is written as `usual` on a Dashy that knows it, once there is history for it", () => {
    for (const id of IDS) {
      const out = md(USUAL_GOAL_MIN_DAYS, id, true);
      expect(out, id).toMatch(/goal: usual\b/);
      expect(dashyProblems(out), id).toEqual([]);
    }
  });
  it("stays a number on an older Dashy", () => {
    for (const id of IDS) {
      expect(md(200, id, false), id).not.toContain("goal: usual");
      expect(md(200, id), id).not.toContain("goal: usual");
    }
  });
  it("stays a number while the history is shorter than the months usual averages", () => {
    for (const id of IDS) {
      const out = md(USUAL_GOAL_MIN_DAYS - 1, id, true);
      expect(out, id).not.toContain("goal: usual");
      expect(dashyProblems(out), id).toEqual([]);
    }
  });
  it("always sits in a bar with a period, which usual needs", () => {
    for (const id of IDS) {
      for (const f of md(200, id, true).match(/```progress\n[\s\S]*?\n```/g) ?? []) expect(f, id).toMatch(/\nperiod: month\n/);
    }
  });
  it("leaves the weekly chart goal a number, because a chart goal is not a bar's", () => {
    expect(md(200, "sport:run", true)).toMatch(/type: bar[\s\S]*?goal: \d+/);
  });
  it("a rebuild follows the Dashy that is installed now", () => {
    const first = md(200, "steps", false);
    const note = withMeta(`---\ntags: []\n---\n\n# t\n\n${wrapRegion(first)}\n`, { v: 1, source: "Garmy/data", groups: [], noSports: [], lang: "en", races: null, template: "steps" });
    const old = rebuildNote(note, rows(200), () => true, "metric", false);
    const now = rebuildNote(note, rows(200), () => true, "metric", true);
    expect(old.kind === "ok" && old.text).not.toContain("goal: usual");
    expect(now.kind === "ok" && now.text).toContain("goal: usual");
  });
});
