import { Notice, Plugin, getLanguage, requestUrl } from "obsidian";
import { GarminClient, GarminError, type Http, type Scheduler } from "./api/client";
import type { Lang, Units } from "./core/catalog";
import { addDays, localDate } from "./core/dates";
import { ISO_FORMAT } from "./core/dayname";
import { overwriteFrom } from "./core/merge";
import { defaultUnits } from "./core/units";
import { shouldAutoSync, syncWindowDays } from "./core/schedule";
import { USUAL_GOAL_SCHEMA, readDashyApi, schemaAtLeast, type DashyApi } from "./core/dashy";
import { WizardModal } from "./app/wizard";
import { LANGS, SYNC_UI, UI, pickLang } from "./i18n";
import { convertDays, writeDays } from "./app/storage";
import { GarmySettingTab } from "./app/settings";
import { rebuildActiveDashboard } from "./app/rebuild";

export interface GarmySettings {
  dataFolder: string; notesFolder: string; racesFolder: string;
  /** Local date of the last successful sync, and when it ran. */
  lastSync: string; lastSyncAt: number;
  /** Interface language: "auto" follows Obsidian. */
  language: "auto" | Lang;
  /** Hours between automatic syncs; 0 turns them off. */
  syncHours: number;
  /** Local date on which Garmin rejected the key, or "" while the key works. */
  keyProblem: string;
  /** Kilometers or miles (yards for swimming) in the notes and on the dashboards. */
  units: Units;
}
const DEFAULTS: GarmySettings = { dataFolder: "Garmy/data", notesFolder: "Garmy", racesFolder: "", lastSync: "", lastSyncAt: 0, language: "auto", syncHours: 6, keyProblem: "", units: "metric" };
const SECRET_ID = "garmy-garmin-api-key";
const DASHY_ID = "dashsidian";
const AUTO_CHECK_MS = 30 * 60 * 1000;
const STARTUP_DELAY_MS = 5000;

export type DashyState = "ready" | "disabled" | "missing";
interface PluginsApi { plugins?: Record<string, unknown>; manifests?: Record<string, unknown>; enablePlugin?: (id: string) => Promise<void> }

export default class GarmyPlugin extends Plugin {
  settings: GarmySettings = { ...DEFAULTS };
  /** True while a sync or the wizard's load is running, so two never write the same notes at once. */
  syncing = false;

  /** Transport through Obsidian's requestUrl: no CORS, works on mobile. */
  readonly http: Http = async (req) => {
    const r = await requestUrl({ url: req.url, method: req.method, headers: req.headers, throw: false });
    return { status: r.status, text: r.text };
  };

  /** requestUrl cannot be aborted, so a silent server is cut off by racing it against a timer. */
  readonly schedule: Scheduler = (ms) => {
    let id = 0;
    const expired = new Promise<never>((_, reject) => {
      id = window.setTimeout(() => reject(new GarminError("network", "Garmin did not answer in time")), ms);
    });
    return { expired, cancel: () => window.clearTimeout(id) };
  };

  async onload(): Promise<void> {
    const saved = await this.loadData() as Partial<GarmySettings> | null;
    // Someone who updates keeps kilometers, which is what Garmy wrote before the setting existed. A fresh install
    // starts in miles only where miles are the everyday unit.
    this.settings = { ...DEFAULTS, units: saved ? "metric" : defaultUnits(navigator.language), ...saved };
    this.addRibbonIcon("layout-dashboard", UI[this.lang()].ribbon, () => this.openWizard());
    this.addCommand({ id: "open-wizard", name: "Build a Garmin dashboard", callback: () => this.openWizard() });
    this.addCommand({ id: "sync-recent", name: "Sync the latest days from Garmin", callback: () => void this.syncNow(true) });
    this.addCommand({ id: "rebuild-dashboard", name: "Rebuild the dashboard in this note", callback: () => void rebuildActiveDashboard(this.app, this.lang(), this.settings.units, this.goalUsual()) });
    this.addSettingTab(new GarmySettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.startAutoSync());
  }

  private autoSyncTimer: number | null = null;

  /** One check shortly after start, then one every half hour. A check syncs only when the interval has passed. */
  startAutoSync(startupDelayMs: number = STARTUP_DELAY_MS): void {
    window.setTimeout(() => void this.maybeAutoSync(), startupDelayMs);
    if (this.autoSyncTimer === null) {
      this.autoSyncTimer = window.setInterval(() => void this.maybeAutoSync(), AUTO_CHECK_MS);
      this.registerInterval(this.autoSyncTimer);
    }
  }

  /** The user's daily note format, so notes named 06.11.2026 or 2026-11-06 are both found. */
  dailyFormat(): string {
    const app = this.app as unknown as {
      plugins?: { plugins?: Record<string, { settings?: { daily?: { format?: string } } } | undefined> };
      internalPlugins?: { getPluginById?: (id: string) => { instance?: { options?: { format?: string } } } | undefined };
    };
    return app.plugins?.plugins?.["periodic-notes"]?.settings?.daily?.format
      || app.internalPlugins?.getPluginById?.("daily-notes")?.instance?.options?.format
      || ISO_FORMAT;
  }

  /** The interface language: the user's choice, else Obsidian's language, else English. */
  lang(): Lang {
    const chosen = this.settings.language;
    return chosen !== "auto" && LANGS.some((l) => l.code === chosen) ? chosen : pickLang(getLanguage());
  }
  getKey(): string { return this.app.secretStorage.getSecret(SECRET_ID) ?? ""; }
  setKey(key: string): void { this.app.secretStorage.setSecret(SECRET_ID, key); }
  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  /** Switches the unit system and fills the notes already on disk, so no request to Garmin is needed. Returns the notes changed. */
  async setUnits(units: Units): Promise<number> {
    this.settings.units = units;
    await this.saveSettings();
    return convertDays(this.app, this.settings.dataFolder, units);
  }
  newClient(key: string = this.getKey()): GarminClient { return new GarminClient(this.http, key, Date.now, undefined, this.schedule); }
  openWizard(): void { new WizardModal(this.app, this, this.lang()).open(); }

  dashyState(): DashyState {
    const p = (this.app as unknown as { plugins?: PluginsApi }).plugins;
    if (p?.plugins?.[DASHY_ID]) return "ready";
    return p?.manifests?.[DASHY_ID] ? "disabled" : "missing";
  }

  /** Dashy's public API, read fresh each time: Dashy may load after Garmy, be turned off or be updated. Null before Dashy 2.2.0. */
  dashyApi(): DashyApi | null {
    return readDashyApi((this.app as unknown as { plugins?: PluginsApi }).plugins?.plugins?.[DASHY_ID]);
  }

  /** The installed Dashy knows `goal: usual`. An older one would show an error in the bar. */
  goalUsual(): boolean {
    const api = this.dashyApi();
    return api !== null && schemaAtLeast(api.schemaVersion, USUAL_GOAL_SCHEMA);
  }

  async enableDashy(): Promise<void> {
    await (this.app as unknown as { plugins?: PluginsApi }).plugins?.enablePlugin?.(DASHY_ID);
  }

  /** Called after any successful load, from the wizard or from a sync. */
  async recordSync(today: string): Promise<void> {
    this.settings.lastSync = today;
    this.settings.lastSyncAt = Date.now();
    this.settings.keyProblem = "";
    await this.saveSettings();
  }

  private async maybeAutoSync(): Promise<void> {
    if (shouldAutoSync(this.settings, this.getKey() !== "", Date.now())) await this.syncNow(false);
  }

  /** Refreshes the days since the last sync (plus a margin) and the three most recent ones are overwritten. */
  async syncNow(manual: boolean): Promise<void> {
    const text = SYNC_UI[this.lang()];
    if (this.syncing) { if (manual) new Notice(text.walkBusy); return; }
    if (!this.getKey()) { if (manual) new Notice(text.noticeNoKey); return; }
    this.syncing = true;
    try {
      const today = localDate(Date.now());
      const back = syncWindowDays(this.settings.lastSync, today);
      const res = await this.newClient().backfill(addDays(today, -back), today, undefined, undefined, this.settings.units);
      await writeDays(this.app, this.settings.dataFolder, res.records, { overwriteFrom: overwriteFrom(today) });
      await this.recordSync(today);
      if (manual) new Notice(text.noticeSynced(res.records.length));
    } catch (e) {
      await this.onSyncError(e, manual);
    } finally {
      this.syncing = false;
    }
  }

  private async onSyncError(e: unknown, manual: boolean): Promise<void> {
    const text = SYNC_UI[this.lang()];
    const kind = e instanceof GarminError ? e.kind : "other";
    if (kind === "auth") {
      const first = !this.settings.keyProblem;
      this.settings.keyProblem = localDate(Date.now());
      await this.saveSettings();
      if (first || manual) this.noticeWithAction(text.noticeKeyRejected, text.noticeReplaceKey);
      return;
    }
    console.error("Garmy: sync failed", e);
    if (!manual) return; // a background failure is retried on its own; only a click earns a message
    new Notice(kind === "network" ? text.noticeOffline : kind === "rate" ? text.noticeRate : text.noticeFailed);
  }

  private noticeWithAction(message: string, label: string): void {
    const notice = new Notice(createFragment((f) => {
      f.createDiv({ text: message });
      const b = f.createEl("button", { text: label, cls: "mod-cta" });
      b.addEventListener("click", () => { notice.hide(); this.openWizard(); });
    }), 0);
  }
}
