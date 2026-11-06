import { TFile, normalizePath, type App } from "obsidian";
import { changesFor } from "../core/merge";
import type { DayRecord } from "../core/types";

const DAY = /^(\d{4}-\d{2}-\d{2})\.md$/;
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

/** Reads the day notes back (for a returning user). Waits for the metadata cache to know new files. */
export function readRows(app: App, folder: string): DayRecord[] {
  const prefix = normalizePath(folder) + "/";
  const rows: DayRecord[] = [];
  for (const f of app.vault.getMarkdownFiles()) {
    if (!f.path.startsWith(prefix)) continue;
    const m = DAY.exec(f.name);
    if (!m || !m[1]) continue;
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (!fm) continue;
    const fields: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(fm)) if (typeof v === "number" || typeof v === "string") fields[k] = v;
    delete fields.position;
    rows.push({ date: m[1], fields });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function uniquePath(app: App, folder: string, name: string): Promise<string> {
  await ensureFolder(app, folder);
  let path = normalizePath(`${folder}/${name}.md`);
  for (let i = 2; app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${folder}/${name} ${i}.md`);
  return path;
}
