import { PluginSettingTab, setIcon, type App, type SettingDefinitionItem } from "obsidian";
import { UI } from "./i18n";
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
    return [
      {
        type: "group",
        heading: ui.setAccount,
        items: [{
          name: ui.setKeyName,
          render: (setting) => {
            // Read when the row is drawn: Obsidian collects the definitions earlier, for search.
            const hasKey = this.plugin.getKey() !== "";
            const line = setting.descEl.createDiv({ cls: `garmy-keystatus ${hasKey ? "is-saved" : "is-none"}` });
            setIcon(line.createSpan({ cls: "garmy-keystatus-icon", attr: { "aria-hidden": "true" } }), hasKey ? "shield-check" : "key-round");
            line.createSpan({ text: hasKey ? ui.setKeySaved : ui.setKeyNone });
            setting.descEl.createDiv({ cls: "garmy-keystatus-sub", text: `${ui.setLastSync}: ${this.plugin.settings.lastSync || ui.setNever}` });
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
    return key === "dataFolder" || key === "notesFolder" ? this.plugin.settings[key] : undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (typeof value !== "string" || (key !== "dataFolder" && key !== "notesFolder")) return;
    this.plugin.settings[key] = value.trim() || FALLBACK[key];
    await this.plugin.saveSettings();
  }
}
