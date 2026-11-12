import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { Notice, Plugin } from "obsidian-test-mocks/obsidian";
import { requestUrl } from "obsidian";
import { GarminError, type BackfillResult } from "./api/client";
import { USUAL_GOAL_SCHEMA } from "./core/dashy";
import { localDate } from "./core/dates";
import { SYNC_UI, UI } from "./i18n";
import { fakeClient, makeHarness, type Harness } from "./test/mock-app";
import { WizardModal } from "./app/wizard";
import GarmyPlugin from "./main";

// requestUrl is the plugin's only door to the network. The mock answers 200 with an empty body; each test that
// needs another answer sets it, and none of them can reach Garmin.
vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<typeof import("obsidian")>();
  return { ...original, requestUrl: vi.fn(original.requestUrl) };
});

const sync = SYNC_UI.en;
const HOUR = 3600e3;
const STARTUP_DELAY_MS = 5000;
const AUTO_CHECK_MS = 30 * 60 * 1000;
/** A fixed "now" in the middle of the local day, so the day arithmetic below is the same in every time zone. */
const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime();
const TODAY = localDate(NOW);

const result = (n: number): BackfillResult => ({
  records: Array.from({ length: n }, (_, i) => ({ date: `2026-11-0${i + 1}`, fields: { steps: 9000 + i, sleep_score: 80 } })),
  warnings: [],
  requests: 1,
});

let h: Harness;
let backfill: ReturnType<typeof vi.fn>;
let notices: MockInstance<Notice["constructor__"]>;

/** A plugin with a key whose client is a fake; `backfill` answers like the real one or fails as the test says. */
async function start(settings: Parameters<typeof makeHarness>[1] = {}, files: Record<string, string> = {}): Promise<void> {
  h = await makeHarness(files, settings);
  h.plugin.setKey("fake-key");
  backfill = vi.fn(() => Promise.resolve(result(3)));
  vi.spyOn(h.plugin, "newClient").mockImplementation(() => fakeClient({ backfill: backfill as never }));
  notices = vi.spyOn(Notice.prototype, "constructor__");
}

const noticeTexts = (): unknown[] => notices.mock.calls.map((c) => c[0]);
const settingsOnDisk = async (): Promise<{ lastSync: string; lastSyncAt: number; keyProblem: string }> =>
  await h.plugin.loadData() as { lastSync: string; lastSyncAt: number; keyProblem: string };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("onload", () => {
  it("starts from the defaults on a fresh install and registers the entry points", async () => {
    h = await makeHarness();
    const mock = Plugin.fromOriginalType2__(h.plugin);
    expect(h.plugin.settings).toMatchObject({ dataFolder: "Garmy/data", notesFolder: "Garmy", language: "auto", syncHours: 6, lastSyncAt: 0, keyProblem: "" });
    expect([...mock.commands__.keys()].sort()).toEqual(["open-wizard", "rebuild-dashboard", "sync-recent"]);
    expect(mock.ribbonActions__).toHaveLength(1);
    expect(mock.settingTabs__).toHaveLength(1);
  });

  it("keeps what was saved, and keeps kilometers for someone who updates", async () => {
    h = await makeHarness();
    await h.plugin.saveData({ syncHours: 12, notesFolder: "Fit" });
    await h.plugin.onload();
    expect(h.plugin.settings).toMatchObject({ syncHours: 12, notesFolder: "Fit", dataFolder: "Garmy/data", units: "metric" });
  });

  it("starts a fresh install in miles on an en-US machine only", async () => {
    h = await makeHarness();
    // No data.json yet: loadData() gives null.
    vi.spyOn(h.plugin, "loadData").mockResolvedValue(null);
    const language = vi.spyOn(navigator, "language", "get");
    language.mockReturnValue("en-US");
    await h.plugin.onload();
    expect(h.plugin.settings.units).toBe("imperial");
    language.mockReturnValue("de-DE");
    await h.plugin.onload();
    expect(h.plugin.settings.units).toBe("metric");
  });

  it("begins the automatic checks only once the workspace layout is ready", async () => {
    h = await makeHarness();
    const startAutoSync = vi.spyOn(h.plugin, "startAutoSync");
    expect(startAutoSync).not.toHaveBeenCalled();
    h.mock.workspace.setLayoutReady__();
    expect(startAutoSync).toHaveBeenCalledOnce();
  });

  it("opens the wizard", async () => {
    h = await makeHarness();
    const open = vi.spyOn(WizardModal.prototype, "open").mockImplementation(() => undefined);
    h.plugin.openWizard();
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.contexts[0]).toBeInstanceOf(WizardModal);
  });

  it("wires the three commands and the ribbon icon to the wizard, the sync and the rebuild", async () => {
    h = await makeHarness();
    const mock = Plugin.fromOriginalType2__(h.plugin);
    const openWizard = vi.spyOn(h.plugin, "openWizard").mockImplementation(() => undefined);
    const syncNow = vi.spyOn(h.plugin, "syncNow").mockResolvedValue(undefined);
    mock.commands__.get("open-wizard")?.callback?.();
    mock.commands__.get("sync-recent")?.callback?.();
    expect(openWizard).toHaveBeenCalledOnce();
    expect(syncNow).toHaveBeenCalledWith(true);
    // The rebuild command reaches the real rebuild: with no note open it says so.
    notices = vi.spyOn(Notice.prototype, "constructor__");
    mock.commands__.get("rebuild-dashboard")?.callback?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(noticeTexts()).toEqual([sync.rebuildNoNote]);
  });
});

describe("automatic sync", () => {
  it("syncs once when the startup delay has passed, not before", async () => {
    await start({ syncHours: 6, lastSyncAt: 0 });
    h.plugin.startAutoSync();
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS - 1);
    expect(backfill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(backfill).toHaveBeenCalledOnce();
    expect(h.plugin.settings.lastSyncAt).toBe(NOW + STARTUP_DELAY_MS);
    expect(h.plugin.settings.lastSync).toBe(TODAY);
  });

  it("takes the delay from its argument", async () => {
    await start({ syncHours: 6, lastSyncAt: 0 });
    h.plugin.startAutoSync(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(backfill).toHaveBeenCalledOnce();
  });

  it("is silent: a background sync shows no notice", async () => {
    await start({ syncHours: 6, lastSyncAt: 0 });
    h.plugin.startAutoSync(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(backfill).toHaveBeenCalledOnce();
    expect(notices).not.toHaveBeenCalled();
  });

  it.each([
    ["automatic sync is turned off", { syncHours: 0, lastSyncAt: 0 }],
    ["the key was rejected earlier", { syncHours: 6, lastSyncAt: 0, keyProblem: "2026-11-01" }],
  ])("does nothing when %s", async (_why, settings) => {
    await start(settings);
    h.plugin.startAutoSync(100);
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(backfill).not.toHaveBeenCalled();
    expect(h.plugin.settings.lastSyncAt).toBe(settings.lastSyncAt);
  });

  it("does nothing without a key, and starts as soon as one is stored", async () => {
    await start({ syncHours: 6, lastSyncAt: 0 });
    h.plugin.setKey("");
    h.plugin.startAutoSync(100);
    await vi.advanceTimersByTimeAsync(AUTO_CHECK_MS - 1);
    expect(backfill).not.toHaveBeenCalled();
    h.plugin.setKey("fake-key");
    await vi.advanceTimersByTimeAsync(1);
    expect(backfill).toHaveBeenCalledOnce();
  });

  it("waits while the last sync is recent, then runs at the first half-hour check after the interval", async () => {
    await start({ syncHours: 6, lastSyncAt: NOW - HOUR });
    h.plugin.startAutoSync(100);
    // Startup check at 100 ms: only 1 h has passed.
    await vi.advanceTimersByTimeAsync(100);
    expect(backfill).not.toHaveBeenCalled();
    // 4.5 h from now is 5.5 h after the last sync: still too early. The check at 5 h from now is the 6 h mark.
    await vi.advanceTimersByTimeAsync(4 * HOUR + 29 * 60 * 1000);
    expect(backfill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(backfill).toHaveBeenCalledOnce();
  });

  it("does not sync again at the next check once it has just synced", async () => {
    await start({ syncHours: 6, lastSyncAt: 0 });
    h.plugin.startAutoSync(100);
    await vi.advanceTimersByTimeAsync(3 * AUTO_CHECK_MS);
    expect(backfill).toHaveBeenCalledOnce();
  });

  it("keeps one half-hour timer however often it is started, and hands it to Obsidian to clear on unload", async () => {
    await start({ syncHours: 6, lastSyncAt: 0 });
    const register = vi.spyOn(h.plugin, "registerInterval");
    h.plugin.startAutoSync(100);
    h.plugin.startAutoSync(100);
    expect(register).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100);
    expect(backfill).toHaveBeenCalled();
  });

  it("does not let an overlapping check start a second sync", async () => {
    await start({ syncHours: 6, lastSyncAt: 0 });
    let finish: (r: BackfillResult) => void = () => undefined;
    backfill.mockImplementation(() => new Promise<BackfillResult>((resolve) => { finish = resolve; }));
    h.plugin.startAutoSync(100);
    h.plugin.startAutoSync(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(backfill).toHaveBeenCalledOnce();
    expect(h.plugin.syncing).toBe(true);
    finish(result(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.plugin.syncing).toBe(false);
  });
});

describe("syncNow", () => {
  it("reads the days since the last sync plus the margin, in the chosen units, and writes them", async () => {
    await start({ lastSync: "2026-11-08", units: "imperial", dataFolder: "Garmy/data" });
    await h.plugin.syncNow(true);
    // Three days since the last sync plus three days of margin.
    expect(backfill).toHaveBeenCalledWith("2026-11-05", TODAY, undefined, undefined, "imperial");
    expect(h.app.vault.getFileByPath("Garmy/data/2026-11-01.md")).not.toBeNull();
    expect(h.app.vault.getFileByPath("Garmy/data/2026-11-03.md")).not.toBeNull();
  });

  it("covers two weeks on the very first sync", async () => {
    await start({ lastSync: "" });
    await h.plugin.syncNow(true);
    expect(backfill).toHaveBeenCalledWith("2026-10-28", TODAY, undefined, undefined, "metric");
  });

  it("overwrites the three latest days and only fills the older ones", async () => {
    const old = (steps: number): string => `---\nsteps: ${steps}\n---\n`;
    await start({ lastSync: "2026-11-08" }, { "Garmy/data/2026-11-01.md": old(1), "Garmy/data/2026-11-10.md": old(1) });
    backfill.mockResolvedValue({ records: [{ date: "2026-11-01", fields: { steps: 500 } }, { date: "2026-11-10", fields: { steps: 500 } }], warnings: [], requests: 1 });
    await h.plugin.syncNow(false);
    const read = async (p: string): Promise<string> => h.app.vault.read(h.app.vault.getFileByPath(p) as never);
    expect(await read("Garmy/data/2026-11-01.md")).toContain("steps: 1");
    expect(await read("Garmy/data/2026-11-10.md")).toContain("steps: 500");
  });

  it("records the sync, clears an earlier key problem, saves, and tells a manual click how many days came", async () => {
    await start({ keyProblem: "2026-11-01" });
    await h.plugin.syncNow(true);
    expect(await settingsOnDisk()).toMatchObject({ lastSync: TODAY, lastSyncAt: NOW, keyProblem: "" });
    expect(noticeTexts()).toEqual([sync.noticeSynced(3)]);
    expect(h.plugin.syncing).toBe(false);
  });

  it("says nothing after a background success", async () => {
    await start();
    await h.plugin.syncNow(false);
    expect(notices).not.toHaveBeenCalled();
  });

  it("refuses to run twice at once: a click says so, a timer stays quiet", async () => {
    await start();
    h.plugin.syncing = true;
    await h.plugin.syncNow(true);
    await h.plugin.syncNow(false);
    expect(backfill).not.toHaveBeenCalled();
    expect(noticeTexts()).toEqual([sync.walkBusy]);
    expect(h.plugin.syncing).toBe(true);
  });

  it("asks for a key when there is none, but only on a click", async () => {
    await start();
    h.plugin.setKey("");
    await h.plugin.syncNow(false);
    expect(notices).not.toHaveBeenCalled();
    await h.plugin.syncNow(true);
    expect(noticeTexts()).toEqual([sync.noticeNoKey]);
    expect(backfill).not.toHaveBeenCalled();
    expect(h.plugin.syncing).toBe(false);
  });

  describe("when Garmin fails", () => {
    let log: MockInstance<Console["error"]>;
    beforeEach(() => { log = vi.spyOn(console, "error").mockImplementation(() => undefined); });

    it.each([
      ["network", new GarminError("network", "offline"), sync.noticeOffline],
      ["rate", new GarminError("rate", "slow down", 429), sync.noticeRate],
      ["http", new GarminError("http", "server", 500), sync.noticeFailed],
      ["an unknown error", new Error("boom"), sync.noticeFailed],
    ])("a click gets the matching message for %s and the sync is released", async (_name, error, message) => {
      await start();
      backfill.mockRejectedValue(error);
      await h.plugin.syncNow(true);
      expect(noticeTexts()).toEqual([message]);
      expect(log).toHaveBeenCalledWith("Garmy: sync failed", error);
      expect(h.plugin.syncing).toBe(false);
      expect(h.plugin.settings.lastSyncAt).toBe(0);
    });

    it("a background failure is logged and retried later, with no message", async () => {
      await start();
      backfill.mockRejectedValue(new GarminError("network", "offline"));
      await h.plugin.syncNow(false);
      expect(notices).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledOnce();
      expect(h.plugin.syncing).toBe(false);
    });

    it("writes nothing when the load fails", async () => {
      await start();
      backfill.mockRejectedValue(new GarminError("network", "offline"));
      await h.plugin.syncNow(true);
      expect(h.app.vault.getFiles().filter((f) => f.path.startsWith("Garmy/data"))).toEqual([]);
    });

    it("remembers a rejected key on that day and offers to replace it, once for the background", async () => {
      await start();
      backfill.mockRejectedValue(new GarminError("auth", "bad key", 401));
      await h.plugin.syncNow(false);
      expect(h.plugin.settings.keyProblem).toBe(TODAY);
      expect((await settingsOnDisk()).keyProblem).toBe(TODAY);
      expect(notices).toHaveBeenCalledOnce();
      expect(notices.mock.calls[0]?.[1]).toBe(0);
      // The second background failure on a key already marked bad stays quiet.
      await h.plugin.syncNow(false);
      expect(notices).toHaveBeenCalledOnce();
      // A click is told again.
      await h.plugin.syncNow(true);
      expect(notices).toHaveBeenCalledTimes(2);
      expect(log).not.toHaveBeenCalled();
    });

    it("shows the rejection with a button that opens the wizard and closes the notice", async () => {
      await start();
      backfill.mockRejectedValue(new GarminError("auth", "bad key", 401));
      const openWizard = vi.spyOn(h.plugin, "openWizard").mockImplementation(() => undefined);
      const hide = vi.spyOn(Notice.prototype, "hide");
      await h.plugin.syncNow(true);
      const fragment = notices.mock.calls[0]?.[0] as DocumentFragment;
      expect(fragment.textContent).toContain(sync.noticeKeyRejected);
      const button = fragment.querySelector("button");
      expect(button?.textContent).toBe(sync.noticeReplaceKey);
      expect(button?.classList.contains("mod-cta")).toBe(true);
      expect(openWizard).not.toHaveBeenCalled();
      button?.click();
      expect(openWizard).toHaveBeenCalledOnce();
      expect(hide).toHaveBeenCalled();
    });
  });

  it("speaks the interface language", async () => {
    await start({ language: "de" });
    h.plugin.setKey("");
    await h.plugin.syncNow(true);
    expect(noticeTexts()).toEqual([SYNC_UI.de.noticeNoKey]);
    expect(SYNC_UI.de.noticeNoKey).not.toBe(sync.noticeNoKey);
  });
});

describe("settings, key and language", () => {
  beforeEach(async () => { h = await makeHarness(); });

  it("keeps the key in Obsidian's secret storage and reads an empty one as none", () => {
    expect(h.plugin.getKey()).toBe("");
    h.plugin.setKey("abc");
    expect(h.plugin.getKey()).toBe("abc");
    expect(JSON.stringify(h.plugin.settings)).not.toContain("abc");
  });

  it("follows the chosen language, else Obsidian's, else English", () => {
    expect(h.plugin.lang()).toBe("en");
    h.plugin.settings.language = "ja";
    expect(h.plugin.lang()).toBe("ja");
    h.plugin.settings.language = "xx" as never;
    expect(h.plugin.lang()).toBe("en");
    h.plugin.settings.language = "auto";
    expect(UI[h.plugin.lang()]).toBe(UI.en);
  });

  it("saves the settings", async () => {
    h.plugin.settings.syncHours = 24;
    await h.plugin.saveSettings();
    expect(await h.plugin.loadData()).toMatchObject({ syncHours: 24 });
  });

  it("switches units, saves the choice and fills the notes on disk from the other system", async () => {
    await start({}, { "Garmy/data/2026-11-01.md": "---\nrun_km: 10\nrun_min: 50\n---\n" });
    const changed = await h.plugin.setUnits("imperial");
    expect(changed).toBe(1);
    expect(h.plugin.settings.units).toBe("imperial");
    expect((await h.plugin.loadData() as { units: string }).units).toBe("imperial");
    const text = await h.app.vault.read(h.app.vault.getFileByPath("Garmy/data/2026-11-01.md") as never);
    expect(text).toContain("run_mi: 6.2");
    expect(text).toContain("run_km: 10");
  });

  it("builds a Garmin client for the stored key unless given another", () => {
    h.plugin.setKey("stored");
    expect(h.plugin.newClient()).toBeInstanceOf(Object);
    expect(h.plugin.newClient("other")).toBeInstanceOf(Object);
  });
});

describe("daily note format", () => {
  beforeEach(async () => { h = await makeHarness(); });
  const plugins = (extra: Record<string, unknown>): void => { Object.assign(h.mock, extra); };

  it("is ISO when nothing says otherwise", () => {
    expect(h.plugin.dailyFormat()).toBe("YYYY-MM-DD");
  });

  it("takes the built-in Daily notes format", () => {
    plugins({ internalPlugins: { getPluginById: () => ({ instance: { options: { format: "DD.MM.YYYY" } } }) } });
    expect(h.plugin.dailyFormat()).toBe("DD.MM.YYYY");
  });

  it("prefers Periodic Notes over the built-in plugin", () => {
    plugins({ internalPlugins: { getPluginById: () => ({ instance: { options: { format: "DD.MM.YYYY" } } }) } });
    Object.assign(h.mock.plugins.plugins, { "periodic-notes": { settings: { daily: { format: "YYYY/MM/DD" } } } });
    expect(h.plugin.dailyFormat()).toBe("YYYY/MM/DD");
  });

  it("falls back to ISO when the built-in plugin has no format", () => {
    plugins({ internalPlugins: { getPluginById: () => ({ instance: { options: {} } }) } });
    expect(h.plugin.dailyFormat()).toBe("YYYY-MM-DD");
  });
});

describe("Dashy", () => {
  beforeEach(async () => { h = await makeHarness(); });

  it("tells a running Dashy from a disabled one and from none", () => {
    expect(h.plugin.dashyState()).toBe("missing");
    Object.assign(h.mock.plugins.manifests, { dashsidian: {} });
    expect(h.plugin.dashyState()).toBe("disabled");
    Object.assign(h.mock.plugins.plugins, { dashsidian: {} });
    expect(h.plugin.dashyState()).toBe("ready");
  });

  it("reads Dashy's API fresh each time, null before it has one", () => {
    expect(h.plugin.dashyApi()).toBeNull();
    Object.assign(h.mock.plugins.plugins, { dashsidian: { api: { apiVersion: 1, schemaVersion: "2.2.0", check: vi.fn() } } });
    expect(h.plugin.dashyApi()?.schemaVersion).toBe("2.2.0");
  });

  it("knows `goal: usual` from the schema that introduced it, and not for an older or absent Dashy", () => {
    expect(h.plugin.goalUsual()).toBe(false);
    Object.assign(h.mock.plugins.plugins, { dashsidian: { api: { apiVersion: 1, schemaVersion: "1.11.9", check: vi.fn() } } });
    expect(h.plugin.goalUsual()).toBe(false);
    Object.assign(h.mock.plugins.plugins, { dashsidian: { api: { apiVersion: 1, schemaVersion: USUAL_GOAL_SCHEMA, check: vi.fn() } } });
    expect(h.plugin.goalUsual()).toBe(true);
  });

  it("asks Obsidian to enable Dashy by its id, and copes with an app that cannot", async () => {
    const enablePlugin = vi.fn(() => Promise.resolve());
    Object.assign(h.mock.plugins, { enablePlugin });
    await h.plugin.enableDashy();
    expect(enablePlugin).toHaveBeenCalledWith("dashsidian");
    Object.assign(h.mock.plugins, { enablePlugin: undefined });
    await expect(h.plugin.enableDashy()).resolves.toBeUndefined();
  });
});

describe("transport", () => {
  beforeEach(async () => { h = await makeHarness(); });

  it("sends a request through requestUrl without throwing on an error status, and returns status and text", async () => {
    vi.mocked(requestUrl).mockResolvedValueOnce({ status: 401, text: "denied" } as never);
    const res = await h.plugin.http({ url: "https://example.test/x", method: "POST", headers: { a: "b" } });
    expect(res).toEqual({ status: 401, text: "denied" });
    expect(requestUrl).toHaveBeenCalledWith({ url: "https://example.test/x", method: "POST", headers: { a: "b" }, throw: false });
  });

  it("cuts off a silent server: the timer rejects with a network error", async () => {
    const { expired } = h.plugin.schedule(30_000);
    const outcome = expect(expired).rejects.toMatchObject({ kind: "network", message: "Garmin did not answer in time" });
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
  });

  it("cancel stops the timer so a fast answer is not followed by a late rejection", async () => {
    const { expired, cancel } = h.plugin.schedule(30_000);
    const seen = vi.fn();
    expired.catch(seen);
    cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("the class is the module's default export", () => {
  expect(GarmyPlugin.prototype).toBeInstanceOf(Plugin);
});
