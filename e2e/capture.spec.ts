import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, openWizard, setKey } from "./fixtures";
import { installDemoGarmin } from "./demo-garmin";

/**
 * Pictures and clips for the README, taken from the real plugin in real Obsidian with generated demo data.
 * Off unless CAPTURE=1 (npm run capture). Frames land in .capture/frames and a manifest in .capture/reels.json;
 * scripts/capture.mjs turns them into GIFs.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const FRAMES = path.join(ROOT, ".capture", "frames");
const SHOTS = path.join(ROOT, "docs", "screens");
const MANIFEST = path.join(ROOT, ".capture", "reels.json");
const WIZARD_CLIP = { x: 110, y: 40, width: 980, height: 800 };
const WINDOW_CLIP = { x: 0, y: 0, width: 1200, height: 860 };

type Clip = { x: number; y: number; width: number; height: number };
const reels: Record<string, Array<{ file: string; ms: number }>> = fs.existsSync(MANIFEST) ? (JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as typeof reels) : {};

test.describe.configure({ mode: "serial" });
test.skip(!process.env.CAPTURE, "set CAPTURE=1 (npm run capture)");
test.setTimeout(300_000);

function saveManifest(): void { fs.mkdirSync(path.dirname(MANIFEST), { recursive: true }); fs.writeFileSync(MANIFEST, JSON.stringify(reels, null, 1)); }

async function frame(win: Page, reel: string, ms: number, clip: Clip): Promise<void> {
    fs.mkdirSync(FRAMES, { recursive: true });
    const list = (reels[reel] ??= []);
    const file = `${reel}-${String(list.length + 1).padStart(3, "0")}.png`;
    await win.screenshot({ path: path.join(FRAMES, file), clip });
    list.push({ file, ms });
}

async function still(win: Page, name: string, clip: Clip): Promise<void> {
    fs.mkdirSync(SHOTS, { recursive: true });
    await win.screenshot({ path: path.join(SHOTS, `${name}.png`), clip });
}

/** The wizard window with a margin, whatever size the step makes it. */
async function stillModal(win: Page, name: string): Promise<void> {
    const box = await win.locator(".garmy-wizard").boundingBox();
    if (!box) return;
    const m = 28;
    await still(win, name, { x: Math.max(0, box.x - m), y: Math.max(0, box.y - m), width: Math.min(1200, box.width + 2 * m), height: Math.min(860, box.height + 2 * m) });
}

/** Properties are Obsidian's own view of a note's header; hiding them is a display setting, the notes are unchanged. */
const hideProperties = (win: Page): Promise<void> => win.evaluate(() => {
    (globalThis as unknown as { app: { vault: { setConfig(k: string, v: string): void } } }).app.vault.setConfig("propertiesInDocument", "hidden");
});

async function setTheme(win: Page, dark: boolean): Promise<void> {
    await win.evaluate(async (d) => {
        const a = (globalThis as unknown as { app: { changeTheme(t: string): void; workspace: { trigger(n: string): void } } }).app;
        a.changeTheme(d ? "obsidian" : "moonstone");
        a.workspace.trigger("css-change");
        await new Promise((r) => setTimeout(r, 500));
    }, dark);
}

/** Draws every block of the note in reading view (lazy blocks need a scroll), then returns to the top. */
async function settleNote(win: Page, min = 20): Promise<void> {
    const sel = ".workspace-leaf.mod-active .markdown-preview-view";
    await expect.poll(() => win.locator(`${sel} [class*='dashy']`).count(), { timeout: 30_000 }).toBeGreaterThan(min);
    await win.evaluate(async (s) => {
        const r = document.querySelector(s);
        if (!r) return;
        for (let y = 0; y <= r.scrollHeight; y += Math.max(200, r.clientHeight - 100)) { r.scrollTop = y; await new Promise((x) => setTimeout(x, 250)); }
        r.scrollTop = 0;
        await new Promise((x) => setTimeout(x, 600));
    }, sel);
}

const scrollNote = (win: Page, y: number): Promise<void> => win.evaluate((top) => {
    const r = document.querySelector(".workspace-leaf.mod-active .markdown-preview-view");
    if (r) r.scrollTop = top;
}, y);

/** Reading view of a note. openFile ignores a mode when the note is already open in the tab, so the view state is set directly. */
async function openInReading(win: Page, path: string | null): Promise<void> {
    await win.evaluate(async (p) => {
        const a = (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null; getLeaf(n: boolean): { setViewState(s: unknown): Promise<void> }; leftSplit: { collapse(): void }; rightSplit: { collapse(): void } } } }).app;
        const file = p ?? a.workspace.getActiveFile()?.path;
        a.workspace.leftSplit.collapse();
        a.workspace.rightSplit.collapse();
        const leaf = a.workspace.getLeaf(false);
        await leaf.setViewState({ type: "markdown", state: { file, mode: "preview" }, active: true });
        // setViewState is ignored for a note that is already open in the tab, so check the mode and force it
        const view = (leaf as unknown as { view: { getMode?(): string; getState(): object; setState(s: object, r: object): Promise<void> } }).view;
        for (let i = 0; i < 5 && view.getMode?.() !== "preview"; i++) {
            await view.setState({ ...view.getState(), mode: "preview" }, { history: false });
            await new Promise((r) => setTimeout(r, 300));
        }
    }, path);
    await win.waitForSelector(".workspace-leaf.mod-active .markdown-reading-view", { timeout: 10_000 });
    await win.waitForTimeout(800);
}
const openActiveInReading = (win: Page): Promise<void> => openInReading(win, null);

async function runWizardToNote(win: Page, days: number, period: string, onFrame?: (label: string, ms: number, clip: Clip) => Promise<void>): Promise<void> {
    const snap = onFrame ?? (async () => undefined);
    await openWizard(win);
    await snap("key", 1500, WIZARD_CLIP);
    const input = win.locator(".garmy-key");
    await input.click();
    await input.pressSequentially("GRM-8f2c-41aa-93d7-5be0c6a19f40", { delay: 30 });
    await snap("key-typed", 900, WIZARD_CLIP);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-period").selectOption(period);
    await snap("load", 1200, WIZARD_CLIP);
    await win.locator(".garmy-load").click();
    for (let i = 0; i < 90; i++) {
        if (await win.locator(".garmy-loaded").count()) break;
        await snap("loading", 650, WIZARD_CLIP);
        await win.waitForTimeout(500);
    }
    await win.locator(".garmy-loaded").waitFor({ timeout: 60_000 });
    await snap("loaded", 1600, WIZARD_CLIP);
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 20_000 });
    await snap("choose", 1800, WIZARD_CLIP);
    await win.locator(".garmy-preview-btn").click();
    await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
    await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(days < 10 ? 5 : 30);
    await win.waitForTimeout(1_200);
    await snap("preview", 2000, WIZARD_CLIP);
    await win.locator(".garmy-create").click();
    await expect.poll(() => win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null } } }).app.workspace.getActiveFile()?.path ?? "")).toMatch(/^Garmy\/(Garmin dashboard|Дашборд)/);
}

test("hero reel and stills: key to finished dashboard", async ({ win }) => {
    await setKey(win, "");
    await hideProperties(win);
    await installDemoGarmin(win, 365, 330);
    await runWizardToNote(win, 365, "365", async (label, ms, clip) => { await frame(win, "wizard", ms, WINDOW_CLIP); if (label === "key") await stillModal(win, "wizard-key-light"); if (label === "choose") await stillModal(win, "wizard-choose-light"); if (label === "preview") await stillModal(win, "wizard-preview-light"); });
    // what the marker looks like in Live Preview with the cursor elsewhere (for a look, not for the README)
    await win.evaluate(() => {
        const a = (globalThis as unknown as { app: { workspace: { activeEditor?: { editor?: { setCursor(l: number, c: number): void; lastLine(): number } } } } }).app;
        const ed = a.workspace.activeEditor?.editor;
        ed?.setCursor(ed.lastLine(), 0);
    });
    await win.waitForTimeout(700);
    fs.mkdirSync(path.join(ROOT, ".capture"), { recursive: true });
    await win.screenshot({ path: path.join(ROOT, ".capture", "live-preview-marker.png"), clip: WINDOW_CLIP });
    await openActiveInReading(win);
    await settleNote(win);
    for (const [i, y] of [0, 520, 1100, 1750, 2450, 3200].entries()) {
        await scrollNote(win, y);
        await win.waitForTimeout(500);
        await frame(win, "wizard", i === 0 ? 2200 : 1500, WINDOW_CLIP);
        await still(win, `dashboard-${i + 1}-light`, WINDOW_CLIP);
    }
    await setTheme(win, true);
    await settleNote(win);
    for (const [i, y] of [0, 1100, 2450].entries()) { await scrollNote(win, y); await win.waitForTimeout(500); await still(win, `dashboard-${i === 0 ? 1 : i === 1 ? 3 : 5}-dark`, WINDOW_CLIP); }
    saveManifest();
});

test("rebuild reel: a young dashboard grows up", async ({ win }) => {
    await setKey(win, "");
    await hideProperties(win);
    await installDemoGarmin(win, 6, 0);
    await runWizardToNote(win, 6, "30");
    const youngPath = await win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } } } }).app.workspace.getActiveFile().path);
    await openActiveInReading(win);
    await settleNote(win);
    await frame(win, "rebuild", 2600, WINDOW_CLIP);
    await still(win, "young-light", WINDOW_CLIP);

    // the diary grows: load a longer history through the wizard, then come back to the first note
    await installDemoGarmin(win, 120, 0);
    await openWizard(win);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-period").selectOption("90");
    await win.locator(".garmy-load").click();
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 60_000 });
    await win.keyboard.press("Escape");
    await win.waitForTimeout(500);
    await openInReading(win, youngPath);
    await win.evaluate(() => (globalThis as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("garmidian:rebuild-dashboard"));
    await win.waitForTimeout(800);
    await win.locator(".notice").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    await frame(win, "rebuild", 1400, WINDOW_CLIP);
    await settleNote(win);
    for (const [i, y] of [0, 700, 1500, 2300].entries()) { await scrollNote(win, y); await win.waitForTimeout(500); await frame(win, "rebuild", i === 0 ? 2200 : 1500, WINDOW_CLIP); if (i === 0) await still(win, "rebuilt-light", WINDOW_CLIP); }
    saveManifest();
});

test("languages reel: the same step in six languages", async ({ win }) => {
    await setKey(win, "");
    for (const code of ["en", "de", "fr", "es", "pt", "ja", "ru"]) {
        await win.evaluate((c) => {
            const a = (globalThis as unknown as { app: { plugins: { plugins: Record<string, { settings: { language: string } }> } } }).app;
            const p = a.plugins.plugins.garmidian;
            if (p) p.settings.language = c;
        }, code);
        await openWizard(win);
        await win.waitForTimeout(500);
        await frame(win, "languages", 1500, WINDOW_CLIP);
        if (code === "de") await stillModal(win, "wizard-key-de");
        await win.keyboard.press("Escape");
        await win.waitForTimeout(400);
    }
    saveManifest();
});

test("phone stills: the mobile interface in a phone-sized window", async ({ app, win }) => {
    // Obsidian's own mobile interface (app.emulateMobile) in a 390 px window. It is not a device: nothing here
    // proves requestUrl or secure storage on iOS or Android, only that the layout and the blocks fit a phone.
    const out = path.join(ROOT, ".capture", "phone");
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    // Switching reloads the window, so the call never returns.
    await win.evaluate(() => (globalThis as unknown as { app: { emulateMobile(on: boolean): void } }).app.emulateMobile(true)).catch(() => undefined);
    await win.waitForLoadState("domcontentloaded");
    await expect.poll(() => win.evaluate(() => {
        const a = (globalThis as unknown as { app?: { workspace?: { layoutReady?: boolean }; plugins?: { plugins?: Record<string, unknown> } } }).app;
        return Boolean(a?.workspace?.layoutReady && a.plugins?.plugins?.garmidian && a.plugins.plugins.dashsidian);
    }).catch(() => false), { timeout: 60_000 }).toBe(true);
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.setSize(390, 700); w?.center(); });
    await win.waitForTimeout(1_500);
    await hideProperties(win);
    await setKey(win, "");
    await installDemoGarmin(win, 365, 0);
    const shot = (name: string): Promise<Buffer> => win.screenshot({ path: path.join(out, `${name}.png`) });
    await runWizardToNote(win, 365, "365", async (label) => {
        if (label === "key") { await win.waitForTimeout(400); await shot("1-key"); }
        if (label === "choose") await shot("2-choose");
        if (label === "preview") await shot("3-preview");
    });
    await openActiveInReading(win);
    await settleNote(win);
    for (const [i, y] of [0, 560, 1500, 2600].entries()) { await scrollNote(win, y); await win.waitForTimeout(500); await shot(`${4 + i}-dashboard`); }
});

/** A library card by template id. */
const card = (win: Page, id: string) => win.locator(`input.garmy-tpl-${id.replace(":", "-")}`);

/** The whole wizard window, as tall as it is (the library is longer than the other steps). */
async function stillTall(win: Page, name: string): Promise<void> {
    const box = await win.locator(".garmy-wizard").boundingBox();
    if (!box) return;
    const m = 28;
    await still(win, name, { x: Math.max(0, box.x - m), y: Math.max(0, box.y - m), width: Math.min(1200, box.width + 2 * m), height: Math.min(1460, box.height + 2 * m) });
}

/** Opens the wizard on the data that is already saved and stops at the choice. */
async function toChoice(win: Page): Promise<void> {
    await openWizard(win);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-use-saved").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-use-saved").click();
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 15_000 });
}

/** Builds one kind of dashboard through the wizard and takes the stills asked for, in reading view. */
async function shootTemplate(win: Page, id: string, shots: Array<{ y: number; name: string; dark?: boolean }>, min = 8, race?: string): Promise<void> {
    await toChoice(win);
    if (race) {
        // a race card waits for a date, and a new wizard window starts without the one typed before
        await win.locator(".garmy-options summary").click();
        await win.locator(".garmy-options-body input[type=text]").first().fill(race);
    }
    await card(win, id).check({ force: true });
    await win.locator(".garmy-preview-btn").click();
    await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
    await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(3);
    await win.waitForTimeout(800);
    await win.locator(".garmy-create").click();
    await expect.poll(() => win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null } } }).app.workspace.getActiveFile()?.path ?? "")).toMatch(/^Garmy\//);
    await openActiveInReading(win);
    await settleNote(win, min);
    await win.evaluate(() => document.querySelectorAll(".notice").forEach((n) => n.remove()));
    for (const sh of shots.filter((x) => !x.dark)) { await scrollNote(win, sh.y); await win.waitForTimeout(500); await still(win, `${sh.name}-light`, WINDOW_CLIP); }
    const dark = shots.filter((x) => x.dark);
    if (dark.length) {
        await setTheme(win, true);
        await settleNote(win, min);
        for (const sh of dark) { await scrollNote(win, sh.y); await win.waitForTimeout(500); await still(win, `${sh.name}-dark`, WINDOW_CLIP); }
        await setTheme(win, false);
    }
}

test("library: the choice, a clip through it, and a page of every kind", async ({ win }) => {
    await setKey(win, "");
    await hideProperties(win);
    await installDemoGarmin(win, 365, 0);
    // one load; every later wizard run builds on the saved days
    await openWizard(win);
    await win.locator(".garmy-key").fill("GRM-8f2c-41aa-93d7-5be0c6a19f40");
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-period").selectOption("365");
    await win.locator(".garmy-load").click();
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 90_000 });

    // a race six weeks ahead, so the race page has a countdown
    const race = new Date(Date.now() + 42 * 864e5);
    const raceDate = `${race.getFullYear()}-${String(race.getMonth() + 1).padStart(2, "0")}-${String(race.getDate()).padStart(2, "0")}`;
    await win.locator(".garmy-options summary").click();
    await win.locator(".garmy-options-body input[type=text]").first().fill(raceDate);
    await win.locator(".garmy-options summary").click();
    await win.evaluate(() => { const b = document.querySelector(".garmy-wizard .garmy-body"); if (b) b.scrollTop = 0; });
    await win.waitForTimeout(500);
    await stillTall(win, "wizard-library-light");

    for (const [i, id] of ["overview", "sleep", "sport:run", "triathlon", "race", "week"].entries()) {
        await card(win, id).check({ force: true });
        await win.waitForTimeout(450);
        await frame(win, "library", i === 0 ? 1800 : 1400, { x: 110, y: 40, width: 980, height: 1000 });
    }
    await win.keyboard.press("Escape");

    const top = [{ y: 0, name: "" }];
    const two = (n: string): Array<{ y: number; name: string; dark?: boolean }> => [{ y: 0, name: `tpl-${n}-a` }, { y: 760, name: `tpl-${n}-b` }];
    await shootTemplate(win, "glance", [{ y: 0, name: "tpl-glance-a" }, { y: 0, name: "tpl-glance-a", dark: true }], 4);
    await shootTemplate(win, "sleep", [...two("sleep"), { y: 0, name: "tpl-sleep-a", dark: true }]);
    await shootTemplate(win, "recovery", two("recovery"));
    await shootTemplate(win, "steps", two("steps"));
    await shootTemplate(win, "sport:run", [...two("run"), { y: 0, name: "tpl-run-a", dark: true }]);
    await shootTemplate(win, "sport:strength", two("strength"));
    await shootTemplate(win, "triathlon", two("triathlon"));
    await shootTemplate(win, "race", two("race"), 8, raceDate);
    await shootTemplate(win, "week", two("week"));
    await shootTemplate(win, "month", two("month"));
    await shootTemplate(win, "year", two("year"));

    // miles: the same run page in the imperial system
    await win.evaluate(() => (globalThis as unknown as { app: { plugins: { plugins: Record<string, { setUnits(u: string): Promise<number> }> } } }).app.plugins.plugins.garmidian!.setUnits("imperial"));
    await shootTemplate(win, "sport:run", [{ y: 0, name: "tpl-run-miles-a" }]);
    void top;
    saveManifest();
});
