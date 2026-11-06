import { test, expect, setKey } from "./fixtures";
import type { ElectronApplication, Page } from "@playwright/test";

async function openSettings(app: ElectronApplication, win: Page): Promise<Page> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const opened = app.waitForEvent("window", { timeout: 8_000 }).catch(() => null);
        await win.evaluate(() => (globalThis as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("app:open-settings"));
        const sw = (await opened) ?? app.windows().find((w) => w !== win) ?? win;
        await sw.waitForLoadState("domcontentloaded");
        try {
            await sw.locator(".vertical-tab-nav-item", { hasText: "Garmy" }).first().click({ timeout: 8_000 });
            return sw;
        } catch {
            await win.evaluate(() => (globalThis as unknown as { app: { setting: { close(): void } } }).app.setting.close()).catch(() => undefined);
            await win.waitForTimeout(1_000);
        }
    }
    throw new Error("the Garmy settings tab did not open");
}

test.describe("settings tab", () => {
    test("shows the key status and forgets the key", async ({ app, win }) => {
        await setKey(win, "some-key");
        const sw = await openSettings(app, win);
        await expect(sw.getByText("Personal API key").first()).toBeVisible();
        const forget = sw.getByRole("button", { name: /Forget/ });
        await expect(forget).toBeVisible();
        await forget.click();
        await expect(forget).toHaveCount(0);
        expect(await win.evaluate(() => (globalThis as unknown as { app: { secretStorage: { getSecret(id: string): string | null } } }).app.secretStorage.getSecret("garmy-garmin-api-key") ?? "")).toBe("");
    });
});
