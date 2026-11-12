import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { DemoHelpers, ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { App } from "obsidian";
import { test, expect, onlyWhen, openWizard, setKey, activePath, type GarmyApp } from "./fixtures";
import { installDemoGarmin } from "./demo-garmin";

/**
 * Pictures and clips for the README, taken from the real plugin in real Obsidian with generated demo data.
 * Off unless CAPTURE=1 (npm run capture). The films are the kit's `demo` fixture: frames land in .opdk/demo/films and
 * `opdk demo` turns them into GIFs and posters in docs/screens (settings in opdk.config.mjs). The stills are
 * plain screenshots straight into docs/screens.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(ROOT, "docs", "screens");
// A fixed day for every picture: the fake Garmin builds its history back from "today", so the pictures and the films
// do not depend on the day they are shot. A Wednesday, so the demo week has trained days on both sides of it.
const TODAY = "2026-11-11T09:26:00";
const WIZARD_CLIP = { x: 110, y: 40, width: 980, height: 800 };
const WINDOW_CLIP = { x: 0, y: 0, width: 1200, height: 860 };

type Clip = { x: number; y: number; width: number; height: number };

test.describe.configure({ mode: "serial" });
onlyWhen("CAPTURE");
test.setTimeout(300_000);

/** The same day, a window without the ribbon, status bar, tab headers and note title, and both side panels folded, in every film test. */
async function stage(demo: DemoHelpers, obsidian: ObsidianHelpers): Promise<void> {
    await demo.freezeTime(TODAY);
    await demo.cleanUi();
    await obsidian.collapseSidebars();
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

/**
 * Draws every block of the note in reading view (lazy blocks need a scroll), then returns to the top. The kit's
 * scrollThrough stays at the bottom, and the pictures start at the top of the note.
 */
async function settleNote(win: Page, obsidian: ObsidianHelpers, min = 20): Promise<void> {
    const sel = ".workspace-leaf.mod-active .markdown-preview-view";
    await expect.poll(() => win.locator(`${sel} [class*='dashy']`).count(), { timeout: 30_000 }).toBeGreaterThan(min);
    await obsidian.scrollThrough(sel);
    await win.evaluate((s) => {
        const r = document.querySelector(s);
        if (r) r.scrollTop = 0;
    }, sel);
    await win.waitForTimeout(600);
}

const scrollNote = (win: Page, y: number): Promise<void> => win.evaluate((top) => {
    const r = document.querySelector(".workspace-leaf.mod-active .markdown-preview-view");
    if (r) r.scrollTop = top;
}, y);

/** Reading view of a note, with the side panels folded so the note gets the whole window (the kit's readingView does not fold them). */
async function openInReading(win: Page, obsidian: ObsidianHelpers, path: string | null): Promise<void> {
    await obsidian.collapseSidebars();
    await obsidian.readingView(path ?? undefined);
    await win.waitForTimeout(800);
}
const openActiveInReading = (win: Page, obsidian: ObsidianHelpers): Promise<void> => openInReading(win, obsidian, null);

async function runWizardToNote(win: Page, obsidian: ObsidianHelpers, days: number, period: string, onFrame?: (label: string, hold: number, clip: Clip) => Promise<void>): Promise<void> {
    const snap = onFrame ?? (async () => undefined);
    await openWizard(win);
    await snap("key", 1.5, WIZARD_CLIP);
    const input = win.locator(".garmy-key");
    await input.click();
    await input.pressSequentially("GRM-8f2c-41aa-93d7-5be0c6a19f40", { delay: 30 });
    await snap("key-typed", 0.9, WIZARD_CLIP);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-period").selectOption(period);
    await snap("load", 1.2, WIZARD_CLIP);
    await win.locator(".garmy-load").click();
    for (let i = 0; i < 90; i++) {
        if (await win.locator(".garmy-loaded").count()) break;
        await snap("loading", 0.65, WIZARD_CLIP);
        await win.waitForTimeout(500);
    }
    await win.locator(".garmy-loaded").waitFor({ timeout: 60_000 });
    await snap("loaded", 1.6, WIZARD_CLIP);
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 20_000 });
    await snap("choose", 1.8, WIZARD_CLIP);
    await win.locator(".garmy-preview-btn").click();
    await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
    await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(days < 10 ? 5 : 30);
    await win.waitForTimeout(1_200);
    await snap("preview", 2, WIZARD_CLIP);
    await win.locator(".garmy-create").click();
    await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/(Garmin dashboard|Дашборд)/);
}

test("hero reel and stills: key to finished dashboard", async ({ win, obsidian, demo }) => {
    await stage(demo, obsidian);
    await setKey(win, "");
    await obsidian.hideProperties();
    await installDemoGarmin(obsidian, 365, 330);
    const film = demo.film({ name: "film-wizard", kind: "desktop", clip: WINDOW_CLIP });
    await runWizardToNote(win, obsidian, 365, "365", async (label, hold) => { await film.shot({ hold }); if (label === "key") await stillModal(win, "wizard-key-light"); if (label === "choose") await stillModal(win, "wizard-choose-light"); if (label === "preview") await stillModal(win, "wizard-preview-light"); });
    // what the marker looks like in Live Preview with the cursor elsewhere (for a look, not for the README)
    await obsidian.evaluate((app: App) => {
        const ed = app.workspace.activeEditor?.editor;
        ed?.setCursor(ed.lastLine(), 0);
    });
    await win.waitForTimeout(700);
    fs.mkdirSync(path.join(ROOT, ".capture"), { recursive: true });
    await win.screenshot({ path: path.join(ROOT, ".capture", "live-preview-marker.png"), clip: WINDOW_CLIP });
    await openActiveInReading(win, obsidian);
    await settleNote(win, obsidian);
    await obsidian.clearNotices();
    for (const [i, y] of [0, 520, 1100, 1750, 2450, 3200].entries()) {
        await scrollNote(win, y);
        await win.waitForTimeout(500);
        await film.shot({ hold: i === 0 ? 2.2 : 1.5 });
        await still(win, `dashboard-${i + 1}-light`, WINDOW_CLIP);
    }
    await obsidian.setTheme({ mode: "dark" });
    await settleNote(win, obsidian);
    for (const [i, y] of [0, 1100, 2450].entries()) { await scrollNote(win, y); await win.waitForTimeout(500); await still(win, `dashboard-${i === 0 ? 1 : i === 1 ? 3 : 5}-dark`, WINDOW_CLIP); }
});

test("rebuild reel: a young dashboard grows up", async ({ win, obsidian, demo }) => {
    await stage(demo, obsidian);
    await setKey(win, "");
    await obsidian.hideProperties();
    await installDemoGarmin(obsidian, 6, 0);
    await runWizardToNote(win, obsidian, 6, "30");
    const youngPath = await activePath(obsidian);
    await openActiveInReading(win, obsidian);
    await settleNote(win, obsidian);
    await obsidian.clearNotices();
    const film = demo.film({ name: "film-rebuild", kind: "desktop", clip: WINDOW_CLIP });
    await film.shot({ hold: 2.6 });
    await still(win, "young-light", WINDOW_CLIP);

    // the diary grows: load a longer history through the wizard, then come back to the first note
    await installDemoGarmin(obsidian, 120, 0);
    await openWizard(win);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-period").selectOption("90");
    await win.locator(".garmy-load").click();
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 60_000 });
    await win.keyboard.press("Escape");
    await win.waitForTimeout(500);
    await openInReading(win, obsidian, youngPath);
    await obsidian.runCommand("garmidian:rebuild-dashboard");
    await win.waitForTimeout(800);
    await win.locator(".notice").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    await film.shot({ hold: 1.4 });
    await settleNote(win, obsidian);
    for (const [i, y] of [0, 700, 1500, 2300].entries()) { await scrollNote(win, y); await win.waitForTimeout(500); await film.shot({ hold: i === 0 ? 2.2 : 1.5 }); if (i === 0) await still(win, "rebuilt-light", WINDOW_CLIP); }
});

test("languages reel: the same step in six languages", async ({ win, obsidian, demo }) => {
    await stage(demo, obsidian);
    await setKey(win, "");
    const film = demo.film({ name: "film-languages", kind: "desktop", clip: WINDOW_CLIP });
    for (const code of ["en", "de", "fr", "es", "pt", "ja", "ru"]) {
        await obsidian.evaluate((app: GarmyApp, c: string) => {
            const p = app.plugins.plugins.garmidian;
            if (p) p.settings.language = c;
        }, code);
        await openWizard(win);
        await win.waitForTimeout(500);
        await film.shot({ hold: 1.5 });
        if (code === "de") await stillModal(win, "wizard-key-de");
        await win.keyboard.press("Escape");
        await win.waitForTimeout(400);
    }
});

test("phone stills: the mobile interface in a phone-sized window", async ({ win, obsidian }) => {
    // Obsidian's own mobile interface (app.emulateMobile) in a 390 px window. It is not a device: nothing here
    // proves requestUrl or secure storage on iOS or Android, only that the layout and the blocks fit a phone.
    const out = path.join(ROOT, ".capture", "phone");
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    await obsidian.mobile({ width: 390, height: 700, scale: 1 });
    await obsidian.hideProperties();
    await setKey(win, "");
    await installDemoGarmin(obsidian, 365, 0);
    // "css" keeps every picture 390 x 700 pixels whichever display the window opened on (a Retina one would give 780 x 1400)
    const shot = (name: string): Promise<Buffer> => win.screenshot({ path: path.join(out, `${name}.png`), scale: "css" });
    await runWizardToNote(win, obsidian, 365, "365", async (label) => {
        if (label === "key") { await win.waitForTimeout(400); await shot("1-key"); }
        if (label === "choose") await shot("2-choose");
        if (label === "preview") await shot("3-preview");
    });
    await openActiveInReading(win, obsidian);
    await settleNote(win, obsidian);
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
async function shootTemplate(win: Page, obsidian: ObsidianHelpers, id: string, shots: Array<{ y: number; name: string; dark?: boolean }>, min = 8, race?: string): Promise<void> {
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
    await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\//);
    await openActiveInReading(win, obsidian);
    await settleNote(win, obsidian, min);
    await obsidian.clearNotices();
    for (const sh of shots.filter((x) => !x.dark)) { await scrollNote(win, sh.y); await win.waitForTimeout(500); await still(win, `${sh.name}-light`, WINDOW_CLIP); }
    const dark = shots.filter((x) => x.dark);
    if (dark.length) {
        await obsidian.setTheme({ mode: "dark" });
        await settleNote(win, obsidian, min);
        for (const sh of dark) { await scrollNote(win, sh.y); await win.waitForTimeout(500); await still(win, `${sh.name}-dark`, WINDOW_CLIP); }
        await obsidian.setTheme({ mode: "light" });
    }
}

test("library: the choice, a clip through it, and a page of every kind", async ({ win, obsidian, demo }) => {
    await stage(demo, obsidian);
    await setKey(win, "");
    await obsidian.hideProperties();
    await installDemoGarmin(obsidian, 365, 0);
    // one load; every later wizard run builds on the saved days
    await openWizard(win);
    await win.locator(".garmy-key").fill("GRM-8f2c-41aa-93d7-5be0c6a19f40");
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-period").selectOption("365");
    await win.locator(".garmy-load").click();
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 90_000 });

    // a race six weeks ahead, so the race page has a countdown
    const race = new Date(new Date(TODAY).getTime() + 42 * 864e5);
    const raceDate = `${race.getFullYear()}-${String(race.getMonth() + 1).padStart(2, "0")}-${String(race.getDate()).padStart(2, "0")}`;
    await win.locator(".garmy-options summary").click();
    await win.locator(".garmy-options-body input[type=text]").first().fill(raceDate);
    await win.locator(".garmy-options summary").click();
    await win.evaluate(() => { const b = document.querySelector(".garmy-wizard .garmy-body"); if (b) b.scrollTop = 0; });
    await win.waitForTimeout(500);
    await stillTall(win, "wizard-library-light");

    const film = demo.film({ name: "film-library", kind: "desktop", clip: { x: 110, y: 40, width: 980, height: 1000 } });
    for (const [i, id] of ["overview", "sleep", "sport:run", "triathlon", "race", "week"].entries()) {
        await card(win, id).check({ force: true });
        await win.waitForTimeout(450);
        await film.shot({ hold: i === 0 ? 1.8 : 1.4 });
    }
    await win.keyboard.press("Escape");

    const top = [{ y: 0, name: "" }];
    const two = (n: string): Array<{ y: number; name: string; dark?: boolean }> => [{ y: 0, name: `tpl-${n}-a` }, { y: 760, name: `tpl-${n}-b` }];
    await shootTemplate(win, obsidian, "glance", [{ y: 0, name: "tpl-glance-a" }, { y: 0, name: "tpl-glance-a", dark: true }], 4);
    await shootTemplate(win, obsidian, "sleep", [...two("sleep"), { y: 0, name: "tpl-sleep-a", dark: true }]);
    await shootTemplate(win, obsidian, "recovery", two("recovery"));
    await shootTemplate(win, obsidian, "steps", two("steps"));
    await shootTemplate(win, obsidian, "sport:run", [...two("run"), { y: 0, name: "tpl-run-a", dark: true }]);
    await shootTemplate(win, obsidian, "sport:strength", two("strength"));
    await shootTemplate(win, obsidian, "triathlon", two("triathlon"));
    await shootTemplate(win, obsidian, "race", two("race"), 8, raceDate);
    await shootTemplate(win, obsidian, "week", two("week"));
    await shootTemplate(win, obsidian, "month", two("month"));
    await shootTemplate(win, obsidian, "year", two("year"));

    // miles: the same run page in the imperial system
    await obsidian.evaluate((app: GarmyApp) => app.plugins.plugins.garmidian!.setUnits("imperial"));
    await shootTemplate(win, obsidian, "sport:run", [{ y: 0, name: "tpl-run-miles-a" }]);
    void top;
});
