import type { Page } from "@playwright/test";
import { test, expect, fakeGarmin, openWizard, setKey } from "./fixtures";

const localDay = (offset: number): string => {
    const d = new Date(Date.now() + offset * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function makeNote(win: Page, path: string, body: string): Promise<void> {
    await win.evaluate(async ([p, b]) => {
        const a = (globalThis as unknown as { app: { vault: { create(p: string, d: string): Promise<unknown>; createFolder(p: string): Promise<unknown>; getAbstractFileByPath(p: string): unknown } } }).app;
        if (!a.vault.getAbstractFileByPath("Garmy")) await a.vault.createFolder("Garmy");
        if (!a.vault.getAbstractFileByPath("Garmy/data")) await a.vault.createFolder("Garmy/data");
        await a.vault.create(p as string, b as string);
    }, [path, body]);
}

const frontmatter = (win: Page, path: string): Promise<Record<string, unknown>> => win.evaluate((p) => {
    const a = (globalThis as unknown as { app: { vault: { getFileByPath(p: string): unknown }; metadataCache: { getFileCache(f: unknown): { frontmatter?: Record<string, unknown> } | null } } }).app;
    return a.metadataCache.getFileCache(a.vault.getFileByPath(p))?.frontmatter ?? {};
}, path);

const runSync = (win: Page): Promise<void> => win.evaluate(async () => {
    const a = (globalThis as unknown as { app: { plugins: { plugins: Record<string, { syncNow(manual: boolean): Promise<void> }> } } }).app;
    await a.plugins.plugins.garmidian?.syncNow(true);
});

test.describe("sync", () => {
    test("the latest days are refreshed, older days only get gaps filled", async ({ win }) => {
        await setKey(win, "k");
        await fakeGarmin(win, 40);
        const today = localDay(0), old = localDay(-10);
        await makeNote(win, `Garmy/data/${today}.md`, "---\nsteps: 100\nhrv: 30\n---\n");
        await makeNote(win, `Garmy/data/${old}.md`, "---\nsteps: 100\n---\n");
        await win.waitForTimeout(800);
        await runSync(win);
        await win.waitForTimeout(1_500);
        const fresh = await frontmatter(win, `Garmy/data/${today}.md`);
        expect(fresh.steps).not.toBe(100); // partial numbers from an earlier sync are replaced
        expect(fresh.hrv).not.toBe(30);
        const older = await frontmatter(win, `Garmy/data/${old}.md`);
        expect(older.steps).toBe(100); // an old value is left alone
        expect(older.hrv).toBeTruthy(); // but a gap is filled
    });

    test("a rejected key during sync is remembered and offered for replacement", async ({ win }) => {
        await setKey(win, "k");
        await fakeGarmin(win, 40, "401");
        await runSync(win);
        await expect(win.locator(".notice")).toContainText("rejected the key");
        const problem = await win.evaluate(() => (globalThis as unknown as { app: { plugins: { plugins: Record<string, { settings: { keyProblem: string } }> } } }).app.plugins.plugins.garmidian?.settings.keyProblem);
        expect(problem).toBe(localDay(0));
        await win.locator(".notice button", { hasText: "Replace key" }).click();
        await expect(win.locator(".garmy-wizard")).toBeVisible();
    });

    test("a sync that fails offline stays quiet in the background", async ({ win }) => {
        await setKey(win, "k");
        await fakeGarmin(win, 40, "offline");
        await win.evaluate(async () => {
            const a = (globalThis as unknown as { app: { plugins: { plugins: Record<string, { syncNow(manual: boolean): Promise<void> }> } } }).app;
            await a.plugins.plugins.garmidian?.syncNow(false);
        });
        await expect(win.locator(".notice")).toHaveCount(0);
    });

    test("a sync does not start while another one runs", async ({ win }) => {
        await setKey(win, "k");
        await fakeGarmin(win, 40, "ok", 300);
        const both = await win.evaluate(async () => {
            const a = (globalThis as unknown as { app: { plugins: { plugins: Record<string, { syncNow(manual: boolean): Promise<void>; syncing: boolean }> } } }).app;
            const p = a.plugins.plugins.garmidian;
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

test.describe("wizard: cancel and Dashy", () => {
    test("cancelling a load saves nothing and says so", async ({ win }) => {
        await fakeGarmin(win, 365, "ok", 700);
        await openWizard(win);
        await win.locator(".garmy-key").fill("k");
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-load").click();
        await win.locator(".garmy-cancel").waitFor({ state: "visible", timeout: 5_000 });
        await win.waitForTimeout(900);
        await win.locator(".garmy-cancel").click();
        await expect(win.locator(".garmy-message")).toContainText("Loading cancelled", { timeout: 10_000 });
        const notes = await win.evaluate(() => (globalThis as unknown as { app: { vault: { getMarkdownFiles(): Array<{ path: string }> } } }).app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Garmy/data/")).length);
        expect(notes).toBe(0);
        await expect(win.locator(".garmy-load")).toBeEnabled();
    });

    test("a turned-off Dashy is flagged in the preview and can be turned on", async ({ win }) => {
        await win.evaluate(async () => {
            const a = (globalThis as unknown as { app: { plugins: { disablePlugin(id: string): Promise<void> } } }).app;
            await a.plugins.disablePlugin("dashsidian");
        });
        await fakeGarmin(win, 30);
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
});
