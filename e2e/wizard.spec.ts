import type { App } from "obsidian";
import { test, expect, fakeGarmin, openWizard, setKey, dashyReport, activePath, type GarmyApp } from "./fixtures";

const KEY = "test-key-not-a-secret";

test.describe("wizard, fake Garmin", () => {
    test("plugin loads and registers its commands", async ({ obsidian }) => {
        const info = await obsidian.evaluate((app: GarmyApp & { commands: { commands: Record<string, { name: string } | undefined> } }) => {
            return { garmidian: !!app.plugins.plugins.garmidian, dashy: !!app.plugins.plugins.dashsidian, wizard: app.commands.commands["garmidian:open-wizard"]?.name, sync: app.commands.commands["garmidian:sync-recent"]?.name };
        });
        expect(info.garmidian && info.dashy).toBe(true);
        expect(info.wizard).toBeTruthy();
        expect(info.sync).toBeTruthy();
    });

    test("the key step shows the bundled Garmin Connect help picture", async ({ win }) => {
        await setKey(win, "");
        await openWizard(win);
        const img = win.locator(".garmy-media-clip.is-still");
        await expect(img).toBeVisible();
        expect(await img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
        await expect(win.locator(".garmy-howto")).toContainText("Personal API Key");
        expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(300);
    });

    test("an empty key gets a friendly message", async ({ win }) => {
        await setKey(win, "");
        await openWizard(win);
        await win.locator(".garmy-key-check").click();
        await expect(win.locator(".garmy-message")).toContainText("Paste the key");
    });

    test("a rejected key says so and keeps the user on the key step", async ({ win, obsidian }) => {
        await fakeGarmin(obsidian, 30, "401");
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();
        await expect(win.locator(".garmy-message")).toContainText("did not accept the key");
        await expect(win.locator(".garmy-load")).toHaveCount(0);
    });

    test("no connection and rate limit have their own messages", async ({ win, obsidian }) => {
        await fakeGarmin(obsidian, 30, "offline");
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();
        await expect(win.locator(".garmy-message")).toContainText("Cannot reach Garmin");
        await fakeGarmin(obsidian, 30, "429");
        await win.locator(".garmy-key-check").click();
        await expect(win.locator(".garmy-message")).toContainText("try again in a minute", { ignoreCase: true });
    });

    test("key to finished dashboard, offering only what the data has", async ({ win, obsidian }) => {
        await fakeGarmin(obsidian, 30);
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();

        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-period").selectOption("30");
        await win.locator(".garmy-load").click();
        await expect(win.locator(".garmy-loaded")).toContainText("30", { timeout: 30_000 });

        await win.locator(".garmy-preview-btn").waitFor({ timeout: 15_000 });
        const offered = await win.locator(".garmy-wizard").innerText();
        expect(offered).toContain("Run");
        expect(offered).not.toMatch(/Swim|Bike|Strength/);

        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 20_000 }).toBeGreaterThan(30);
        const preview = await dashyReport(win, ".garmy-preview");
        expect(preview.diagnostics).toEqual([]);

        await win.locator(".garmy-create").click();
        await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/Garmin dashboard/);
    });

    test("the key never reaches a note or the plugin data file", async ({ win, obsidian }) => {
        await fakeGarmin(obsidian, 30);
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-period").selectOption("30");
        await win.locator(".garmy-load").click();
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 30_000 });
        const leaks = await obsidian.evaluate(async (app: App, k: string) => {
            const out: string[] = [];
            for (const f of app.vault.getMarkdownFiles()) if ((await app.vault.read(f)).includes(k)) out.push(f.path);
            const data = await app.vault.adapter.read(".obsidian/plugins/garmidian/data.json").catch(() => "");
            if (data.includes(k)) out.push("data.json");
            return out;
        }, KEY);
        expect(leaks).toEqual([]);
    });

    test("finished steps can be revisited from the step indicator", async ({ win, obsidian }) => {
        await fakeGarmin(obsidian, 30);
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-stepper button").first().click();
        await expect(win.locator(".garmy-key")).toBeVisible();
    });
});
