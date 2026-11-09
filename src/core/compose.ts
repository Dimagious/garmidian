// Composer: data profile + user choices -> one markdown note with Dashy blocks.
// Every block declares what it needs; a block whose data is missing is not written.
// The overview lives here; the other dashboards are in templates.ts and are chosen with `template`.
import { METRICS, SPORTS } from "./catalog";
import { fence, niceUp, q, series, type Row } from "./blocks";
import { makeCtx, type ComposeOptions, type ComposeResult } from "./ctx";
import { buildTemplate, resolveTemplate } from "./templates";
import { distanceFor } from "./units";
import { has } from "./profile";
import type { DataProfile } from "./types";

export { niceUp };
export { activeSports } from "./ctx";
export type { ComposeOptions, ComposeResult, Mode } from "./ctx";

/** The dashboard the options ask for. The default is the overview of recovery, movement and training. */
export function compose(p: DataProfile, o: ComposeOptions): ComposeResult {
  const id = resolveTemplate(o);
  if (id !== "overview") return buildTemplate(id, p, o);
  return overview(p, o);
}

function overview(p: DataProfile, o: ComposeOptions): ComposeResult {
  const c = makeCtx(p, o);
  const { t, u, src, sports, R, usual, lbl, unit, avail, add, skip, head, colorOf, sportCard, layers } = c;
  const units = c.units;
  const groups = o.groups ?? ["recovery", "activity", "training"];
  c.open(t.title ?? "");

  if (p.span < 7) c.out.push(`> ${t.waitWeek} ${p.days}.`);

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
      if (a.length) add("recovery.chart.scores", fence("dashy-chart", ["source: " + src, `range: ${R}d`, "agg: avg", "title: " + q(a.map(lbl).join(" / ")), series(a.map((f) => ({ field: f, label: lbl(f), color: colorOf(f) })))]));
      const b = avail(["hrv", "resting_hr"]);
      if (b.length) add("recovery.chart.hr", fence("dashy-chart", ["source: " + src, `range: ${R}d`, "agg: avg", "title: " + q(b.map(lbl).join(" / ")), series(b.map((f) => ({ field: f, label: lbl(f), color: colorOf(f) })))]));
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
        const d = distanceFor(p, s, units);
        const f = d?.field ?? sp.min;
        const base = p.sumLast(f, 28);
        if (base > 0) goals.push({ label: lbl(s), field: f, agg: "sum", goal: c.monthGoal(base), unit: d ? u[d.unit] : "", icon: sp.icon });
      }
      if (goals.length) { head(t.goals, 3); add("training.goals", fence("progress", ["source: " + src, "period: month", "columns: 2"], goals)); }
    } else skip("training.goals", `span ${p.span} < 28`);
  }

  const race = c.raceCard();
  if (race) { head(t.races); add("races.countdown", fence("countdown", ["columns: 2"], [race])); }
  else skip("races", "no races folder");

  return c.finish();
}
