import { describe, expect, it } from "vitest";
import { compose, niceUp } from "./compose";
import { formatDuration, mapActivities, mapDailySummaries, mapHrv, mapSleep, type DayMap } from "./mapping";
import { buildProfile } from "./profile";
import type { DayRecord } from "./types";

const day = (i: number, fields: Record<string, number | string>): DayRecord => ({ date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), fields });
const rows = (n: number, f: (i: number) => Record<string, number | string>): DayRecord[] => Array.from({ length: n }, (_, i) => day(i, f(i)));
const SRC = "Garmy/data";

describe("mapping", () => {
  it("maps daily summaries, skips unmeasured stress and does not invent a distance", () => {
    const days: DayMap = new Map();
    mapDailySummaries({ data: [
      { calendarDate: "2026-11-01", movement: { steps: { value: 9000, distanceInMeters: 7123 } }, heartRate: { restingValue: 48 }, stress: { avgLevel: 27 }, bodyBattery: { maxValue: 94, minValue: 35 } },
      { calendarDate: "2026-11-02", movement: { steps: { value: 0, distanceInMeters: 0 } }, stress: { avgLevel: -1 } },
    ] }, days);
    expect(days.get("2026-11-01")).toEqual({ steps: 9000, resting_hr: 48, stress: 27, body_battery: 94 });
    expect(days.get("2026-11-02")).toEqual({ steps: 0 });
  });
  it("maps sleep score and duration text", () => {
    const days: DayMap = new Map();
    mapSleep([{ calendarDate: "2026-11-01", sleepTimeSeconds: 27780, sleepScores: { overall: { value: 94 } } }, { calendarDate: "2026-11-02", sleepTimeSeconds: 0 }], days);
    expect(days.get("2026-11-01")).toEqual({ sleep_score: 94, sleep_duration: "7h 43min" });
    expect(days.has("2026-11-02")).toBe(false);
  });
  it("maps hrv last night average", () => {
    const days: DayMap = new Map();
    mapHrv({ hrvSummaries: [{ calendarDate: "2026-11-01", lastNightAvg: 44 }, { calendarDate: "2026-11-02" }] }, days);
    expect(days.get("2026-11-01")).toEqual({ hrv: 44 });
    expect(days.has("2026-11-02")).toBe(false);
  });
  it("sums activities per day by sport and ignores multisport and unknown types", () => {
    const days: DayMap = new Map();
    mapActivities([
      { activityType: { typeKey: "running" }, startTimeLocal: "2026-11-01 07:00:00", distance: 10000, duration: 3000 },
      { activityType: { typeKey: "trail_running" }, startTimeLocal: "2026-11-01 18:00:00", distance: 5000, duration: 1800 },
      { activityType: { typeKey: "strength_training" }, startTimeLocal: "2026-11-01 19:00:00", distance: 0, duration: 3600 },
      { activityType: { typeKey: "multi_sport" }, startTimeLocal: "2026-11-02 09:00:00", distance: 50000, duration: 9000 },
      { activityType: { typeKey: "yoga" }, startTimeLocal: "2026-11-02 09:00:00", distance: 0, duration: 600 },
    ], days);
    expect(days.get("2026-11-01")).toEqual({ run_km: 15, run_min: 80, strength_min: 60 });
    expect(days.has("2026-11-02")).toBe(false);
  });
  it("formats durations", () => { expect(formatDuration(3600)).toBe("1h 0min"); expect(formatDuration(0)).toBe("0h 0min"); });
});

describe("profile", () => {
  it("counts days, span and non-zero values", () => {
    const p = buildProfile([day(0, { steps: 100, swim_km: 0 }), day(9, { steps: 200 })]);
    expect(p.days).toBe(2); expect(p.span).toBe(10);
    expect(p.count.swim_km).toBe(1); expect(p.nonzero.swim_km).toBeUndefined();
    expect(p.sumLast("steps", 2)).toBe(200);
  });
  it("handles no data", () => { const p = buildProfile([]); expect(p.span).toBe(0); expect(p.first).toBeNull(); });
});

describe("compose", () => {
  const full = (i: number): Record<string, number | string> => ({ steps: 8000, resting_hr: 50, stress: 25, distance_km: 6, sleep_score: 80, sleep_duration: "7h 0min", hrv: 50, run_km: 5, run_min: 30 });

  it("3 days: only latest cards, a waiting note, no charts", () => {
    const r = compose(buildProfile(rows(3, full)), { source: SRC });
    expect(r.log.blocks).toEqual(["recovery.now", "activity.cards", "training.cards"]);
    expect(r.markdown).toContain("неделя данных");
    expect(r.markdown).not.toContain("dashy-chart");
  });
  it("Body Battery appears in the cards and the score chart only when the data has it", () => {
    const with_ = compose(buildProfile(rows(40, (i) => ({ ...full(i), body_battery: 80 }))), { source: SRC }).markdown;
    expect(with_).toContain("field: body_battery, agg: latest");
    expect(with_).toMatch(/field: body_battery, label: Body Battery/);
    expect(compose(buildProfile(rows(40, full)), { source: SRC }).markdown).not.toContain("body_battery");
  });
  it("never writes a block for a missing field or unused sport", () => {
    const r = compose(buildProfile(rows(40, full)), { source: SRC });
    expect(r.markdown).not.toContain("training_readiness");
    expect(r.markdown).not.toContain("swim");
    expect(r.markdown).not.toContain("bike");
  });
  it("a sport with only zeros is not used", () => {
    const r = compose(buildProfile(rows(40, (i) => ({ ...full(i), swim_km: 0, swim_min: 0 }))), { source: SRC });
    expect(r.markdown).not.toContain("swim");
  });
  it("goals come from the last 28 days, 10 percent up", () => {
    const r = compose(buildProfile(rows(40, full)), { source: SRC });
    expect(r.markdown).toMatch(/field: run_km, agg: sum, goal: 200/);
  });
  it("year maps need history", () => {
    expect(compose(buildProfile(rows(29, full)), { source: SRC }).log.blocks).not.toContain("activity.heatmap.year");
    expect(compose(buildProfile(rows(30, full)), { source: SRC }).log.blocks).toContain("activity.heatmap.year");
    expect(compose(buildProfile(rows(60, full)), { source: SRC }).log.blocks).toContain("training.heatmap.year");
  });
  it("race block only with a folder", () => {
    expect(compose(buildProfile(rows(10, full)), { source: SRC }).log.blocks).not.toContain("races.countdown");
    expect(compose(buildProfile(rows(10, full)), { source: SRC, races: "Races" }).markdown).toContain("source: Races");
  });
  it("english labels", () => {
    const r = compose(buildProfile(rows(10, full)), { source: SRC, lang: "en" });
    expect(r.markdown).toContain("Resting HR");
    expect(r.markdown).not.toContain("Пульс");
  });
  it("respects groups", () => {
    const r = compose(buildProfile(rows(40, full)), { source: SRC, groups: ["activity"] });
    expect(r.log.blocks.every((b) => b.startsWith("activity"))).toBe(true);
  });
  it("month note uses the note period", () => {
    const r = compose(buildProfile(rows(40, full)), { source: SRC, mode: "month" });
    expect(r.markdown).toContain("period: note");
  });
  it("empty data gives a note without blocks, not a crash", () => {
    const r = compose(buildProfile([]), { source: SRC });
    expect(r.log.blocks).toEqual([]);
  });
  it("uses no em dash", () => { expect(compose(buildProfile(rows(40, full)), { source: SRC }).markdown).not.toContain("—"); });
  it("niceUp rounds goals to friendly numbers", () => {
    expect([niceUp(0), niceUp(110), niceUp(231), niceUp(2.2), niceUp(0.9)]).toEqual([0, 200, 250, 2.5, 1]);
  });
});
