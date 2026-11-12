import { test, expect, onlyWhen, openWizard, setKey, dashyReport } from "./fixtures";
import { liveKey } from "./live-key";

onlyWhen("GARMIN_LIVE");

// Against the real Garmin Personal API. Off by default: set GARMIN_LIVE=1. The key comes from liveKey().
test.describe("wizard, live Garmin", () => {
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
