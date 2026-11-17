import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { DemoHelpers, ObsidianHelpers, VaultHandle } from "obsidian-plugin-dev-kit/e2e";
import { test, expect, onlyWhen, openWizard, setKey, activePath, type GarmyApp } from "./fixtures";
import { installDemoGarmin } from "./demo-garmin";

/**
 * Clips for the YouTube overview (docs/video/storyboard.md): continuous screen recordings of the real plugin in real
 * Obsidian with the demo Garmin, one .webm per scene group. Off unless VIDEO=1 (npm run video:clips, which uses playwright.video.config.ts: the kit's own video and trace would hold the screencast at 800x450). Clips go to
 * out/video/clips (not committed); scripts/video/assemble.sh fits them to the voice and joins them.
 */
onlyWhen("VIDEO");

const OUT = path.resolve(import.meta.dirname, "..", "out", "video", "clips");
const TODAY = "2026-11-11T09:26:00";
const KEY = "GRM-8f2c-41aa-93d7-5be0c6a19f40";
// The recording is as big as the window; scripts/video/assemble.sh scales it to 1920x1080. A larger `size` only pads the picture with grey.
const SIZE = { width: 1440, height: 810 };

test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
});

/** A 16:9 window that fits the display, so the clip needs no crop. */
async function frame(win: Page, electron: { evaluate: <R>(fn: (m: { BrowserWindow: { getAllWindows(): Array<{ setContentSize(w: number, h: number): void; center(): void }> } }) => R) => Promise<R> }): Promise<void> {
    await electron.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.setContentSize(1440, 810);
        w?.center();
    });
    // Without an explicit viewport Playwright records an Electron page at 800x450 whatever `size` says.
    await win.setViewportSize({ width: 1440, height: 810 });
}

async function record(win: Page, name: string, take: () => Promise<void>): Promise<void> {
    await win.screencast.start({ path: path.join(OUT, `${name}.webm`), size: SIZE, quality: 95 });
    try {
        await take();
    } finally {
        await win.screencast.stop();
    }
}

/** The wizard keeps its steps in one scrolling box: the first element inside it that has more content than room. */
const scrollWizardTo = (win: Page, frac: number): Promise<void> => win.evaluate((f) => {
    const root = document.querySelector(".garmy-wizard");
    if (!root) return;
    const box = [root, ...Array.from(root.querySelectorAll("*"))].find((el) => el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY !== "visible");
    if (box) box.scrollTop = (box.scrollHeight - box.clientHeight) * f;
}, frac);

/** A slow, even scroll of the note in reading view, from `from` to `to` pixels over `seconds`. */
async function glide(win: Page, from: number, to: number, seconds: number): Promise<void> {
    const steps = Math.round(seconds * 20);
    for (let i = 0; i <= steps; i++) {
        const y = from + ((to - from) * i) / steps;
        await win.evaluate((top) => {
            const r = document.querySelector(".workspace-leaf.mod-active .markdown-preview-view");
            if (r) r.scrollTop = top;
        }, y);
        await win.waitForTimeout(50);
    }
}

async function openInReading(win: Page, obsidian: ObsidianHelpers): Promise<void> {
    await obsidian.readingView();
    await expect(win.locator(".workspace-leaf.mod-active .markdown-preview-view")).toBeVisible();
}

async function settleNote(win: Page, obsidian: ObsidianHelpers): Promise<void> {
    const sel = ".workspace-leaf.mod-active .markdown-preview-view";
    await expect.poll(() => win.locator(`${sel} [class*='dashy']`).count(), { timeout: 30_000 }).toBeGreaterThan(20);
    await obsidian.scrollThrough(sel);
    await glide(win, 3200, 0, 0.1);
    await obsidian.settle({ root: sel });
}

/** Notes without their properties block; written into app.json because Obsidian reads it again a moment after the settings change. */
function hideProperties(vault: VaultHandle): void {
    const appJson = JSON.parse(vault.read(".obsidian/app.json")) as Record<string, unknown>;
    vault.write(".obsidian/app.json", JSON.stringify({ ...appJson, propertiesInDocument: "hidden" }, null, 2));
}

async function stage(win: Page, demo: DemoHelpers, obsidian: ObsidianHelpers, vault: VaultHandle): Promise<void> {
    await demo.freezeTime(TODAY);
    await demo.cleanUi();
    hideProperties(vault);
    await win.addStyleTag({ content: ".modal-container { align-items: flex-start !important; padding-top: 36px !important; }" });
    await setKey(win, "");
    void obsidian;
}

test("clip 1: key, load and the library, then the note", async ({ win, obsidian, demo, vault, app: electron }) => {
    await frame(win, electron);
    await stage(win, demo, obsidian, vault);
    await installDemoGarmin(obsidian, 365, 330);
    await record(win, "wizard", async () => {
        await openWizard(win);
        // the key step is on screen while the voice explains where the key comes from
        await demo.beat(11);
        await demo.typeSlowly(win.locator(".garmy-key"), KEY, { delayMs: 45 });
        await demo.beat(1);
        await demo.moveAndClick(win.locator(".garmy-key-check"));
        await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
        await demo.beat(1.5);
        await win.locator(".garmy-period").hover();
        await win.locator(".garmy-period").selectOption("365");
        await demo.beat(1.5);
        await demo.moveAndClick(win.locator(".garmy-load"));
        await win.locator(".garmy-loaded").waitFor({ timeout: 60_000 });
        await demo.beat(2.5);
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 20_000 });
        // the library: from the first card to the last, then back to the top
        await demo.beat(2);
        for (let i = 0; i <= 20; i++) {
            await scrollWizardTo(win, i / 20);
            await win.waitForTimeout(450);
        }
        await demo.beat(1.5);
        await scrollWizardTo(win, 0);
        await demo.beat(1.5);
        await demo.moveAndClick(win.locator(".garmy-preview-btn"));
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(30);
        await demo.beat(3);
        await demo.moveAndClick(win.locator(".garmy-create"));
        await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/(Garmin dashboard|Дашборд)/);
        await demo.hideCursor();
    });
    // the note itself, a second clip so it can be replaced by a take on another vault
    await openInReading(win, obsidian);
    await settleNote(win, obsidian);
    await obsidian.clearNotices();
    await record(win, "note", async () => {
        await win.waitForTimeout(2500);
        await glide(win, 0, 3300, 26);
        await win.waitForTimeout(1500);
    });
});

test("clip 2: rebuild, miles and seven languages", async ({ win, obsidian, demo, vault, app: electron }) => {
    await frame(win, electron);
    await stage(win, demo, obsidian, vault);
    await installDemoGarmin(obsidian, 365, 0);
    await setKey(win, KEY);
    await openWizard(win);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 15_000 });
    await win.locator(".garmy-load").click();
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 60_000 });
    await win.locator(".garmy-preview-btn").click();
    await win.locator(".garmy-create").waitFor({ timeout: 10_000 });
    await win.locator(".garmy-create").click();
    await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/(Garmin dashboard|Дашборд)/);
    await openInReading(win, obsidian);
    await settleNote(win, obsidian);
    await obsidian.clearNotices();
    // park the pointer in the margin, over a link it would open a hover card
    await win.mouse.move(1430, 400);
    await record(win, "variants", async () => {
        await win.waitForTimeout(1500);
        await glide(win, 0, 700, 3);
        // kilometres to miles: the plugin converts the note
        await obsidian.evaluate(async (app: GarmyApp) => { await app.plugins.plugins.garmidian?.setUnits("imperial"); });
        await win.waitForTimeout(2500);
        await glide(win, 700, 1500, 4);
        await obsidian.evaluate(async (app: GarmyApp) => { await app.plugins.plugins.garmidian?.setUnits("metric"); });
        await win.waitForTimeout(1500);
        // the wizard in seven languages
        await glide(win, 1500, 0, 1);
        for (const code of ["en", "de", "fr", "es", "pt", "ja", "ru"]) {
            await obsidian.evaluate((app: GarmyApp, c: string) => {
                const p = app.plugins.plugins.garmidian;
                if (p) p.settings.language = c;
            }, code);
            await openWizard(win);
            await win.waitForTimeout(1500);
            await win.keyboard.press("Escape");
            await expect(win.locator(".garmy-wizard")).toHaveCount(0);
        }
    });
});

test("clip 3: Garmy in the community plugin catalog", async ({ win, obsidian, demo, app: electron }) => {
    await frame(win, electron);
    await demo.cleanUi();
    // The test vault has Garmy installed, so the catalog would offer Uninstall. For this scene it is forgotten, as on a vault that has never had it.
    await obsidian.evaluate(async (app: GarmyApp) => {
        await app.plugins.disablePlugin("garmidian");
        delete app.plugins.manifests["garmidian"];
    });
    // Real catalog over the network: the plugin has to be there and the browser must find it by name. The Install button is never clicked.
    await win.evaluate(() => {
        const app = (globalThis as unknown as { app: { setting: { open(): void; openTabById(id: string): void } } }).app;
        app.setting.open();
        app.setting.openTabById("community-plugins");
    });
    const browse = win.getByRole("button", { name: "Browse" });
    await browse.waitFor({ timeout: 10_000 });
    await win.mouse.move(1430, 400);
    await record(win, "catalog", async () => {
        await demo.beat(2.5);
        await demo.moveAndClick(browse);
        const search = win.locator(".modal.mod-community-modal input[type=search], .modal.mod-community-modal input[type=text]").first();
        await search.waitFor({ timeout: 20_000 });
        await demo.beat(1.5);
        await demo.typeSlowly(search, "Garmy", { delayMs: 140 });
        const hit = win.locator(".modal.mod-community-modal .community-item", { hasText: "Garmy" }).first();
        await hit.waitFor({ timeout: 20_000 });
        await demo.beat(2.5);
        await demo.moveAndClick(hit);
        await win.getByRole("button", { name: /^Install$/ }).waitFor({ timeout: 10_000 });
        await demo.beat(4);
        await demo.hideCursor();
    });
    await win.keyboard.press("Escape");
});

test("clip 4: scene 5 on the author's own Garmy data", async ({ win, obsidian, demo, vault, app: electron }) => {
    // The numbers are the author's real ones: the daily notes of Garmy/data (metrics in the frontmatter, no diary text) are copied into the
    // test vault, and the dashboard is built from them by Garmy's own rebuild command, in English. The real vault is only read.
    const src = path.join(process.env.REAL_VAULT ?? path.join(os.homedir(), "my-obsidian-vault"), "Garmy");
    const data = fs.readdirSync(path.join(src, "data")).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
    expect(data.length).toBeGreaterThan(100);
    await frame(win, electron);
    await stage(win, demo, obsidian, vault);
    for (const name of data) vault.write(`Garmy/data/${name}`, fs.readFileSync(path.join(src, "data", name), "utf8"));
    const dashboard = fs.readFileSync(path.join(src, "Дашборд Garmin.md"), "utf8").replace("||ru||", "||en||").replace("# Мой дашборд Garmin", "# My Garmin dashboard");
    vault.write("Garmy/Garmin dashboard.md", dashboard);
    await win.addStyleTag({ content: ".metadata-container { display: none !important; }" });
    // Garmy reads the whole folder when it rebuilds, so wait until Obsidian has read every note's properties.
    await expect.poll(() => obsidian.evaluate((app: GarmyApp) => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Garmy/data/") && app.metadataCache.getFileCache(f)?.frontmatter).length), { timeout: 60_000 }).toBe(data.length);
    await installDemoGarmin(obsidian, 3, 0);
    await expect.poll(() => obsidian.evaluate((app: GarmyApp) => app.vault.getFileByPath("Garmy/Garmin dashboard.md") !== null), { timeout: 20_000 }).toBe(true);
    await obsidian.evaluate(async (app: GarmyApp) => {
        const file = app.vault.getFileByPath("Garmy/Garmin dashboard.md");
        if (file) await app.workspace.getLeaf(false).openFile(file);
    });
    await expect.poll(() => activePath(obsidian)).toBe("Garmy/Garmin dashboard.md");
    await obsidian.runCommand("garmidian:rebuild-dashboard");
    await expect(win.locator(".notice").first()).toBeVisible({ timeout: 15_000 });
    await win.waitForTimeout(3000);
    // a fresh window, so the reading view draws the rebuilt note once and not on top of the old one
    await obsidian.reload();
    await win.addStyleTag({ content: ".metadata-container { display: none !important; }" });
    await obsidian.evaluate(async (app: GarmyApp) => {
        const file = app.vault.getFileByPath("Garmy/Garmin dashboard.md");
        if (file) await app.workspace.getLeaf(false).openFile(file);
    });
    await expect.poll(() => activePath(obsidian)).toBe("Garmy/Garmin dashboard.md");
    await openInReading(win, obsidian);
    await settleNote(win, obsidian);
    // Blocks with sparklines grow after they are first measured; a resize makes the reading view lay the note out again
    await win.setViewportSize({ width: 1380, height: 810 });
    await win.waitForTimeout(1200);
    await win.setViewportSize({ width: 1440, height: 810 });
    await win.waitForTimeout(1500);
    await settleNote(win, obsidian);
    await win.waitForTimeout(1500);
    await obsidian.clearNotices();
    await win.mouse.move(1430, 400);
    const max = await win.evaluate(() => {
        const r = document.querySelector(".workspace-leaf.mod-active .markdown-preview-view");
        return r ? r.scrollHeight - r.clientHeight : 0;
    });
    // Scrolling this note redraws its sections out of place (blocks end up on top of each other), and so did the screen recorder. The
    // window is made as tall as the note instead, so every section is drawn at once and nothing scrolls; one picture of it is clean, and
    // the composition pans over that picture at a steady speed.
    await win.setViewportSize({ width: 1440, height: Math.round(max) + 900 });
    await win.waitForTimeout(2500);
    await expect.poll(() => win.locator(".workspace-leaf.mod-active .markdown-preview-view [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(20);
    await win.waitForTimeout(2500);
    const box = await win.locator(".workspace-leaf.mod-active .markdown-preview-sizer").boundingBox();
    if (!box) throw new Error("The note has no box");
    await win.screenshot({ path: path.join(OUT, "..", "garmin", "note-real.png"), clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y), width: box.width + 80, height: Math.min(box.height, max + 810) } });
});
