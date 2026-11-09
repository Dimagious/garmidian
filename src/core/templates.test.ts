import { describe, expect, it } from "vitest";
import { dashyProblems, fences } from "../test/dashy-schema";
import { LANGS } from "../i18n";
import { compose } from "./compose";
import { buildProfile } from "./profile";
import { decodeMeta, encodeMeta, readRegionMeta, replaceRegion, wrapRegion, withMeta, splitComposed, type RegionMeta } from "./region";
import { rebuildNote } from "./rebuild";
import { convertRecords } from "./units";
import { buildTemplate, listTemplates, resolveTemplate } from "./templates";
import type { DayRecord } from "./types";

type F = Record<string, number | string>;
const day = (i: number, fields: F): DayRecord => ({ date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10), fields });
const rows = (n: number, f: (i: number) => F): DayRecord[] => Array.from({ length: n }, (_, i) => day(i, f(i)));
const SRC = "Garmy/data";

const body = (i: number): F => ({ steps: 7000 + (i % 7) * 900, resting_hr: 48 + (i % 5), stress: 22 + (i % 9), body_battery: 70 + (i % 25), sleep_score: 70 + (i % 20), sleep_duration: "7h 10min", hrv: 45 + (i % 12) });
const withSports = (i: number): F => ({
  ...body(i),
  run_km: i % 3 === 0 ? 8 : 0, run_min: i % 3 === 0 ? 45 : 0,
  bike_km: i % 4 === 0 ? 40 : 0, bike_min: i % 4 === 0 ? 90 : 0,
  swim_km: i % 5 === 0 ? 1.5 : 0, swim_min: i % 5 === 0 ? 40 : 0,
  strength_min: i % 6 === 0 ? 50 : 0,
});
const all = (n: number): DayRecord[] => rows(n, withSports);

const IDS = ["overview", "glance", "sleep", "recovery", "steps", "sport:run", "sport:bike", "sport:swim", "sport:strength", "triathlon", "race", "week", "month", "year"];
const opts = (template: string, extra: object = {}) => ({ source: SRC, template, races: "2026-12-06", ...extra });

describe("every template, on every shape of data, writes blocks Dashy accepts", () => {
  for (const n of [1, 3, 8, 20, 40, 120]) {
    for (const id of IDS) {
      it(`${id} with ${n} days`, () => {
        const md = compose(buildProfile(all(n)), opts(id)).markdown;
        expect(dashyProblems(md)).toEqual([]);
        expect(md).not.toContain("—");
        expect(md).not.toContain("–");
      });
    }
  }
  it("also with only the days a watch without sports would give", () => {
    for (const id of IDS) expect(dashyProblems(compose(buildProfile(rows(40, body)), opts(id)).markdown), id).toEqual([]);
  });
  it("also with a single field", () => {
    for (const id of IDS) expect(dashyProblems(compose(buildProfile(rows(40, (i) => ({ steps: 5000 + i }))), opts(id)).markdown), id).toEqual([]);
  });
  it("in every language, with miles", () => {
    for (const { code } of LANGS) {
      for (const id of IDS) {
        const md = compose(buildProfile(all(60)), opts(id, { lang: code, units: "imperial" })).markdown;
        expect(dashyProblems(md), `${code} ${id}`).toEqual([]);
        expect(md.split(/^# .*$/m)[1]?.trimStart().split("\n")[0], `${code} ${id} names the source`).toContain("Garmin");
      }
    }
  });
  it("on empty data says so instead of writing nothing", () => {
    for (const id of IDS.filter((x) => x !== "overview")) {
      const r = compose(buildProfile([]), { source: SRC, template: id });
      expect(r.log.blocks, id).toEqual([]);
      expect(r.markdown, id).toContain("Not enough data");
    }
  });
});

describe("resolveTemplate", () => {
  it("defaults to the overview, honours the old month mode, and ignores ids it does not know", () => {
    expect(resolveTemplate({ source: SRC })).toBe("overview");
    expect(resolveTemplate({ source: SRC, mode: "month" })).toBe("month");
    expect(resolveTemplate({ source: SRC, template: "week" })).toBe("week");
    expect(resolveTemplate({ source: SRC, template: "sport:run" })).toBe("sport:run");
    expect(resolveTemplate({ source: SRC, template: "sport:golf" })).toBe("overview");
    expect(resolveTemplate({ source: SRC, template: "nonsense" })).toBe("overview");
  });
  it("an unknown id builds the overview", () => {
    const a = compose(buildProfile(all(40)), { source: SRC });
    const b = compose(buildProfile(all(40)), { source: SRC, template: "nonsense" });
    expect(b.markdown).toBe(a.markdown);
  });
});

describe("listTemplates: the library follows the data", () => {
  const ids = (p: ReturnType<typeof buildProfile>, o = {}) => listTemplates(p, { source: SRC, ...o }).map((t) => t.id);
  const need = (p: ReturnType<typeof buildProfile>, id: string, o = {}) => listTemplates(p, { source: SRC, ...o }).find((t) => t.id === id)?.need;

  it("offers a card per sport that is really in the data", () => {
    expect(ids(buildProfile(all(40)))).toEqual(expect.arrayContaining(["sport:run", "sport:bike", "sport:swim", "sport:strength"]));
    expect(ids(buildProfile(rows(40, body)))).not.toContain("sport:run");
    expect(ids(buildProfile(rows(40, (i) => ({ ...body(i), run_km: 5, run_min: 30 }))))).toEqual(expect.arrayContaining(["sport:run"]));
    expect(ids(buildProfile(rows(40, (i) => ({ ...body(i), run_km: 5, run_min: 30 }))))).not.toContain("sport:swim");
  });
  it("a sport with only zeros is not offered", () => {
    expect(ids(buildProfile(rows(40, (i) => ({ ...body(i), swim_km: 0, swim_min: 0 }))))).not.toContain("sport:swim");
  });
  it("the sport card describes distance only where the sport has one", () => {
    const list = listTemplates(buildProfile(all(40)), { source: SRC });
    expect(list.find((t) => t.id === "sport:run")?.desc).toBe("sportDist");
    expect(list.find((t) => t.id === "sport:strength")?.desc).toBe("sportTime");
  });
  it("triathlon shows with one of its sports and unlocks with a second", () => {
    const run = buildProfile(rows(40, (i) => ({ ...body(i), run_km: 5, run_min: 30 })));
    expect(need(run, "triathlon")).toBe("tri");
    const two = buildProfile(rows(40, (i) => ({ ...body(i), run_km: 5, run_min: 30, bike_km: 20, bike_min: 50 })));
    expect(need(two, "triathlon")).toBeNull();
    expect(ids(buildProfile(rows(40, body)))).not.toContain("triathlon");
    expect(need(buildProfile(rows(40, (i) => ({ ...body(i), strength_min: 40 }))), "triathlon")).toBeUndefined();
  });
  it("each health card says what is missing", () => {
    const only = buildProfile(rows(40, () => ({ steps: 9000 })));
    expect(need(only, "sleep")).toBe("sleep");
    expect(need(only, "recovery")).toBe("recovery");
    expect(need(only, "steps")).toBeNull();
    const noSteps = buildProfile(rows(40, () => ({ sleep_score: 80 })));
    expect(need(noSteps, "steps")).toBe("steps");
    expect(need(noSteps, "sleep")).toBeNull();
  });
  it("the year needs two months, the race needs a race", () => {
    expect(need(buildProfile(all(59)), "year")).toBe("history");
    expect(need(buildProfile(all(60)), "year")).toBeNull();
    expect(need(buildProfile(all(40)), "race")).toBe("race");
    expect(need(buildProfile(all(40)), "race", { races: "2026-12-06" })).toBeNull();
    expect(need(buildProfile(all(40)), "race", { races: "Races" })).toBeNull();
  });
  it("everything needs some data first", () => {
    const empty = listTemplates(buildProfile([]), { source: SRC });
    for (const t of empty.filter((x) => ["overview", "glance", "week", "month", "race"].includes(x.id))) expect(t.need, t.id).toBe("data");
  });
  it("chooses sports from the data even when the options name fewer", () => {
    expect(ids(buildProfile(all(40)), { sports: ["run"] })).toContain("sport:swim");
  });
});

describe("morning glance", () => {
  it("four latest numbers, then the week against usual", () => {
    const r = compose(buildProfile(all(40)), opts("glance"));
    expect(r.log.blocks).toEqual(["glance.now", "glance.week"]);
    expect(r.markdown).toContain("columns: 4");
    expect(r.markdown).toContain("trend: 14d");
    expect(r.markdown).toContain("compare: usual");
  });
  it("takes what exists: three days of steps only", () => {
    const r = compose(buildProfile(rows(3, () => ({ steps: 100 }))), opts("glance"));
    expect(r.log.blocks).toEqual(["glance.now"]);
    expect(r.markdown).not.toContain("trend");
  });
});

describe("sleep", () => {
  it("counts nights over 80 this month and the streak of 7 hour nights", () => {
    const md = compose(buildProfile(all(40)), opts("sleep")).markdown;
    expect(md).toContain('where: "sleep_score >= 80"');
    expect(md).toContain("agg: current_streak");
    expect(md).toContain("at_least: 7h");
    expect(md).toContain("goal: 7h");
  });
  it("a year map shades by score when there is one and by duration when there is not", () => {
    expect(compose(buildProfile(all(40)), opts("sleep")).markdown).toContain("bands: [85, 75, 60]");
    const dur = compose(buildProfile(rows(40, () => ({ sleep_duration: "7h 0min" }))), opts("sleep")).markdown;
    expect(dur).toContain("bands: [8h, 7h, 6h]");
    expect(dur).not.toContain("sleep_score");
  });
  it("no year map before a month of data", () => {
    expect(compose(buildProfile(all(29)), opts("sleep")).log.blocks).not.toContain("sleep.heatmap.year");
    expect(compose(buildProfile(all(30)), opts("sleep")).log.blocks).toContain("sleep.heatmap.year");
  });
});

describe("recovery", () => {
  it("one chart per heart signal and one for energy and stress", () => {
    const r = compose(buildProfile(all(40)), opts("recovery"));
    expect(r.log.blocks).toEqual(expect.arrayContaining(["recovery.chart.hrv", "recovery.chart.resting_hr", "recovery.chart.energy", "recovery.good", "recovery.heatmap.hrv"]));
    expect(r.markdown).toContain("where: stress <= 25");
    expect(r.markdown).toContain('where: "body_battery >= 80"');
  });
  it("leaves out what the watch does not measure", () => {
    const md = compose(buildProfile(rows(40, (i) => ({ hrv: 40 + (i % 5) }))), opts("recovery")).markdown;
    expect(md).not.toContain("body_battery");
    expect(md).not.toContain("stress");
    expect(md).not.toContain("resting_hr");
  });
});

describe("steps", () => {
  it("has the streaks, the month and a goal from the last 28 days", () => {
    const r = compose(buildProfile(all(40)), opts("steps"));
    expect(r.log.blocks).toEqual(expect.arrayContaining(["steps.cards", "steps.month", "steps.goal", "steps.chart.days", "steps.chart.weeks", "steps.heatmap.year"]));
    expect(r.markdown).toContain("agg: streak");
    expect(r.markdown).toContain('where: "steps >= 10000"');
    expect(r.markdown).toMatch(/goal: \d+/);
  });
  it("is small after three days", () => {
    expect(compose(buildProfile(rows(3, () => ({ steps: 100 }))), opts("steps")).log.blocks).toEqual(["steps.cards"]);
  });
});

describe("sport", () => {
  const md = (sport: string, extra: object = {}, n = 60) => compose(buildProfile(convertRecords(all(n), "imperial")), opts(`sport:${sport}`, extra)).markdown;

  it("a run is measured in kilometers, then miles, and its title names the sport", () => {
    const km = md("run");
    expect(km).toContain("field: run_km");
    expect(km).not.toMatch(/run_mi\b/);
    expect(km).toContain("# 🏃 Run");
    const mi = md("run", { units: "imperial" });
    expect(mi).toContain("field: run_mi");
    expect(mi).not.toContain("run_km");
  });
  it("a swim is measured in yards in the imperial system", () => {
    const yd = md("swim", { units: "imperial" });
    expect(yd).toContain("field: swim_yd");
    expect(yd).toContain("unit: yd");
  });
  it("a sport page is about its own sport only", () => {
    const run = md("run");
    for (const other of ["bike_", "swim_", "strength_"]) expect(run).not.toContain(other);
  });
  it("lifting has no distance and pairs with sleep and energy; the others pair with heart signals", () => {
    const s = md("strength");
    expect(s).not.toContain("_km");
    expect(s).not.toContain("distance");
    expect(s).toContain("title: Sleep / Body Battery");
    const r = md("run");
    expect(r).toContain("title: HRV / Resting HR");
    expect(r).not.toContain("Sleep / Body Battery");
  });
  it("counts sessions as days with minutes", () => {
    const r = md("run");
    expect(r).toContain('where: "run_min > 0"');
    expect(r).toContain("agg: count");
  });
  it("sets the weekly line from the last four weeks and the month goal with it", () => {
    const r = compose(buildProfile(all(60)), opts("sport:run"));
    expect(r.log.blocks).toEqual(expect.arrayContaining(["sport.goal", "sport.chart.volume", "sport.chart.sessions", "sport.chart.recovery", "sport.heatmap.month", "sport.heatmap.year"]));
    expect(r.markdown).toMatch(/goal: \d+/);
  });
  it("falls back to minutes when a sport has no distance in the notes", () => {
    const m = compose(buildProfile(rows(40, (i) => ({ ...body(i), run_min: 40 }))), opts("sport:run")).markdown;
    expect(m).toContain("field: run_min");
    expect(m).not.toContain("run_km");
  });
  it("a sport that is not in the data builds the empty note", () => {
    const r = compose(buildProfile(rows(40, body)), opts("sport:swim"));
    expect(r.log.blocks).toEqual([]);
    expect(r.markdown).toContain("Not enough data");
  });
  it("is small in the first days", () => {
    const r = compose(buildProfile(all(3)), opts("sport:run"));
    expect(r.log.blocks).toEqual(["sport.week"]);
    expect(r.markdown).toContain("a week of data");
  });
});

describe("triathlon", () => {
  it("shows the three sports, and the brick days with bike and run", () => {
    const r = compose(buildProfile(all(60)), opts("triathlon"));
    expect(r.log.blocks).toEqual(expect.arrayContaining(["tri.distance", "tri.time", "tri.brick", "tri.chart.minutes", "tri.heatmap.month", "tri.heatmap.year", "tri.goals", "tri.recovery", "races.countdown"]));
    expect(r.markdown).toContain('where: "bike_min > 0 and run_min > 0"');
    for (const s of ["swim_km", "bike_km", "run_km"]) expect(r.markdown).toContain(s);
    expect(r.markdown).not.toContain("strength");
  });
  it("with only swim and run there are no brick days and the page still stands", () => {
    const r = compose(buildProfile(rows(60, (i) => ({ ...body(i), swim_km: 1, swim_min: 30, run_km: 5, run_min: 30 }))), opts("triathlon"));
    expect(r.log.blocks).not.toContain("tri.brick");
    expect(r.markdown).not.toContain("bike");
  });
  it("grows with the data: a bike that shows up later is included on rebuild", () => {
    const early = rows(60, (i) => ({ ...body(i), swim_km: 1, swim_min: 30, run_km: 5, run_min: 30 }));
    const meta: RegionMeta = { v: 1, source: SRC, groups: [], noSports: [], lang: "en", races: null, template: "triathlon" };
    const first = compose(buildProfile(early), { source: SRC, template: "triathlon" });
    const note = withMeta(`# t\n\n${wrapRegion(splitComposed(first.markdown).body)}\n`, meta);
    expect(note).not.toContain("bike_km");
    const later = early.map((r, i) => (i % 4 === 0 ? { ...r, fields: { ...r.fields, bike_km: 30, bike_min: 70 } } : r));
    const res = rebuildNote(note, later, () => true);
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.text).toContain("bike_km");
  });
});

describe("race", () => {
  it("counts down to a date", () => {
    const md = compose(buildProfile(all(60)), opts("race", { races: "2026-12-06" })).markdown;
    expect(md).toContain("date: 2026-12-06");
    expect(md).not.toContain("pick: next");
  });
  it("counts down to the next note in a folder", () => {
    const md = compose(buildProfile(all(60)), opts("race", { races: "Races" })).markdown;
    expect(md).toContain("source: Races");
    expect(md).toContain("pick: next");
  });
  it("writes nothing without a race", () => {
    const r = compose(buildProfile(all(60)), { source: SRC, template: "race" });
    expect(r.log.blocks).toEqual([]);
  });
  it("compares four weeks with the four before, over the sports there are", () => {
    const r = compose(buildProfile(all(60)), opts("race"));
    expect(r.markdown).toContain("period: 28d");
    expect(r.log.blocks).toEqual(expect.arrayContaining(["race.build", "race.chart.weeks", "race.recovery", "race.chart.hr", "race.heatmap.month"]));
  });
  it("the overview takes a date too", () => {
    expect(compose(buildProfile(all(10)), { source: SRC, races: "2026-12-06" }).markdown).toContain("date: 2026-12-06");
  });
  it("a rebuild keeps a date without looking for a folder", () => {
    const meta: RegionMeta = { v: 1, source: SRC, groups: [], noSports: [], lang: "en", races: "2026-12-06", template: "race" };
    const note = withMeta(`# t\n\n${wrapRegion("x")}\n`, meta);
    const res = rebuildNote(note, all(60), () => false);
    expect(res.kind === "ok" && res.text.includes("date: 2026-12-06")).toBe(true);
    expect(readRegionMeta(res.kind === "ok" ? res.text : "")?.races).toBe("2026-12-06");
  });
  it("a rebuild drops a folder that no longer exists", () => {
    const meta: RegionMeta = { v: 1, source: SRC, groups: ["recovery"], noSports: [], lang: "en", races: "Gone" };
    const res = rebuildNote(withMeta(`# t\n\n${wrapRegion("x")}\n`, meta), all(60), () => false);
    expect(res.kind === "ok" && res.text.includes("Gone")).toBe(false);
  });
});

describe("year", () => {
  it("totals, longest, averages and months side by side", () => {
    const r = compose(buildProfile(all(120)), opts("year"));
    expect(r.log.blocks).toEqual(expect.arrayContaining(["year.totals", "year.longest", "year.averages", "year.chart.minutes", "year.chart.sleep_score", "year.chart.hrv", "year.chart.resting_hr", "year.chart.steps", "year.heatmap.sport"]));
    expect(r.markdown).toContain("bucket: month");
    expect(r.markdown).toContain("period: year");
  });
});

describe("weekly and monthly reviews", () => {
  it("count the period the note is named for", () => {
    for (const id of ["week", "month"]) {
      const md = compose(buildProfile(all(40)), opts(id)).markdown;
      expect(md, id).toContain("period: note");
      expect(md, id).toContain("range: note");
    }
  });
  it("the week keeps its streak outside the week", () => {
    const md = compose(buildProfile(all(40)), opts("week")).markdown;
    const streak = fences(md).find((f) => f.body.includes("current_streak"))!;
    expect(streak.body).not.toContain("period");
  });
  it("the monthly review is the one that always was, without the closing line", () => {
    const m = compose(buildProfile(all(40)), { source: SRC, mode: "month" });
    expect(m.markdown).toBe(compose(buildProfile(all(40)), { source: SRC, template: "month" }).markdown);
    expect(m.markdown).not.toContain("Built by Garmy");
    expect(compose(buildProfile(all(40)), opts("week")).markdown).toContain("Built by Garmy");
  });
});

describe("the choice is kept in the note", () => {
  const meta = (template?: string): RegionMeta => ({ v: 1, source: SRC, groups: ["recovery"], noSports: ["swim"], lang: "ru", races: null, ...(template ? { template } : {}) });
  it("writes the template as an eighth field, and leaves the overview with the seven it had", () => {
    expect(encodeMeta(meta("sleep"))).toBe("1|Garmy/data|recovery|swim|ru||" + "|sleep");
    expect(encodeMeta(meta("overview"))).toBe("1|Garmy/data|recovery|swim|ru||");
    expect(encodeMeta(meta())).toBe("1|Garmy/data|recovery|swim|ru||");
  });
  it("reads it back, sport ids included", () => {
    expect(decodeMeta(encodeMeta(meta("sport:run")))?.template).toBe("sport:run");
    expect(decodeMeta(encodeMeta(meta("sleep")))).toEqual(meta("sleep"));
  });
  it("reads a note from before templates as the overview", () => {
    const old = decodeMeta("1|Garmy/data|recovery,activity,training||en||");
    expect(old?.template).toBeUndefined();
  });
  it("a rebuild builds what the note was made as", () => {
    const m = meta("sport:run");
    const note = withMeta(`intro\n\n${wrapRegion("old")}\n\noutro`, { ...m, lang: "en" });
    const res = rebuildNote(note, all(60), () => true);
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    expect(res.text).toContain("field: run_km");
    expect(res.text).toContain("intro");
    expect(res.text).toContain("outro");
    expect(res.text).not.toContain("recovery.now");
    expect(readRegionMeta(res.text)?.template).toBe("sport:run");
  });
  it("replaceRegion keeps the template property", () => {
    const note = withMeta(wrapRegion("a"), meta("year"));
    expect(readRegionMeta(replaceRegion(note, "b", meta("year"))!)?.template).toBe("year");
  });
});

describe("buildTemplate", () => {
  it("is what compose calls for anything but the overview", () => {
    const p = buildProfile(all(40));
    expect(buildTemplate("sleep", p, { source: SRC }).markdown).toBe(compose(p, { source: SRC, template: "sleep" }).markdown);
  });
});
