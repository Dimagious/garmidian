// Distance units. Garmin reports meters; the notes hold kilometers, or miles (yards for swimming), as the user chose.
import { SPORTS, type DistanceDef, type Units } from "./catalog";
import type { DataProfile, DayRecord } from "./types";
import { did } from "./profile";

export const METERS_PER_MILE = 1609.344;
export const METERS_PER_YARD = 0.9144;

const round = (v: number, d: number): number => Number(v.toFixed(d));

/** Meters in the unit a note holds: kilometers and miles to two decimals, whole yards. */
export function fromMeters(meters: number, unit: DistanceDef["unit"]): number {
  if (unit === "km") return round(meters / 1000, 2);
  if (unit === "mi") return round(meters / METERS_PER_MILE, 2);
  return Math.round(meters / METERS_PER_YARD);
}

function toMeters(value: number, unit: DistanceDef["unit"]): number {
  return unit === "km" ? value * 1000 : unit === "mi" ? value * METERS_PER_MILE : value * METERS_PER_YARD;
}

/** Miles for the United States, kilometers everywhere else; the user can change it in the wizard and in settings. */
export function defaultUnits(locale: string): Units {
  return /^en-US$/i.test(locale) ? "imperial" : "metric";
}

const other = (u: Units): Units => (u === "metric" ? "imperial" : "metric");

/**
 * The distance fields a note is missing in `units`, worked out from the other unit system. Used when the user
 * switches units, so a year of notes needs no new request to Garmin. Fields already present are never replaced.
 */
export function convertFields(fields: Record<string, unknown>, units: Units): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sp of Object.values(SPORTS)) {
    if (!sp.dist) continue;
    const want = sp.dist[units];
    const have = sp.dist[other(units)];
    const present = fields[want.field];
    const source = fields[have.field];
    if ((present === undefined || present === null || present === "") && typeof source === "number" && Number.isFinite(source)) {
      out[want.field] = fromMeters(toMeters(source, have.unit), want.unit);
    }
  }
  return out;
}

/** The same for records held in memory. Returns new records; the input is left alone. */
export function convertRecords(records: DayRecord[], units: Units): DayRecord[] {
  return records.map((r) => ({ date: r.date, fields: { ...r.fields, ...convertFields(r.fields, units) } }));
}

/**
 * The distance field to draw for a sport: the one in the chosen unit system when the data has it, otherwise the
 * other one. Notes the user already had may hold kilometers while Garmy is set to miles; the card then says
 * kilometers instead of the sport vanishing.
 */
export function distanceFor(p: DataProfile, sport: string, units: Units): DistanceDef | null {
  const dist = SPORTS[sport]?.dist;
  if (!dist) return null;
  if (did(p, dist[units].field)) return dist[units];
  if (did(p, dist[other(units)].field)) return dist[other(units)];
  return null;
}
