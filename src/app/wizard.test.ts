import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notice } from "obsidian-test-mocks/obsidian";
import { GarminError, type BackfillResult, type Progress } from "../api/client";
import type { DayRecord } from "../core/types";
import { SYNC_UI, UI } from "../i18n";
import { fakeClient, makeHarness, type Harness } from "../test/mock-app";
import { WizardModal } from "./wizard";

const ui = UI.en;
const sync = SYNC_UI.en;
const KEY_ID = "garmy-garmin-api-key";

/** Day notes as the wizard writes them: properties only. */
const dayNote = (fields: Record<string, number>): string => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n`;
const SAVED_DAYS: Record<string, string> = Object.fromEntries(
  [1, 2, 3, 4, 5].map((d) => [`Garmy/data/2026-11-0${d}.md`, dayNote({ sleep_score: 70 + d, steps: 8000 + d, run_min: 30, run_km: 5 })]),
);
const records = (n: number): DayRecord[] => Array.from({ length: n }, (_, i) => ({ date: `2026-10-0${i + 1}`, fields: { sleep_score: 80, steps: 9000, run_min: 40, run_km: 6 } }));
const result = (n: number, warnings: string[] = []): BackfillResult => ({ records: records(n), warnings, requests: 1 });

let h: Harness;
let modal: WizardModal;
let root: HTMLElement;

const q = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`nothing matches ${sel}; the wizard shows: ${root.textContent}`);
  return el;
};
const all = (sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));
const stepTitle = (): string => q(".garmy-step-title").textContent;
const callout = (): HTMLElement => all(".garmy-message").pop() ?? q(".garmy-message");
const type = (el: HTMLInputElement, value: string): void => { el.value = value; el.dispatchEvent(new Event("input")); };
const change = (el: HTMLInputElement | HTMLSelectElement, patch: Partial<HTMLInputElement> = {}): void => { Object.assign(el, patch); el.dispatchEvent(new Event("change")); };
/** Lets the promises the wizard started (and the renders they cause) settle. */
const settle = async (): Promise<void> => { await vi.advanceTimersByTimeAsync(0); };

async function open(files: Record<string, string> = {}, settings: Parameters<typeof makeHarness>[1] = {}): Promise<void> {
  h = await makeHarness(files, settings);
  openWizard();
}

function openWizard(): void {
  // Modal.open() of the mocks closes the modal on the next tick, so the tests call onOpen() themselves.
  modal = new WizardModal(h.app, h.plugin, "en");
  modal.onOpen();
  root = modal.contentEl;
  // Focus only works on an element that is in the document.
  document.body.append(modal.containerEl);
}

/** Key step -> load step with a key Garmin accepts. */
async function toLoad(): Promise<void> {
  vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({}));
  type(q<HTMLInputElement>("#garmy-key-input"), "good-key");
  q(".garmy-key-check").click();
  await settle();
  expect(stepTitle()).toBe(ui.loadTitle);
}

/** From the key step to the choose step on notes the vault already holds. */
async function toChoose(): Promise<void> {
  await toLoad();
  q(".garmy-use-saved").click();
  expect(stepTitle()).toBe(ui.chooseTitle);
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { modal.onClose(); modal.containerEl.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("step 1, the key", () => {
  beforeEach(() => open());

  it("shows the four steps with the first current, and a password field", () => {
    expect(q(".garmy-title").textContent).toBe(ui.title);
    expect(all(".garmy-steps-item").map((li) => li.classList.contains("is-current"))).toEqual([true, false, false, false]);
    expect(q(".garmy-steps-item.is-current").getAttribute("aria-current")).toBe("step");
    expect(stepTitle()).toBe(ui.keyTitle);
    expect(q<HTMLInputElement>("#garmy-key-input").type).toBe("password");
    expect(root.querySelector(".garmy-status")).toBeNull();
    expect(modal.modalEl.hasClass("garmy-wizard")).toBe(true);
  });

  it("labels the stepper by the hidden text, not by a tooltip", () => {
    const nav = q("nav.garmy-stepper");
    expect(q(`#${nav.getAttribute("aria-labelledby")}`).textContent).toBe(ui.stepsLabel);
  });

  it("shows and hides the key", () => {
    const toggle = q(".garmy-key-toggle");
    const input = q<HTMLInputElement>("#garmy-key-input");
    toggle.click();
    expect([input.type, toggle.textContent, toggle.getAttribute("aria-pressed")]).toEqual(["text", ui.keyHide, "true"]);
    toggle.click();
    expect([input.type, toggle.textContent, toggle.getAttribute("aria-pressed")]).toEqual(["password", ui.keyShow, "false"]);
  });

  it("asks for a key instead of calling Garmin when the field is empty", () => {
    const newClient = vi.spyOn(h.plugin, "newClient");
    q(".garmy-key-check").click();
    expect(callout().classList.contains("is-warn")).toBe(true);
    expect(callout().textContent).toContain(ui.errEmptyTitle);
    expect(callout().getAttribute("role")).toBe("alert");
    expect(newClient).not.toHaveBeenCalled();
    expect(stepTitle()).toBe(ui.keyTitle);
  });

  it("verifies the key, stores it in the secret storage, clears an old problem and moves on", async () => {
    h.plugin.settings.keyProblem = "2026-11-01";
    const client = fakeClient({});
    const newClient = vi.spyOn(h.plugin, "newClient").mockReturnValue(client);
    type(q<HTMLInputElement>("#garmy-key-input"), "  my-key  ");
    q(".garmy-key-check").click();
    await settle();
    expect(newClient).toHaveBeenCalledWith("my-key");
    expect(client.verify).toHaveBeenCalledOnce();
    expect(h.app.secretStorage.getSecret(KEY_ID)).toBe("my-key");
    expect(h.plugin.settings.keyProblem).toBe("");
    expect(((await h.plugin.loadData()) as { keyProblem: string }).keyProblem).toBe("");
    expect(stepTitle()).toBe(ui.loadTitle);
    expect(q(".garmy-steps-item.is-current").textContent).toContain(ui.stepNames[1]);
  });

  it("checks the key on Enter", async () => {
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({}));
    const input = q<HTMLInputElement>("#garmy-key-input");
    type(input, "k");
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    input.dispatchEvent(enter);
    await settle();
    expect(enter.defaultPrevented).toBe(true);
    expect(stepTitle()).toBe(ui.loadTitle);
  });

  it("disables the button and says so while Garmin is being asked", async () => {
    let answer = (): void => undefined;
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ verify: () => new Promise<void>((r) => { answer = r; }) }));
    type(q<HTMLInputElement>("#garmy-key-input"), "k");
    q(".garmy-key-check").click();
    expect(q<HTMLButtonElement>(".garmy-key-check").disabled).toBe(true);
    expect(q(".garmy-key-check").textContent).toBe(ui.keyChecking);
    answer();
    await settle();
    expect(stepTitle()).toBe(ui.loadTitle);
  });

  it("keeps a rejected key out of the storage and offers to type another", async () => {
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ verify: () => Promise.reject(new GarminError("auth", "401", 401)) }));
    const input = q<HTMLInputElement>("#garmy-key-input");
    type(input, "bad");
    q(".garmy-key-check").click();
    await settle();
    expect(callout().textContent).toContain(ui.errBadTitle);
    expect(h.plugin.getKey()).toBe("");
    expect(stepTitle()).toBe(ui.keyTitle);
    q(".garmy-callout-action").click();
    expect(document.activeElement).toBe(q("#garmy-key-input"));
  });

  it("offers a retry when Garmin asks to wait, and the retry can succeed", async () => {
    const verify = vi.fn().mockRejectedValueOnce(new GarminError("rate", "429", 429)).mockResolvedValue(undefined);
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ verify }));
    type(q<HTMLInputElement>("#garmy-key-input"), "k");
    q(".garmy-key-check").click();
    await settle();
    expect(callout().textContent).toContain(ui.errRateTitle);
    expect(callout().classList.contains("is-warn")).toBe(true);
    q(".garmy-callout-action").click();
    await settle();
    expect(stepTitle()).toBe(ui.loadTitle);
  });

  it("reports a network failure and logs the cause", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ verify: () => Promise.reject(new TypeError("offline")) }));
    type(q<HTMLInputElement>("#garmy-key-input"), "k");
    q(".garmy-key-check").click();
    await settle();
    expect(callout().textContent).toContain(ui.errNetTitle);
    expect(log).toHaveBeenCalledOnce();
  });

  it("goes on with the saved key when the field is left empty", async () => {
    h.app.secretStorage.setSecret(KEY_ID, "saved");
    modal.onOpen();
    expect(q(".garmy-ok").textContent).toBe(ui.keySaved);
    const newClient = vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({}));
    q(".garmy-key-check").click();
    await settle();
    expect(newClient).toHaveBeenCalledWith("saved");
    expect(stepTitle()).toBe(ui.loadTitle);
  });
});

describe("step 1, notes the user already has", () => {
  it("finds nothing in an empty vault and says so", async () => {
    await open();
    q(".garmy-find-notes").click();
    expect(q(".garmy-notes-none").textContent).toBe(sync.notesNone);
  });

  it("offers a folder of daily notes with Garmin numbers and builds from it without a key", async () => {
    const files = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [`Health/2026-10-0${d}.md`, dayNote({ sleep_score: 80, steps: 9000 })]));
    await open(files);
    q(".garmy-find-notes").click();
    const folder = q(".garmy-notes-folder");
    expect(folder.textContent).toBe(sync.notesFolder("Health", 5));
    folder.click();
    expect(stepTitle()).toBe(ui.chooseTitle);
    expect(h.plugin.getKey()).toBe("");
  });

  it("ignores a folder with fewer notes than it takes to be a data folder", async () => {
    await open({ "Health/2026-10-01.md": dayNote({ sleep_score: 80, steps: 9000 }) });
    q(".garmy-find-notes").click();
    expect(root.querySelector(".garmy-notes-folder")).toBeNull();
    expect(root.querySelector(".garmy-notes-none")).not.toBeNull();
  });
});

describe("step 2, loading", () => {
  beforeEach(() => open());

  it("loads the period, writes one note per day and tells how many are new", async () => {
    const backfill = vi.fn((_from: string, _to: string, onProgress?: (p: Progress) => void) => {
      onProgress?.({ step: "daily", done: 3, total: 3 });
      return Promise.resolve(result(3));
    });
    await toLoad();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill }));
    q(".garmy-load").click();
    await settle();
    expect(q(".garmy-loaded").textContent).toBe(`${ui.loaded} 3 (+3)`);
    expect(h.app.vault.getAbstractFileByPath("Garmy/data/2026-10-02.md")).not.toBeNull();
    expect(h.plugin.settings.lastSync).not.toBe("");
    expect(h.plugin.syncing).toBe(false);
    expect(all(".garmy-part-state").map((s) => s.textContent)[0]).toBe(ui.partDone);
  });

  it("asks Garmin for the period the user picked, in the plugin's units", async () => {
    const backfill = vi.fn().mockResolvedValue(result(1));
    await toLoad();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill }));
    h.plugin.settings.units = "imperial";
    change(q<HTMLSelectElement>(".garmy-period"), { value: "30" });
    q(".garmy-load").click();
    await settle();
    const [from, to, , , units] = backfill.mock.calls[0] as [string, string, unknown, unknown, string];
    expect((Date.parse(to) - Date.parse(from)) / 864e5).toBe(29);
    expect(units).toBe("imperial");
  });

  it("moves on by itself after the summary, and at once on Continue", async () => {
    await toLoad();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill: vi.fn().mockResolvedValue(result(2)) }));
    q(".garmy-load").click();
    await settle();
    expect(stepTitle()).toBe(ui.loadTitle);
    await vi.advanceTimersByTimeAsync(1800);
    expect(stepTitle()).toBe(ui.chooseTitle);
  });

  it("warns about partial data and waits longer before moving on", async () => {
    await toLoad();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill: vi.fn().mockResolvedValue(result(2, ["sleep: 3 days failed"])) }));
    q(".garmy-load").click();
    await settle();
    expect(q(".garmy-summary-warn").textContent).toBe(ui.summaryPartial);
    expect(all(".garmy-part-state")[1]?.textContent).toBe(ui.partWarn);
    await vi.advanceTimersByTimeAsync(1800);
    expect(stepTitle()).toBe(ui.loadTitle);
    q(".garmy-continue").click();
    expect(stepTitle()).toBe(ui.chooseTitle);
  });

  it("refuses to start while a sync is running, so two never write the same notes", async () => {
    await toLoad();
    const backfill = vi.fn();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill }));
    h.plugin.syncing = true;
    q(".garmy-load").click();
    await settle();
    expect(callout().textContent).toContain(sync.busy);
    expect(backfill).not.toHaveBeenCalled();
    expect(h.plugin.syncing).toBe(true);
  });

  it("stops on request and says it was cancelled, without logging an error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await toLoad();
    const backfill = vi.fn((_f: string, _t: string, _p: unknown, cancel: { cancelled: boolean }) =>
      new Promise<BackfillResult>((_, reject) => { const t = setInterval(() => { if (cancel.cancelled) { clearInterval(t); reject(new GarminError("cancelled", "stopped")); } }, 10); }));
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill }));
    q(".garmy-load").click();
    expect(q<HTMLButtonElement>(".garmy-cancel").hidden).toBe(false);
    q(".garmy-cancel").click();
    await vi.advanceTimersByTimeAsync(20);
    expect(callout().textContent).toContain(sync.cancelledTitle);
    expect(h.plugin.syncing).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("remembers that Garmin rejected the key and sends the user back to enter a new one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await toLoad();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill: vi.fn().mockRejectedValue(new GarminError("auth", "401", 401)) }));
    q(".garmy-load").click();
    await settle();
    expect(callout().textContent).toContain(ui.stoppedAuth);
    expect(h.plugin.settings.keyProblem).not.toBe("");
    expect(((await h.plugin.loadData()) as { keyProblem: string }).keyProblem).toBe(h.plugin.settings.keyProblem);
    expect(h.plugin.syncing).toBe(false);
    q(".garmy-callout-action").click();
    expect(stepTitle()).toBe(ui.keyTitle);
  });

  it("offers a retry after a network failure and the retry returns to the load step", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await toLoad();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill: vi.fn().mockRejectedValue(new GarminError("network", "down")) }));
    q(".garmy-load").click();
    await settle();
    expect(callout().textContent).toContain(ui.stoppedNet);
    expect(h.plugin.settings.keyProblem).toBe("");
    expect(all(".garmy-part-state").map((s) => s.textContent)).not.toContain(ui.partDone);
    q(".garmy-callout-action").click();
    expect(root.querySelector(".garmy-callout")).toBeNull();
  });

  it("warns that there is no data when Garmin returns nothing", async () => {
    await toLoad();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill: vi.fn().mockResolvedValue(result(0)) }));
    q(".garmy-load").click();
    await vi.advanceTimersByTimeAsync(1800);
    expect(callout().textContent).toContain(ui.errNoDataTitle);
    expect(stepTitle()).toBe(ui.loadTitle);
  });

  it("offers the notes already saved, so a returning user does not load again", async () => {
    await open(SAVED_DAYS);
    await toLoad();
    expect(q(".garmy-saved-text").textContent).toContain(`${ui.savedInfo} 5`);
    expect(q(".garmy-hint").textContent).toBe(`${ui.note}Garmy/data`);
  });

  it("lets the user go back to a finished step from the stepper", async () => {
    await toLoad();
    q("button.garmy-steps-btn").click();
    expect(stepTitle()).toBe(ui.keyTitle);
  });
});

describe("step 3, choosing", () => {
  beforeEach(async () => { await open(SAVED_DAYS); await toChoose(); });

  it("offers the groups and sports the data really has, all ticked", () => {
    expect(all(".garmy-cards:not(.garmy-tpls) .garmy-card-title").map((t) => t.textContent)).toEqual([ui.groups.recovery, ui.groups.activity, ui.groups.training]);
    expect(all(".garmy-cards:not(.garmy-tpls) input").every((i) => (i as HTMLInputElement).checked)).toBe(true);
    expect(all(".garmy-chip").length).toBe(1);
    expect(q<HTMLInputElement>(".garmy-sport-run").checked).toBe(true);
  });

  it("offers only the groups the data supports", async () => {
    await open({ "Garmy/data/2026-11-01.md": dayNote({ steps: 100 }) });
    await toChoose();
    expect(all(".garmy-cards:not(.garmy-tpls) .garmy-card-title").map((t) => t.textContent)).toEqual([ui.groups.activity]);
    expect(q(".garmy-sports-box .garmy-hint").textContent).toBe(ui.noSports);
  });

  it("mirrors a ticked box onto its card", () => {
    const input = q<HTMLInputElement>(".garmy-group-recovery");
    const card = input.closest("label") as HTMLElement;
    expect(card.classList.contains("is-checked")).toBe(true);
    change(input, { checked: false });
    expect(card.classList.contains("is-checked")).toBe(false);
  });

  it("blocks the preview when nothing is ticked, and says why", () => {
    const preview = q<HTMLButtonElement>(".garmy-preview-btn");
    expect(preview.disabled).toBe(false);
    for (const g of ["recovery", "activity", "training"]) change(q<HTMLInputElement>(`.garmy-group-${g}`), { checked: false });
    expect(preview.disabled).toBe(true);
    expect(q(".garmy-empty-hint").classList.contains("is-visible")).toBe(true);
    change(q<HTMLInputElement>(".garmy-group-activity"), { checked: true });
    expect(preview.disabled).toBe(false);
  });

  it("does not count training as something to show when no sport is ticked", () => {
    change(q<HTMLInputElement>(".garmy-group-recovery"), { checked: false });
    change(q<HTMLInputElement>(".garmy-group-activity"), { checked: false });
    expect(q<HTMLButtonElement>(".garmy-preview-btn").disabled).toBe(false);
    change(q<HTMLInputElement>(".garmy-sport-run"), { checked: false });
    expect(q<HTMLButtonElement>(".garmy-preview-btn").disabled).toBe(true);
  });

  it("starts on the overview and greys out dashboards that wait for a race", () => {
    expect(q<HTMLInputElement>(".garmy-tpl-overview").checked).toBe(true);
    expect(q<HTMLInputElement>(".garmy-tpl-race").disabled).toBe(true);
    expect(q(".garmy-tpl-race").closest("label")?.classList.contains("is-disabled")).toBe(true);
    expect(q(".garmy-tpl-race").closest("label")?.querySelector(".garmy-card-desc")?.textContent).toBe(ui.tplNeed.race);
  });

  it("switches to another dashboard and hides the overview's groups", () => {
    expect(q(".garmy-overview-box").hidden).toBe(false);
    change(q<HTMLInputElement>(".garmy-tpl-week"), { checked: true });
    expect(q(".garmy-overview-box").hidden).toBe(true);
    expect(q(".garmy-sports-box").hidden).toBe(false);
    change(q<HTMLInputElement>(".garmy-tpl-overview"), { checked: true });
    expect(q(".garmy-overview-box").hidden).toBe(false);
  });

  it("enables the race dashboard once a race date is typed", () => {
    expect(q<HTMLInputElement>(".garmy-tpl-race").disabled).toBe(true);
    type(q<HTMLInputElement>(".garmy-options input"), " 2027-04-18 ");
    expect(q<HTMLInputElement>(".garmy-tpl-race").disabled).toBe(false);
  });

  it("switches units: converts the data on screen and saves the setting", async () => {
    const setUnits = vi.spyOn(h.plugin, "setUnits");
    const select = all(".garmy-options select")[0] as HTMLSelectElement;
    change(select, { value: "imperial" });
    await settle();
    expect(setUnits).toHaveBeenCalledWith("imperial");
    expect(h.plugin.settings.units).toBe("imperial");
    expect(((await h.plugin.loadData()) as { units: string }).units).toBe("imperial");
  });

  it("goes back to loading and on to the preview", () => {
    q(".garmy-preview-btn").click();
    expect(stepTitle()).toBe(ui.previewTitle);
    q(".garmy-back").click();
    expect(stepTitle()).toBe(ui.chooseTitle);
    q(".garmy-back").click();
    expect(stepTitle()).toBe(ui.loadTitle);
  });
});

describe("step 4, preview and insert", () => {
  beforeEach(async () => { await open({ ...SAVED_DAYS, "Notes/Today.md": "# Today\n" }); await toChoose(); q(".garmy-preview-btn").click(); });

  it("asks the user to install Dashy when it is missing", () => {
    expect(callout().textContent).toContain(ui.noDashyTitle);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    q(".garmy-callout-action").click();
    expect(open).toHaveBeenCalledWith("obsidian://show-plugin?id=dashsidian");
  });

  it("offers to enable Dashy when it is installed but off, and redraws after", async () => {
    Object.assign(h.mock.plugins, { manifests: { dashsidian: {} } });
    const enable = vi.spyOn(h.plugin, "enableDashy").mockResolvedValue(undefined);
    q(".garmy-back").click();
    q(".garmy-preview-btn").click();
    expect(callout().textContent).toContain(sync.dashyDisabledTitle);
    q(".garmy-callout-action").click();
    await settle();
    expect(enable).toHaveBeenCalledOnce();
  });

  it("shows no warning when Dashy is on", () => {
    Object.assign(h.mock.plugins.plugins, { dashsidian: {} });
    q(".garmy-back").click();
    q(".garmy-preview-btn").click();
    expect(root.querySelector(".garmy-warn")).toBeNull();
  });

  it("finishes rendering the preview and clears the busy state", async () => {
    await settle();
    expect(q(".garmy-preview").getAttribute("aria-busy")).toBe("false");
    expect(root.querySelector(".garmy-preview-wait")).toBeNull();
  });

  it("tells the user when the preview could not be drawn", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { MarkdownRenderer } = await import("obsidian-test-mocks/obsidian");
    vi.spyOn(MarkdownRenderer, "render").mockRejectedValue(new Error("render failed"));
    q(".garmy-back").click();
    q(".garmy-preview-btn").click();
    await settle();
    expect(root.textContent).toContain(ui.errRenderTitle);
    expect(q(".garmy-preview").getAttribute("aria-busy")).toBe("false");
    expect(log).toHaveBeenCalled();
  });

  it("creates the dashboard note with its region markers, tells the user and closes", async () => {
    const notices = vi.spyOn(Notice.prototype, "constructor__");
    q(".garmy-create").click();
    await settle();
    const file = h.app.vault.getAbstractFileByPath("Garmy/Garmin dashboard.md");
    expect(file).not.toBeNull();
    const text = await h.app.vault.cachedRead(file as never);
    expect(text).toContain("garmy:");
    expect(notices).toHaveBeenCalledWith(`${ui.created}Garmy/Garmin dashboard.md`, undefined);
    expect(root.childElementCount).toBe(0);
  });

  it("will not insert when no note is open", async () => {
    q(".garmy-insert").click();
    await settle();
    expect(callout().textContent).toContain(ui.errNoNoteTitle);
    expect(stepTitle()).toBe(ui.previewTitle);
  });

  it("inserts the dashboard into the open note and records the choices in its properties", async () => {
    const file = h.app.vault.getFileByPath("Notes/Today.md");
    if (!file) throw new Error("fixture note missing");
    const leaf = h.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    h.app.workspace.setActiveLeaf(leaf, { focus: true });
    const notices = vi.spyOn(Notice.prototype, "constructor__");
    q(".garmy-insert").click();
    await settle();
    expect(notices).toHaveBeenCalledWith(ui.inserted, undefined);
    expect(await h.app.vault.read(file)).toContain("garmy:");
    expect(root.childElementCount).toBe(0);
  });
});

describe("step 4, Dashy checks the blocks before the note is written", () => {
  const broken = [{ lang: "dashy-bar", status: "known", findings: [{ level: "error", message: "field sleep is missing" }] }];
  const fine = [{ lang: "dashy-bar", status: "known", findings: [] }];
  const notIndexed = [{ lang: "dashy-bar", status: "known", findings: [{ level: "notice", message: "Obsidian is still indexing" }] }];

  async function withDashy(check: ReturnType<typeof vi.fn>): Promise<ReturnType<typeof vi.spyOn>> {
    await open({ ...SAVED_DAYS, "Notes/Today.md": "# Today\n" });
    Object.assign(h.mock.plugins.plugins, { dashsidian: { api: { apiVersion: 1, schemaVersion: "2.2.0", check } } });
    await toChoose();
    q(".garmy-preview-btn").click();
    return vi.spyOn(Notice.prototype, "constructor__");
  }

  it("shows the first error as a second notice and still creates the note", async () => {
    const notices = await withDashy(vi.fn().mockResolvedValue(broken));
    q(".garmy-create").click();
    await settle();
    expect(notices).toHaveBeenCalledWith(`${ui.blocksProblem} field sleep is missing`, 12000);
    expect(h.app.vault.getAbstractFileByPath("Garmy/Garmin dashboard.md")).not.toBeNull();
  });

  it("stays quiet when every block is fine", async () => {
    const check = vi.fn().mockResolvedValue(fine);
    const notices = await withDashy(check);
    q(".garmy-create").click();
    await settle();
    expect(check).toHaveBeenCalledOnce();
    expect(notices).toHaveBeenCalledOnce();
  });

  it("asks again once when Obsidian was still indexing", async () => {
    const check = vi.fn().mockResolvedValueOnce(notIndexed).mockResolvedValue(broken);
    const notices = await withDashy(check);
    q(".garmy-create").click();
    await settle();
    expect(check).toHaveBeenCalledTimes(2);
    expect(notices).toHaveBeenCalledWith(`${ui.blocksProblem} field sleep is missing`, 12000);
  });

  it("still creates the note when Dashy itself fails, and logs why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const notices = await withDashy(vi.fn().mockRejectedValue(new Error("boom")));
    q(".garmy-create").click();
    await settle();
    expect(warn).toHaveBeenCalledOnce();
    expect(notices).toHaveBeenCalledOnce();
    expect(h.app.vault.getAbstractFileByPath("Garmy/Garmin dashboard.md")).not.toBeNull();
  });
});

describe("step 4, notes that already exist", () => {
  it("numbers a second dashboard instead of overwriting the first", async () => {
    await open({ ...SAVED_DAYS, "Garmy/Garmin dashboard.md": "mine" });
    await toChoose();
    q(".garmy-preview-btn").click();
    q(".garmy-create").click();
    await settle();
    expect(h.app.vault.getAbstractFileByPath("Garmy/Garmin dashboard 2.md")).not.toBeNull();
    expect(await h.app.vault.read(h.app.vault.getAbstractFileByPath("Garmy/Garmin dashboard.md") as never)).toBe("mine");
  });

  it("names a weekly review for its week and refuses to make a second one", async () => {
    await open(SAVED_DAYS);
    await toChoose();
    change(q<HTMLInputElement>(".garmy-tpl-week"), { checked: true });
    q(".garmy-preview-btn").click();
    q(".garmy-create").click();
    await settle();
    const week = h.app.vault.getMarkdownFiles().filter((f) => /^Garmy\/\d{4}-W\d{2}\.md$/.test(f.path));
    expect(week).toHaveLength(1);
    openWizard();
    await toChoose();
    change(q<HTMLInputElement>(".garmy-tpl-week"), { checked: true });
    q(".garmy-preview-btn").click();
    q(".garmy-create").click();
    await settle();
    expect(callout().textContent).toContain(ui.tplExistsTitle);
    expect(h.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Garmy/") && f.path.includes("-W"))).toHaveLength(1);
  });
});

describe("closing", () => {
  it("cancels the pending move to the next step", async () => {
    await open();
    await toLoad();
    vi.spyOn(h.plugin, "newClient").mockReturnValue(fakeClient({ backfill: vi.fn().mockResolvedValue(result(2)) }));
    q(".garmy-load").click();
    await settle();
    modal.onClose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(root.childElementCount).toBe(0);
  });
});
