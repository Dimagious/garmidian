import { SPORTS } from "./catalog";
import { describe, expect, it } from "vitest";
import { detectDataFolders } from "./detect";
import { rebuildNote } from "./rebuild";
import { readRegionMeta, splitComposed, withMeta, wrapRegion, type RegionMeta } from "./region";
import { compose } from "./compose";
import { buildProfile } from "./profile";
import { shouldAutoSync, syncWindowDays } from "./schedule";
import { dayParser, isoParser } from "./dayname";
import type { DayRecord } from "./types";

const H = 3600e3;
const base = { syncHours: 6, keyProblem: "", lastSyncAt: 0, lastSync: "" };

describe("shouldAutoSync", () => {
  it("runs when on, keyed, and the interval has passed", () => {
    expect(shouldAutoSync({ ...base, lastSyncAt: 0 }, true, 6 * H)).toBe(true);
    expect(shouldAutoSync({ ...base, lastSyncAt: 1000 }, true, 1000 + 6 * H - 1)).toBe(false);
    expect(shouldAutoSync({ ...base, lastSyncAt: 1000 }, true, 1000 + 6 * H)).toBe(true);
  });
  it("never runs when off, without a key, or after Garmin rejected the key", () => {
    expect(shouldAutoSync({ ...base, syncHours: 0 }, true, 99 * H)).toBe(false);
    expect(shouldAutoSync(base, false, 99 * H)).toBe(false);
    expect(shouldAutoSync({ ...base, keyProblem: "2026-11-06" }, true, 99 * H)).toBe(false);
  });
  it("respects each interval choice", () => {
    for (const h of [6, 12, 24]) {
      expect(shouldAutoSync({ ...base, syncHours: h, lastSyncAt: 0 }, true, h * H - 1)).toBe(false);
      expect(shouldAutoSync({ ...base, syncHours: h, lastSyncAt: 0 }, true, h * H)).toBe(true);
    }
  });
});

describe("syncWindowDays", () => {
  it("starts with two weeks, then since the last sync plus a margin", () => {
    expect(syncWindowDays("", "2026-11-06")).toBe(14);
    expect(syncWindowDays("2026-11-06", "2026-11-06")).toBe(3);
    expect(syncWindowDays("2026-11-04", "2026-11-06")).toBe(5);
    expect(syncWindowDays("2026-10-30", "2026-11-06")).toBe(10);
  });
  it("never reaches further back than 60 days", () => {
    expect(syncWindowDays("2025-01-01", "2026-11-06")).toBe(60);
  });
  it("copes with a last sync date in the future (clock change)", () => {
    expect(syncWindowDays("2026-11-10", "2026-11-06")).toBe(3);
  });
});

const rows = (n: number, f: (i: number) => Record<string, number | string>): DayRecord[] =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), fields: f(i) }));
const full = (): Record<string, number | string> => ({ steps: 8000, resting_hr: 50, stress: 25, sleep_score: 80, sleep_duration: "7h 0min", hrv: 50, run_km: 5, run_min: 30 });
const meta: RegionMeta = { v: 1, source: "Garmy/data", groups: ["recovery", "activity", "training"], noSports: [], lang: "en", races: null };

function noteWith(data: DayRecord[], m: RegionMeta = meta): string {
  const composed = compose(buildProfile(data), { source: m.source, lang: m.lang, groups: m.groups, sports: Object.keys(SPORTS).filter((k) => !m.noSports.includes(k)), races: m.races });
  const parts = splitComposed(composed.markdown);
  return withMeta(`---\ntags: [x]\n---\n\nMy intro line\n\n${wrapRegion(parts.body)}\n\nMy outro line\n`, m);
}

describe("rebuildNote", () => {
  it("regenerates the region from newer data and keeps what the user wrote", () => {
    const young = noteWith(rows(3, full));
    expect(young).toContain("a week of data");
    const r = rebuildNote(young, rows(40, full), () => false);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.text).toContain("My intro line");
    expect(r.text).toContain("My outro line");
    expect(r.text).toContain("tags: [x]");
    expect(r.text).not.toContain("a week of data");
    expect(r.blocks).toContain("recovery.chart.scores");
    expect(readRegionMeta(r.text)).toEqual(meta);
  });
  it("keeps the choices the dashboard was built with", () => {
    const only = noteWith(rows(40, full), { ...meta, groups: ["recovery"], noSports: [] });
    const r = rebuildNote(only, rows(60, full), () => false);
    expect(r.kind === "ok" && r.blocks.every((b) => b.startsWith("recovery"))).toBe(true);
  });
  it("picks up a sport that appeared after the dashboard was built, but not one the user switched off", () => {
    const young = noteWith(rows(10, full), { ...meta, noSports: ["swim"] });
    const later = (i: number): Record<string, number | string> => ({ ...full(), bike_km: 40, bike_min: 90, swim_km: 1.5, swim_min: 40 });
    const r = rebuildNote(young, rows(40, later), () => false);
    expect(r.kind === "ok" && r.text.includes("field: bike_km")).toBe(true);
    expect(r.kind === "ok" && r.text.includes("swim_km")).toBe(false);
    expect(r.kind === "ok" && readRegionMeta(r.text)?.noSports).toEqual(["swim"]);
  });
  it("is idempotent when nothing changed", () => {
    const data = rows(40, full);
    const note = noteWith(data);
    const r = rebuildNote(note, data, () => false);
    expect(r.kind === "ok" && r.text).toBe(note);
  });
  it("drops a races folder that no longer exists, and keeps one that does", () => {
    const withRaces = noteWith(rows(10, full), { ...meta, races: "Races" });
    const gone = rebuildNote(withRaces, rows(10, full), () => false);
    expect(gone.kind === "ok" && gone.text.includes("races.countdown")).toBe(false);
    expect(gone.kind === "ok" && readRegionMeta(gone.text)?.races).toBeNull();
    const kept = rebuildNote(withRaces, rows(10, full), (p) => p === "Races");
    expect(kept.kind === "ok" && kept.text.includes("source: Races")).toBe(true);
  });
  it("says what is wrong instead of guessing", () => {
    expect(rebuildNote("plain note", rows(10, full), () => false)).toEqual({ kind: "no-region" });
    expect(rebuildNote(noteWith(rows(10, full)), [], () => false)).toEqual({ kind: "no-data" });
  });
});

describe("detectDataFolders", () => {
  const note = (path: string, props: Record<string, unknown>) => ({ path, props });
  const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}.md`;
  it("finds the folder of daily notes that carry Garmin numbers", () => {
    const notes = [1, 2, 3, 4, 5, 6].map((n) => note(`Diary/${day(n)}`, { steps: 1000 * n, sleep_score: 80, tags: ["x"] }));
    expect(detectDataFolders(notes)).toEqual([{ folder: "Diary", notes: 6, fields: ["sleep_score", "steps"] }]);
  });
  it("ignores notes with too few known numbers, non-date names and tiny folders", () => {
    const few = [1, 2, 3, 4, 5, 6].map((n) => note(`A/${day(n)}`, { steps: 1 }));
    const named = [1, 2, 3, 4, 5, 6].map((n) => note(`B/note ${n}.md`, { steps: 1, hrv: 2 }));
    const tiny = [1, 2].map((n) => note(`C/${day(n)}`, { steps: 1, hrv: 2 }));
    expect(detectDataFolders([...few, ...named, ...tiny])).toEqual([]);
  });
  it("ignores empty values and ranks folders by size", () => {
    const small = [1, 2, 3, 4, 5].map((n) => note(`Small/${day(n)}`, { steps: 1, hrv: 2 }));
    const big = [1, 2, 3, 4, 5, 6, 7].map((n) => note(`Big/${day(n)}`, { steps: 1, hrv: 2, stress: "" }));
    const r = detectDataFolders([...small, ...big]);
    expect(r.map((c) => c.folder)).toEqual(["Big", "Small"]);
    expect(r[0]?.fields).toEqual(["hrv", "steps"]);
  });
  it("handles daily notes in the vault root", () => {
    const notes = [1, 2, 3, 4, 5].map((n) => note(day(n), { steps: 1, hrv: 2 }));
    expect(detectDataFolders(notes)[0]?.folder).toBe("");
  });
});

describe("detectDataFolders with another day format", () => {
  const note = (path: string, props: Record<string, unknown>) => ({ path, props });
  const eu = (n: number) => `${String(n).padStart(2, "0")}.10.2026.md`;
  it("finds notes named in the user's own format", () => {
    const notes = [1, 2, 3, 4, 5, 6].map((n) => note(`Diary/${eu(n)}`, { steps: 1, hrv: 2 }));
    expect(detectDataFolders(notes)).toEqual([]);
    expect(detectDataFolders(notes, dayParser("DD.MM.YYYY"))).toEqual([{ folder: "Diary", notes: 6, fields: ["hrv", "steps"] }]);
  });
  it("can accept either ISO or the custom format", () => {
    const custom = dayParser("DD.MM.YYYY");
    const both = (n: string) => isoParser(n) ?? custom(n);
    const notes = [...[1, 2, 3].map((n) => note(`D/${eu(n)}`, { steps: 1, hrv: 2 })), ...[4, 5, 6].map((n) => note(`D/2026-10-0${n}.md`, { steps: 1, hrv: 2 }))];
    expect(detectDataFolders(notes, both)[0]?.notes).toBe(6);
  });
});

describe("rebuildNote with a custom day format", () => {
  it("keeps the format in the region so the same notes are read again", () => {
    const m: RegionMeta = { v: 1, source: "Diary", groups: ["recovery"], noSports: [], lang: "en", races: null, dayFormat: "DD.MM.YYYY" };
    const note = withMeta(`${wrapRegion("old")}\n`, m);
    expect(readRegionMeta(note)?.dayFormat).toBe("DD.MM.YYYY");
    const r = rebuildNote(note, rows(20, full), () => false);
    expect(r.kind === "ok" && readRegionMeta(r.text)?.dayFormat).toBe("DD.MM.YYYY");
  });
  it("a region without a format stays without one", () => {
    expect(readRegionMeta(withMeta(wrapRegion("x"), { v: 1, source: "S", groups: [], noSports: [], lang: "en", races: null }))).not.toHaveProperty("dayFormat");
  });
});
