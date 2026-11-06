// Composer: data profile + user choices -> one markdown note with Dashy blocks.
// Every block declares what it needs; a block whose data is missing is not written.
import { METRICS, SPORTS, type Lang } from "./catalog";
import { T, UNITS } from "../i18n";
import { did, has } from "./profile";
import type { DataProfile } from "./types";

export type Mode = "dashboard" | "month";
export interface ComposeOptions {
  source: string;
  lang?: Lang;
  groups?: string[];
  /** sport ids chosen by the user; only those with real data are used */
  sports?: string[];
  races?: string | null;
  mode?: Mode;
}
export interface ComposeResult {
  markdown: string;
  log: { blocks: string[]; skipped: string[] };
}

type Scalar = string | number | boolean | undefined | null;
type Row = Record<string, Scalar>;

const needsQuote = (v: string): boolean => /[,:{}[\]#"'&*!|>%@`]/.test(v) || v !== v.trim() || v === "";
const q = (v: Scalar): string => (typeof v === "string" && needsQuote(v) ? JSON.stringify(v) : String(v));
const map = (o: Row): string =>
  "{ " + Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${q(v)}`).join(", ") + " }";
const list = (rows: Row[]): string => rows.map((o) => "  - " + map(o)).join("\n");
const fence = (lang: string, head: string[], rows?: Row[]): string =>
  "```" + lang + "\n" + head.join("\n") + (rows ? "\nitems:\n" + list(rows) : "") + "\n```";
const series = (rows: Row[], key = "series"): string => `${key}:\n` + list(rows);

const RANGES = [7, 14, 30, 60, 90];
const rangeFor = (span: number): number | null => RANGES.filter((r) => r <= span).at(-1) ?? null;
export function niceUp(x: number): number {
  if (x <= 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(x));
  const m = x / mag;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return Number((step * mag).toPrecision(12));
}

export function activeSports(p: DataProfile, chosen?: string[]): string[] {
  return (chosen ?? Object.keys(SPORTS)).filter((s) => {
    const sp = SPORTS[s];
    return sp !== undefined && (did(p, sp.min) || (sp.km !== null && did(p, sp.km)));
  });
}

export function compose(p: DataProfile, o: ComposeOptions): ComposeResult {
  const lang: Lang = o.lang ?? "ru";
  const t = T[lang];
  const u = UNITS[lang];
  const src = o.source;
  const groups = o.groups ?? ["recovery", "activity", "training"];
  const sports = activeSports(p, o.sports);
  const R = rangeFor(p.span);
  const usual = p.span >= 14; // "compare: usual" needs history to mean anything
  const blocks: string[] = [];
  const skipped: string[] = [];
  const out: string[] = [];

  const lbl = (f: string): string => t[f] ?? f;
  const unit = (f: string): string => {
    const k = METRICS[f]?.unit;
    return k ? u[k] ?? "" : "";
  };
  const avail = (fields: string[]): string[] => fields.filter((f) => has(p, f));
  const add = (name: string, md: string): void => { out.push(md); blocks.push(name); };
  const skip = (name: string, why: string): void => { skipped.push(`${name}: ${why}`); };
  const head = (title: string | undefined, level = 2): void => { out.push("#".repeat(level) + " " + (title ?? "")); };
  const colorOf = (f: string): string => METRICS[f]?.color ?? "blue";

  out.push(["---", "created: " + (p.last ?? ""), "updated: " + (p.last ?? ""), "tags:", '  - "#dashboard"', '  - "#garmy"', "---"].join("\n"));
  out.push("# " + (o.mode === "month" ? t.month : t.title));

  const sportCard = (s: string): Row => {
    const sp = SPORTS[s]!;
    const f = sp.km ?? sp.min;
    return { label: lbl(s), field: f, agg: "sum", precision: sp.km ? sp.precision : 0, unit: sp.km ? u.km : "", icon: sp.icon, ...(usual ? { compare: true, better: "up" } : {}) };
  };
  const layers = (): string => series(sports.map((s) => ({ field: SPORTS[s]!.min, color: SPORTS[s]!.color, label: lbl(s) })), "layers");

  if (o.mode === "month") {
    const rec = avail(["sleep_score", "hrv", "resting_hr", "stress", "training_readiness"]);
    const cards: Row[] = [
      ...rec.map((f): Row => ({ label: lbl(f), field: f, agg: "avg", precision: 0, unit: unit(f), icon: METRICS[f]!.icon, ...(usual ? { compare: "usual", better: METRICS[f]!.better } : {}) })),
      ...(has(p, "steps") ? [{ label: t.stepsPerDay, field: "steps", agg: "avg", precision: 0, icon: "🚶" } as Row] : []),
    ].slice(0, 4);
    if (cards.length) add("month.recovery", fence("stats", ["columns: " + cards.length, "source: " + src, "period: note"], cards));
    if (sports.length) {
      head(t.training);
      add("month.training", fence("stats", ["columns: " + Math.min(4, sports.length), "source: " + src, "period: note"], sports.map(sportCard)));
      add("month.heatmap", fence("heatmap", ["source: " + src, "range: note", "layout: calendar", "pick: max", "title: " + q(t.monthByDay), layers()]));
    }
    if (has(p, "steps")) add("month.steps", fence("dashy-chart", ["source: " + src, "field: steps", "type: bar", "range: note", "goal: 10000", "label: " + q(t.steps), "title: " + q(t.chartSteps)]));
    const hr = avail(["sleep_score", "hrv", "resting_hr"]);
    if (hr.length) add("month.sleepHrv", fence("dashy-chart", ["source: " + src, "range: note", "agg: avg", "title: " + q(t.sleepHrv), series(hr.map((f) => ({ field: f, label: lbl(f), color: colorOf(f) })))]));
    return { markdown: out.join("\n\n") + "\n", log: { blocks, skipped } };
  }

  if (p.span < 7) out.push(`> ${t.waitWeek} ${p.days}.`);

  const rec = groups.includes("recovery") ? avail(["sleep_score", "sleep_duration", "hrv", "body_battery", "resting_hr", "training_readiness", "stress"]) : [];
  if (rec.length) {
    head(t.recovery);
    add("recovery.now", fence("stats", ["columns: 3", "source: " + src], rec.map((f): Row => ({ label: lbl(f), field: f, agg: "latest", unit: unit(f), icon: METRICS[f]!.icon }))));
    const avgs = rec.filter((f) => f !== "sleep_duration");
    if (p.span >= 7 && avgs.length) {
      head(usual ? t.weekVsUsual : t.week, 3);
      add("recovery.week", fence("stats", ["columns: 3", "source: " + src, "period: 7d"], avgs.map((f): Row => ({
        label: lbl(f), field: f, agg: "avg", precision: 0, unit: unit(f), icon: METRICS[f]!.icon,
        ...(usual ? { compare: "usual", better: METRICS[f]!.better, trend: "14d" } : {}),
      }))));
    } else skip("recovery.week", `span ${p.span} < 7`);
    if (R !== null) {
      const a = avail(["sleep_score", "training_readiness", "body_battery"]);
      if (a.length) add("recovery.chart.scores", fence("dashy-chart", ["source: " + src, `range: ${R}d`, "agg: avg", "title: " + q(t.chartRecovery), series(a.map((f) => ({ field: f, label: lbl(f), color: colorOf(f) })))]));
      const b = avail(["hrv", "resting_hr"]);
      if (b.length) add("recovery.chart.hr", fence("dashy-chart", ["source: " + src, `range: ${R}d`, "agg: avg", "title: " + q(t.chartHr), series(b.map((f) => ({ field: f, label: lbl(f), color: colorOf(f) })))]));
    } else skip("recovery.charts", `span ${p.span} < 7`);
  }

  const act = groups.includes("activity") ? avail(["steps", "distance_km"]) : [];
  if (act.length) {
    head(t.activity);
    const cards: Row[] = [];
    if (has(p, "steps")) cards.push({ label: t.stepsPerDay, field: "steps", agg: "avg", period: "7d", precision: 0, icon: "🚶", ...(usual ? { compare: "usual", better: "up", trend: "30d" } : {}) });
    if (has(p, "steps") && p.span >= 14) cards.push({ label: t.stepsStreak, field: "steps", agg: "current_streak", at_least: 10000, unit: t.days, icon: "🔥" });
    if (has(p, "distance_km")) cards.push({ label: t.km7, field: "distance_km", agg: "sum", period: "7d", precision: 1, unit: u.km, icon: "📏", ...(usual ? { compare: true, better: "up" } : {}) });
    add("activity.cards", fence("stats", ["columns: 3", "source: " + src], cards));
    if (R !== null && has(p, "steps")) add("activity.chart.steps", fence("dashy-chart", ["source: " + src, "field: steps", "type: bar", `range: ${R}d`, "goal: 10000", "label: " + q(t.steps), "title: " + q(t.chartSteps)]));
    if (p.span >= 30 && has(p, "steps")) add("activity.heatmap.year", fence("heatmap", ["source: " + src, "field: steps", "color: blue", "range: 365d", "bands: [14000, 10000, 7000]", "title: " + q(t.steps)]));
    else if (has(p, "steps")) skip("activity.heatmap.year", `span ${p.span} < 30`);
  }

  if (groups.includes("training") && sports.length) {
    head(t.training);
    add("training.cards", fence("stats", ["columns: " + Math.min(4, sports.length), "source: " + src, "period: 7d"], sports.map(sportCard)));
    if (R !== null) {
      const weekly = p.span >= 28;
      const range = weekly ? ["bucket: week", `range: ${Math.min(182, Math.max(28, Math.floor(p.span / 7) * 7))}d`] : [`range: ${R}d`];
      add("training.chart.minutes", fence("dashy-chart", ["source: " + src, "type: bar", ...range, "agg: sum", "title: " + q(t.chartMinutes), series(sports.map((s) => ({ field: SPORTS[s]!.min, label: lbl(s), color: SPORTS[s]!.color })))]));
    } else skip("training.chart", `span ${p.span} < 7`);
    if (p.span >= 7) add("training.heatmap.month", fence("heatmap", ["source: " + src, "range: month", "layout: calendar", "pick: max", "title: " + q(t.monthByDay), layers()]));
    if (p.span >= 60) add("training.heatmap.year", fence("heatmap", ["source: " + src, "range: 365d", "pick: max", "title: " + q(t.yearBySport), layers()]));
    else skip("training.heatmap.year", `span ${p.span} < 60`);
    if (p.span >= 28) {
      const goals: Row[] = [];
      for (const s of sports) {
        const sp = SPORTS[s]!;
        const f = sp.km ?? sp.min;
        const base = p.sumLast(f, 28);
        if (base > 0) goals.push({ label: lbl(s), field: f, agg: "sum", goal: niceUp(base * 1.1), unit: sp.km ? u.km : "", icon: sp.icon });
      }
      if (goals.length) { head(t.goals, 3); add("training.goals", fence("progress", ["source: " + src, "period: month", "columns: 2"], goals)); }
    } else skip("training.goals", `span ${p.span} < 28`);
  }

  if (o.races) { head(t.races); add("races.countdown", fence("countdown", ["columns: 2"], [{ label: t.nextRace, field: "date", source: o.races, pick: "next", icon: "🏁" }])); }
  else skip("races", "no races folder");

  out.push("> " + t.madeBy);
  return { markdown: out.join("\n\n") + "\n", log: { blocks, skipped } };
}
