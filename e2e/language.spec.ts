import type { ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import { test, expect, openWizard, type GarmyApp } from "./fixtures";

const setLanguage = (obsidian: ObsidianHelpers, code: string): Promise<void> => obsidian.evaluate((app: GarmyApp, c: string) => {
    const p = app.plugins.plugins.garmidian;
    if (!p) throw new Error("not loaded");
    p.settings.language = c;
}, code);

test.describe("interface language", () => {
    test("follows Obsidian (English here) when the setting is automatic", async ({ win, obsidian }) => {
        await setLanguage(obsidian, "auto"); // the fixture pins "en" in data.json
        await openWizard(win);
        await expect(win.locator(".garmy-wizard")).toContainText("Connect your Garmin account");
    });

    for (const [code, text] of [["ru", "Подключите аккаунт Garmin"], ["de", "Garmin"], ["fr", "Garmin"], ["es", "Garmin"], ["pt", "Garmin"], ["ja", "Garmin"]] as const) {
        test(`${code}: the wizard speaks the chosen language`, async ({ win, obsidian }) => {
            await setLanguage(obsidian, code);
            await openWizard(win);
            const body = await win.locator(".garmy-wizard").innerText();
            expect(body).toContain(text);
            expect(body).not.toContain("Connect your Garmin account");
            expect(body).not.toContain("Paste the key");
        });
    }

    test("an unknown language setting falls back to English", async ({ win, obsidian }) => {
        await setLanguage(obsidian, "xx");
        await openWizard(win);
        await expect(win.locator(".garmy-wizard")).toContainText("Connect your Garmin account");
    });
});
