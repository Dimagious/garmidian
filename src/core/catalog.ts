// What Garmy knows about: health metrics and sports, with labels per language.
// Fields are the names written to the note frontmatter (same as Garmin Health Sync / garmin-repair).

export interface MetricDef { icon: string; color: string; better: "up" | "down"; group: "recovery" | "activity"; unit: "" | "ms" | "bpm" | "km" }
export type Units = "metric" | "imperial";
export type DistanceUnit = "km" | "mi" | "yd";
/** The note property a sport's distance is written to in one unit system, how it is labelled and how many decimals a card shows. */
export interface DistanceDef { field: string; unit: DistanceUnit; precision: number }
export interface SportDef { icon: string; color: string; dist: Record<Units, DistanceDef> | null; min: string }
export type { Lang } from "../i18n/types";

export const METRICS: Record<string, MetricDef> = {
  sleep_score:        { icon: "💤", color: "purple", better: "up",   group: "recovery", unit: "" },
  sleep_duration:     { icon: "🛏", color: "blue",   better: "up",   group: "recovery", unit: "" },
  hrv:                { icon: "💓", color: "green",  better: "up",   group: "recovery", unit: "ms" },
  resting_hr:         { icon: "❤️", color: "red",    better: "down", group: "recovery", unit: "bpm" },
  body_battery:       { icon: "⚡", color: "cyan",   better: "up",   group: "recovery", unit: "" },
  training_readiness: { icon: "🔋", color: "blue",   better: "up",   group: "recovery", unit: "" },
  stress:             { icon: "😰", color: "orange", better: "down", group: "recovery", unit: "" },
  steps:              { icon: "🚶", color: "blue",   better: "up",   group: "activity", unit: "" },
  distance_km:        { icon: "📏", color: "cyan",   better: "up",   group: "activity", unit: "km" },
};

export const SPORTS: Record<string, SportDef> = {
  run:      { icon: "🏃", color: "green",  dist: { metric: { field: "run_km", unit: "km", precision: 1 },  imperial: { field: "run_mi", unit: "mi", precision: 1 } },  min: "run_min" },
  bike:     { icon: "🚴", color: "blue",   dist: { metric: { field: "bike_km", unit: "km", precision: 0 }, imperial: { field: "bike_mi", unit: "mi", precision: 0 } }, min: "bike_min" },
  // A pool is measured in yards where miles are the road unit, and a mile of swimming is not a number anyone uses.
  swim:     { icon: "🏊", color: "cyan",   dist: { metric: { field: "swim_km", unit: "km", precision: 1 }, imperial: { field: "swim_yd", unit: "yd", precision: 0 } }, min: "swim_min" },
  strength: { icon: "🏋️", color: "orange", dist: null, min: "strength_min" },
};
