import { execFileSync } from "node:child_process";
import { test, expect, openWizard, setKey, dashyReport } from "./fixtures";

/**
 * Against the real Garmin Personal API. Off by default: set GARMIN_LIVE=1. The key comes from
 * GARMIN_PERSONAL_API_KEY or the macOS Keychain (service garmin-personal-api) and is never printed.
 */
function liveKey(): string {
    const fromEnv = process.env.GARMIN_PERSONAL_API_KEY?.trim();
    if (fromEnv) return fromEnv;
    return execFileSync("/usr/bin/security", ["find-generic-password", "-s", "garmin-personal-api", "-w"]).toString().trim();
}

test.describe("wizard, live Garmin", () => {
    test.skip(!process.env.GARMIN_LIVE, "set GARMIN_LIVE=1 to run against the real API");
    test.setTimeout(240_000);

    test("a real key loads 30 days and draws a clean dashboard", async ({ win }) => {
        const key = liveKey();
        await setKey(win, key);
        await openWizard(win);
        await win.locator(".garmy-key-check").click();
        await win.locator(".garmy-load").waitFor({ timeout: 30_000 });
        await win.locator(".garmy-period").selectOption("30");
        await win.locator(".garmy-load").click();
        await expect(win.locator(".garmy-loaded")).toContainText(/\d+/, { timeout: 120_000 });
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 20_000 });
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 30_000 }).toBeGreaterThan(30);
        expect((await dashyReport(win, ".garmy-preview")).diagnostics).toEqual([]);
    });
});
