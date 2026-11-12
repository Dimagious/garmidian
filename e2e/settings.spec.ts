import type { App } from "obsidian";
import { test, expect, setKey } from "./fixtures";

test.describe("settings tab", () => {
    test("shows the key status and forgets the key", async ({ win, obsidian }) => {
        await setKey(win, "some-key");
        const tab = await obsidian.openSettings("garmidian");
        await expect(tab.getByText("Personal API key").first()).toBeVisible();
        const forget = tab.getByRole("button", { name: /Forget/ });
        await expect(forget).toBeVisible();
        await forget.click();
        await expect(forget).toHaveCount(0);
        expect(await obsidian.evaluate((app: App) => app.secretStorage.getSecret("garmy-garmin-api-key") ?? "")).toBe("");
    });
});
