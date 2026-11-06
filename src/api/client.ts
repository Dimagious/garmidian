// Garmin Personal API client. Transport is injected: Obsidian's requestUrl in the plugin, a fake in tests.
import { mapActivities, mapDailySummaries, mapHrv, mapSleep, toRecords, type DayMap } from "../core/mapping";
import type { DayRecord } from "../core/types";

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_URL = BASE + "/personalapitoken-service/personal-api/personal-api-key/token";
const DAY_MS = 864e5;

export interface HttpRequest { url: string; method: "GET" | "POST"; headers: Record<string, string> }
export interface HttpResponse { status: number; text: string }
export type Http = (req: HttpRequest) => Promise<HttpResponse>;

export type GarminErrorKind = "auth" | "rate" | "network" | "http" | "parse" | "cancelled";
export class GarminError extends Error {
  constructor(public readonly kind: GarminErrorKind, message: string, public readonly status?: number) {
    super(message);
    this.name = "GarminError";
  }
}

/** Starts a timer; the promise rejects when it fires, `cancel` stops it. */
export type Scheduler = (ms: number) => { expired: Promise<never>; cancel: () => void };
/** Set `cancelled` to stop a running backfill before its next request. */
export interface CancelToken { cancelled: boolean }
export const REQUEST_TIMEOUT_MS = 30_000;

export interface Progress { step: "daily" | "sleep" | "hrv" | "activities"; done: number; total: number }
export interface BackfillResult { records: DayRecord[]; warnings: string[]; requests: number }

export const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const ms = (date: string): number => Date.parse(date + "T00:00:00Z");

/** Split [from, to] into inclusive ranges of at most `size` days. */
export function chunkRange(from: string, to: string, size: number): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let s = ms(from); s <= ms(to); s += size * DAY_MS) out.push([iso(s), iso(Math.min(s + (size - 1) * DAY_MS, ms(to)))]);
  return out;
}

export class GarminClient {
  private token: string | null = null;
  private tokenAt = 0;
  requests = 0;

  constructor(
    private readonly http: Http,
    private readonly apiKey: string,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (t) => new Promise((r) => window.setTimeout(r, t)),
    private readonly schedule?: Scheduler,
  ) {}

  private cancel: CancelToken | null = null;

  private async send(req: HttpRequest): Promise<HttpResponse> {
    if (this.cancel?.cancelled) throw new GarminError("cancelled", "Cancelled");
    this.requests++;
    const timer = this.schedule?.(REQUEST_TIMEOUT_MS);
    try {
      return await (timer ? Promise.race([this.http(req), timer.expired]) : this.http(req));
    } catch (e) {
      if (e instanceof GarminError) throw e;
      throw new GarminError("network", `No connection to Garmin: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      timer?.cancel();
    }
  }

  /** The token lives 24 hours and cannot be refreshed, so a new one is requested after 23. */
  async getToken(force = false): Promise<string> {
    if (!force && this.token && this.now() - this.tokenAt < 23 * 3600e3) return this.token;
    const res = await this.send({ url: TOKEN_URL, method: "POST", headers: { Authorization: `ApiKey ${this.apiKey}` } });
    if (res.status === 401 || res.status === 403) throw new GarminError("auth", "Garmin rejected the key. It may be wrong or expired.", res.status);
    if (res.status === 429) throw new GarminError("rate", "Garmin is rate limiting requests.", res.status);
    if (res.status !== 200) throw new GarminError("http", `Token service answered HTTP ${res.status}`, res.status);
    const raw = res.text.trim();
    let token = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "string") token = parsed;
      else if (parsed && typeof parsed === "object") {
        const o = parsed as Record<string, unknown>;
        const v = o.access_token ?? o.accessToken ?? o.token;
        if (typeof v === "string") token = v;
      }
    } catch { /* the token comes as a bare JWT string */ }
    if (!token) throw new GarminError("parse", "Garmin returned an empty token");
    this.token = token;
    this.tokenAt = this.now();
    return token;
  }

  async verify(): Promise<void> { await this.getToken(true); }

  async getJson(path: string, retried = false): Promise<unknown> {
    const token = await this.getToken();
    const res = await this.send({ url: BASE + path, method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 401 && !retried) { await this.getToken(true); return this.getJson(path, true); }
    if (res.status === 429 && !retried) { await this.sleep(5000); return this.getJson(path, true); }
    if (res.status === 401 || res.status === 403) throw new GarminError("auth", "Garmin rejected the token.", res.status);
    if (res.status === 429) throw new GarminError("rate", "Garmin is rate limiting requests.", res.status);
    if (res.status !== 200) throw new GarminError("http", `HTTP ${res.status} on ${path.split("?")[0]}`, res.status);
    try { return JSON.parse(res.text); } catch { throw new GarminError("parse", `Not JSON from ${path.split("?")[0]}`); }
  }

  /**
   * Everything the dashboards need for [from, to]: one call per year for daily summaries and HRV,
   * one per 31 days for sleep, one per 200 activities. A failed optional part becomes a warning.
   */
  async backfill(from: string, to: string, onProgress: (p: Progress) => void = () => undefined, cancel?: CancelToken): Promise<BackfillResult> {
    this.cancel = cancel ?? null;
    const days: DayMap = new Map();
    const warnings: string[] = [];
    let succeeded = 0;
    const outage: { first: GarminError | null } = { first: null };
    const failed = (e: unknown, label: string): void => {
      if (e instanceof GarminError && (e.kind === "auth" || e.kind === "cancelled")) throw e; // a dead key or a cancel stops everything
      if (!outage.first && e instanceof GarminError) outage.first = e;
      warnings.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    };
    const part = async (step: Progress["step"], ranges: Array<[string, string]>, run: (a: string, b: string) => Promise<void>): Promise<void> => {
      let done = 0;
      onProgress({ step, done, total: ranges.length });
      for (const [a, b] of ranges) {
        try { await run(a, b); succeeded++; } catch (e) { failed(e, `${step} ${a}..${b}`); }
        onProgress({ step, done: ++done, total: ranges.length });
      }
    };
    await part("daily", chunkRange(from, to, 365), async (a, b) => mapDailySummaries(await this.getJson(`/usersummary-service/v2/dailysummaries?startDate=${a}&endDate=${b}`), days));
    await part("sleep", chunkRange(from, to, 31), async (a, b) => mapSleep(await this.getJson(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${a}&endDate=${b}`), days));
    await part("hrv", chunkRange(from, to, 365), async (a, b) => mapHrv(await this.getJson(`/hrv-service/hrv/daily/${a}/${b}`), days));
    onProgress({ step: "activities", done: 0, total: 1 });
    let start = 0;
    const activities: unknown[] = []; // mapped once at the end: a day can span two pages
    for (let page = 0; page < 50; page++) {
      let batch: unknown;
      try {
        batch = await this.getJson(`/activitylist-service/activities/search/activities?start=${start}&limit=200&startDate=${from}&endDate=${to}`);
        succeeded++;
      } catch (e) {
        failed(e, `activities page ${page}`);
        break;
      }
      const n = Array.isArray(batch) ? batch.length : 0;
      if (Array.isArray(batch)) for (const a of batch as unknown[]) activities.push(a);
      onProgress({ step: "activities", done: page + 1, total: n === 200 ? page + 2 : page + 1 });
      if (n < 200) break;
      start += 200;
    }
    // Nothing came back at all: that is an outage, not an empty account, and the user must hear it as one.
    if (succeeded === 0 && outage.first) throw outage.first;
    mapActivities(activities, days);
    return { records: toRecords(days), warnings, requests: this.requests };
  }
}
