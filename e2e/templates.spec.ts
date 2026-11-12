import { test, expect, openWizard, dashyReport, activePath, readNote } from "./fixtures";
import { installDemoGarmin } from "./demo-garmin";
import type { Page } from "@playwright/test";
import type { ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";

const KEY = "templates-test-key";

async function reachChoose(win: Page, obsidian: ObsidianHelpers, days = 120): Promise<void> {
    await installDemoGarmin(obsidian, days);
    await openWizard(win);
    await win.locator(".garmy-key").fill(KEY);
    await win.locator(".garmy-key-check").click();
    await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
    await win.locator(".garmy-period").selectOption(days > 90 ? "365" : "90");
    await win.locator(".garmy-load").click();
    await expect(win.locator(".garmy-loaded")).toContainText(String(days), { timeout: 60_000 });
    await win.locator(".garmy-preview-btn").waitFor({ timeout: 15_000 });
}

const card = (win: Page, id: string) => win.locator(`input.garmy-tpl-${id.replace(":", "-")}`);

test.describe("dashboard library", () => {
    test("lists what the data can fill and greys out the rest with the reason", async ({ win, obsidian }) => {
        await reachChoose(win, obsidian);
        for (const id of ["overview", "glance", "sleep", "recovery", "steps", "sport:run", "sport:bike", "sport:swim", "sport:strength", "triathlon", "week", "month", "year"]) {
            await expect(card(win, id), id).toBeEnabled();
        }
        // a race needs a date or a folder first
        await expect(card(win, "race")).toBeDisabled();
        await win.locator(".garmy-options summary").click();
        await win.locator(".garmy-options-body input[type=text]").first().fill("2026-12-06");
        await expect(card(win, "race")).toBeEnabled();
        await win.locator(".garmy-options-body input[type=text]").first().fill("");
        await expect(card(win, "race")).toBeDisabled();
    });

    test("a short history unlocks fewer cards", async ({ win, obsidian }) => {
        await reachChoose(win, obsidian, 30);
        await expect(card(win, "year")).toBeDisabled();
        await expect(card(win, "sleep")).toBeEnabled();
    });

    test("every dashboard in the library draws in Dashy without a single warning", async ({ win, obsidian }) => {
        test.setTimeout(240_000);
        await reachChoose(win, obsidian);
        await win.locator(".garmy-options summary").click();
        await win.locator(".garmy-options-body input[type=text]").first().fill("2026-12-06");
        const ids = ["overview", "glance", "sleep", "recovery", "steps", "sport:run", "sport:bike", "sport:swim", "sport:strength", "triathlon", "race", "week", "month", "year"];
        for (const id of ids) {
            await card(win, id).check({ force: true });
            await win.locator(".garmy-preview-btn").click();
            await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
            await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 20_000, message: id }).toBeGreaterThan(3);
            const report = await dashyReport(win, ".garmy-preview");
            expect(report.diagnostics, `${id}: Dashy diagnostics`).toEqual([]);
            expect(report.unrendered, `${id}: blocks that did not draw`).toEqual([]);
            await win.locator(".garmy-back").click();
            await win.locator(".garmy-preview-btn").waitFor({ timeout: 10_000 });
        }
    });

    test("a sport changes what is offered: lifting has no distance, the run does", async ({ win, obsidian }) => {
        await reachChoose(win, obsidian);
        await card(win, "sport:strength").check({ force: true });
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 20_000 }).toBeGreaterThan(3);
        const lifting = await win.locator(".garmy-preview").innerText();
        expect(lifting).not.toMatch(/\bkm\b/);
        await win.locator(".garmy-back").click();
        await card(win, "sport:run").check({ force: true });
        await win.locator(".garmy-preview-btn").click();
        await expect.poll(async () => win.locator(".garmy-preview").innerText(), { timeout: 20_000 }).toMatch(/\bkm\b/);
    });

    test("the note keeps its kind: the property names the template and a rebuild builds the same dashboard", async ({ win, obsidian }) => {
        await reachChoose(win, obsidian);
        await card(win, "sleep").check({ force: true });
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-create").click();
        await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/Garmin dashboard - Sleep/);
        const path = await activePath(obsidian);
        const before = await readNote(obsidian, path);
        expect(before).toMatch(/garmy: "1\|[^"]*\|sleep"/);
        await obsidian.runCommand("garmidian:rebuild-dashboard");
        await expect.poll(() => readNote(obsidian, path), { timeout: 15_000 }).toMatch(/where: "sleep_score >= 80"/);
        expect(await readNote(obsidian, path)).toMatch(/garmy: "1\|[^"]*\|sleep"/);
    });

    test("a weekly review is named for its week, and the preview already counts that week", async ({ win, obsidian }) => {
        await reachChoose(win, obsidian);
        await card(win, "week").check({ force: true });
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 20_000 }).toBeGreaterThan(3);
        expect((await dashyReport(win, ".garmy-preview")).diagnostics).toEqual([]);
        await win.locator(".garmy-create").click();
        await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/\d{4}-W\d{2}\.md$/);
    });
});
