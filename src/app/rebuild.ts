import { MarkdownView, Notice, type App } from "obsidian";
import { compose } from "../core/compose";
import { buildProfile } from "../core/profile";
import { readRegionMeta, replaceRegion, splitComposed } from "../core/region";
import { SYNC_UI } from "./i18n-sync";
import { readRows } from "./storage";
import type { Lang } from "../core/catalog";

/** Rebuilds the Garmy dashboard region of the open note from the data on disk, with the choices it was built with. */
export async function rebuildActiveDashboard(app: App, lang: Lang): Promise<void> {
  const text = SYNC_UI[lang];
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  const file = view?.file;
  if (!file) { new Notice(text.rebuildNoNote); return; }
  const current = await app.vault.read(file);
  const meta = readRegionMeta(current);
  if (!meta) { new Notice(text.rebuildNoRegion); return; }
  const profile = buildProfile(readRows(app, meta.source));
  if (profile.days === 0) { new Notice(text.rebuildNoData); return; }
  const races = meta.races && app.vault.getAbstractFileByPath(meta.races) ? meta.races : null;
  const composed = compose(profile, { source: meta.source, lang: meta.lang, groups: meta.groups, sports: meta.sports, races });
  const body = splitComposed(composed.markdown).body;
  let replaced = false;
  await app.vault.process(file, (data) => {
    const next = replaceRegion(data, body, { ...meta, races });
    replaced = next !== null;
    return next ?? data;
  });
  new Notice(replaced ? text.rebuildDone : text.rebuildNoRegion);
}
