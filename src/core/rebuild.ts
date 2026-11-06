// Rebuilding a dashboard in an existing note: the note's own region markers say how it was built.
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
 */
export function rebuildNote(note: string, rows: DayRecord[], folderExists: (path: string) => boolean): RebuildResult {
  const meta = readRegionMeta(note);
  if (!meta) return { kind: "no-region" };
  const profile = buildProfile(rows);
  if (profile.days === 0) return { kind: "no-data" };
  const races = meta.races && folderExists(meta.races) ? meta.races : null;
  const composed = compose(profile, { source: meta.source, lang: meta.lang, groups: meta.groups, sports: meta.sports, races });
  const text = replaceRegion(note, splitComposed(composed.markdown).body, { ...meta, races });
  return text === null ? { kind: "no-region" } : { kind: "ok", text, blocks: composed.log.blocks };
}
