// What Garmy knows about: health metrics and sports, with labels per language.
// Fields are the names written to the note frontmatter (same as Garmin Health Sync / garmin-repair).

export interface MetricDef { icon: string; color: string; better: "up" | "down"; group: "recovery" | "activity"; unit: "" | "ms" | "bpm" | "km" }
export interface SportDef { icon: string; color: string; km: string | null; min: string; precision: number }
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
  run:      { icon: "🏃", color: "green",  km: "run_km",  min: "run_min",  precision: 1 },
  bike:     { icon: "🚴", color: "blue",   km: "bike_km", min: "bike_min", precision: 0 },
  swim:     { icon: "🏊", color: "cyan",   km: "swim_km", min: "swim_min", precision: 1 },
  strength: { icon: "🏋️", color: "orange", km: null,      min: "strength_min", precision: 0 },
};
