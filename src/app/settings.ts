import { PluginSettingTab, setIcon, type App, type SettingDefinitionItem } from "obsidian";
import { UI } from "./i18n";
import { SYNC_UI } from "./i18n-sync";
import type GarmyPlugin from "../main";

type FolderKey = "dataFolder" | "notesFolder";
const FALLBACK: Record<FolderKey, string> = { dataFolder: "Garmy/data", notesFolder: "Garmy" };

/** The settings tab, declared rather than drawn: Obsidian renders, searches and persists it (1.13+). */
export class GarmySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: GarmyPlugin) {
    super(app, plugin);
    this.containerEl.addClass("garmy-settings");
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const ui = UI[this.plugin.lang()];
    const sync = SYNC_UI[this.plugin.lang()];
    return [
      {
        type: "group",
        heading: ui.setAccount,
        items: [{
          name: ui.setKeyName,
          render: (setting) => {
            // Read when the row is drawn: Obsidian collects the definitions earlier, for search.
            const hasKey = this.plugin.getKey() !== "";
            const rejected = hasKey && this.plugin.settings.keyProblem !== "";
            const line = setting.descEl.createDiv({ cls: `garmy-keystatus ${rejected ? "is-rejected" : hasKey ? "is-saved" : "is-none"}` });
            setIcon(line.createSpan({ cls: "garmy-keystatus-icon", attr: { "aria-hidden": "true" } }), rejected ? "circle-alert" : hasKey ? "shield-check" : "key-round");
            line.createSpan({ text: rejected ? sync.setKeyRejected(this.plugin.settings.keyProblem) : hasKey ? ui.setKeySaved : ui.setKeyNone });
            setting.descEl.createDiv({ cls: "garmy-keystatus-sub", text: `${sync.setLastSyncAt}: ${this.plugin.settings.lastSync || ui.setNever}` });
            if (rejected) setting.addButton((b) => b.setButtonText(sync.setReplaceKey).setCta().onClick(() => this.plugin.openWizard()));
            if (hasKey) {
              setting.addButton((b) => b.setButtonText(ui.setForget).setDestructive().onClick(() => {
                this.plugin.setKey("");
                this.update();
              }));
            }
          },
        }],
      },
      {
        type: "group",
        heading: sync.setSyncName,
        items: [
          {
            name: sync.setSyncName, desc: sync.setSyncDesc,
            control: { type: "dropdown", key: "syncHours", options: { "0": sync.syncOff, "6": sync.sync6, "12": sync.sync12, "24": sync.sync24 } },
          },
          {
            name: sync.setSyncNowName, desc: sync.setSyncNowDesc,
            render: (setting) => { setting.addButton((b) => b.setButtonText(sync.setSyncNow).onClick(() => { void this.plugin.syncNow(true).then(() => this.update()); })); },
          },
        ],
      },
      {
        type: "group",
        heading: ui.setFolders,
        items: [
          { name: ui.setDataName, desc: ui.setDataDesc, control: { type: "text", key: "dataFolder", placeholder: FALLBACK.dataFolder } },
          { name: ui.setNotesName, desc: ui.setNotesDesc, control: { type: "text", key: "notesFolder", placeholder: FALLBACK.notesFolder } },
        ],
      },
      {
        type: "group",
        heading: ui.setWizard,
        items: [{
          name: ui.setWizardName,
          desc: ui.setWizardDesc,
          render: (setting) => {
            setting.addButton((b) => b.setButtonText(ui.setOpen).setCta().onClick(() => this.plugin.openWizard()));
          },
        }],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    if (key === "syncHours") return String(this.plugin.settings.syncHours);
    return key === "dataFolder" || key === "notesFolder" ? this.plugin.settings[key] : undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "syncHours" && typeof value === "string") {
      this.plugin.settings.syncHours = Number(value) || 0;
      await this.plugin.saveSettings();
      return;
    }
    if (typeof value !== "string" || (key !== "dataFolder" && key !== "notesFolder")) return;
    this.plugin.settings[key] = value.trim() || FALLBACK[key];
    await this.plugin.saveSettings();
  }
}
