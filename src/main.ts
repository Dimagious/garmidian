import { Notice, Plugin, PluginSettingTab, Setting, getLanguage, requestUrl, setIcon, type App } from "obsidian";
import { GarminClient, iso, type Http } from "./api/client";
import type { Lang } from "./core/catalog";
import { WizardModal } from "./app/wizard";
import { UI } from "./app/i18n";
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
    this.addRibbonIcon("layout-dashboard", UI[this.lang()].ribbon, () => this.openWizard());
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
    const ui = UI[this.plugin.lang()];
    el.empty();
    el.addClass("garmy-settings");

    new Setting(el).setName(ui.setAccount).setHeading();
    const hasKey = this.plugin.getKey() !== "";
    const keyRow = new Setting(el).setName(ui.setKeyName);
    keyRow.descEl.empty();
    const line = keyRow.descEl.createDiv({ cls: `garmy-keystatus ${hasKey ? "is-saved" : "is-none"}` });
    setIcon(line.createSpan({ cls: "garmy-keystatus-icon", attr: { "aria-hidden": "true" } }), hasKey ? "shield-check" : "key-round");
    line.createSpan({ text: hasKey ? ui.setKeySaved : ui.setKeyNone });
    keyRow.descEl.createDiv({ cls: "garmy-keystatus-sub", text: `${ui.setLastSync}: ${this.plugin.settings.lastSync || ui.setNever}` });
    if (hasKey) keyRow.addButton((b) => b.setButtonText(ui.setForget).setWarning().onClick(() => { this.plugin.setKey(""); this.display(); }));

    new Setting(el).setName(ui.setFolders).setHeading();
    new Setting(el).setName(ui.setDataName).setDesc(ui.setDataDesc).addText((t) => t.setValue(this.plugin.settings.dataFolder).onChange(async (v) => { this.plugin.settings.dataFolder = v.trim() || "Garmy/data"; await this.plugin.saveSettings(); }));
    new Setting(el).setName(ui.setNotesName).setDesc(ui.setNotesDesc).addText((t) => t.setValue(this.plugin.settings.notesFolder).onChange(async (v) => { this.plugin.settings.notesFolder = v.trim() || "Garmy"; await this.plugin.saveSettings(); }));

    new Setting(el).setName(ui.setWizard).setHeading();
    new Setting(el).setName(ui.setWizardName).setDesc(ui.setWizardDesc).addButton((b) => b.setButtonText(ui.setOpen).setCta().onClick(() => this.plugin.openWizard()));
  }
}
