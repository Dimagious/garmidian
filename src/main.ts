import { Notice, Plugin, PluginSettingTab, Setting, getLanguage, requestUrl, type App } from "obsidian";
import { GarminClient, iso, type Http } from "./api/client";
import type { Lang } from "./core/catalog";
import { WizardModal } from "./app/wizard";
import { writeDays } from "./app/storage";

export interface GarmySettings { dataFolder: string; notesFolder: string; racesFolder: string; lastSync: string }
const DEFAULTS: GarmySettings = { dataFolder: "Garmy/data", notesFolder: "Garmy", racesFolder: "", lastSync: "" };
const SECRET_ID = "garmy-garmin-api-key";

export default class GarmyPlugin extends Plugin {
  settings: GarmySettings = { ...DEFAULTS };

  /** Transport through Obsidian's requestUrl: no CORS, works on mobile. */
  readonly http: Http = async (req) => {
    const r = await requestUrl({ url: req.url, method: req.method, headers: req.headers, throw: false });
    return { status: r.status, text: r.text };
  };

  async onload(): Promise<void> {
    this.settings = { ...DEFAULTS, ...(await this.loadData() as Partial<GarmySettings> | null) };
    this.addRibbonIcon("layout-dashboard", "Garmy", () => this.openWizard());
    this.addCommand({ id: "open-wizard", name: "Build a Garmin dashboard", callback: () => this.openWizard() });
    this.addCommand({ id: "sync-recent", name: "Sync the last 14 days from Garmin", callback: () => void this.syncRecent() });
    this.addSettingTab(new GarmySettingTab(this.app, this));
  }

  lang(): Lang { return getLanguage().startsWith("ru") ? "ru" : "en"; }
  getKey(): string { return this.app.secretStorage.getSecret(SECRET_ID) ?? ""; }
  setKey(key: string): void { this.app.secretStorage.setSecret(SECRET_ID, key); }
  hasDashy(): boolean { return Boolean((this.app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins?.dashsidian); }
  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  openWizard(): void { new WizardModal(this.app, this, this.lang()).open(); }

  async syncRecent(): Promise<void> {
    const key = this.getKey();
    if (!key) { new Notice("Garmy: no key. Run the wizard first."); return; }
    try {
      const res = await new GarminClient(this.http, key).backfill(iso(Date.now() - 13 * 864e5), iso(Date.now()));
      const w = await writeDays(this.app, this.settings.dataFolder, res.records);
      this.settings.lastSync = iso(Date.now());
      await this.saveSettings();
      new Notice(`Garmy: ${res.records.length} days, ${w.created} new, ${w.updated} updated`);
    } catch (e) {
      new Notice(`Garmy: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

class GarmySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: GarmyPlugin) { super(app, plugin); }

  display(): void {
    const el = this.containerEl;
    el.empty();
    new Setting(el).setName("Data folder").setDesc("One note per day with Garmin numbers in its properties.").addText((t) => t.setValue(this.plugin.settings.dataFolder).onChange(async (v) => { this.plugin.settings.dataFolder = v.trim() || "Garmy/data"; await this.plugin.saveSettings(); }));
    new Setting(el).setName("Dashboards folder").setDesc("Where the wizard creates dashboard notes.").addText((t) => t.setValue(this.plugin.settings.notesFolder).onChange(async (v) => { this.plugin.settings.notesFolder = v.trim() || "Garmy"; await this.plugin.saveSettings(); }));
    new Setting(el).setName("Personal API key").setDesc(this.plugin.getKey() ? "A key is saved in Obsidian's secure storage." : "No key saved. Run the wizard.").addButton((b) => b.setButtonText("Forget key").onClick(() => { this.plugin.setKey(""); this.display(); }));
    new Setting(el).setName("Open the wizard").addButton((b) => b.setButtonText("Open").setCta().onClick(() => this.plugin.openWizard()));
  }
}
