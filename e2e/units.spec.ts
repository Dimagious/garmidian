import { test, expect, fakeGarmin, openWizard, dashyReport, activePath, readNote, type GarmyApp } from "./fixtures";
import type { App } from "obsidian";
import type { Page } from "@playwright/test";
import type { FakeHandle, ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";

const KEY = "units-test-key";

const settings = (obsidian: ObsidianHelpers): Promise<{ units: string }> =>
    obsidian.evaluate((app: GarmyApp) => ({ units: app.plugins.plugins.garmidian!.settings.units }));

const setUnitsSetting = (obsidian: ObsidianHelpers, units: string): Promise<number> =>
    obsidian.evaluate((app: GarmyApp, u: string) => app.plugins.plugins.garmidian!.setUnits(u), units);

const frontmatterOf = (obsidian: ObsidianHelpers, path: string): Promise<Record<string, unknown>> =>
    obsidian.evaluate((app: App, p: string) => {
        const file = app.vault.getFileByPath(p);
        return (file && app.metadataCache.getFileCache(file)?.frontmatter) || {};
    }, path);

/** Loads a month through the wizard and returns the fake Garmin, whose calls() count the requests the plugin sent. */
async function loadAMonth(win: Page, obsidian: ObsidianHelpers): Promise<FakeHandle> {
    const garmin = await fakeGarmin(obsidian, 30);
    await openWizard(win);
    await win.locator(".garmy-key").fill(KEY);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
    await win.locator(".garmy-period").selectOption("30");
    await win.locator(".garmy-load").click();
    await expect(win.locator(".garmy-loaded")).toContainText("30", { timeout: 30_000 });
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 15_000 });
    return garmin;
}

test.describe("distance units", () => {
    test("the test vault is pinned to kilometers and the notes hold run_km, not run_mi", async ({ win, obsidian }) => {
        await loadAMonth(win, obsidian);
        expect((await settings(obsidian)).units).toBe("metric");
        const dir = await obsidian.evaluate((app: App) => app.vault.getFolderByPath("Garmy/data")?.children.map((c) => c.path) ?? []);
        const withRun = (await Promise.all(dir.map((p) => frontmatterOf(obsidian, p)))).filter((fm) => typeof fm.run_km === "number");
        expect(withRun.length).toBeGreaterThan(0);
        expect(withRun.every((fm) => !("run_mi" in fm))).toBe(true);
    });

    test("switching to miles in the wizard fills the notes, redraws the preview in miles and never asks Garmin again", async ({ win, obsidian }) => {
        const garmin = await loadAMonth(win, obsidian);
        const sent = (await garmin.calls()).length;
        expect(sent).toBeGreaterThan(0); // the counter sees the requests of the load, so an unchanged count below means something

        await win.locator(".garmy-options summary").click();
        await win.locator(".garmy-options-body select").first().selectOption("imperial");
        await expect.poll(async () => (await settings(obsidian)).units).toBe("imperial");
        expect((await garmin.calls()).length).toBe(sent);

        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 20_000 }).toBeGreaterThan(30);
        const report = await dashyReport(win, ".garmy-preview");
        expect(report.diagnostics).toEqual([]);
        expect(await win.locator(".garmy-preview").innerText()).toMatch(/\bmi\b/);

        await win.locator(".garmy-create").click();
        // the note is written after Dashy has checked its blocks, so it opens a moment after the click
        await expect.poll(() => activePath(obsidian), { timeout: 15_000 }).toMatch(/^Garmy\/Garmin dashboard/);
        const path = await activePath(obsidian);
        const text = await readNote(obsidian, path);
        expect(text).toContain("field: run_mi,");
        expect(text).not.toContain("field: run_km,");
    });

    test("the setting converts the notes, and a rebuild follows it in both directions", async ({ win, obsidian }) => {
        await loadAMonth(win, obsidian);
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-create").click();
        await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/Garmin dashboard/);

        const changed = await setUnitsSetting(obsidian, "imperial");
        expect(changed).toBeGreaterThan(0);
        await obsidian.runCommand("garmidian:rebuild-dashboard");
        const read = async (): Promise<string> => {
            const path = await activePath(obsidian);
            return path ? readNote(obsidian, path) : "";
        };
        await expect.poll(read, { timeout: 15_000 }).toContain("field: run_mi,");
        expect(await read()).not.toContain("field: run_km,");

        // Back to kilometers: the kilometer fields were never removed, so nothing needs converting.
        expect(await setUnitsSetting(obsidian, "metric")).toBe(0);
        await obsidian.runCommand("garmidian:rebuild-dashboard");
        await expect.poll(read, { timeout: 15_000 }).toContain("field: run_km,");
    });
});
