// Dashboards about training: one sport on its own, the three triathlon sports side by side, a race build and the year.
import { METRICS, SPORTS } from "./catalog";
import { fence, niceUp, q, series, type Row } from "./blocks";
import type { Ctx } from "./ctx";
import { has } from "./profile";
import { distanceFor } from "./units";

const TRI = ["swim", "bike", "run"];
const triSports = (c: Ctx): string[] => TRI.filter((s) => c.sports.includes(s));

const cmp = (c: Ctx): Row => (c.p.span >= 14 ? { compare: true, better: "up" } : {});

/** What a sport is measured in: its distance when it has one, otherwise the minutes. */
function volumeOf(c: Ctx, s: string): { field: string; unit: string; precision: number; distance: boolean } {
  const d = distanceFor(c.p, s, c.units);
  return d ? { field: d.field, unit: c.u[d.unit] ?? "", precision: d.precision, distance: true } : { field: SPORTS[s]!.min, unit: c.u.min ?? "", precision: 0, distance: false };
}

/** Month goal for a sport from the last 28 days plus a tenth, the way the overview sets them. */
function goalRows(c: Ctx, list: string[]): Row[] {
  const rows: Row[] = [];
  for (const s of list) {
    const v = volumeOf(c, s);
    const base = c.p.sumLast(v.field, 28);
    if (base > 0) rows.push({ label: c.lbl(s), field: v.field, agg: "sum", goal: c.monthGoal(base), unit: v.unit, icon: SPORTS[s]!.icon });
  }
  return rows;
}

/** Recovery for the sports that wear the body down in different ways: heart signals for endurance, sleep and energy for lifting. */
function recoveryPair(c: Ctx, s: string): string[] {
  return c.avail(s === "strength" ? ["sleep_score", "body_battery"] : ["hrv", "resting_hr"]);
}

/** One sport: this week, this month, the longest, sessions and streak, weekly volume and sessions, and what recovery says about it. */
export function sport(c: Ctx, s: string): void {
  const { p, src, t, u, lbl, add, R } = c;
  const sp = SPORTS[s];
  if (!sp || !c.sports.includes(s)) return;
  const v = volumeOf(c, s);
  const m = sp.min;
  const week: Row[] = [];
  if (v.distance) week.push({ label: t.distance_km, field: v.field, agg: "sum", period: "7d", precision: v.precision, unit: v.unit, icon: sp.icon, sub: t.week, ...cmp(c) });
  week.push({ label: t.time, field: m, agg: "sum", period: "7d", unit: u.min, icon: "⏱", sub: t.week, ...cmp(c) });
  week.push({ label: t.sessions, agg: "count", where: `${m} > 0`, period: "7d", icon: "📅", sub: t.week, ...cmp(c) });
  week.push({ label: t.longest, field: v.field, agg: "max", period: "90d", precision: v.precision, unit: v.unit, icon: "🏆", sub: `90${t.days ?? ""}` });
  add("sport.week", fence("stats", [`columns: ${week.length}`, "source: " + src], week));

  if (p.span >= 7) {
    c.head(t.thisMonth, 3);
    add("sport.month", fence("stats", ["columns: 3", "source: " + src], [
      { label: v.distance ? t.distance_km : t.time, field: v.field, agg: "sum", period: "month", precision: v.precision, unit: v.unit, icon: sp.icon, ...cmp(c) },
      { label: t.sessions, agg: "count", where: `${m} > 0`, period: "month", icon: "📅" },
      { label: t.streakNow, field: m, agg: "current_streak", at_least: 1, unit: t.days, icon: "🔥" },
    ]));
  }
  if (p.span >= 28) {
    const goals = goalRows(c, [s]);
    if (goals.length) { c.head(t.goals, 3); add("sport.goal", fence("progress", ["source: " + src, "period: month"], goals)); }
  } else c.skip("sport.goal", `span ${p.span} < 28`);

  if (R !== null) {
    c.head(t.trends);
    const weekly = p.span >= 28;
    const base = p.sumLast(v.field, 28);
    const weeklyGoal = weekly && base > 0 ? niceUp((base / 4) * 1.1) : undefined;
    const win = c.trainingWindow();
    add("sport.chart.volume", fence("dashy-chart", ["source: " + src, `field: ${v.field}`, "type: bar", ...win, "agg: sum", `color: ${sp.color}`, "label: " + q(v.distance ? t.chartVolume : t.chartMinutes), ...(v.unit ? ["unit: " + q(v.unit.trim())] : []), `precision: ${v.precision}`, ...(weeklyGoal ? [`goal: ${weeklyGoal}`] : []), "title: " + q(v.distance ? t.chartVolume : t.chartMinutes)]));
    add("sport.chart.sessions", fence("dashy-chart", ["source: " + src, `where: ${q(`${m} > 0`)}`, "type: bar", ...win, "agg: count", `color: ${sp.color}`, "label: " + q(t.sessions), "title: " + q(t.chartSessions)]));
  } else c.skip("sport.charts", `span ${p.span} < 7`);

  if (p.span >= 7) add("sport.heatmap.month", fence("heatmap", ["source: " + src, "range: month", "layout: calendar", "title: " + q(t.monthByDay), c.layers([s])]));
  if (p.span >= 60) add("sport.heatmap.year", fence("heatmap", ["source: " + src, `field: ${m}`, `color: ${sp.color}`, "range: 365d", "title: " + q(lbl(s))]));
  else c.skip("sport.heatmap.year", `span ${p.span} < 60`);
  const rec = recoveryPair(c, s);
  if (R !== null && rec.length) {
    c.head(t.recovery);
    add("sport.chart.recovery", fence("dashy-chart", ["source: " + src, `range: ${R}d`, "agg: avg", "title: " + q(rec.map(lbl).join(" / ")), series(rec.map((f) => ({ field: f, label: lbl(f), color: c.colorOf(f) })))]));
  }
}

/** Swim, bike and run side by side, with the bike-then-run days only a triathlete has, and recovery under them. */
export function triathlon(c: Ctx): void {
  const { p, src, t, u, lbl, add, R } = c;
  const list = triSports(c);
  if (!list.length) return;
  add("tri.distance", fence("stats", [`columns: ${list.length}`, "source: " + src, "period: 7d"], list.map((s) => c.sportCard(s))));
  add("tri.time", fence("stats", [`columns: ${list.length}`, "source: " + src, "period: 7d"], list.map((s): Row => ({ label: lbl(s), field: SPORTS[s]!.min, agg: "sum", unit: u.min, icon: "⏱", sub: t.time, ...cmp(c) }))));

  const combos: Row[] = [];
  if (list.includes("bike") && list.includes("run")) {
    combos.push({ label: t.brick, agg: "count", where: "bike_min > 0 and run_min > 0", period: "30d", icon: "🧱", sub: `30${t.days ?? ""}` });
    combos.push({ label: t.brick, agg: "count", where: "bike_min > 0 and run_min > 0", period: "year", icon: "🧱", sub: t.thisYear });
  }
  if (combos.length) add("tri.brick", fence("stats", [`columns: ${combos.length}`, "source: " + src], combos));

  if (R !== null) {
    add("tri.chart.minutes", fence("dashy-chart", ["source: " + src, "type: bar", ...c.trainingWindow(), "agg: sum", "title: " + q(t.chartMinutes), series(list.map((s) => ({ field: SPORTS[s]!.min, label: lbl(s), color: SPORTS[s]!.color })))]));
  } else c.skip("tri.chart", `span ${p.span} < 7`);
  if (p.span >= 7) add("tri.heatmap.month", fence("heatmap", ["source: " + src, "range: month", "layout: calendar", "pick: max", "title: " + q(t.monthByDay), c.layers(list)]));
  if (p.span >= 60) add("tri.heatmap.year", fence("heatmap", ["source: " + src, "range: 365d", "pick: max", "title: " + q(t.yearBySport), c.layers(list)]));
  else c.skip("tri.heatmap.year", `span ${p.span} < 60`);
  if (p.span >= 28) {
    const goals = goalRows(c, list);
    if (goals.length) { c.head(t.goals, 3); add("tri.goals", fence("progress", ["source: " + src, "period: month", `columns: ${Math.min(2, goals.length)}`], goals)); }
  }
  const rec = c.avail(["hrv", "resting_hr", "sleep_score"]);
  if (p.span >= 7 && rec.length) {
    c.head(c.usual ? t.weekVsUsual : t.week);
    add("tri.recovery", fence("stats", [`columns: ${rec.length}`, "source: " + src, "period: 7d"], rec.map((f): Row => ({ label: lbl(f), field: f, agg: "avg", precision: 0, unit: c.unit(f), icon: METRICS[f]!.icon, ...(c.usual ? { compare: "usual", better: METRICS[f]!.better } : {}) }))));
  }
  const race = c.raceCard();
  if (race) { c.head(t.races); add("races.countdown", fence("countdown", ["columns: 2"], [race])); }
}

/** The days to the start, what the last four weeks added up to against the four before, and how the body is taking it. */
export function race(c: Ctx): void {
  const { p, src, t, lbl, add, R } = c;
  const card = c.raceCard();
  if (!card) return;
  add("races.countdown", fence("countdown", ["columns: 2"], [card]));
  const list = c.sports;
  if (list.length && p.span >= 14) {
    c.head(t.last4, 3);
    add("race.build", fence("stats", [`columns: ${Math.min(4, list.length)}`, "source: " + src, "period: 28d"], list.map((s): Row => ({ label: lbl(s), field: SPORTS[s]!.min, agg: "sum", unit: c.u.min, icon: SPORTS[s]!.icon, compare: true, better: "up" }))));
  } else if (list.length) c.skip("race.build", `span ${p.span} < 14`);
  if (R !== null && list.length) {
    const win = p.span >= 28 ? ["bucket: week", `range: ${Math.min(56, Math.max(28, Math.floor(p.span / 7) * 7))}d`] : [`range: ${R}d`];
    add("race.chart.weeks", fence("dashy-chart", ["source: " + src, "type: bar", ...win, "agg: sum", "title: " + q(t.buildUp), series(list.map((s) => ({ field: SPORTS[s]!.min, label: lbl(s), color: SPORTS[s]!.color })))]));
  }
  const rec = c.avail(["hrv", "resting_hr", "sleep_score", "body_battery"]);
  if (p.span >= 7 && rec.length) {
    c.head(t.recovery);
    add("race.recovery", fence("stats", [`columns: ${Math.min(4, rec.length)}`, "source: " + src, "period: 7d"], rec.map((f): Row => ({ label: lbl(f), field: f, agg: "avg", precision: 0, unit: c.unit(f), icon: METRICS[f]!.icon, ...(c.usual ? { compare: "usual", better: METRICS[f]!.better } : {}) }))));
    const hr = c.avail(["hrv", "resting_hr"]);
    if (R !== null && hr.length) add("race.chart.hr", fence("dashy-chart", ["source: " + src, `range: ${Math.min(R, 30)}d`, "agg: avg", "title: " + q(hr.map(lbl).join(" / ")), series(hr.map((f) => ({ field: f, label: lbl(f), color: c.colorOf(f) })))]));
  }
  if (list.length && p.span >= 7) add("race.heatmap.month", fence("heatmap", ["source: " + src, "range: month", "layout: calendar", "pick: max", "title: " + q(t.monthByDay), c.layers()]));
}

/** The year so far: totals and averages, the longest effort of each sport, months side by side and the year maps. */
export function year(c: Ctx): void {
  const { p, src, t, lbl, add } = c;
  const list = c.sports;
  if (list.length) {
    c.head(t.yearTotals, 3);
    add("year.totals", fence("stats", [`columns: ${Math.min(4, list.length)}`, "source: " + src, "period: year"], list.map((s): Row => {
      const v = volumeOf(c, s);
      return { label: lbl(s), field: v.field, agg: "sum", precision: v.precision, unit: v.unit, icon: SPORTS[s]!.icon };
    })));
    add("year.longest", fence("stats", [`columns: ${Math.min(4, list.length)}`, "source: " + src, "period: year"], list.map((s): Row => {
      const v = volumeOf(c, s);
      return { label: lbl(s), field: v.field, agg: "max", precision: v.precision, unit: v.unit, icon: "🏆", sub: t.longest };
    })));
  }
  const avg = c.avail(["sleep_score", "hrv", "resting_hr", "steps"]);
  if (avg.length) {
    c.head(t.yearAverages, 3);
    add("year.averages", fence("stats", [`columns: ${Math.min(4, avg.length)}`, "source: " + src, "period: year"], avg.map((f): Row => ({ label: lbl(f), field: f, agg: "avg", precision: 0, unit: c.unit(f), icon: METRICS[f]!.icon }))));
  }
  c.head(t.byMonth);
  const month = (name: string, extra: string[], rows?: Row[], title?: string): void => {
    add(name, fence("dashy-chart", ["source: " + src, "bucket: month", "range: 365d", ...extra, ...(title ? ["title: " + q(title)] : []), ...(rows ? [series(rows)] : [])]));
  };
  if (list.length) month("year.chart.minutes", ["type: bar", "agg: sum"], list.map((s) => ({ field: SPORTS[s]!.min, label: lbl(s), color: SPORTS[s]!.color })), t.chartMinutes);
  for (const f of ["sleep_score", "hrv", "resting_hr"]) if (has(p, f)) month(`year.chart.${f}`, [`field: ${f}`, "agg: avg", `color: ${c.colorOf(f)}`, "label: " + q(lbl(f))], undefined, lbl(f));
  if (has(p, "steps")) month("year.chart.steps", ["field: steps", "type: bar", "agg: avg", "color: blue", "label: " + q(t.steps)], undefined, t.stepsPerDay);
  if (list.length) add("year.heatmap.sport", fence("heatmap", ["source: " + src, "range: 365d", "pick: max", "title: " + q(t.yearBySport), c.layers()]));
}
