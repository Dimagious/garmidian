import { TFile, normalizePath, type App } from "obsidian";
import { isoParser, type DayParser } from "../core/dayname";
import { changesFor } from "../core/merge";
import type { NoteProps } from "../core/detect";
import type { Units } from "../core/catalog";
import { convertFields } from "../core/units";
import type { DayRecord } from "../core/types";

const yamlValue = (v: number | string): string => (typeof v === "string" ? JSON.stringify(v) : String(v));

async function ensureFolder(app: App, folder: string): Promise<void> {
  const parts = normalizePath(folder).split("/");
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(cur)) await app.vault.createFolder(cur);
  }
}

export interface WriteResult { created: number; updated: number; untouched: number }
export interface WriteOptions {
  /** Days on or after this date are overwritten with Garmin's latest numbers; earlier ones only get gaps filled. */
  overwriteFrom?: string;
}

/**
 * One note per day. See core/merge.ts for which fields change. A note that would not change is not
 * rewritten: a year of identical files would otherwise churn the sync of iCloud or git for nothing.
 */
export async function writeDays(app: App, folder: string, records: DayRecord[], opts: WriteOptions = {}): Promise<WriteResult> {
  await ensureFolder(app, folder);
  const res: WriteResult = { created: 0, updated: 0, untouched: 0 };
  for (const { date, fields } of records) {
    const path = normalizePath(`${folder}/${date}.md`);
    const overwrite = opts.overwriteFrom !== undefined && date >= opts.overwriteFrom;
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const cached = app.metadataCache.getFileCache(existing)?.frontmatter;
      if (cached && Object.keys(changesFor(cached, fields, overwrite)).length === 0) { res.untouched++; continue; }
      let changed = false;
      await app.fileManager.processFrontMatter(existing, (fm: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(changesFor(fm, fields, overwrite))) { fm[k] = v; changed = true; }
      });
      if (changed) res.updated++; else res.untouched++;
    } else {
      const body = Object.entries(fields).map(([k, v]) => `${k}: ${yamlValue(v)}`).join("\n");
      await app.vault.create(path, `---\n${body}\n---\n`);
      res.created++;
    }
  }
  return res;
}

/**
 * Adds the distance fields a unit system needs to every day note of a folder, from the other unit system.
 * Notes that need nothing are not touched. Returns how many notes changed.
 */
export async function convertDays(app: App, folder: string, units: Units): Promise<number> {
  const dir = app.vault.getFolderByPath(normalizePath(folder));
  if (!dir) return 0;
  let changed = 0;
  for (const f of dir.children) {
    if (!(f instanceof TFile) || !f.name.endsWith(".md")) continue;
    const cached = app.metadataCache.getFileCache(f)?.frontmatter;
    if (!cached || Object.keys(convertFields(cached, units)).length === 0) continue;
    await app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(convertFields(fm, units))) fm[k] = v;
    });
    changed++;
  }
  return changed;
}

/**
 * Reads the day notes of one folder back (for a returning user). Waits for the metadata cache to know new files.
 * Looks only at that folder's children: it does not walk the whole vault.
 */
export function readRows(app: App, folder: string, parse: DayParser = isoParser): DayRecord[] {
  const dir = app.vault.getFolderByPath(normalizePath(folder));
  if (!dir) return [];
  const rows: DayRecord[] = [];
  for (const f of dir.children) {
    if (!(f instanceof TFile)) continue;
    const date = f.name.endsWith(".md") ? parse(f.name.slice(0, -3)) : null;
    if (!date) continue;
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (!fm) continue;
    const fields: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(fm)) if (typeof v === "number" || typeof v === "string") fields[k] = v;
    delete fields.position;
    rows.push({ date, fields });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The properties of every note the metadata cache knows, to detect where Garmin numbers already live.
 * This is the only place that walks the whole vault, and it runs only when the user clicks "Look for those notes".
 * It reads properties from the cache; it opens no file.
 */
export function scanNotes(app: App): NoteProps[] {
  const out: NoteProps[] = [];
  for (const f of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (fm) out.push({ path: f.path, props: fm });
  }
  return out;
}

export async function uniquePath(app: App, folder: string, name: string): Promise<string> {
  await ensureFolder(app, folder);
  let path = normalizePath(`${folder}/${name}.md`);
  for (let i = 2; app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${folder}/${name} ${i}.md`);
  return path;
}
