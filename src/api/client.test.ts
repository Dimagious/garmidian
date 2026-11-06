import { describe, expect, it } from "vitest";
import { chunkRange, GarminClient, GarminError, type Http, type HttpRequest } from "./client";

const ok = (body: unknown): { status: number; text: string } => ({ status: 200, text: JSON.stringify(body) });
const noSleep = (): Promise<void> => Promise.resolve();

function fake(handler: (req: HttpRequest, n: number) => { status: number; text: string }): { http: Http; calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return { calls, http: (req) => { calls.push(req); return Promise.resolve(handler(req, calls.length)); } };
}
const base = (req: HttpRequest): { status: number; text: string } | null => (req.url.includes("personal-api-key/token") ? { status: 200, text: "jwt.value" } : null);

describe("chunkRange", () => {
  it("splits into inclusive chunks", () => {
    expect(chunkRange("2026-01-01", "2026-02-15", 31)).toEqual([["2026-01-01", "2026-01-31"], ["2026-02-01", "2026-02-15"]]);
    expect(chunkRange("2026-01-01", "2026-01-01", 31)).toEqual([["2026-01-01", "2026-01-01"]]);
  });
});

describe("GarminClient", () => {
  it("sends the key only to the token service", async () => {
    const f = fake((r) => base(r) ?? ok([]));
    const c = new GarminClient(f.http, "SECRET", Date.now, noSleep);
    await c.getJson("/x");
    expect(f.calls[0]?.headers.Authorization).toBe("ApiKey SECRET");
    expect(f.calls[1]?.headers.Authorization).toBe("Bearer jwt.value");
    expect(JSON.stringify(f.calls.slice(1))).not.toContain("SECRET");
  });
  it("accepts a JSON token object and reuses the token", async () => {
    const f = fake((r) => (r.url.includes("personal-api-key") ? { status: 200, text: '{"access_token":"abc"}' } : ok({})));
    const c = new GarminClient(f.http, "k", Date.now, noSleep);
    await c.getJson("/a"); await c.getJson("/b");
    expect(f.calls.filter((r) => r.url.includes("personal-api-key")).length).toBe(1);
    expect(f.calls[1]?.headers.Authorization).toBe("Bearer abc");
  });
  it("requests a new token after 23 hours", async () => {
    let t = 0;
    const f = fake((r) => base(r) ?? ok({}));
    const c = new GarminClient(f.http, "k", () => t, noSleep);
    await c.getJson("/a"); t = 24 * 3600e3; await c.getJson("/b");
    expect(f.calls.filter((r) => r.url.includes("personal-api-key")).length).toBe(2);
  });
  it("reports a rejected key as auth error without leaking it", async () => {
    const f = fake(() => ({ status: 401, text: "" }));
    const err = await new GarminClient(f.http, "SECRET", Date.now, noSleep).verify().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GarminError);
    expect((err as GarminError).kind).toBe("auth");
    expect((err as GarminError).message).not.toContain("SECRET");
  });
  it("refreshes the token once on 401, then gives up", async () => {
    let n = 0;
    const f = fake((r) => base(r) ?? (n++ === 0 ? { status: 401, text: "" } : ok({ a: 1 })));
    expect(await new GarminClient(f.http, "k", Date.now, noSleep).getJson("/x")).toEqual({ a: 1 });
    const f2 = fake((r) => base(r) ?? { status: 401, text: "" });
    await expect(new GarminClient(f2.http, "k", Date.now, noSleep).getJson("/x")).rejects.toMatchObject({ kind: "auth" });
  });
  it("waits and retries once on 429", async () => {
    let n = 0, slept = 0;
    const f = fake((r) => base(r) ?? (n++ === 0 ? { status: 429, text: "" } : ok({ a: 1 })));
    const c = new GarminClient(f.http, "k", Date.now, (t) => { slept += t; return Promise.resolve(); });
    expect(await c.getJson("/x")).toEqual({ a: 1 });
    expect(slept).toBe(5000);
  });
  it("network failure becomes a network error", async () => {
    const c = new GarminClient(() => Promise.reject(new Error("offline")), "k", Date.now, noSleep);
    await expect(c.verify()).rejects.toMatchObject({ kind: "network" });
  });

  describe("backfill", () => {
    const route = (r: HttpRequest): { status: number; text: string } => {
      if (r.url.includes("dailysummaries")) return ok({ data: [{ calendarDate: "2026-11-01", movement: { steps: { value: 100, distanceInMeters: 1000 } } }] });
      if (r.url.includes("dailySleepSummariesByDate")) return ok([{ calendarDate: "2026-11-01", sleepTimeSeconds: 3600, sleepScores: { overall: { value: 90 } } }]);
      if (r.url.includes("hrv/daily")) return ok({ hrvSummaries: [{ calendarDate: "2026-11-01", lastNightAvg: 50 }] });
      if (r.url.includes("activities/search")) return ok([]);
      return { status: 404, text: "" };
    };
    it("merges all parts into one record per day and reports progress", async () => {
      const f = fake((r) => base(r) ?? route(r));
      const seen: string[] = [];
      const res = await new GarminClient(f.http, "k", Date.now, noSleep).backfill("2026-10-20", "2026-11-05", (p) => seen.push(p.step));
      expect(res.records).toEqual([{ date: "2026-11-01", fields: { steps: 100, sleep_score: 90, sleep_duration: "1h 0min", hrv: 50 } }]);
      expect(res.warnings).toEqual([]);
      expect(new Set(seen)).toEqual(new Set(["daily", "sleep", "hrv", "activities"]));
    });
    it("a year of sleep is 12 requests of at most 31 days", async () => {
      const f = fake((r) => base(r) ?? route(r));
      await new GarminClient(f.http, "k", Date.now, noSleep).backfill("2025-11-06", "2026-11-05");
      expect(f.calls.filter((r) => r.url.includes("dailySleepSummariesByDate")).length).toBe(12);
      expect(f.calls.filter((r) => r.url.includes("dailysummaries")).length).toBe(1);
    });
    it("pages through activities", async () => {
      const page = Array.from({ length: 200 }, () => ({ activityType: { typeKey: "running" }, startTimeLocal: "2026-11-01 07:00:00", distance: 1000, duration: 600 }));
      const f = fake((r) => base(r) ?? (r.url.includes("activities/search") ? (r.url.includes("start=0") ? ok(page) : ok([])) : route(r)));
      const res = await new GarminClient(f.http, "k", Date.now, noSleep).backfill("2026-10-20", "2026-11-05");
      expect(f.calls.filter((r) => r.url.includes("activities/search")).length).toBe(2);
      expect(res.records[0]?.fields.run_km).toBe(200);
    });
    it("a day split across two activity pages is summed, not overwritten", async () => {
      const run = (min: number): unknown => ({ activityType: { typeKey: "running" }, startTimeLocal: "2026-11-01 07:00:00", distance: 1000, duration: min * 60 });
      const page = [...Array.from({ length: 199 }, () => ({ activityType: { typeKey: "yoga" }, startTimeLocal: "2026-10-30 07:00:00", distance: 0, duration: 60 })), run(30)];
      const f = fake((r) => base(r) ?? (r.url.includes("activities/search") ? (r.url.includes("start=0") ? ok(page) : ok([run(15)])) : route(r)));
      const res = await new GarminClient(f.http, "k", Date.now, noSleep).backfill("2026-10-20", "2026-11-05");
      expect(res.records.find((r) => r.date === "2026-11-01")?.fields.run_min).toBe(45);
    });
    it("a failing optional part becomes a warning, the rest survives", async () => {
      const f = fake((r) => base(r) ?? (r.url.includes("hrv") ? { status: 500, text: "" } : route(r)));
      const res = await new GarminClient(f.http, "k", Date.now, noSleep).backfill("2026-10-20", "2026-11-05");
      expect(res.warnings.length).toBe(1);
      expect(res.records[0]?.fields.steps).toBe(100);
    });
    it("a dead key stops the backfill", async () => {
      const f = fake((r) => base(r) ?? { status: 403, text: "" });
      await expect(new GarminClient(f.http, "k", Date.now, noSleep).backfill("2026-10-20", "2026-11-05")).rejects.toMatchObject({ kind: "auth" });
    });
  });
});
