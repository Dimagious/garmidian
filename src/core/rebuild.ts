// Rebuilding a dashboard in an existing note: the note's own region markers say how it was built.
import { SPORTS, type Units } from "./catalog";
import { isRaceDate } from "./blocks";
import { compose } from "./compose";
import { buildProfile } from "./profile";
import { readRegionMeta, replaceRegion, splitComposed } from "./region";
import type { DayRecord } from "./types";

export type RebuildResult =
  | { kind: "ok"; text: string; blocks: string[] }
  | { kind: "no-region" }
  | { kind: "no-data" };

/**
 * @param note       the full text of the note
 * @param rows       the day records found in the region's source folder
 * @param folderExists  tells whether the races folder named in the region still exists
 * @param units      the user's current choice: a rebuild follows it, so switching to miles and rebuilding redraws in miles
 */
export function rebuildNote(note: string, rows: DayRecord[], folderExists: (path: string) => boolean, units: Units = "metric"): RebuildResult {
  const meta = readRegionMeta(note);
  if (!meta) return { kind: "no-region" };
  const profile = buildProfile(rows);
  if (profile.days === 0) return { kind: "no-data" };
  // a race can be one date, which needs no folder; a folder that has since been renamed is dropped
  const races = meta.races && (isRaceDate(meta.races) || folderExists(meta.races)) ? meta.races : null;
  const composed = compose(profile, { source: meta.source, lang: meta.lang, groups: meta.groups, sports: Object.keys(SPORTS).filter((k) => !meta.noSports.includes(k)), races, units, template: meta.template });
  const text = replaceRegion(note, splitComposed(composed.markdown).body, { ...meta, races });
  return text === null ? { kind: "no-region" } : { kind: "ok", text, blocks: composed.log.blocks };
}
