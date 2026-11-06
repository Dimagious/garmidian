// A dashboard lives between two comment markers, so it can be rebuilt later without touching
// anything the user wrote around it. The start marker carries the choices the dashboard was built with.
//   %% garmy:start {"v":1,...} %%
//   ...generated blocks...
//   %% garmy:end %%
import type { Lang } from "./catalog";

export interface RegionMeta {
  v: 1;
  source: string;
  groups: string[];
  sports: string[];
  lang: Lang;
  races: string | null;
  /** How the source notes are named, when they are not ISO dates (notes the user already had). */
  dayFormat?: string;
}

const PATTERN = /%% garmy:start (\{[^\n]*?\}) %%\n([\s\S]*?)\n%% garmy:end %%/;

/** `%` is escaped so the JSON can never contain the marker's own `%%`. */
const encode = (meta: RegionMeta): string => JSON.stringify(meta).replace(/%/g, "\\u0025");

export interface Composed { frontmatter: string; title: string; body: string }

/** Splits composed markdown into its frontmatter, its first heading and the rest. */
export function splitComposed(markdown: string): Composed {
  const fm = /^---\n[\s\S]*?\n---\n\n?/.exec(markdown);
  const rest = fm ? markdown.slice(fm[0].length) : markdown;
  const h1 = /^# [^\n]*\n\n?/.exec(rest);
  return { frontmatter: fm ? fm[0].trimEnd() : "", title: h1 ? h1[0].trim() : "", body: (h1 ? rest.slice(h1[0].length) : rest).trim() };
}

export function wrapRegion(body: string, meta: RegionMeta): string {
  // blank lines keep the markers out of the first and last paragraph of the dashboard
  return `%% garmy:start ${encode(meta)} %%\n\n${body.trim()}\n\n%% garmy:end %%`;
}

export function readRegionMeta(note: string): RegionMeta | null {
  const m = PATTERN.exec(note);
  if (!m?.[1]) return null;
  try {
    const raw: unknown = JSON.parse(m[1]);
    if (raw === null || typeof raw !== "object") return null;
    const o = raw as Partial<RegionMeta>;
    if (o.v !== 1 || typeof o.source !== "string" || !Array.isArray(o.groups) || !Array.isArray(o.sports)) return null;
    return { v: 1, source: o.source, groups: o.groups.map(String), sports: o.sports.map(String), lang: o.lang === "en" ? "en" : "ru", races: typeof o.races === "string" ? o.races : null, ...(typeof o.dayFormat === "string" ? { dayFormat: o.dayFormat } : {}) };
  } catch {
    return null;
  }
}

/** The note with its region replaced; null when there is no region to replace. */
export function replaceRegion(note: string, body: string, meta: RegionMeta): string | null {
  if (!PATTERN.test(note)) return null;
  return note.replace(PATTERN, () => wrapRegion(body, meta));
}
