import { test, expect, fakeGarmin, openWizard, setKey, dashyReport } from "./fixtures";

const KEY = "test-key-not-a-secret";

test.describe("wizard, fake Garmin", () => {
    test("plugin loads and registers its commands", async ({ win }) => {
        const info = await win.evaluate(() => {
            const a = (globalThis as unknown as { app: { plugins: { plugins: Record<string, unknown> }; commands: { commands: Record<string, { name: string }> } } }).app;
            return { garmidian: !!a.plugins.plugins.garmidian, dashy: !!a.plugins.plugins.dashsidian, wizard: a.commands.commands["garmidian:open-wizard"]?.name, sync: a.commands.commands["garmidian:sync-recent"]?.name };
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

    test("a rejected key says so and keeps the user on the key step", async ({ win }) => {
        await fakeGarmin(win, 30, "401");
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();
        await expect(win.locator(".garmy-message")).toContainText("did not accept the key");
        await expect(win.locator(".garmy-load")).toHaveCount(0);
    });

    test("no connection and rate limit have their own messages", async ({ win }) => {
        await fakeGarmin(win, 30, "offline");
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();
        await expect(win.locator(".garmy-message")).toContainText("Cannot reach Garmin");
        await fakeGarmin(win, 30, "429");
        await win.locator(".garmy-key-check").click();
        await expect(win.locator(".garmy-message")).toContainText("try again in a minute", { ignoreCase: true });
    });

    test("key to finished dashboard, offering only what the data has", async ({ win }) => {
        await fakeGarmin(win, 30);
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
        await expect.poll(() => win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null } } }).app.workspace.getActiveFile()?.path ?? "")).toMatch(/^Garmy\/Garmin dashboard/);
    });

    test("the key never reaches a note or the plugin data file", async ({ win }) => {
        await fakeGarmin(win, 30);
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-period").selectOption("30");
        await win.locator(".garmy-load").click();
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 30_000 });
        const leaks = await win.evaluate(async (k) => {
            const a = (globalThis as unknown as { app: { vault: { getMarkdownFiles(): Array<{ path: string }>; read(f: unknown): Promise<string>; adapter: { read(p: string): Promise<string> } } } }).app;
            const out: string[] = [];
            for (const f of a.vault.getMarkdownFiles()) if ((await a.vault.read(f)).includes(k)) out.push(f.path);
            const data = await a.vault.adapter.read(".obsidian/plugins/garmidian/data.json").catch(() => "");
            if (data.includes(k)) out.push("data.json");
            return out;
        }, KEY);
        expect(leaks).toEqual([]);
    });

    test("finished steps can be revisited from the step indicator", async ({ win }) => {
        await fakeGarmin(win, 30);
        await openWizard(win);
        await win.locator(".garmy-key").fill(KEY);
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-stepper button").first().click();
        await expect(win.locator(".garmy-key")).toBeVisible();
    });
});
