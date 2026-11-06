import { MarkdownView, Notice, type App } from "obsidian";
import { dayParser, isoParser } from "../core/dayname";
import { rebuildNote } from "../core/rebuild";
import { readRegionMeta } from "../core/region";
import { SYNC_UI } from "../i18n";
import { readRows } from "./storage";
import type { Lang } from "../core/catalog";

/** Rebuilds the Garmy dashboard region of the open note from the data on disk, with the choices it was built with. */
export async function rebuildActiveDashboard(app: App, lang: Lang): Promise<void> {
  const text = SYNC_UI[lang];
  const file = app.workspace.getActiveViewOfType(MarkdownView)?.file;
  if (!file) { new Notice(text.rebuildNoNote); return; }
  const meta = readRegionMeta(await app.vault.read(file));
  if (!meta) { new Notice(text.rebuildNoRegion); return; }
  const custom = meta.dayFormat ? dayParser(meta.dayFormat) : null;
  const rows = readRows(app, meta.source, (name) => isoParser(name) ?? custom?.(name) ?? null);
  const exists = (path: string): boolean => app.vault.getAbstractFileByPath(path) !== null;
  let outcome = "";
  await app.vault.process(file, (data) => {
    const r = rebuildNote(data, rows, exists);
    outcome = r.kind;
    return r.kind === "ok" ? r.text : data;
  });
  new Notice(outcome === "ok" ? text.rebuildDone : outcome === "no-data" ? text.rebuildNoData : text.rebuildNoRegion);
}
