import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { App } from "obsidian";
import { test, expect, onlyWhen, fakeGarmin, openWizard, setKey, dashyReport, activePath, type GarmyApp } from "./fixtures";
import { liveKey } from "./live-key";

onlyWhen("TOUR");

/**
 * A walk through every wizard state with pictures, for a person to look at, plus the layout checks that a picture
 * cannot give. Off unless TOUR=1 (`TOUR=1 npx playwright test e2e/tour.spec.ts`). Pictures go to .e2e/tour (not committed).
 *
 * The network is the fake Garmin. The real one is used only with GARMIN_LIVE=1 as well, for the one test that loads
 * history and builds a dashboard; the key then comes from liveKey() (the same gate as live.spec.ts), read once per run.
 * The layout walks always use the fake, and nothing reads the Keychain without GARMIN_LIVE=1.
 */
const OUT = path.resolve(import.meta.dirname, "..", ".e2e", "tour");
const LIVE = process.env.GARMIN_LIVE === "1";
const FAKE_KEY = "test-key-not-a-secret";
let cachedKey: string | undefined;
/** The real key, read from the Keychain once per run and only in live mode. */
const realKey = (): string => (cachedKey ??= liveKey());

type Reply = { status: number; text: string };

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test.beforeAll(() => {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
});

const shot = (win: Page, name: string): Promise<Buffer> => win.screenshot({ path: path.join(OUT, name) });

async function closeWizard(win: Page): Promise<void> {
    await win.keyboard.press("Escape");
    await expect(win.locator(".garmy-wizard")).toHaveCount(0);
}

/** Key step to the summary of a loaded history: the real Garmin when `live`, the fake one otherwise. */
async function loadHistory(win: Page, obsidian: ObsidianHelpers, days: number, live: boolean = LIVE): Promise<void> {
    if (live) await setKey(win, realKey());
    else {
        await fakeGarmin(obsidian, days);
        await setKey(win, FAKE_KEY);
    }
    await openWizard(win);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 30_000 });
    await win.locator(".garmy-period").selectOption(String(days));
    await win.locator(".garmy-load").click();
    await expect(win.locator(".garmy-loaded")).toContainText("Days loaded:", { timeout: live ? 180_000 : 60_000 });
}

test("the settings tab with and without a key", async ({ win, obsidian }) => {
    await fakeGarmin(obsidian, 0);
    for (const [name, key] of [["settings-no-key.png", ""], ["settings-key-saved.png", FAKE_KEY]] as const) {
        await setKey(win, key);
        const tab = await obsidian.openSettings("garmidian");
        await expect(tab).toHaveClass(/garmy-settings/);
        await obsidian.settle({ root: ".modal.mod-settings" });
        await win.locator(".modal.mod-settings").screenshot({ path: path.join(OUT, name) });
        await obsidian.closeSettings();
    }
});

test("every error and warning state of the key and load steps", async ({ win, obsidian }) => {
    const message = win.locator(".garmy-message");
    const check = win.locator(".garmy-key-check");

    // 1. no key at all
    await setKey(win, "");
    await openWizard(win);
    await shot(win, "s1-key-empty-slot.png");
    await check.click();
    await expect(message).toContainText("Paste the key");
    await shot(win, "s1-key-empty-message.png");

    // 2. a wrong key: one action, and the typed key stays in the field
    await fakeGarmin(obsidian, 30, "401");
    await win.locator(".garmy-key").fill("wrong-key-value");
    await check.click();
    await expect(message).toContainText("did not accept the key");
    await expect(message.locator("button")).toHaveCount(1);
    await expect(win.locator(".garmy-key")).toHaveValue("wrong-key-value");
    await obsidian.settle();
    await shot(win, "s2-key-wrong.png");

    // 3. no connection
    await fakeGarmin(obsidian, 30, "offline");
    await check.click();
    await expect(message).toContainText("Cannot reach Garmin");
    await shot(win, "s3-key-offline.png");

    // 4. rate limited
    await fakeGarmin(obsidian, 30, "429");
    await check.click();
    await expect(message).toContainText("try again in a minute", { ignoreCase: true });
    await shot(win, "s4-key-rate.png");

    // 5. the key is fine, one part of the load fails (sleep answers 500), the rest has no data
    await obsidian.replace("garmidian", "http", () => (req: { url: string; method: string }): Promise<Reply> => new Promise<Reply>((resolve) => {
        setTimeout(() => {
            if (req.method === "POST") resolve({ status: 200, text: "jwt" });
            else if (req.url.includes("dailySleepSummaries")) resolve({ status: 500, text: "" });
            else resolve({ status: 200, text: "[]" });
        }, 350);
    }));
    await check.click();
    await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
    await shot(win, "s5-load-idle.png");
    await win.locator(".garmy-load").click();
    await expect(win.locator(".garmy-part.is-done")).not.toHaveCount(0);
    await expect(win.locator(".garmy-part.is-waiting, .garmy-part.is-loading")).not.toHaveCount(0);
    await expect(win.locator('.garmy-progress [role="progressbar"]')).toHaveCount(4);
    await shot(win, "s6-load-progress.png");
    await expect(message).toBeVisible({ timeout: 40_000 });
    await obsidian.settle();
    await shot(win, "s7-load-nodata.png");
    await closeWizard(win);

    // 6. the key passes the check, then Garmin rejects it while loading
    await obsidian.replace("garmidian", "http", () => {
        let posts = 0;
        return (req: { url: string; method: string }): Promise<Reply> => {
            if (req.method !== "POST") return Promise.resolve({ status: 200, text: "[]" });
            posts++;
            return Promise.resolve(posts > 1 ? { status: 401, text: "" } : { status: 200, text: "jwt" });
        };
    });
    await setKey(win, "k");
    await openWizard(win);
    await check.click();
    await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
    await win.locator(".garmy-load").click();
    await expect(message).toContainText("stopped accepting the key", { timeout: 20_000 });
    await expect(message.locator("button")).toHaveCount(1);
    await obsidian.settle();
    await shot(win, "s8-load-stopped.png");
});

test("key to a finished dashboard, step by step", async ({ win, obsidian }) => {
    const days = 30;
    await loadHistory(win, obsidian, days);
    await shot(win, "w2-summary.png");
    const loaded = await win.locator(".garmy-loaded").innerText();
    expect(loaded).toMatch(/Days loaded: \d+/);

    await win.locator(".garmy-preview-btn").waitFor({ timeout: 20_000 });
    const groups = await win.locator(".garmy-wizard .garmy-card-title, .garmy-wizard .garmy-chip-label").allInnerTexts();
    expect(groups.some((g) => /Sleep|Recovery/.test(g))).toBe(true);
    expect(groups.some((g) => /Run/.test(g))).toBe(true);
    if (!LIVE) expect(groups.some((g) => /Swim|Bike|Strength/.test(g))).toBe(false);
    await shot(win, "w3-choose.png");

    await win.locator(".garmy-preview-btn").click();
    await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
    await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(30);
    const preview = await dashyReport(win, ".garmy-preview");
    expect(preview.diagnostics).toEqual([]);
    await shot(win, "w4-preview.png");

    await win.locator(".garmy-create").click();
    await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/Garmin dashboard/);
    const dayNotes = await obsidian.evaluate((app: App) => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Garmy/data/")).length);
    expect(dayNotes).toBeGreaterThan(0);

    // the created note in reading view, the way a user opens it
    await obsidian.collapseSidebars();
    await obsidian.readingView();
    const note = ".workspace-leaf.mod-active .markdown-preview-view";
    await expect.poll(() => win.locator(`${note} [class*='dashy']`).count(), { timeout: 30_000 }).toBeGreaterThan(30);
    await obsidian.scrollThrough(note);
    const final = await dashyReport(win, note);
    expect(final.diagnostics).toEqual([]);
    expect(final.unrendered).toEqual([]);
    for (let k = 0; k < 4; k++) {
        await win.evaluate(([sel, i]) => {
            const root = document.querySelector(sel as string);
            if (root) root.scrollTop = (i as number) * (root.clientHeight - 80);
        }, [note, k]);
        await obsidian.settle();
        await shot(win, `w5-note-${k + 1}.png`);
    }

    // the key is in secure storage only
    const key = LIVE ? realKey() : FAKE_KEY;
    const leaks = await obsidian.evaluate(async (app: App, k: string) => {
        const out: string[] = [];
        for (const f of app.vault.getMarkdownFiles()) if ((await app.vault.read(f)).includes(k)) out.push(f.path);
        const data = await app.vault.adapter.read(".obsidian/plugins/garmidian/data.json").catch(() => "");
        if (data.includes(k)) out.push("data.json");
        return out;
    }, key);
    expect(leaks).toEqual([]);
});

/** The wizard fits its modal: nothing scrolls sideways. */
const overflow = (win: Page): Promise<{ modalW: number; viewW: number; hScroll: boolean }> => win.evaluate(() => {
    const wizard = document.querySelector(".garmy-wizard");
    const body = document.querySelector(".garmy-body");
    if (!wizard) throw new Error("The wizard is not open: open it before measuring its overflow.");
    return {
        modalW: Math.round(wizard.getBoundingClientRect().width),
        viewW: innerWidth,
        hScroll: wizard.scrollWidth > wizard.clientWidth + 1 || (body ? body.scrollWidth > body.clientWidth + 1 : false),
    };
});

/** Buttons, selects, inputs, chips and cards of the wizard that are shorter than a thumb (44 px, less the rounding). */
const smallTargets = (win: Page): Promise<string[]> => win.evaluate(() => {
    const sel = ".garmy-wizard button, .garmy-wizard select, .garmy-wizard input:not(.garmy-check), .garmy-wizard .garmy-chip, .garmy-wizard .garmy-card";
    return [...document.querySelectorAll<HTMLElement>(sel)]
        .filter((e) => e.offsetParent && e.getBoundingClientRect().height < 43.5)
        .map((e) => `${e.className || e.tagName} ${Math.round(e.getBoundingClientRect().height)}`);
});

test("layout: no sideways scroll, touch targets and a focus ring, in every theme and width", async ({ win, obsidian, app: electron }) => {
    await loadHistory(win, obsidian, 30, false);
    await closeWizard(win);

    // After a load and after mobile() the page is new, so the fake goes in again: these walks never touch the network.
    const walk = async (tag: string, opts: { dashyMissing?: boolean; touch?: boolean } = {}): Promise<void> => {
        await fakeGarmin(obsidian, 30);
        if (opts.dashyMissing) await obsidian.evaluate((app: GarmyApp) => { delete app.plugins.plugins.dashsidian; });
        await openWizard(win);
        await shot(win, `v-${tag}-1-key.png`);
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await shot(win, `v-${tag}-2-load.png`);
        await win.locator(".garmy-use-saved").click();
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 10_000 });
        await shot(win, `v-${tag}-3-choose.png`);
        if (opts.touch) expect(await smallTargets(win), `${tag}: touch targets under 44 px`).toEqual([]);
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        if (!opts.dashyMissing) await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(30);
        await obsidian.settle({ root: ".garmy-wizard" });
        await win.evaluate(() => { const b = document.querySelector(".garmy-body"); if (b) b.scrollTop = 0; });
        await shot(win, `v-${tag}-4-preview.png`);
        const ov = await overflow(win);
        expect(ov.hScroll, `${tag}: the modal is ${ov.modalW} px of ${ov.viewW} px`).toBe(false);
        await closeWizard(win);
    };

    await walk("light");

    // keyboard: Tab from the key field reaches the primary button, and every stop on the way shows a focus ring
    await fakeGarmin(obsidian, 30);
    await openWizard(win);
    await win.locator(".garmy-key").focus();
    const stops: Array<{ cls: string; inWizard: boolean; outlineStyle: string; outlineWidth: string }> = [];
    for (let i = 0; i < 8 && !stops.some((s) => s.cls.includes("garmy-key-check")); i++) {
        await win.keyboard.press("Tab");
        stops.push(await win.evaluate(() => {
            const el = document.activeElement;
            if (!el) throw new Error("Nothing has focus after Tab.");
            const style = getComputedStyle(el);
            return { cls: String(el.className), inWizard: el.closest(".garmy-wizard") !== null, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
        }));
    }
    expect(stops.some((s) => s.cls.includes("garmy-key-check")), `Tab never reached the primary button: ${JSON.stringify(stops)}`).toBe(true);
    for (const stop of stops) expect(stop, `no focus ring on ${stop.cls}`).toMatchObject({ inWizard: true, outlineStyle: "solid", outlineWidth: "2px" });
    await shot(win, "v-focus-ring.png");
    await closeWizard(win);

    await obsidian.setTheme({ mode: "dark" });
    await walk("dark");
    await obsidian.setTheme({ mode: "light" });
    await walk("nodashy", { dashyMissing: true });

    // a narrow desktop window, then Obsidian's mobile interface
    await electron.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.setSize(390, 844);
        w?.center();
    });
    await walk("narrow", { dashyMissing: true });
    await fakeGarmin(obsidian, 30, "429");
    await openWizard(win);
    await win.locator(".garmy-key-check").click();
    await expect(win.locator(".garmy-message")).toBeVisible();
    await shot(win, "v-narrow-error-rate.png");
    await closeWizard(win);

    await obsidian.mobile();
    await walk("mobile", { dashyMissing: true, touch: true });
});
