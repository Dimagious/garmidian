// What every dashboard template is built from: the data profile, the user's choices, the words in their language
// and the few helpers that write a heading, a block or a note about a block that was left out.
import { METRICS, SPORTS, type Lang, type Units } from "./catalog";
import { T, UNITS } from "../i18n";
import { isRaceDate, niceUp, rangeFor, series, type Row } from "./blocks";
import { USUAL_GOAL_MIN_DAYS } from "./dashy";
import { did, has } from "./profile";
import type { DataProfile } from "./types";
import { distanceFor } from "./units";

export type Mode = "dashboard" | "month";
export interface ComposeOptions {
  source: string;
  lang?: Lang;
  groups?: string[];
  /** sport ids chosen by the user; only those with real data are used */
  sports?: string[];
  /** a folder of race notes, or one date (YYYY-MM-DD) */
  races?: string | null;
  /** Kept for callers that ask for the monthly review by name; `template: "month"` is the same thing. */
  mode?: Mode;
  /** Kilometers or miles for sport distances. Default metric. */
  units?: Units;
  /** Which dashboard to build: "overview" (the default), "sport:run", "week" and so on. See templates.ts. */
  template?: string;
  /** The installed Dashy knows `goal: usual`, so a month goal can follow the user's own past months. */
  goalUsual?: boolean;
}
export interface ComposeResult {
  markdown: string;
  log: { blocks: string[]; skipped: string[] };
}

export function activeSports(p: DataProfile, chosen?: string[]): string[] {
  return (chosen ?? Object.keys(SPORTS)).filter((s) => {
    const sp = SPORTS[s];
    return sp !== undefined && (did(p, sp.min) || distanceFor(p, s, "metric") !== null || distanceFor(p, s, "imperial") !== null);
  });
}

export interface Ctx {
  p: DataProfile;
  o: ComposeOptions;
  lang: Lang;
  units: Units;
  t: Record<string, string>;
  u: Record<string, string>;
  /** the folder the blocks read */
  src: string;
  /** sports that are chosen and really in the data */
  sports: string[];
  /** the longest standard chart window the data covers, or null under a week */
  R: number | null;
  /** enough history for "compare: usual" to mean something */
  usual: boolean;
  out: string[];
  blocks: string[];
  skipped: string[];
  lbl: (f: string) => string;
  unit: (f: string) => string;
  /** the fields among `fields` that the data has */
  avail: (fields: string[]) => string[];
  add: (name: string, md: string) => void;
  skip: (name: string, why: string) => void;
  head: (title: string | undefined, level?: number) => void;
  colorOf: (f: string) => string;
  /** a stats card for one sport: its distance when it has one, otherwise its minutes */
  sportCard: (s: string) => Row;
  /** a heatmap `layers:` list, one layer per sport's minutes */
  layers: (list?: string[]) => string;
  /** the window of a training chart: weekly bars once a month of data exists, daily before that */
  trainingWindow: () => string[];
  /** a month goal: `usual` where Dashy knows it and the history is long enough, else the last 28 days plus a tenth, rounded up */
  monthGoal: (last28: number) => number | string;
  /** the countdown card for a race date or the next race note in a folder */
  raceCard: () => Row | null;
  /** frontmatter, the title and the line naming Garmin as the source */
  open: (title: string) => void;
  /** the finished result; the closing line is left out where a template says so */
  finish: (footer?: boolean) => ComposeResult;
}

/** The pieces a template writes with. */
export function makeCtx(p: DataProfile, o: ComposeOptions): Ctx {
  const lang: Lang = o.lang ?? "en";
  const units: Units = o.units ?? "metric";
  const t = T[lang];
  const u = UNITS[lang];
  const sports = activeSports(p, o.sports);
  const R = rangeFor(p.span);
  const out: string[] = [];
  const blocks: string[] = [];
  const skipped: string[] = [];

  const lbl = (f: string): string => t[f] ?? f;
  const c: Ctx = {
    p, o, lang, units, t, u, src: o.source, sports, R, usual: p.span >= 14, out, blocks, skipped,
    lbl,
    unit: (f) => {
      const k = METRICS[f]?.unit;
      return k ? u[k] ?? "" : "";
    },
    avail: (fields) => fields.filter((f) => has(p, f)),
    add: (name, md) => { out.push(md); blocks.push(name); },
    skip: (name, why) => { skipped.push(`${name}: ${why}`); },
    head: (title, level = 2) => { out.push("#".repeat(level) + " " + (title ?? "")); },
    colorOf: (f) => METRICS[f]?.color ?? "blue",
    sportCard: (s) => {
      const sp = SPORTS[s]!;
      const d = distanceFor(p, s, units);
      return { label: lbl(s), field: d?.field ?? sp.min, agg: "sum", precision: d?.precision ?? 0, unit: d ? u[d.unit] : "", icon: sp.icon, ...(p.span >= 14 ? { compare: true, better: "up" } : {}) };
    },
    layers: (list = sports) => series(list.map((s) => ({ field: SPORTS[s]!.min, color: SPORTS[s]!.color, label: lbl(s) })), "layers"),
    trainingWindow: () => {
      if (R === null) return [];
      return p.span >= 28 ? ["bucket: week", `range: ${Math.min(182, Math.max(28, Math.floor(p.span / 7) * 7))}d`] : [`range: ${R}d`];
    },
    monthGoal: (last28) => (o.goalUsual && p.span >= USUAL_GOAL_MIN_DAYS ? "usual" : niceUp(last28 * 1.1)),
    raceCard: () => {
      if (!o.races) return null;
      return isRaceDate(o.races)
        ? { label: t.nextRace, date: o.races, icon: "🏁" }
        : { label: t.nextRace, field: "date", source: o.races, pick: "next", icon: "🏁" };
    },
    open: (title) => {
      out.push(["---", "created: " + (p.last ?? ""), "updated: " + (p.last ?? ""), "tags:", '  - "#dashboard"', '  - "#garmy"', "---"].join("\n"));
      out.push("# " + title);
      // Garmin's API brand guidelines ask for the source to be named next to the title of any view of its data
      out.push(t.dataSource ?? "Garmin");
    },
    finish: (footer = true) => {
      if (footer) out.push("> " + t.madeBy);
      return { markdown: out.join("\n\n") + "\n", log: { blocks, skipped } };
    },
  };
  return c;
}
