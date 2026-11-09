// Finds folders that already hold Garmin numbers in note properties (for example from Garmin Health Sync),
// so a user who has them does not need to load anything.
import { METRICS, SPORTS } from "./catalog";
import { isoParser, type DayParser } from "./dayname";

const KNOWN = new Set<string>([
  ...Object.keys(METRICS),
  ...Object.values(SPORTS).flatMap((s) => [s.min, ...(s.dist ? [s.dist.metric.field, s.dist.imperial.field] : [])]),
]);

export interface NoteProps { path: string; props: Record<string, unknown> }
export interface FolderCandidate { folder: string; notes: number; fields: string[] }

/** A note counts when its name is a date and it carries at least two numbers Garmy knows. */
export function detectDataFolders(notes: NoteProps[], parse: DayParser = isoParser, minNotes = 5): FolderCandidate[] {
  const byFolder = new Map<string, { notes: number; fields: Set<string> }>();
  for (const { path, props } of notes) {
    const slash = path.lastIndexOf("/");
    const name = path.slice(slash + 1);
    if (!name.endsWith(".md") || parse(name.slice(0, -3)) === null) continue;
    const known = Object.keys(props).filter((k) => KNOWN.has(k) && props[k] !== null && props[k] !== "");
    if (known.length < 2) continue;
    const folder = slash < 0 ? "" : path.slice(0, slash);
    const entry = byFolder.get(folder) ?? { notes: 0, fields: new Set<string>() };
    entry.notes++;
    for (const k of known) entry.fields.add(k);
    byFolder.set(folder, entry);
  }
  return [...byFolder.entries()]
    .filter(([, v]) => v.notes >= minNotes)
    .map(([folder, v]) => ({ folder, notes: v.notes, fields: [...v.fields].sort() }))
    .sort((a, b) => b.notes - a.notes);
}
