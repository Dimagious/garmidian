// A checker for the Dashy blocks Garmy writes, built from Dashy's own reference (the tables of keys per block).
// It cannot draw a block, but it catches what a typo or a wrong combination would turn into a warning in the note:
// an unknown key, a card without its field, `compare: usual` on a sum, a chart with both `field` and `series`.
import { parse } from "yaml";

type Obj = Record<string, unknown>;

const KEYS = {
  stats: { root: ["columns", "layout", "items", "source", "tag", "where", "period", "date_field", "date_format"], item: ["label", "source", "tag", "where", "period", "date_field", "date_format", "compare", "better", "field", "agg", "at_least", "at_most", "days", "skip_field", "unit", "precision", "trend", "icon", "sub"] },
  progress: { root: ["columns", "items", "source", "tag", "where", "period", "date_field", "date_format"], item: ["label", "goal", "source", "tag", "where", "period", "date_field", "date_format", "field", "agg", "at_least", "at_most", "days", "skip_field", "unit", "precision", "icon", "sub"] },
  countdown: { root: ["columns", "date_format", "items"], item: ["label", "date", "field", "source", "tag", "where", "pick", "repeat", "icon", "sub"] },
  heatmap: { root: ["source", "tag", "where", "field", "per_day", "date_field", "date_format", "skip_field", "color", "layers", "pick", "bands", "link", "range", "layout", "title"], item: ["field", "color", "label"] },
  chart: { root: ["source", "tag", "where", "date_field", "date_format", "field", "series", "agg", "bucket", "range", "type", "label", "color", "unit", "precision", "goal", "link", "title"], item: ["field", "agg", "label", "color"] },
} as const;
const CARD_AGGS = ["count", "sum", "avg", "min", "max", "latest", "streak", "current_streak"];
const CHART_AGGS = ["sum", "avg", "min", "max", "count"];
const COLORS = ["blue", "green", "cyan", "purple", "pink", "orange", "red", "gray"];

export interface Fence { lang: string; body: string; line: number }

/** The fenced blocks of a note, as Dashy would be handed them. */
export function fences(markdown: string): Fence[] {
  const out: Fence[] = [];
  const re = /^```([\w-]+)\n([\s\S]*?)\n```$/gm;
  for (let m = re.exec(markdown); m; m = re.exec(markdown)) out.push({ lang: m[1]!, body: m[2]!, line: markdown.slice(0, m.index).split("\n").length });
  return out;
}

const only = (o: Obj, allowed: readonly string[], where: string, errs: string[]): void => {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errs.push(`${where}: unknown key "${k}"`);
};

function card(o: Obj, kind: "stats" | "progress", where: string, root: Obj, errs: string[]): void {
  const agg = String(o.agg ?? "count");
  if (!CARD_AGGS.includes(agg)) errs.push(`${where}: unknown agg "${agg}"`);
  if (!["count", "streak", "current_streak"].includes(agg) && typeof o.field !== "string") errs.push(`${where}: agg ${agg} needs a field`);
  if (typeof o.label !== "string" || o.label === "") errs.push(`${where}: no label`);
  if (kind === "progress" && !(o.goal === "usual" || (typeof o.goal === "number" && o.goal > 0))) errs.push(`${where}: a bar needs a goal above zero`);
  if (o.goal === "usual" && o.period === undefined && root.period === undefined) errs.push(`${where}: goal usual without a period`);
  if (o.compare !== undefined) {
    if (o.period === undefined && root.period === undefined) errs.push(`${where}: compare without a period`);
    if (agg === "streak" || agg === "current_streak") errs.push(`${where}: compare on a streak`);
    if (o.compare === "usual" && agg !== "avg") errs.push(`${where}: compare usual needs avg`);
  }
  if (o.better !== undefined && o.compare === undefined) errs.push(`${where}: better without compare`);
  if (o.trend !== undefined && typeof o.field !== "string") errs.push(`${where}: trend needs a field`);
  if ((o.at_least !== undefined || o.at_most !== undefined) && !["streak", "current_streak"].includes(agg)) errs.push(`${where}: at_least on ${agg}`);
  if (o.where !== undefined && typeof o.where !== "string" && !Array.isArray(o.where)) errs.push(`${where}: where must be text`);
  if (typeof o.where === "string" && / or /.test(o.where)) errs.push(`${where}: or is not supported in where`);
}

function validate(f: Fence): string[] {
  const errs: string[] = [];
  const lang = f.lang === "dashy-chart" ? "chart" : f.lang;
  const keys = (KEYS as Record<string, { root: readonly string[]; item: readonly string[] }>)[lang];
  if (!keys) return [`block "${f.lang}" is not a Dashy block`];
  let doc: unknown;
  try { doc = parse(f.body); } catch (e) { return [`${f.lang}: YAML does not parse: ${(e as Error).message}`]; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [`${f.lang}: not a mapping`];
  const root = doc as Obj;
  const at = `${f.lang}@${f.line}`;
  only(root, keys.root, at, errs);

  if (lang === "stats" || lang === "progress" || lang === "countdown") {
    const items = root.items;
    if (!Array.isArray(items) || items.length === 0) errs.push(`${at}: no items`);
    else items.forEach((raw, i) => {
      const it = raw as Obj;
      only(it, keys.item, `${at} item ${i}`, errs);
      if (lang !== "countdown") card(it, lang, `${at} item ${i}`, root, errs);
      else if ((it.date === undefined) === (it.field === undefined)) errs.push(`${at} item ${i}: exactly one of date and field`);
    });
  }

  if (lang === "heatmap") {
    if ((root.field === undefined) === (root.layers === undefined)) errs.push(`${at}: exactly one of field and layers`);
    if (Array.isArray(root.layers)) root.layers.forEach((l, i) => only(l as Obj, keys.item, `${at} layer ${i}`, errs));
    if (root.layers !== undefined && root.color !== undefined) errs.push(`${at}: color with layers`);
    if (root.pick !== undefined && root.layers === undefined) errs.push(`${at}: pick without layers`);
    if (root.layout === "calendar" && !["month", "week", "note"].includes(String(root.range))) errs.push(`${at}: calendar needs range month, week or note`);
    if (root.color !== undefined && !COLORS.includes(String(root.color))) errs.push(`${at}: color ${String(root.color)}`);
  }

  if (lang === "chart") {
    const agg = String(root.agg ?? "sum");
    if (!CHART_AGGS.includes(agg)) errs.push(`${at}: unknown agg "${agg}"`);
    if (root.field !== undefined && root.series !== undefined) errs.push(`${at}: field and series together`);
    if (root.field === undefined && root.series === undefined && agg !== "count") errs.push(`${at}: no field, no series`);
    if (root.series !== undefined) {
      if (!Array.isArray(root.series) || root.series.length > 4) errs.push(`${at}: series must be a list of at most 4`);
      else root.series.forEach((s, i) => {
        only(s as Obj, keys.item, `${at} series ${i}`, errs);
        if (typeof (s as Obj).color === "string" && !COLORS.includes((s as Obj).color as string)) errs.push(`${at} series ${i}: color`);
      });
      if (root.color !== undefined || root.label !== undefined) errs.push(`${at}: color or label with series`);
    }
    if (root.type !== undefined && !["line", "bar"].includes(String(root.type))) errs.push(`${at}: type`);
    if (root.bucket !== undefined && !["day", "week", "month", "year"].includes(String(root.bucket))) errs.push(`${at}: bucket`);
  }
  return errs;
}

/** Every problem in the Dashy blocks of a note. An empty list means the blocks match the reference. */
export function dashyProblems(markdown: string): string[] {
  return fences(markdown).flatMap(validate);
}
