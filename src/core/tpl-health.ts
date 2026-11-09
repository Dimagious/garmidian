// Dashboards about the body: a morning glance, sleep, recovery and steps. Each writes only the blocks its data supports.
import { METRICS } from "./catalog";
import { fence, niceUp, q, series, type Row } from "./blocks";
import type { Ctx } from "./ctx";
import { has } from "./profile";

const usualCmp = (c: Ctx, f: string): Row => (c.usual ? { compare: "usual", better: METRICS[f]?.better ?? "up" } : {});

/** Four numbers from last night with a sketch of two weeks behind each, and the week against the usual. Small enough for a home page. */
export function glance(c: Ctx): void {
  const { p, src, t, lbl, unit, add } = c;
  const now = c.avail(["sleep_score", "hrv", "resting_hr", "body_battery", "stress", "steps"]).slice(0, 4);
  if (!now.length) return;
  const sketch: Row = p.span >= 7 ? { trend: "14d" } : {};
  add("glance.now", fence("stats", [`columns: ${now.length}`, "source: " + src], now.map((f): Row => ({
    label: lbl(f), field: f, agg: "latest", unit: unit(f), icon: METRICS[f]!.icon, sub: f === "sleep_score" || f === "hrv" ? t.latestNight : t.latest, ...sketch,
  }))));
  const week = c.avail(["sleep_score", "hrv", "resting_hr", "steps"]).slice(0, 4);
  if (p.span >= 7 && week.length) {
    c.head(c.usual ? t.weekVsUsual : t.week);
    add("glance.week", fence("stats", [`columns: ${week.length}`, "source: " + src, "period: 7d"], week.map((f): Row => ({
      label: lbl(f), field: f, agg: "avg", precision: 0, unit: unit(f), icon: METRICS[f]!.icon, ...usualCmp(c, f),
    }))));
  } else c.skip("glance.week", `span ${p.span} < 7`);
}

/** Score and duration, how many nights cleared a bar, a streak of long nights, a chart per measure and a year map. */
export function sleep(c: Ctx): void {
  const { p, src, t, lbl, add, R } = c;
  const score = has(p, "sleep_score");
  const dur = has(p, "sleep_duration");
  if (!score && !dur) return;
  const have = [score ? "sleep_score" : "", dur ? "sleep_duration" : ""].filter(Boolean);

  const cards: Row[] = have.map((f): Row => ({ label: lbl(f), field: f, agg: "latest", icon: METRICS[f]!.icon, sub: t.latestNight }));
  if (p.span >= 7) for (const f of have) cards.push({ label: lbl(f), field: f, agg: "avg", period: "7d", ...(f === "sleep_score" ? { precision: 0 } : {}), icon: METRICS[f]!.icon, sub: t.avg7, ...usualCmp(c, f) });
  add("sleep.cards", fence("stats", [`columns: ${Math.min(4, cards.length)}`, "source: " + src], cards));

  if (p.span >= 7) {
    const rhythm: Row[] = [];
    if (score) rhythm.push({ label: t.nights80, agg: "count", where: "sleep_score >= 80", period: "month", icon: "🌙" });
    if (dur) rhythm.push({ label: t.nights7h, field: "sleep_duration", agg: "current_streak", at_least: "7h", unit: t.days, icon: "🔥" });
    if (score) rhythm.push({ label: t.best30, field: "sleep_score", agg: "max", period: "30d", icon: "🏆" });
    add("sleep.rhythm", fence("stats", [`columns: ${rhythm.length}`, "source: " + src], rhythm));
  } else c.skip("sleep.rhythm", `span ${p.span} < 7`);

  if (R !== null) {
    if (score) add("sleep.chart.score", fence("dashy-chart", ["source: " + src, "field: sleep_score", "agg: avg", `range: ${R}d`, "color: purple", "label: " + q(lbl("sleep_score")), "title: " + q(lbl("sleep_score"))]));
    if (dur) add("sleep.chart.duration", fence("dashy-chart", ["source: " + src, "field: sleep_duration", "type: bar", "agg: avg", `range: ${R}d`, "goal: 7h", "color: blue", "label: " + q(lbl("sleep_duration")), "title: " + q(lbl("sleep_duration"))]));
  } else c.skip("sleep.charts", `span ${p.span} < 7`);

  if (p.span >= 30) {
    add("sleep.heatmap.year", fence("heatmap", ["source: " + src, `field: ${score ? "sleep_score" : "sleep_duration"}`, "color: purple", "range: 365d", `bands: ${score ? "[85, 75, 60]" : "[8h, 7h, 6h]"}`, "title: " + q(lbl(score ? "sleep_score" : "sleep_duration"))]));
  } else c.skip("sleep.heatmap.year", `span ${p.span} < 30`);
}

/** HRV, resting heart rate, Body Battery and stress: now, this week against the usual, and the days that went well. */
export function recovery(c: Ctx): void {
  const { p, src, t, lbl, unit, add, R } = c;
  const core = c.avail(["hrv", "resting_hr", "body_battery", "stress"]);
  if (!core.length) return;
  const shown = c.avail(["hrv", "resting_hr", "body_battery", "stress", "training_readiness", "sleep_score"]);
  const sketch: Row = p.span >= 7 ? { trend: "14d" } : {};
  add("recovery.now", fence("stats", ["columns: 3", "source: " + src], shown.map((f): Row => ({ label: lbl(f), field: f, agg: "latest", unit: unit(f), icon: METRICS[f]!.icon, ...sketch }))));

  if (p.span >= 7) {
    c.head(c.usual ? t.weekVsUsual : t.week, 3);
    add("recovery.week", fence("stats", ["columns: 3", "source: " + src, "period: 7d"], shown.map((f): Row => ({
      label: lbl(f), field: f, agg: "avg", precision: 0, unit: unit(f), icon: METRICS[f]!.icon, ...usualCmp(c, f), ...(c.usual ? { trend: "14d" } : {}),
    }))));
    const good: Row[] = [];
    if (has(p, "stress")) good.push({ label: t.calmDays, agg: "count", where: "stress <= 25", period: "month", icon: "🧘" });
    if (has(p, "body_battery")) good.push({ label: t.chargedDays, agg: "count", where: "body_battery >= 80", period: "month", icon: "🔋" });
    if (good.length) add("recovery.good", fence("stats", [`columns: ${good.length}`, "source: " + src], good));
  } else c.skip("recovery.week", `span ${p.span} < 7`);

  if (R !== null) {
    const one = (f: string): void => {
      add(`recovery.chart.${f}`, fence("dashy-chart", ["source: " + src, `field: ${f}`, "agg: avg", `range: ${R}d`, `color: ${c.colorOf(f)}`, "label: " + q(lbl(f)), "title: " + q(lbl(f))]));
    };
    for (const f of ["hrv", "resting_hr"]) if (has(p, f)) one(f);
    const both = c.avail(["body_battery", "stress"]);
    if (both.length) add("recovery.chart.energy", fence("dashy-chart", ["source: " + src, `range: ${R}d`, "agg: avg", "title: " + q(both.map(lbl).join(" / ")), series(both.map((f) => ({ field: f, label: lbl(f), color: c.colorOf(f) })))]));
  } else c.skip("recovery.charts", `span ${p.span} < 7`);

  if (p.span >= 30 && has(p, "hrv")) add("recovery.heatmap.hrv", fence("heatmap", ["source: " + src, "field: hrv", "color: green", "range: 365d", "title: " + q(lbl("hrv"))]));
}

/** Steps: the average day, the best streaks at 10,000, the month, a goal for it, bars per day and per week, a year map. */
export function steps(c: Ctx): void {
  const { p, src, t, add, R } = c;
  if (!has(p, "steps")) return;
  const cards: Row[] = [
    { label: t.stepsPerDay, field: "steps", agg: "avg", period: "7d", precision: 0, icon: "🚶", ...(c.usual ? { compare: "usual", better: "up", trend: "30d" } : {}) },
    { label: t.bestDay, field: "steps", agg: "max", period: "30d", icon: "🏆" },
  ];
  if (p.span >= 14) {
    cards.push({ label: t.stepsStreak, field: "steps", agg: "current_streak", at_least: 10000, unit: t.days, icon: "🔥" });
    cards.push({ label: t.bestStreak, field: "steps", agg: "streak", at_least: 10000, unit: t.days, icon: "🥇" });
  }
  add("steps.cards", fence("stats", [`columns: ${Math.min(4, cards.length)}`, "source: " + src], cards));

  if (p.span >= 7) {
    c.head(t.thisMonth, 3);
    add("steps.month", fence("stats", ["columns: 3", "source: " + src, "period: month"], [
      { label: t.stepsMonth, field: "steps", agg: "sum", icon: "🚶", compare: true, better: "up" },
      { label: t.days10k, agg: "count", where: "steps >= 10000", icon: "🎯" },
      { label: t.stepsPerDay, field: "steps", agg: "avg", precision: 0, icon: "📈" },
    ]));
  }
  if (p.span >= 28) {
    const base = p.sumLast("steps", 28);
    if (base > 0) add("steps.goal", fence("progress", ["source: " + src, "period: month"], [{ label: t.stepsMonth, field: "steps", agg: "sum", goal: niceUp(base * 1.1), icon: "🚶" }]));
  } else c.skip("steps.goal", `span ${p.span} < 28`);

  if (R !== null) add("steps.chart.days", fence("dashy-chart", ["source: " + src, "field: steps", "type: bar", `range: ${R}d`, "goal: 10000", "label: " + q(t.steps), "title: " + q(t.chartSteps)]));
  if (p.span >= 28) add("steps.chart.weeks", fence("dashy-chart", ["source: " + src, "field: steps", "type: bar", "agg: avg", ...c.trainingWindow(), "goal: 10000", "label: " + q(t.steps), "title: " + q(t.weeklyAvgSteps)]));
  if (p.span >= 30) add("steps.heatmap.year", fence("heatmap", ["source: " + src, "field: steps", "color: blue", "range: 365d", "bands: [14000, 10000, 7000]", "title: " + q(t.steps)]));
}
