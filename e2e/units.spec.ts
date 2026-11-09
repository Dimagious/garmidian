import { test, expect, fakeGarmin, openWizard, dashyReport } from "./fixtures";
import type { Page } from "@playwright/test";

const KEY = "units-test-key";

type Settings = { units: string };
const settings = (win: Page): Promise<Settings> =>
    win.evaluate(() => (globalThis as unknown as { app: { plugins: { plugins: Record<string, { settings: Settings }> } } }).app.plugins.plugins.garmidian!.settings);

const setUnitsSetting = (win: Page, units: string): Promise<number> =>
    win.evaluate((u) => (globalThis as unknown as { app: { plugins: { plugins: Record<string, { setUnits(u: string): Promise<number> }> } } }).app.plugins.plugins.garmidian!.setUnits(u), units);

/** Counts every request the plugin sends, so a test can prove a switch did not ask Garmin again. */
const countRequests = (win: Page): Promise<void> =>
    win.evaluate(() => {
        const plugin = (globalThis as unknown as { app: { plugins: { plugins: Record<string, { http: (r: unknown) => Promise<unknown> }> } } }).app.plugins.plugins.garmidian!;
        const g = globalThis as unknown as { __garminCalls: number };
        g.__garminCalls = 0;
        const inner = plugin.http;
        plugin.http = (r) => { g.__garminCalls += 1; return inner(r); };
    });
const requestCount = (win: Page): Promise<number> => win.evaluate(() => (globalThis as unknown as { __garminCalls?: number }).__garminCalls ?? 0);

const frontmatterOf = (win: Page, path: string): Promise<Record<string, unknown>> =>
    win.evaluate((p) => {
        const a = (globalThis as unknown as { app: { vault: { getAbstractFileByPath(p: string): unknown }; metadataCache: { getFileCache(f: unknown): { frontmatter?: Record<string, unknown> } | null } } }).app;
        return a.metadataCache.getFileCache(a.vault.getAbstractFileByPath(p))?.frontmatter ?? {};
    }, path);

async function loadAMonth(win: Page): Promise<void> {
    await fakeGarmin(win, 30);
    await openWizard(win);
    await win.locator(".garmy-key").fill(KEY);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
    await win.locator(".garmy-period").selectOption("30");
    await win.locator(".garmy-load").click();
    await expect(win.locator(".garmy-loaded")).toContainText("30", { timeout: 30_000 });
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 15_000 });
}

test.describe("distance units", () => {
    test("the test vault is pinned to kilometers and the notes hold run_km, not run_mi", async ({ win }) => {
        await loadAMonth(win);
        expect((await settings(win)).units).toBe("metric");
        const dir = await win.evaluate(() => (globalThis as unknown as { app: { vault: { getFolderByPath(p: string): { children: Array<{ path: string }> } | null } } }).app.vault.getFolderByPath("Garmy/data")?.children.map((c) => c.path) ?? []);
        const withRun = (await Promise.all(dir.map((p) => frontmatterOf(win, p)))).filter((fm) => typeof fm.run_km === "number");
        expect(withRun.length).toBeGreaterThan(0);
        expect(withRun.every((fm) => !("run_mi" in fm))).toBe(true);
    });

    test("switching to miles in the wizard fills the notes, redraws the preview in miles and never asks Garmin again", async ({ win }) => {
        await loadAMonth(win);
        await countRequests(win);

        await win.locator(".garmy-options summary").click();
        await win.locator(".garmy-options-body select").first().selectOption("imperial");
        await expect.poll(async () => (await settings(win)).units).toBe("imperial");
        expect(await requestCount(win)).toBe(0);

        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 20_000 }).toBeGreaterThan(30);
        const report = await dashyReport(win, ".garmy-preview");
        expect(report.diagnostics).toEqual([]);
        expect(await win.locator(".garmy-preview").innerText()).toMatch(/\bmi\b/);

        await win.locator(".garmy-create").click();
        const path = await win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null } } }).app.workspace.getActiveFile()?.path ?? "");
        expect(path).toMatch(/^Garmy\/Garmin dashboard/);
        const text = await win.evaluate((p) => {
            const a = (globalThis as unknown as { app: { vault: { getAbstractFileByPath(p: string): unknown; read(f: unknown): Promise<string> } } }).app;
            return a.vault.read(a.vault.getAbstractFileByPath(p));
        }, path);
        expect(text).toContain("field: run_mi,");
        expect(text).not.toContain("field: run_km,");
    });

    test("the setting converts the notes, and a rebuild follows it in both directions", async ({ win }) => {
        await loadAMonth(win);
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-create").click();
        await expect.poll(() => win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null } } }).app.workspace.getActiveFile()?.path ?? "")).toMatch(/^Garmy\/Garmin dashboard/);

        const changed = await setUnitsSetting(win, "imperial");
        expect(changed).toBeGreaterThan(0);
        await win.evaluate(() => (globalThis as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("garmidian:rebuild-dashboard"));
        const read = (): Promise<string> => win.evaluate(() => {
            const a = (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null }; vault: { getAbstractFileByPath(p: string): unknown; read(f: unknown): Promise<string> } } }).app;
            const f = a.workspace.getActiveFile();
            return f ? a.vault.read(a.vault.getAbstractFileByPath(f.path)) : Promise.resolve("");
        });
        await expect.poll(read, { timeout: 15_000 }).toContain("field: run_mi,");
        expect(await read()).not.toContain("field: run_km,");

        // Back to kilometers: the kilometer fields were never removed, so nothing needs converting.
        expect(await setUnitsSetting(win, "metric")).toBe(0);
        await win.evaluate(() => (globalThis as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("garmidian:rebuild-dashboard"));
        await expect.poll(read, { timeout: 15_000 }).toContain("field: run_km,");
    });
});
