import { test, expect, openWizard } from "./fixtures";
import type { Page } from "@playwright/test";

const setLanguage = (win: Page, code: string): Promise<void> => win.evaluate((c) => {
    const a = (globalThis as unknown as { app: { plugins: { plugins: Record<string, { settings: { language: string } }> } } }).app;
    const p = a.plugins.plugins.garmidian;
    if (!p) throw new Error("not loaded");
    p.settings.language = c;
}, code);

test.describe("interface language", () => {
    test("follows Obsidian (English here) when the setting is automatic", async ({ win }) => {
        await openWizard(win);
        await expect(win.locator(".garmy-wizard")).toContainText("Connect your Garmin account");
    });

    for (const [code, text] of [["ru", "Подключите аккаунт Garmin"], ["de", "Garmin"], ["fr", "Garmin"], ["es", "Garmin"], ["pt", "Garmin"], ["ja", "Garmin"]] as const) {
        test(`${code}: the wizard speaks the chosen language`, async ({ win }) => {
            await setLanguage(win, code);
            await openWizard(win);
            const body = await win.locator(".garmy-wizard").innerText();
            expect(body).toContain(text);
            expect(body).not.toContain("Connect your Garmin account");
            expect(body).not.toContain("Paste the key");
        });
    }

    test("an unknown language setting falls back to English", async ({ win }) => {
        await setLanguage(win, "xx");
        await openWizard(win);
        await expect(win.locator(".garmy-wizard")).toContainText("Connect your Garmin account");
    });
});
