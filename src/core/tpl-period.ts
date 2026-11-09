// Reviews that count their own week or month: they sit in a note named for the period (2026-W45, 2026-11) and every
// block says `period: note` or `range: note`, so the same dashboard is right in any week's note.
import { METRICS, SPORTS } from "./catalog";
import { fence, q, series, type Row } from "./blocks";
import type { Ctx } from "./ctx";
import { has } from "./profile";

const recoveryCards = (c: Ctx, fields: string[], max: number): Row[] =>
  c.avail(fields).slice(0, max).map((f): Row => ({
    label: c.lbl(f), field: f, agg: "avg", precision: 0, unit: c.unit(f), icon: METRICS[f]!.icon,
    ...(c.usual ? { compare: "usual", better: METRICS[f]!.better } : {}),
  }));

/** Shared by both reviews: the same blocks over the period the note's name stands for. */
function review(c: Ctx, recFields: string[], name: string): void {
  const { p, src, t, sports, add, lbl } = c;
  const rec = recoveryCards(c, recFields, 4);
  const steps: Row[] = has(p, "steps") ? [{ label: t.stepsPerDay, field: "steps", agg: "avg", precision: 0, icon: "🚶" }] : [];
  const cards = [...rec, ...steps].slice(0, 4);
  if (cards.length) add(`${name}.recovery`, fence("stats", [`columns: ${cards.length}`, "source: " + src, "period: note"], cards));
  if (sports.length) {
    c.head(t.training);
    add(`${name}.training`, fence("stats", [`columns: ${Math.min(4, sports.length)}`, "source: " + src, "period: note"], sports.map((s) => c.sportCard(s))));
    add(`${name}.heatmap`, fence("heatmap", ["source: " + src, "range: note", "layout: calendar", "pick: max", "title: " + q(t.monthByDay), c.layers()]));
  }
  if (has(p, "steps")) add(`${name}.steps`, fence("dashy-chart", ["source: " + src, "field: steps", "type: bar", "range: note", "goal: 10000", "label: " + q(t.steps), "title: " + q(t.chartSteps)]));
  const hr = c.avail(["sleep_score", "hrv", "resting_hr"]);
  if (hr.length) add(`${name}.sleepHrv`, fence("dashy-chart", ["source: " + src, "range: note", "agg: avg", "title: " + q(hr.map(lbl).join(" / ")), series(hr.map((f) => ({ field: f, label: lbl(f), color: c.colorOf(f) })))]));
}

/** The monthly review. */
export function month(c: Ctx): void {
  review(c, ["sleep_score", "hrv", "resting_hr", "stress", "training_readiness"], "month");
}

/** The weekly review: the week against your usual, minutes by sport, the days of the week, and the streak that outlives the week. */
export function week(c: Ctx): void {
  const { p, src, t, sports, add } = c;
  const rec = recoveryCards(c, ["sleep_score", "hrv", "resting_hr", "body_battery", "stress"], 4);
  if (rec.length) { c.head(t.recovery); add("week.recovery", fence("stats", [`columns: ${rec.length}`, "source: " + src, "period: note"], rec)); }
  if (sports.length) {
    c.head(t.training);
    add("week.training", fence("stats", [`columns: ${Math.min(4, sports.length)}`, "source: " + src, "period: note"], sports.map((s) => c.sportCard(s))));
    add("week.minutes", fence("dashy-chart", ["source: " + src, "type: bar", "range: note", "agg: sum", "title: " + q(t.chartMinutes), series(sports.map((s) => ({ field: SPORTS[s]!.min, label: c.lbl(s), color: SPORTS[s]!.color })))]));
  }
  if (has(p, "steps")) {
    c.head(t.activity);
    add("week.steps", fence("stats", ["columns: 2", "source: " + src, "period: note"], [
      { label: t.stepsPerDay, field: "steps", agg: "avg", precision: 0, icon: "🚶", ...(c.usual ? { compare: true, better: "up" } : {}) },
      { label: t.steps, field: "steps", agg: "sum", icon: "👣" },
    ]));
    // a streak counts back from today, so it cannot live in a block that looks at one week only
    if (p.span >= 14) add("week.streak", fence("stats", ["columns: 2", "source: " + src], [{ label: t.stepsStreak, field: "steps", agg: "current_streak", at_least: 10000, unit: t.days, icon: "🔥" }]));
    add("week.chart.steps", fence("dashy-chart", ["source: " + src, "field: steps", "type: bar", "range: note", "goal: 10000", "label: " + q(t.steps), "title: " + q(t.chartSteps)]));
  }
  const hr = c.avail(["sleep_score", "hrv", "resting_hr"]);
  if (hr.length) add("week.chart.recovery", fence("dashy-chart", ["source: " + src, "range: note", "agg: avg", "title: " + q(hr.map(c.lbl).join(" / ")), series(hr.map((f) => ({ field: f, label: c.lbl(f), color: c.colorOf(f) })))]));
  if (sports.length) add("week.heatmap", fence("heatmap", ["source: " + src, "range: note", "layout: calendar", "pick: max", "title: " + q(t.monthByDay), c.layers()]));
}
