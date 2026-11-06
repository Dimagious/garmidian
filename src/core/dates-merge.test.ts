import { describe, expect, it } from "vitest";
import { addDays, daysBetween, localDate } from "./dates";
import { changesFor, overwriteFrom } from "./merge";

describe("dates", () => {
  it("localDate follows the local calendar, not UTC", () => {
    // 00:30 local time is still the previous day in UTC for anyone east of Greenwich
    expect(localDate(new Date(2026, 10, 6, 0, 30).getTime())).toBe("2026-11-06");
    // 23:30 local time is already the next day in UTC for anyone west of it
    expect(localDate(new Date(2026, 10, 6, 23, 30).getTime())).toBe("2026-11-06");
  });
  it("pads month and day", () => { expect(localDate(new Date(2026, 0, 5, 12).getTime())).toBe("2026-01-05"); });
  it("addDays crosses months, years and leap days", () => {
    expect(addDays("2026-11-06", -6)).toBe("2026-10-31");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // across a daylight saving change in Europe
  });
  it("daysBetween counts calendar days", () => {
    expect(daysBetween("2026-10-31", "2026-11-06")).toBe(6);
    expect(daysBetween("2026-11-06", "2026-11-06")).toBe(0);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("merge", () => {
  it("fills missing and empty fields, keeps the rest, when not overwriting", () => {
    expect(changesFor({ steps: 100, hrv: "" }, { steps: 900, hrv: 50, sleep_score: 80 }, false)).toEqual({ hrv: 50, sleep_score: 80 });
  });
  it("refreshes changed fields when overwriting, and skips equal ones", () => {
    expect(changesFor({ steps: 100, hrv: 50 }, { steps: 900, hrv: 50 }, true)).toEqual({ steps: 900 });
  });
  it("leaves fields Garmin does not return untouched", () => {
    expect(changesFor({ steps: 100, note: "mine" }, { steps: 100 }, true)).toEqual({});
  });
  it("treats zero as a value, not as empty", () => {
    expect(changesFor({ steps: 0 }, { steps: 500 }, false)).toEqual({});
    expect(changesFor({ steps: 0 }, { steps: 500 }, true)).toEqual({ steps: 500 });
  });
  it("overwrites today and the two days before it", () => {
    expect(overwriteFrom("2026-11-06")).toBe("2026-11-04");
    expect(overwriteFrom("2026-03-01")).toBe("2026-02-27");
  });
});
