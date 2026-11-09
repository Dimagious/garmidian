import { test as base, _electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Launching Obsidian for real: Obsidian's own app.asar runs through the project-local electron,
 * because the bundled binary rejects the debugging port (2024 Electron fuse change).
 */
const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const APP_ASAR = "/Applications/Obsidian.app/Contents/Resources/app.asar";
const PRISTINE = path.join(ROOT, "e2e-vault.pristine");
export const SECRET_ID = "garmy-garmin-api-key";

/** Obsidian writes while it shuts down, so a plain remove can race it. Cleanup must never fail a test. */
function removeTree(dir: string): void {
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (error) {
        console.warn(`[e2e] could not remove ${dir}, left for the OS temp cleanup:`, error);
    }
}

interface Fixtures {
    vaultPath: string;
    app: ElectronApplication;
    win: Page;
}

export const test = base.extend<Fixtures>({
    // A throwaway copy of the committed vault, symlinks dereferenced so it carries the built plugins.
    // eslint-disable-next-line no-empty-pattern
    vaultPath: async ({}, use) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garmidian-e2e-vault-"));
        const vault = path.join(dir, "vault");
        fs.cpSync(PRISTINE, vault, { recursive: true, dereference: true });
        // Pin kilometers and English: a fresh install picks miles for an en-US machine and follows the machine language, and the pictures and specs must not depend on the machine.
        fs.writeFileSync(path.join(vault, ".obsidian", "plugins", "garmidian", "data.json"), JSON.stringify({ units: "metric", language: "en" }));
        await use(vault);
        removeTree(dir);
    },

    app: async ({ vaultPath }, use) => {
        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "garmidian-e2e-userdata-"));
        fs.writeFileSync(
            path.join(userDataDir, "obsidian.json"),
            JSON.stringify({ vaults: { "garmidian-e2e": { path: vaultPath, ts: Date.now(), open: true } } }),
        );
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const app = await _electron.launch({
            args: [APP_ASAR, `--user-data-dir=${userDataDir}`, "--use-mock-keychain"],
            env: env as Record<string, string>,
        });
        await use(app);
        await Promise.race([app.close().catch(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
        try {
            const proc = app.process();
            if (!proc.killed) proc.kill("SIGKILL");
        } catch {
            // already gone
        }
        removeTree(userDataDir);
    },

    win: async ({ app }, use) => {
        const win = await app.firstWindow();
        await win.waitForLoadState("domcontentloaded");
        win.on("dialog", (dialog) => { void dialog.dismiss().catch(() => undefined); });
        try {
            await win.getByRole("button", { name: "Trust author and enable plugins" }).waitFor({ state: "visible", timeout: 5_000 });
            await win.keyboard.press("Escape");
        } catch {
            // trusted already
        }
        await win.evaluate(async () => {
            const a = (globalThis as unknown as { app?: { plugins?: { setEnable?: (on: boolean) => Promise<void> } } }).app;
            await a?.plugins?.setEnable?.(true);
        }).catch(() => undefined);
        await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.setSize(1200, 1500); w?.center(); });
        await win.waitForTimeout(1_500);
        await use(win);
    },
});

export { expect } from "@playwright/test";

/** Stores a key the way the wizard does (Obsidian's secure storage). */
export async function setKey(win: Page, key: string): Promise<void> {
    await win.evaluate(([id, k]) => {
        (globalThis as unknown as { app: { secretStorage: { setSecret(i: string, v: string): void } } }).app.secretStorage.setSecret(id as string, k as string);
    }, [SECRET_ID, key]);
}

export async function openWizard(win: Page): Promise<void> {
    await win.evaluate(() => (globalThis as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("garmidian:open-wizard"));
    await win.locator(".garmy-wizard").waitFor({ timeout: 5_000 });
}

/**
 * Replaces the plugin's transport with a fake Garmin that serves `days` days of synthetic data:
 * steps, resting HR, stress, sleep, HRV and a run every third day. No swimming, cycling or readiness,
 * so the wizard must not offer them. `mode` picks a failure instead: 401, offline or 429.
 */
export async function fakeGarmin(win: Page, days: number, mode: "ok" | "401" | "offline" | "429" = "ok", delayMs = 0): Promise<void> {
    await win.evaluate(([n, m, delay]) => {
        const g = globalThis as unknown as { app: { plugins: { plugins: Record<string, { http: unknown }> } } };
        const plugin = g.app.plugins.plugins.garmidian;
        if (!plugin) throw new Error("garmidian is not loaded");
        const pad = (x: number): string => String(x).padStart(2, "0");
        const iso = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
        const dates: string[] = [];
        for (let i = (n as number) - 1; i >= 0; i--) dates.push(iso(Date.now() - i * 864e5));
        const within = (url: string): string[] => {
            const q = new URL(url);
            const a = q.searchParams.get("startDate") ?? url.split("/").slice(-2)[0] ?? "";
            const b = q.searchParams.get("endDate") ?? url.split("/").slice(-1)[0] ?? "";
            return dates.filter((d) => d >= a && d <= b);
        };
        const respond = (req: { url: string; method: string }): Promise<{ status: number; text: string }> => {
            if (m === "offline") return Promise.reject(new Error("offline"));
            if (m === "401") return Promise.resolve({ status: 401, text: "" });
            if (m === "429") return Promise.resolve({ status: 429, text: "" });
            const json = (v: unknown): Promise<{ status: number; text: string }> => Promise.resolve({ status: 200, text: JSON.stringify(v) });
            if (req.method === "POST") return Promise.resolve({ status: 200, text: "jwt" });
            const u = req.url;
            if (u.includes("dailysummaries")) {
                return json({ data: within(u).map((d, i) => ({ calendarDate: d, movement: { steps: { value: 6000 + (i % 7) * 900, distanceInMeters: 5000 } }, heartRate: { restingValue: 48 + (i % 4) }, stress: { avgLevel: 22 + (i % 9) }, bodyBattery: { maxValue: 70 + (i % 20), minValue: 25 } })) });
            }
            if (u.includes("dailySleepSummariesByDate")) {
                return json(within(u).map((d, i) => ({ calendarDate: d, sleepTimeSeconds: 25200 + (i % 5) * 1200, sleepScores: { overall: { value: 72 + (i % 15) } } })));
            }
            if (u.includes("hrv/daily")) return json({ hrvSummaries: within(u).map((d, i) => ({ calendarDate: d, lastNightAvg: 44 + (i % 10) })) });
            if (u.includes("activities/search")) {
                return json(dates.filter((_, i) => i % 3 === 0).map((d) => ({ activityType: { typeKey: "running" }, startTimeLocal: `${d} 07:00:00`, distance: 8000, duration: 2700 })));
            }
            return Promise.resolve({ status: 404, text: "" });
        };
        plugin.http = (req: { url: string; method: string }) => (delay ? new Promise((r) => setTimeout(r, delay as number)).then(() => respond(req)) : respond(req));
    }, [days, mode, delayMs] as const);
}

/** Dashy diagnostics and unrendered blocks inside a container, after scrolling it so lazy blocks draw. */
export async function dashyReport(win: Page, containerSelector: string): Promise<{ dashy: number; diagnostics: string[]; unrendered: string[] }> {
    return win.evaluate(async (sel) => {
        const root = document.querySelector(sel);
        if (!root) return { dashy: 0, diagnostics: ["container not found"], unrendered: [] };
        for (let y = 0; y <= root.scrollHeight; y += Math.max(200, root.clientHeight - 100)) {
            root.scrollTop = y;
            await new Promise((r) => setTimeout(r, 250));
        }
        root.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 500));
        return {
            dashy: root.querySelectorAll("[class*='dashy']").length,
            diagnostics: [...root.querySelectorAll(".dashy-diagnostics,.dashy-notice")].map((x) => (x.textContent ?? "").trim()),
            unrendered: [...root.querySelectorAll("pre > code")].map((c) => c.className).filter((c) => /stats|progress|heatmap|chart|countdown/.test(c)),
        };
    }, containerSelector);
}
