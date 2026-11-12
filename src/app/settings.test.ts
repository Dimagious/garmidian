import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, Plugin, Setting } from "obsidian-test-mocks/obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { LANGS, SYNC_UI, UI } from "../i18n";
import { makeHarness, type Harness } from "../test/mock-app";
import { GarmySettingTab } from "./settings";

const ui = UI.en;
const sync = SYNC_UI.en;
const KEY_ID = "garmy-garmin-api-key";

interface Row { name?: string; desc?: string; render?: (s: never) => unknown; control?: { type: string; key: string; options?: Record<string, string>; placeholder?: string } }
type Group = { type: "group"; heading?: string; items: Row[] };

const groups = (items: SettingDefinitionItem[]): Group[] => items as unknown as Group[];
const rows = (items: SettingDefinitionItem[]): Row[] => groups(items).flatMap((g) => g.items);
const row = (items: SettingDefinitionItem[], name: string): Row => {
  const found = rows(items).find((r) => r.name === name);
  if (!found) throw new Error(`no settings row named "${name}"`);
  return found;
};

/** Draws a row that has a `render` callback on a mock Setting, the way Obsidian does, and returns the Setting. */
function draw(h: Harness, item: Row): Setting {
  const setting = Setting.create__(createDiv());
  item.render?.(setting.asOriginalType__() as never);
  return setting;
}

const buttons = (s: Setting): HTMLButtonElement[] => Array.from(s.settingEl.querySelectorAll("button"));

describe("GarmySettingTab", () => {
  let h: Harness;
  let tab: GarmySettingTab;
  beforeEach(async () => {
    h = await makeHarness();
    tab = new GarmySettingTab(h.app, h.plugin);
  });

  describe("layout", () => {
    it("is registered by the plugin and marks its container", () => {
      const registered = Plugin.fromOriginalType2__(h.plugin).settingTabs__;
      expect(registered).toHaveLength(1);
      expect(registered[0]).toBeInstanceOf(GarmySettingTab);
      expect(tab.containerEl.hasClass("garmy-settings")).toBe(true);
    });

    it("declares the groups in order, in the interface language", () => {
      expect(groups(tab.getSettingDefinitions()).map((g) => g.heading)).toEqual([ui.setAccount, sync.setLangName, sync.setUnitsName, sync.setSyncName, ui.setFolders, ui.setWizard]);
      h.plugin.settings.language = "de";
      expect(groups(tab.getSettingDefinitions())[0]?.heading).toBe("Konto");
    });

    it("offers automatic language plus every language the plugin ships", () => {
      const control = row(tab.getSettingDefinitions(), sync.setLangName).control;
      expect(Object.keys(control?.options ?? {})).toEqual(["auto", ...LANGS.map((l) => l.code)]);
    });

    it("offers the four sync intervals and the two unit systems", () => {
      const items = tab.getSettingDefinitions();
      expect(Object.keys(row(items, sync.setSyncName).control?.options ?? {})).toEqual(["0", "6", "12", "24"]);
      expect(Object.keys(row(items, sync.setUnitsName).control?.options ?? {})).toEqual(["metric", "imperial"]);
    });

    it("shows the default folders as placeholders", () => {
      const items = tab.getSettingDefinitions();
      expect(row(items, ui.setDataName).control?.placeholder).toBe("Garmy/data");
      expect(row(items, ui.setNotesName).control?.placeholder).toBe("Garmy");
    });
  });

  describe("the key row", () => {
    const keyRow = (): Row => row(tab.getSettingDefinitions(), ui.setKeyName);

    it("says no key is saved and offers no button", () => {
      const s = draw(h, keyRow());
      expect(s.descEl.querySelector(".garmy-keystatus")?.classList.contains("is-none")).toBe(true);
      expect(s.descEl.textContent).toContain(ui.setKeyNone);
      expect(s.descEl.textContent).toContain(`${sync.setLastSyncAt}: ${ui.setNever}`);
      expect(buttons(s)).toHaveLength(0);
    });

    it("says a key is saved and lets the user forget it", () => {
      h.app.secretStorage.setSecret(KEY_ID, "k");
      const update = vi.spyOn(tab, "update");
      const s = draw(h, keyRow());
      expect(s.descEl.querySelector(".garmy-keystatus")?.classList.contains("is-saved")).toBe(true);
      expect(buttons(s).map((b) => b.textContent)).toEqual([ui.setForget]);
      buttons(s)[0]?.click();
      expect(h.plugin.getKey()).toBe("");
      expect(update).toHaveBeenCalledOnce();
    });

    it("tells the user Garmin rejected the key and offers a new one through the wizard", () => {
      h.app.secretStorage.setSecret(KEY_ID, "k");
      h.plugin.settings.keyProblem = "2026-11-06";
      h.plugin.settings.lastSync = "2026-11-01";
      const open = vi.spyOn(h.plugin, "openWizard").mockImplementation(() => undefined);
      const s = draw(h, keyRow());
      expect(s.descEl.querySelector(".garmy-keystatus")?.classList.contains("is-rejected")).toBe(true);
      expect(s.descEl.textContent).toContain(sync.setKeyRejected("2026-11-06"));
      expect(s.descEl.textContent).toContain("2026-11-01");
      expect(buttons(s).map((b) => b.textContent)).toEqual([sync.setReplaceKey, ui.setForget]);
      buttons(s)[0]?.click();
      expect(open).toHaveBeenCalledOnce();
    });

    it("ignores a stale problem when there is no key any more", () => {
      h.plugin.settings.keyProblem = "2026-11-06";
      const s = draw(h, keyRow());
      expect(s.descEl.querySelector(".garmy-keystatus")?.classList.contains("is-none")).toBe(true);
    });
  });

  describe("the action rows", () => {
    it("syncs on demand with a visible result, then redraws", async () => {
      const syncNow = vi.spyOn(h.plugin, "syncNow").mockResolvedValue(undefined);
      const update = vi.spyOn(tab, "update");
      buttons(draw(h, row(tab.getSettingDefinitions(), sync.setSyncNowName)))[0]?.click();
      expect(syncNow).toHaveBeenCalledWith(true);
      await vi.waitFor(() => { expect(update).toHaveBeenCalled(); });
    });

    it("opens the wizard from the wizard row", () => {
      const open = vi.spyOn(h.plugin, "openWizard").mockImplementation(() => undefined);
      const s = draw(h, row(tab.getSettingDefinitions(), ui.setWizardName));
      expect(buttons(s).map((b) => b.textContent)).toEqual([ui.setOpen]);
      buttons(s)[0]?.click();
      expect(open).toHaveBeenCalledOnce();
    });
  });

  describe("control values", () => {
    it("reads the current settings, with the sync interval as a string", () => {
      h.plugin.settings.syncHours = 12;
      h.plugin.settings.units = "imperial";
      h.plugin.settings.language = "fr";
      h.plugin.settings.dataFolder = "D";
      h.plugin.settings.notesFolder = "N";
      expect(["syncHours", "units", "language", "dataFolder", "notesFolder"].map((k) => tab.getControlValue(k))).toEqual(["12", "imperial", "fr", "D", "N"]);
      expect(tab.getControlValue("nope")).toBeUndefined();
    });

    it("saves a language and redraws in it", async () => {
      const update = vi.spyOn(tab, "update");
      await tab.setControlValue("language", "ru");
      expect(h.plugin.settings.language).toBe("ru");
      expect((await h.plugin.loadData() as { language: string }).language).toBe("ru");
      expect(update).toHaveBeenCalledOnce();
    });

    it("falls back to automatic for a language it does not ship", async () => {
      h.plugin.settings.language = "ru";
      await tab.setControlValue("language", "xx");
      expect(h.plugin.settings.language).toBe("auto");
    });

    it("switches units, converts the notes and says so", async () => {
      const setUnits = vi.spyOn(h.plugin, "setUnits").mockResolvedValue(3);
      const notices = vi.spyOn(Notice.prototype, "constructor__");
      await tab.setControlValue("units", "imperial");
      expect(setUnits).toHaveBeenCalledWith("imperial");
      expect(notices).toHaveBeenCalledWith(sync.noticeUnitsChanged, undefined);
    });

    it("does nothing when the unit system is already the chosen one", async () => {
      const setUnits = vi.spyOn(h.plugin, "setUnits");
      const notices = vi.spyOn(Notice.prototype, "constructor__");
      await tab.setControlValue("units", "metric");
      expect(setUnits).not.toHaveBeenCalled();
      expect(notices).not.toHaveBeenCalled();
    });

    it("rejects a unit system that does not exist", async () => {
      const setUnits = vi.spyOn(h.plugin, "setUnits");
      await tab.setControlValue("units", "furlongs");
      expect(setUnits).not.toHaveBeenCalled();
      expect(h.plugin.settings.units).toBe("metric");
    });

    it("saves the sync interval as a number, and 0 for garbage", async () => {
      await tab.setControlValue("syncHours", "24");
      expect(h.plugin.settings.syncHours).toBe(24);
      await tab.setControlValue("syncHours", "soon");
      expect(h.plugin.settings.syncHours).toBe(0);
      expect((await h.plugin.loadData() as { syncHours: number }).syncHours).toBe(0);
    });

    it("trims a folder and falls back to the default when it is emptied", async () => {
      await tab.setControlValue("dataFolder", "  My/data ");
      expect(h.plugin.settings.dataFolder).toBe("My/data");
      await tab.setControlValue("dataFolder", "   ");
      expect(h.plugin.settings.dataFolder).toBe("Garmy/data");
      await tab.setControlValue("notesFolder", "");
      expect(h.plugin.settings.notesFolder).toBe("Garmy");
    });

    it("ignores unknown keys and values of the wrong type, and saves nothing", async () => {
      const save = vi.spyOn(h.plugin, "saveData");
      await tab.setControlValue("whatever", "x");
      await tab.setControlValue("dataFolder", 42);
      await tab.setControlValue("syncHours", 6);
      await tab.setControlValue("language", null);
      expect(save).not.toHaveBeenCalled();
    });
  });
});
