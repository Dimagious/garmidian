import type { ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { App } from "obsidian";
import { test, expect, fakeGarmin, openWizard, setKey, type GarmyApp } from "./fixtures";

declare global { interface Window { __opened?: string } }

const localDay = (offset: number): string => {
    const d = new Date(Date.now() + offset * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function makeNote(obsidian: ObsidianHelpers, path: string, body: string): Promise<void> {
    await obsidian.evaluate(async (app: App, [p, b]: [string, string]) => {
        if (!app.vault.getAbstractFileByPath("Garmy")) await app.vault.createFolder("Garmy");
        if (!app.vault.getAbstractFileByPath("Garmy/data")) await app.vault.createFolder("Garmy/data");
        await app.vault.create(p, b);
    }, [path, body]);
}

const frontmatter = (obsidian: ObsidianHelpers, path: string): Promise<Record<string, unknown>> => obsidian.evaluate((app: App, p: string) => {
    const file = app.vault.getFileByPath(p);
    return (file && app.metadataCache.getFileCache(file)?.frontmatter) || {};
}, path);

const runSync = (obsidian: ObsidianHelpers): Promise<void> => obsidian.evaluate(async (app: GarmyApp) => {
    await app.plugins.plugins.garmidian?.syncNow(true);
});

test.describe("sync", () => {
    test("the latest days are refreshed, older days only get gaps filled", async ({ win, obsidian }) => {
        await setKey(win, "k");
        await fakeGarmin(obsidian, 40);
        const today = localDay(0), old = localDay(-10);
        await makeNote(obsidian, `Garmy/data/${today}.md`, "---\nsteps: 100\nhrv: 30\n---\n");
        await makeNote(obsidian, `Garmy/data/${old}.md`, "---\nsteps: 100\n---\n");
        await obsidian.waitForMetadataCache();
        await runSync(obsidian);
        await obsidian.waitForMetadataCache();
        const fresh = await frontmatter(obsidian, `Garmy/data/${today}.md`);
        expect(fresh.steps).not.toBe(100); // partial numbers from an earlier sync are replaced
        expect(fresh.hrv).not.toBe(30);
        const older = await frontmatter(obsidian, `Garmy/data/${old}.md`);
        expect(older.steps).toBe(100); // an old value is left alone
        expect(older.hrv).toBeTruthy(); // but a gap is filled
    });

    test("a rejected key during sync is remembered and offered for replacement", async ({ win, obsidian }) => {
        await setKey(win, "k");
        await fakeGarmin(obsidian, 40, "401");
        await runSync(obsidian);
        await expect(win.locator(".notice")).toContainText("rejected the key");
        const problem = await obsidian.evaluate((app: GarmyApp) => app.plugins.plugins.garmidian?.settings.keyProblem);
        expect(problem).toBe(localDay(0));
        await win.locator(".notice button", { hasText: "Replace key" }).click();
        await expect(win.locator(".garmy-wizard")).toBeVisible();
    });

    test("a sync that fails offline stays quiet in the background", async ({ win, obsidian }) => {
        await setKey(win, "k");
        await fakeGarmin(obsidian, 40, "offline");
        await obsidian.evaluate(async (app: GarmyApp) => {
            await app.plugins.plugins.garmidian?.syncNow(false);
        });
        await expect(win.locator(".notice")).toHaveCount(0);
    });

    test("a sync does not start while another one runs", async ({ win, obsidian }) => {
        await setKey(win, "k");
        await fakeGarmin(obsidian, 40, "ok", 300);
        const both = await obsidian.evaluate(async (app: GarmyApp) => {
            const p = app.plugins.plugins.garmidian;
            if (!p) throw new Error("not loaded");
            const first = p.syncNow(false);
            const busyWhileRunning = p.syncing;
            await p.syncNow(false); // returns at once
            await first;
            return { busyWhileRunning, busyAfter: p.syncing };
        });
        expect(both).toEqual({ busyWhileRunning: true, busyAfter: false });
    });
});

const notesIn = (obsidian: ObsidianHelpers): Promise<number> => obsidian.evaluate((app: App) => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Garmy/data/")).length);

const plugin = (obsidian: ObsidianHelpers, body: string): Promise<void> => obsidian.evaluate((app: GarmyApp, code: string) => {
    new Function("p", code)(app.plugins.plugins.garmidian);
}, body);

test.describe("auto sync wiring", () => {
    test("a due sync starts by itself from the timer", async ({ win, obsidian }) => {
        await setKey(win, "k");
        await fakeGarmin(obsidian, 40);
        await plugin(obsidian, "p.settings.syncHours = 6; p.settings.lastSyncAt = 0; p.startAutoSync(100);");
        await expect.poll(() => notesIn(obsidian), { timeout: 20_000 }).toBeGreaterThan(10);
    });

    test("turned off, it does nothing", async ({ win, obsidian }) => {
        await setKey(win, "k");
        await fakeGarmin(obsidian, 40);
        await plugin(obsidian, "p.settings.syncHours = 0; p.settings.lastSyncAt = 0; p.startAutoSync(100);");
        await win.waitForTimeout(3_000);
        expect(await notesIn(obsidian)).toBe(0);
    });

    test("it waits until the interval has passed", async ({ win, obsidian }) => {
        await setKey(win, "k");
        await fakeGarmin(obsidian, 40);
        await plugin(obsidian, "p.settings.syncHours = 6; p.settings.lastSyncAt = Date.now() - 3600e3; p.startAutoSync(100);");
        await win.waitForTimeout(3_000);
        expect(await notesIn(obsidian)).toBe(0);
    });

    test("it stays quiet when Garmin rejected the key earlier", async ({ win, obsidian }) => {
        await setKey(win, "k");
        await fakeGarmin(obsidian, 40);
        await plugin(obsidian, "p.settings.syncHours = 6; p.settings.lastSyncAt = 0; p.settings.keyProblem = '2026-11-01'; p.startAutoSync(100);");
        await win.waitForTimeout(3_000);
        expect(await notesIn(obsidian)).toBe(0);
    });
});

test.describe("wizard: cancel and Dashy", () => {
    test("cancelling a load saves nothing and says so", async ({ win, obsidian }) => {
        await fakeGarmin(obsidian, 365, "ok", 700);
        await openWizard(win);
        await win.locator(".garmy-key").fill("k");
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-load").click();
        await win.locator(".garmy-cancel").waitFor({ state: "visible", timeout: 5_000 });
        await win.waitForTimeout(900);
        await win.locator(".garmy-cancel").click();
        await expect(win.locator(".garmy-message")).toContainText("Loading cancelled", { timeout: 10_000 });
        const notes = await notesIn(obsidian);
        expect(notes).toBe(0);
        await expect(win.locator(".garmy-load")).toBeEnabled();
    });

    test("a turned-off Dashy is flagged in the preview and can be turned on", async ({ win, obsidian }) => {
        await obsidian.evaluate((app: GarmyApp) => app.plugins.disablePlugin("dashsidian"));
        await fakeGarmin(obsidian, 30);
        await openWizard(win);
        await win.locator(".garmy-key").fill("k");
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-period").selectOption("30");
        await win.locator(".garmy-load").click();
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 30_000 });
        await win.locator(".garmy-preview-btn").click();
        await expect(win.locator(".garmy-warn")).toContainText("turned off");
        await win.locator(".garmy-warn button", { hasText: "Turn on Dashy" }).click();
        await expect(win.locator(".garmy-warn")).toHaveCount(0, { timeout: 10_000 });
    });

    test("a Dashy that is not installed is flagged, with a link to its page", async ({ win, obsidian }) => {
        await obsidian.evaluate(async (app: GarmyApp) => {
            await app.plugins.disablePlugin("dashsidian");
            delete app.plugins.manifests.dashsidian; // as if it had never been installed
            window.open = (u?: string | URL) => { window.__opened = String(u); return null; };
        });
        await fakeGarmin(obsidian, 30);
        await openWizard(win);
        await win.locator(".garmy-key").fill("k");
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-period").selectOption("30");
        await win.locator(".garmy-load").click();
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 30_000 });
        await win.locator(".garmy-preview-btn").click();
        await expect(win.locator(".garmy-warn")).toContainText("not installed");
        await win.locator(".garmy-warn button", { hasText: "Open the Dashy page" }).click();
        expect(await win.evaluate(() => window.__opened)).toBe("obsidian://show-plugin?id=dashsidian");
    });
});
