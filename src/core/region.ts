// A dashboard lives between two short comment markers, so it can be rebuilt later without touching anything the
// user wrote around it. The choices it was built with live in one note property, `garmy`, not in the text:
// Live Preview shows comments, and a long line of JSON above the dashboard would be seen on every visit.
//
//   ---
//   garmy: "1|Garmy/data|recovery,activity,training||en||"
//   ---
//   %% garmy:start %%
//   ...generated blocks...
//   %% garmy:end %%
import type { Lang } from "./catalog";

export interface RegionMeta {
  v: 1;
  source: string;
  groups: string[];
  /** Sports the user switched off. A sport that appears in the data later is included on rebuild. */
  noSports: string[];
  lang: Lang;
  races: string | null;
  /** How the source notes are named, when they are not ISO dates (notes the user already had). */
  dayFormat?: string;
}

export const START = "%% garmy:start %%";
export const END = "%% garmy:end %%";
const REGION = /%% garmy:start %%\n([\s\S]*?)\n%% garmy:end %%/;
const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const PROP = /^garmy:[^\n]*$/m;

const esc = (s: string): string => s.replace(/%/g, "%25").replace(/\|/g, "%7C").replace(/,/g, "%2C");
const unesc = (s: string): string => s.replace(/%2C/g, ",").replace(/%7C/g, "|").replace(/%25/g, "%");
const list = (s: string): string[] => (s === "" ? [] : s.split(",").map(unesc));

/** The value of the `garmy` property: version | source | groups | sports switched off | language | races | day format. */
export function encodeMeta(m: RegionMeta): string {
  return ["1", esc(m.source), m.groups.map(esc).join(","), m.noSports.map(esc).join(","), m.lang, esc(m.races ?? ""), esc(m.dayFormat ?? "")].join("|");
}

export function decodeMeta(value: string): RegionMeta | null {
  const p = value.split("|");
  if (p.length < 7 || p[0] !== "1") return null;
  const [, source, groups, noSports, lang, races, dayFormat] = p as [string, string, string, string, string, string, string];
  if (source === "") return null;
  return {
    v: 1, source: unesc(source), groups: list(groups), noSports: list(noSports), lang: (lang as Lang),
    races: races === "" ? null : unesc(races), ...(dayFormat === "" ? {} : { dayFormat: unesc(dayFormat) }),
  };
}

export interface Composed { frontmatter: string; title: string; body: string }

/** Splits composed markdown into its frontmatter, its first heading and the rest. */
export function splitComposed(markdown: string): Composed {
  const fm = /^---\n[\s\S]*?\n---\n\n?/.exec(markdown);
  const rest = fm ? markdown.slice(fm[0].length) : markdown;
  const h1 = /^# [^\n]*\n\n?/.exec(rest);
  return { frontmatter: fm ? fm[0].trimEnd() : "", title: h1 ? h1[0].trim() : "", body: (h1 ? rest.slice(h1[0].length) : rest).trim() };
}

/** Blank lines keep the markers out of the first and last paragraph of the dashboard. */
export function wrapRegion(body: string): string {
  return `${START}\n\n${body.trim()}\n\n${END}`;
}

/** Sets the `garmy` property in the note's frontmatter, adding the frontmatter when there is none. */
export function withMeta(note: string, meta: RegionMeta): string {
  const line = `garmy: ${JSON.stringify(encodeMeta(meta))}`;
  const fm = FRONTMATTER.exec(note);
  if (!fm) return `---\n${line}\n---\n\n${note}`;
  const block = fm[1] ?? "";
  const next = PROP.test(block) ? block.replace(PROP, () => line) : `${block}\n${line}`;
  return `---\n${next}\n---\n${note.slice(fm[0].length)}`;
}

/** The choices a dashboard was built with, when the note has both the markers and the property. */
export function readRegionMeta(note: string): RegionMeta | null {
  if (!REGION.test(note)) return null;
  const block = FRONTMATTER.exec(note)?.[1];
  const line = block ? PROP.exec(block)?.[0] : undefined;
  if (!line) return null;
  try {
    const raw: unknown = JSON.parse(line.slice("garmy:".length).trim());
    return typeof raw === "string" ? decodeMeta(raw) : null;
  } catch {
    return null;
  }
}

/** The note with its region replaced and the property refreshed; null when there is no region to replace. */
export function replaceRegion(note: string, body: string, meta: RegionMeta): string | null {
  if (!REGION.test(note)) return null;
  return withMeta(note.replace(REGION, () => wrapRegion(body)), meta);
}
