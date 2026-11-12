import type { Locator, Page } from "@playwright/test";
import type { DemoHelpers, ObsidianHelpers, VaultHandle } from "obsidian-plugin-dev-kit/e2e";
import { test, expect, onlyWhen, openWizard, setKey, activePath, type GarmyApp } from "./fixtures";
import { installDemoGarmin } from "./demo-garmin";

/**
 * Pictures and clips for the README, the site and the community listing, taken from the real plugin in real Obsidian
 * with generated demo data. Off unless CAPTURE=1 (npm run capture). Everything goes through the kit's `demo` fixture:
 * frames and stills land in .opdk/demo, and `opdk demo` turns the films into GIFs and copies the stills to docs/screens
 * (settings in opdk.config.mjs). Stills are always 2x, whatever the display.
 */
// A fixed day for every picture: the fake Garmin builds its history back from "today", so the pictures and the films
// do not depend on the day they are shot. A Wednesday, so the demo week has trained days on both sides of it.
const TODAY = "2026-11-11T09:26:00";
const WINDOW_CLIP = { x: 0, y: 0, width: 1200, height: 860 };
// The wizard films: a box that holds the tallest step with the modal pinned to its top (see pinModal), and the library
// film's box, which is taller because that step lists every card. The window asks for 1500 px but Obsidian keeps it
// inside the display (1084 px on the machine these were taken on), and a clip past the window fails the shot, so the
// hero box stays under that.
const HERO_CLIP = { x: 0, y: 0, width: 1200, height: 1080 };
const LIBRARY_CLIP = { x: 110, y: 40, width: 980, height: 1000 };
const KEY = "GRM-8f2c-41aa-93d7-5be0c6a19f40";

test.describe.configure({ mode: "serial" });
onlyWhen("CAPTURE");
test.setTimeout(300_000);

/** How a spec reaches the page: a plain click for pictures, the travelling cursor for a film, a finger on a phone. */
interface Pointer {
    click(target: Locator): Promise<void>;
    type(target: Locator, text: string): Promise<void>;
}

const plain: Pointer = {
    click: (target) => target.click(),
    type: (target, text) => target.fill(text),
};
const mouse = (demo: DemoHelpers): Pointer => ({
    click: (target) => demo.moveAndClick(target),
    type: (target, text) => demo.typeSlowly(target, text, { delayMs: 30 }),
});
const finger = (demo: DemoHelpers): Pointer => ({
    click: (target) => demo.tap(target),
    type: async (target, text) => {
        await demo.tap(target);
        await demo.typeSlowly(text, { delayMs: 30 });
    },
});

/**
 * Notes without their properties block. `obsidian.hideProperties()` changes the setting in memory only: Obsidian reads
 * app.json again a moment later (after the settings `cleanUi` saves) and the block comes back. Written into app.json,
 * the setting stays.
 */
function hideProperties(vault: VaultHandle): void {
    const appJson = JSON.parse(vault.read(".obsidian/app.json")) as Record<string, unknown>;
    vault.write(".obsidian/app.json", JSON.stringify({ ...appJson, propertiesInDocument: "hidden" }, null, 2));
}

/** The same day, a window without the ribbon, status bar, tab headers, note title and properties, with both side panels folded. */
async function stage(demo: DemoHelpers, obsidian: ObsidianHelpers, vault: VaultHandle): Promise<void> {
    await demo.freezeTime(TODAY);
    await demo.cleanUi();
    hideProperties(vault);
}

/**
 * Obsidian centres a modal in the window, so the modal jumps up and down in a film from one step to the next. Pinned to
 * the top, it stays where it is and a film's frame can be one fixed box.
 */
async function pinModal(win: Page): Promise<void> {
    await win.addStyleTag({ content: ".modal-container { align-items: flex-start !important; padding-top: 48px !important; }" });
}

/** The wizard window with a margin, whatever size the step makes it. */
const modalClip = (win: Page): { clip: Locator; padding: number } => ({ clip: win.locator(".garmy-wizard"), padding: 28 });

/**
 * Draws every block of the note in reading view (lazy blocks need a scroll), then returns to the top. The kit's
 * scrollThrough stays at the bottom, and the pictures start at the top of the note.
 */
async function settleNote(win: Page, obsidian: ObsidianHelpers, min = 20): Promise<void> {
    const sel = ".workspace-leaf.mod-active .markdown-preview-view";
    await expect.poll(() => win.locator(`${sel} [class*='dashy']`).count(), { timeout: 30_000 }).toBeGreaterThan(min);
    await obsidian.scrollThrough(sel);
    await scrollNote(win, 0);
    await obsidian.settle({ root: sel });
}

const scrollNote = (win: Page, y: number): Promise<void> => win.evaluate((top) => {
    const r = document.querySelector(".workspace-leaf.mod-active .markdown-preview-view");
    if (r) r.scrollTop = top;
}, y);

/** Reading view of a note (the active one without a path). */
async function openInReading(win: Page, obsidian: ObsidianHelpers, path?: string): Promise<void> {
    await obsidian.readingView(path);
    await expect(win.locator(".workspace-leaf.mod-active .markdown-preview-view")).toBeVisible();
    await expect(win.locator(".workspace-leaf.mod-active .metadata-container")).toBeHidden();
}

interface WizardRun {
    pointer: Pointer;
    days: number;
    period: string;
    /** Called at each step with the step's name and how long a film holds it. */
    onStep?: (label: "key" | "load" | "loading" | "loaded" | "choose" | "preview", hold: number) => Promise<void>;
}

async function runWizardToNote(win: Page, obsidian: ObsidianHelpers, run: WizardRun): Promise<void> {
    const { pointer, days, period } = run;
    const step = run.onStep ?? (async () => undefined);
    await openWizard(win);
    await step("key", 1.5);
    await pointer.type(win.locator(".garmy-key"), KEY);
    await step("key", 0.9);
    await pointer.click(win.locator(".garmy-key-check"));
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    // A native <select> opens a menu the picture does not show, so the cursor goes to it and the value is set.
    await win.locator(".garmy-period").hover();
    await win.locator(".garmy-period").selectOption(period);
    await step("load", 1.2);
    await pointer.click(win.locator(".garmy-load"));
    // The loading frames sample a load that is running, so they are taken at the pace of the load and are not settled.
    for (let i = 0; i < 90; i++) {
        if (await win.locator(".garmy-loaded").count()) break;
        await step("loading", 0.65);
        await win.waitForTimeout(500);
    }
    await win.locator(".garmy-loaded").waitFor({ timeout: 60_000 });
    await step("loaded", 1.6);
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 20_000 });
    await step("choose", 1.8);
    await pointer.click(win.locator(".garmy-preview-btn"));
    await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
    await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(days < 10 ? 5 : 30);
    await step("preview", 2);
    await pointer.click(win.locator(".garmy-create"));
    await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/(Garmin dashboard|Дашборд)/);
}

/** Every still is 2x, settled, and without the cursor arrow. */
const STILL = { settle: true, cursor: false } as const;

test("hero film and stills: key to finished dashboard", async ({ win, obsidian, demo, vault }) => {
    await stage(demo, obsidian, vault);
    await pinModal(win);
    await setKey(win, "");
    await installDemoGarmin(obsidian, 365, 330);
    const film = demo.film({ name: "film-wizard", kind: "desktop", clip: HERO_CLIP });
    await runWizardToNote(win, obsidian, {
        pointer: mouse(demo),
        days: 365,
        period: "365",
        onStep: async (label, hold) => {
            await film.shot({ hold, settle: label !== "loading" });
            if (label === "key" && hold > 1) await demo.still("wizard-key-light", { ...modalClip(win), ...STILL });
            if (label === "choose") await demo.still("wizard-choose-light", { ...modalClip(win), ...STILL });
            if (label === "preview") await demo.still("wizard-preview-light", { ...modalClip(win), ...STILL });
        },
    });
    // The note frames follow the Create click: the arrow would sit over the note where the button was.
    await demo.hideCursor();
    await openInReading(win, obsidian);
    await settleNote(win, obsidian);
    await obsidian.clearNotices();
    for (const [i, y] of [0, 520, 1100, 1750, 2450, 3200].entries()) {
        await scrollNote(win, y);
        await film.shot({ hold: i === 0 ? 2.2 : 1.5, settle: true });
        await demo.still(`dashboard-${i + 1}-light`, { clip: WINDOW_CLIP, ...STILL });
    }
    await obsidian.setTheme({ mode: "dark" });
    await settleNote(win, obsidian);
    for (const [y, n] of [[0, 1], [1100, 3], [2450, 5]] as const) {
        await scrollNote(win, y);
        await demo.still(`dashboard-${n}-dark`, { clip: WINDOW_CLIP, ...STILL });
    }
});

test("rebuild film: a young dashboard grows up", async ({ win, obsidian, demo, vault }) => {
    await stage(demo, obsidian, vault);
    await setKey(win, "");
    await installDemoGarmin(obsidian, 6, 0);
    await runWizardToNote(win, obsidian, { pointer: plain, days: 6, period: "30" });
    const youngPath = await activePath(obsidian);
    await openInReading(win, obsidian);
    await settleNote(win, obsidian);
    await obsidian.clearNotices();
    // Nothing in this film is clicked, so there is no cursor to show.
    const film = demo.film({ name: "film-rebuild", kind: "desktop", clip: WINDOW_CLIP, cursor: false });
    await film.shot({ hold: 2.6, settle: true });

    // the diary grows: load a longer history through the wizard, then come back to the first note
    await installDemoGarmin(obsidian, 120, 0);
    await openWizard(win);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-period").selectOption("90");
    await win.locator(".garmy-load").click();
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 60_000 });
    await win.keyboard.press("Escape");
    await expect(win.locator(".garmy-wizard")).toHaveCount(0);
    await openInReading(win, obsidian, youngPath);
    await obsidian.runCommand("garmidian:rebuild-dashboard");
    await expect(win.locator(".notice").first()).toBeVisible({ timeout: 10_000 });
    await film.shot({ hold: 1.4, settle: true });
    await settleNote(win, obsidian);
    for (const [i, y] of [0, 700, 1500, 2300].entries()) {
        await scrollNote(win, y);
        await film.shot({ hold: i === 0 ? 2.2 : 1.5, settle: true });
    }
});

test("languages film: the same step in seven languages", async ({ win, obsidian, demo, vault }) => {
    await stage(demo, obsidian, vault);
    await pinModal(win);
    await setKey(win, "");
    // Nothing in this film is clicked, so there is no cursor to show.
    const film = demo.film({ name: "film-languages", kind: "desktop", clip: WINDOW_CLIP, cursor: false });
    for (const code of ["en", "de", "fr", "es", "pt", "ja", "ru"]) {
        await obsidian.evaluate((app: GarmyApp, c: string) => {
            const p = app.plugins.plugins.garmidian;
            if (p) p.settings.language = c;
        }, code);
        await openWizard(win);
        await film.shot({ hold: 1.5, settle: true });
        await win.keyboard.press("Escape");
        await expect(win.locator(".garmy-wizard")).toHaveCount(0);
    }
});

test("phone stills: the mobile interface in a phone-sized window", async ({ win, obsidian, demo, vault }) => {
    // Obsidian's own mobile interface (app.emulateMobile) in a 390 px window. It is not a device: nothing here
    // proves requestUrl or secure storage on iOS or Android, only that the layout and the blocks fit a phone.
    // 780 x 1400 pixels at 2x on any display; the listing pictures (npm run listing) frame these.
    await obsidian.mobile({ width: 390, height: 700 });
    await demo.freezeTime(TODAY);
    await demo.cleanUi({ sidebars: false });
    // Obsidian's bottom toolbar floats over the cards at the foot of the page, and the pictures are of the plugin.
    await win.addStyleTag({ content: ".mobile-navbar { display: none !important; }" });
    hideProperties(vault);
    await setKey(win, "");
    await installDemoGarmin(obsidian, 365, 0);
    await runWizardToNote(win, obsidian, {
        pointer: finger(demo),
        days: 365,
        period: "365",
        onStep: async (label, hold) => {
            if (label === "key" && hold > 1) await demo.still("phone-key", STILL);
            if (label === "choose") await demo.still("phone-choose", STILL);
        },
    });
    await openInReading(win, obsidian);
    await settleNote(win, obsidian);
    await obsidian.clearNotices();
    for (const [name, y] of [["phone-recovery", 0], ["phone-week", 605], ["phone-charts", 1500]] as const) {
        await scrollNote(win, y);
        await demo.still(name, STILL);
    }
});

/** A library card by template id: the label that is clicked, not its hidden radio. */
const card = (win: Page, id: string): Locator => win.locator(`label.garmy-card:has(input.garmy-tpl-${id.replace(":", "-")})`);

/** Opens the wizard on the data that is already saved and stops at the choice. */
async function toChoice(win: Page): Promise<void> {
    await openWizard(win);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-use-saved").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-use-saved").click();
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 15_000 });
}

/** Builds one kind of dashboard through the wizard and takes the stills asked for, in reading view. */
async function shootTemplate(win: Page, obsidian: ObsidianHelpers, demo: DemoHelpers, id: string, shots: Array<{ y: number; name: string; dark?: boolean }>, min = 8, race?: string): Promise<void> {
    await toChoice(win);
    if (race) {
        // a race card waits for a date, and a new wizard window starts without the one typed before
        await win.locator(".garmy-options summary").click();
        await win.locator(".garmy-options-body input[type=text]").first().fill(race);
    }
    await card(win, id).click();
    await win.locator(".garmy-preview-btn").click();
    await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
    await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(3);
    await obsidian.settle({ root: ".garmy-preview" });
    await win.locator(".garmy-create").click();
    await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\//);
    await openInReading(win, obsidian);
    await settleNote(win, obsidian, min);
    await obsidian.clearNotices();
    for (const sh of shots.filter((x) => !x.dark)) {
        await scrollNote(win, sh.y);
        await demo.still(`${sh.name}-light`, { clip: WINDOW_CLIP, ...STILL });
    }
    const dark = shots.filter((x) => x.dark);
    if (dark.length) {
        await obsidian.setTheme({ mode: "dark" });
        await settleNote(win, obsidian, min);
        for (const sh of dark) {
            await scrollNote(win, sh.y);
            await demo.still(`${sh.name}-dark`, { clip: WINDOW_CLIP, ...STILL });
        }
        await obsidian.setTheme({ mode: "light" });
    }
}

test("library: the choice, a clip through it, and a page of every kind", async ({ win, obsidian, demo, vault }) => {
    await stage(demo, obsidian, vault);
    await pinModal(win);
    await setKey(win, "");
    await installDemoGarmin(obsidian, 365, 0);
    // one load; every later wizard run builds on the saved days
    await openWizard(win);
    await win.locator(".garmy-key").fill(KEY);
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
    // the library is longer than the other steps: the whole modal, as tall as it is
    await demo.still("wizard-library-light", { ...modalClip(win), ...STILL });

    const film = demo.film({ name: "film-library", kind: "desktop", clip: LIBRARY_CLIP });
    for (const [i, id] of ["overview", "sleep", "sport:run", "triathlon", "race", "week"].entries()) {
        const target = card(win, id);
        await demo.moveAndClick(target);
        await expect(target.locator("input")).toBeChecked();
        await film.shot({ hold: i === 0 ? 1.8 : 1.4, settle: true });
    }
    await win.keyboard.press("Escape");
    await expect(win.locator(".garmy-wizard")).toHaveCount(0);

    // only the pages the README and the site show
    const two = (n: string): Array<{ y: number; name: string }> => [{ y: 0, name: `tpl-${n}-a` }, { y: 760, name: `tpl-${n}-b` }];
    await shootTemplate(win, obsidian, demo, "glance", [{ y: 0, name: "tpl-glance-a" }], 4);
    await shootTemplate(win, obsidian, demo, "steps", two("steps"));
    await shootTemplate(win, obsidian, demo, "sport:run", two("run"));
    await shootTemplate(win, obsidian, demo, "sport:strength", [{ y: 0, name: "tpl-strength-a" }]);
    await shootTemplate(win, obsidian, demo, "race", two("race"), 8, raceDate);
    await shootTemplate(win, obsidian, demo, "week", two("week"));
    await shootTemplate(win, obsidian, demo, "month", [{ y: 0, name: "tpl-month-a" }]);

    // miles: the same run page in the imperial system
    await obsidian.evaluate((app: GarmyApp) => app.plugins.plugins.garmidian!.setUnits("imperial"));
    await shootTemplate(win, obsidian, demo, "sport:run", [{ y: 0, name: "tpl-run-miles-a" }]);
});
