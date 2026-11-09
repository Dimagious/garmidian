import { describe, expect, it } from "vitest";
import { compose, activeSports } from "./compose";
import { convertFields, convertRecords, defaultUnits, distanceFor, fromMeters } from "./units";
import { mapActivities, type DayMap } from "./mapping";
import { rebuildNote } from "./rebuild";
import { readRegionMeta, splitComposed, withMeta, wrapRegion, type RegionMeta } from "./region";
import { buildProfile } from "./profile";
import type { DayRecord } from "./types";

const day = (i: number, fields: Record<string, number | string>): DayRecord => ({ date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), fields });
const rows = (n: number, f: Record<string, number | string>): DayRecord[] => Array.from({ length: n }, (_, i) => day(i, f));
const SRC = "Garmy/data";

describe("fromMeters", () => {
  it("rounds kilometers and miles to two decimals and yards to whole yards", () => {
    expect(fromMeters(10000, "km")).toBe(10);
    expect(fromMeters(1609.344, "mi")).toBe(1);
    expect(fromMeters(10000, "mi")).toBe(6.21);
    expect(fromMeters(1500, "yd")).toBe(1640);
    expect(fromMeters(0, "mi")).toBe(0);
  });
});

describe("mapActivities in imperial units", () => {
  const acts = [
    { activityType: { typeKey: "running" }, startTimeLocal: "2026-11-01 07:00:00", distance: 10000, duration: 3000 },
    { activityType: { typeKey: "trail_running" }, startTimeLocal: "2026-11-01 18:00:00", distance: 5000, duration: 1800 },
    { activityType: { typeKey: "road_biking" }, startTimeLocal: "2026-11-01 12:00:00", distance: 40000, duration: 5400 },
    { activityType: { typeKey: "lap_swimming" }, startTimeLocal: "2026-11-02 06:00:00", distance: 1500, duration: 2400 },
    { activityType: { typeKey: "strength_training" }, startTimeLocal: "2026-11-02 19:00:00", distance: 0, duration: 3600 },
    { activityType: { typeKey: "multi_sport" }, startTimeLocal: "2026-11-03 09:00:00", distance: 50000, duration: 9000 },
  ];
  it("writes miles for runs and rides, yards for swims, minutes unchanged, and sums the meters before converting", () => {
    const days: DayMap = new Map();
    mapActivities(acts, days, "imperial");
    expect(days.get("2026-11-01")).toEqual({ run_mi: 9.32, run_min: 80, bike_mi: 24.85, bike_min: 90 });
    expect(days.get("2026-11-02")).toEqual({ swim_yd: 1640, swim_min: 40, strength_min: 60 });
    expect(days.has("2026-11-03")).toBe(false);
  });
  it("writes the metric names by default, so nothing changes for existing users", () => {
    const days: DayMap = new Map();
    mapActivities(acts, days);
    expect(days.get("2026-11-01")).toEqual({ run_km: 15, run_min: 80, bike_km: 40, bike_min: 90 });
    expect(days.get("2026-11-02")).toEqual({ swim_km: 1.5, swim_min: 40, strength_min: 60 });
  });
});

describe("convertFields", () => {
  it("adds miles and yards from kilometers", () => {
    expect(convertFields({ run_km: 10, bike_km: 40, swim_km: 1.5, run_min: 50 }, "imperial")).toEqual({ run_mi: 6.21, bike_mi: 24.85, swim_yd: 1640 });
  });
  it("adds kilometers from miles and yards", () => {
    expect(convertFields({ run_mi: 6.21, swim_yd: 1640 }, "metric")).toEqual({ run_km: 9.99, swim_km: 1.5 });
  });
  it("never replaces a field that is already there, not even a zero", () => {
    expect(convertFields({ run_km: 10, run_mi: 7 }, "imperial")).toEqual({});
    expect(convertFields({ run_km: 10, run_mi: 0 }, "imperial")).toEqual({});
  });
  it("ignores values that are not numbers, and notes with no distance at all", () => {
    expect(convertFields({ run_km: "far", bike_km: null, swim_km: Number.NaN }, "imperial")).toEqual({});
    expect(convertFields({ steps: 9000 }, "imperial")).toEqual({});
    expect(convertFields({}, "metric")).toEqual({});
  });
  it("keeps a zero distance as a zero", () => {
    expect(convertFields({ swim_km: 0 }, "imperial")).toEqual({ swim_yd: 0 });
  });
  it("round-trips within the rounding of the notes", () => {
    const mi = convertFields({ run_km: 21.1 }, "imperial").run_mi ?? 0;
    expect(Math.abs((convertFields({ run_mi: mi }, "metric").run_km ?? 0) - 21.1)).toBeLessThan(0.02);
  });
});

describe("convertRecords", () => {
  it("returns new records with the extra fields and leaves the input alone", () => {
    const input = [day(0, { run_km: 10, steps: 5 })];
    const out = convertRecords(input, "imperial");
    expect(out[0]?.fields).toEqual({ run_km: 10, steps: 5, run_mi: 6.21 });
    expect(input[0]?.fields).toEqual({ run_km: 10, steps: 5 });
  });
});

describe("distanceFor", () => {
  it("prefers the chosen unit system", () => {
    const p = buildProfile(rows(3, { run_km: 5, run_mi: 3.1, run_min: 30 }));
    expect(distanceFor(p, "run", "imperial")?.field).toBe("run_mi");
    expect(distanceFor(p, "run", "metric")?.field).toBe("run_km");
  });
  it("falls back to the other system when the data only has that", () => {
    const p = buildProfile(rows(3, { run_km: 5, run_min: 30 }));
    expect(distanceFor(p, "run", "imperial")).toMatchObject({ field: "run_km", unit: "km" });
  });
  it("is null for strength, for unknown sports and when the distance is all zeros", () => {
    const p = buildProfile(rows(3, { run_km: 0, run_min: 30, strength_min: 40 }));
    expect(distanceFor(p, "strength", "imperial")).toBeNull();
    expect(distanceFor(p, "kayak", "imperial")).toBeNull();
    expect(distanceFor(p, "run", "imperial")).toBeNull();
  });
});

describe("compose in imperial units", () => {
  const full = { steps: 8000, resting_hr: 50, sleep_score: 80, run_mi: 3.1, run_min: 30, bike_mi: 20, bike_min: 60, swim_yd: 1000, swim_min: 30, strength_min: 40 };
  it("draws miles and yards on cards and goals, with the unit labels", () => {
    const md = compose(buildProfile(rows(40, full)), { source: SRC, units: "imperial" }).markdown;
    expect(md).toContain("field: run_mi,");
    expect(md).toContain("field: bike_mi,");
    expect(md).toContain("field: swim_yd,");
    expect(md).toMatch(/field: run_mi,[^\n]*unit: " mi"/);
    expect(md).toMatch(/field: swim_yd,[^\n]*precision: 0[^\n]*unit: " yd"/);
    expect(md).not.toContain("run_km");
    expect(md).not.toContain("swim_km");
  });
  it("labels every language's miles and yards", () => {
    for (const lang of ["en", "ru", "es", "de", "fr", "pt", "ja"] as const) {
      const md = compose(buildProfile(rows(40, full)), { source: SRC, units: "imperial", lang }).markdown;
      expect(md).toMatch(/unit: "? ?mi"?/);
      expect(md).toMatch(/unit: "? ?yd"?/);
    }
  });
  it("still draws kilometers by default", () => {
    const md = compose(buildProfile(rows(40, { ...full, run_km: 5, bike_km: 30, swim_km: 1 })), { source: SRC }).markdown;
    expect(md).toContain("field: run_km,");
    expect(md).not.toContain("field: run_mi,");
  });
  it("falls back to the kilometers a user's own notes hold and says kilometers", () => {
    const md = compose(buildProfile(rows(40, { steps: 8000, run_km: 5, run_min: 30 })), { source: SRC, units: "imperial" }).markdown;
    expect(md).toContain("field: run_km,");
    expect(md).toMatch(/field: run_km,[^\n]*unit: " km"/);
  });
  it("counts a sport that has only a distance and no minutes", () => {
    expect(activeSports(buildProfile(rows(5, { swim_yd: 800 })))).toEqual(["swim"]);
  });
});

describe("rebuild follows the current units", () => {
  const meta: RegionMeta = { v: 1, source: SRC, groups: ["recovery", "activity", "training"], noSports: [], lang: "en", races: null };
  const data = rows(40, { steps: 8000, sleep_score: 80, run_km: 5, run_mi: 3.11, run_min: 30 });
  const built = (): string => {
    const parts = splitComposed(compose(buildProfile(data), { source: SRC, units: "metric" }).markdown);
    return withMeta(`${parts.frontmatter}\n\n${parts.title}\n\n${wrapRegion(parts.body)}\n`, meta);
  };
  it("redraws in miles after the switch, and back", () => {
    const note = built();
    expect(note).toContain("field: run_km,");
    const toMiles = rebuildNote(note, data, () => false, "imperial");
    expect(toMiles.kind === "ok" && toMiles.text.includes("field: run_mi,")).toBe(true);
    expect(toMiles.kind === "ok" && toMiles.text.includes("field: run_km,")).toBe(false);
    if (toMiles.kind !== "ok") return;
    expect(readRegionMeta(toMiles.text)).toEqual(meta);
    const back = rebuildNote(toMiles.text, data, () => false, "metric");
    expect(back.kind === "ok" && back.text).toBe(note);
  });
});

describe("defaultUnits", () => {
  it("is miles for en-US only", () => {
    expect(defaultUnits("en-US")).toBe("imperial");
    expect(defaultUnits("en-us")).toBe("imperial");
    for (const l of ["en", "en-GB", "de-DE", "ru", "ja", "pt-BR", ""]) expect(defaultUnits(l)).toBe("metric");
  });
});
