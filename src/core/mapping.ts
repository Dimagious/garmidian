// Personal API responses -> frontmatter fields. Pure functions, no network.
import type { DayRecord } from "./types";

type Json = unknown;
const rec = (v: Json): Record<string, Json> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json>) : null);
const arr = (v: Json): Json[] => (Array.isArray(v) ? v : []);
const num = (v: Json): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: Json): string | null => (typeof v === "string" ? v : null);
const round = (v: number, d: number): number => Number(v.toFixed(d));

export type DayMap = Map<string, Record<string, number | string>>;

function slot(days: DayMap, date: string): Record<string, number | string> {
  let d = days.get(date);
  if (!d) { d = {}; days.set(date, d); }
  return d;
}

/**
 * /usersummary-service/v2/dailysummaries -> steps, resting_hr, stress, body_battery (the day's highest value).
 * Distance is deliberately not read: the range endpoints only report walking distance, while the
 * full daily distance exists only in the per-day endpoint (one request per day).
 */
export function mapDailySummaries(json: Json, days: DayMap): void {
  for (const item of arr(rec(json)?.data)) {
    const r = rec(item);
    const date = str(r?.calendarDate);
    if (!r || !date) continue;
    const out = slot(days, date);
    const steps = rec(rec(r.movement)?.steps);
    const stepsVal = num(steps?.value);
    if (stepsVal !== null) out.steps = stepsVal;
    const rhr = num(rec(r.heartRate)?.restingValue);
    if (rhr !== null) out.resting_hr = rhr;
    const stress = num(rec(r.stress)?.avgLevel);
    if (stress !== null && stress >= 0) out.stress = stress; // -1 means "not measured"
    const battery = num(rec(r.bodyBattery)?.maxValue);
    if (battery !== null) out.body_battery = battery;
  }
}

/** "7h 43min", same text Garmin Health Sync writes, so existing templates read it */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds / 60);
  return `${Math.floor(total / 60)}h ${total % 60}min`;
}

/** /sleep-service/sleep/dailySleepSummariesByDate -> sleep_score, sleep_duration */
export function mapSleep(json: Json, days: DayMap): void {
  for (const item of arr(json)) {
    const r = rec(item);
    const date = str(r?.calendarDate);
    if (!r || !date) continue;
    const score = num(rec(rec(r.sleepScores)?.overall)?.value);
    const secs = num(r.sleepTimeSeconds);
    if (score === null && !secs) continue;
    const out = slot(days, date);
    if (score !== null) out.sleep_score = score;
    if (secs) out.sleep_duration = formatDuration(secs);
  }
}

/** /hrv-service/hrv/daily/{from}/{to} -> hrv (last night average) */
export function mapHrv(json: Json, days: DayMap): void {
  for (const item of arr(rec(json)?.hrvSummaries)) {
    const r = rec(item);
    const date = str(r?.calendarDate);
    const v = num(r?.lastNightAvg);
    if (date && v !== null) slot(days, date).hrv = v;
  }
}

const SPORT_OF: Record<string, string> = {
  running: "run", trail_running: "run", treadmill_running: "run", track_running: "run", virtual_run: "run", street_running: "run",
  cycling: "bike", road_biking: "bike", indoor_cycling: "bike", mountain_biking: "bike", gravel_cycling: "bike", virtual_ride: "bike", e_bike_fitness: "bike",
  lap_swimming: "swim", open_water_swimming: "swim",
  strength_training: "strength",
};

/** activities/search -> run_km, run_min, bike_km, ... summed per local day. Multi-sport is not split. */
export function mapActivities(json: Json, days: DayMap): void {
  const totals = new Map<string, Record<string, number>>();
  for (const item of arr(json)) {
    const r = rec(item);
    const key = str(rec(r?.activityType)?.typeKey);
    const start = str(r?.startTimeLocal);
    const sport = key ? SPORT_OF[key] : undefined;
    if (!r || !start || !sport) continue;
    const date = start.slice(0, 10);
    const t = totals.get(date) ?? {};
    const meters = num(r.distance) ?? 0;
    const secs = num(r.duration) ?? 0;
    if (sport !== "strength") t[`${sport}_km`] = (t[`${sport}_km`] ?? 0) + meters / 1000;
    t[`${sport}_min`] = (t[`${sport}_min`] ?? 0) + secs / 60;
    totals.set(date, t);
  }
  for (const [date, t] of totals) {
    const out = slot(days, date);
    for (const [k, v] of Object.entries(t)) out[k] = k.endsWith("_km") ? round(v, 2) : Math.round(v);
  }
}

export function toRecords(days: DayMap): DayRecord[] {
  return [...days.entries()].map(([date, fields]) => ({ date, fields })).sort((a, b) => a.date.localeCompare(b.date));
}
