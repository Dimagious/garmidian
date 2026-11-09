// The dashboard library: every kind of dashboard Garmy can build, what each one needs from the data, and how to build it.
// The wizard lists them with `listTemplates` (a template whose data is missing is shown with the reason), the composer
// builds with `buildTemplate`, and a rebuild reads the id from the note, so a dashboard keeps its kind as the data grows.
import { SPORTS } from "./catalog";
import { makeCtx, type ComposeOptions, type ComposeResult, type Ctx } from "./ctx";
import { has } from "./profile";
import { glance, recovery, sleep, steps } from "./tpl-health";
import { month, week } from "./tpl-period";
import { race, sport, triathlon, year } from "./tpl-training";
import type { DataProfile } from "./types";

/** Why a dashboard is not offered yet; the wizard turns each into a sentence in the user's language. */
export type Need = "data" | "sleep" | "recovery" | "steps" | "tri" | "history" | "race";

interface Def {
  id: string;
  /** a Lucide icon for the wizard card */
  icon: string;
  /** the key of the dashboard's name in the labels, which is also its title in the note */
  name: string;
  /** the key of its one-line description in the wizard texts */
  desc: string;
  needs: (p: DataProfile, o: ComposeOptions, sports: string[]) => Need | null;
  build: (c: Ctx) => void;
  /** The closing line "Built by Garmy" is left out of the monthly review, as it always was. */
  footer?: boolean;
}

const anyOf = (p: DataProfile, fields: string[]): boolean => fields.some((f) => has(p, f));

const DEFS: Def[] = [
  { id: "overview", icon: "layout-dashboard", name: "tplOverview", desc: "overview", needs: (p) => (p.days > 0 ? null : "data"), build: () => undefined },
  { id: "glance", icon: "sunrise", name: "tplGlance", desc: "glance", needs: (p) => (anyOf(p, ["sleep_score", "hrv", "resting_hr", "body_battery", "stress", "steps"]) ? null : "data"), build: glance },
  { id: "sleep", icon: "moon", name: "tplSleep", desc: "sleep", needs: (p) => (anyOf(p, ["sleep_score", "sleep_duration"]) ? null : "sleep"), build: sleep },
  { id: "recovery", icon: "heart-pulse", name: "tplRecovery", desc: "recovery", needs: (p) => (anyOf(p, ["hrv", "resting_hr", "body_battery", "stress"]) ? null : "recovery"), build: recovery },
  { id: "steps", icon: "footprints", name: "tplSteps", desc: "steps", needs: (p) => (has(p, "steps") ? null : "steps"), build: steps },
  { id: "triathlon", icon: "medal", name: "tplTriathlon", desc: "triathlon", needs: (_p, _o, sports) => (["swim", "bike", "run"].filter((s) => sports.includes(s)).length >= 2 ? null : "tri"), build: triathlon },
  { id: "race", icon: "flag", name: "tplRace", desc: "race", needs: (p, o) => (p.days === 0 ? "data" : o.races ? null : "race"), build: race },
  { id: "week", icon: "calendar-days", name: "tplWeek", desc: "week", needs: (p) => (p.days > 0 ? null : "data"), build: week },
  { id: "month", icon: "calendar-range", name: "month", desc: "month", needs: (p) => (p.days > 0 ? null : "data"), build: month, footer: false },
  { id: "year", icon: "calendar-check", name: "tplYear", desc: "year", needs: (p) => (p.span >= 60 ? null : "history"), build: year },
];

/** One card in the wizard. `sport` is set for the per-sport dashboards. */
export interface TemplateOption {
  id: string;
  icon: string;
  /** key in the labels for the name; a sport's own id for "sport:run" */
  name: string;
  /** key in the wizard texts for the description */
  desc: string;
  need: Need | null;
  sport?: string;
}

const SPORT_ICONS: Record<string, string> = { run: "timer", bike: "bike", swim: "waves", strength: "dumbbell" };

/** The sports a dashboard can be built for: the ones in the data. */
function dataSports(p: DataProfile, o: ComposeOptions): string[] {
  return makeCtx(p, { ...o, sports: undefined }).sports;
}

/** Everything the library holds, in the order the wizard shows it, each with the reason it is not available yet, if so. */
export function listTemplates(p: DataProfile, o: ComposeOptions): TemplateOption[] {
  const sports = dataSports(p, o);
  const out: TemplateOption[] = [];
  const push = (d: Def): void => { out.push({ id: d.id, icon: d.icon, name: d.name, desc: d.desc, need: d.needs(p, o, sports) }); };
  for (const id of ["overview", "glance", "sleep", "recovery", "steps"]) push(DEFS.find((d) => d.id === id)!);
  for (const s of sports) {
    const sp = SPORTS[s];
    if (sp) out.push({ id: `sport:${s}`, icon: SPORT_ICONS[s] ?? "activity", name: s, desc: sp.dist ? "sportDist" : "sportTime", need: null, sport: s });
  }
  // a triathlon card appears as soon as one of its sports does, and unlocks with the second
  if (["swim", "bike", "run"].some((s) => sports.includes(s))) push(DEFS.find((d) => d.id === "triathlon")!);
  for (const id of ["race", "week", "month", "year"]) push(DEFS.find((d) => d.id === id)!);
  return out;
}

/** The template an options object asks for. Unknown ids fall back to the overview. */
export function resolveTemplate(o: ComposeOptions): string {
  const id = o.template ?? (o.mode === "month" ? "month" : "overview");
  if (id.startsWith("sport:")) return SPORTS[id.slice(6)] ? id : "overview";
  return DEFS.some((d) => d.id === id) ? id : "overview";
}

/** The sports a dashboard of this kind reads, whatever the user ticked: a sport dashboard is about its one sport. */
function sportsFor(id: string, o: ComposeOptions): string[] | undefined {
  if (id.startsWith("sport:")) return [id.slice(6)];
  if (id === "triathlon") return ["swim", "bike", "run"];
  return o.sports;
}

export function buildTemplate(id: string, p: DataProfile, o: ComposeOptions): ComposeResult {
  const c = makeCtx(p, { ...o, sports: sportsFor(id, o) });
  const sportId = id.startsWith("sport:") ? id.slice(6) : null;
  const def = sportId ? null : DEFS.find((d) => d.id === id)!;
  const title = sportId ? `${SPORTS[sportId]!.icon} ${c.lbl(sportId)}` : c.t[def!.name] ?? "";
  c.open(title);
  if (p.span < 7) c.out.push(`> ${c.t.waitWeek} ${p.days}.`);
  if (sportId) sport(c, sportId);
  else def!.build(c);
  if (!c.blocks.length) c.out.push(`> ${c.t.tplEmpty}`);
  return c.finish(def?.footer !== false);
}

