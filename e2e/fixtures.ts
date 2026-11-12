import { createObsidianTest, type FakeHandle, type ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { Page } from "@playwright/test";
import type { App } from "obsidian";

export const SECRET_ID = "garmy-garmin-api-key";

/**
 * Pinned in data.json: a fresh install picks miles for an en-US machine and follows the machine language, and the
 * pictures and specs must not depend on the machine. Auto-sync is off (`syncHours: 0`) so that a key stored by a spec can never
 * make the startup timer call the real Garmin API; the specs that test auto-sync switch it on themselves. Dashy is installed next to Garmy because the wizard previews
 * its dashboards with it; DASHY_DIST points at a Dashy checkout with a built main.js.
 */
export const { test, expect, onlyWhen } = createObsidianTest({
    seedVault: "e2e-vault.pristine",
    plugins: [{ dir: "." }, { dir: process.env.DASHY_DIST ?? "../dashsidian" }],
    data: { garmidian: { units: "metric", language: "en", syncHours: 0 } },
    window: { width: 1200, height: 1500 },
    // Stopping the trace of a long capture test (dozens of snapshots of Dashy's charts) is bounded by this and took
    // more than the default 5 s in the library test; a hung Obsidian is still killed after this long.
    timeouts: { close: 30_000 },
    // Obsidian's secure storage otherwise asks the macOS Keychain for access.
    electronArgs: ["--use-mock-keychain"],
});

/** Stores a key the way the wizard does (Obsidian's secure storage). */
export async function setKey(win: Page, key: string): Promise<void> {
    await win.evaluate(([id, k]) => {
        (globalThis as unknown as { app: { secretStorage: { setSecret(i: string, v: string): void } } }).app.secretStorage.setSecret(id as string, k as string);
    }, [SECRET_ID, key]);
}

/** The part of the plugin object the specs touch (importing src/main would pull the whole bundle's asset imports into the e2e type check). */
export interface GarmyHandle {
    settings: { language: string; units: string; keyProblem: string };
    syncing: boolean;
    syncNow(manual: boolean): Promise<void>;
    setUnits(units: string): Promise<number>;
    dailyFormat(): string;
}

/** `app` as the specs see it: Obsidian's own type plus the plugin registry, which the public typings leave out. */
export type GarmyApp = App & { plugins: { plugins: { garmidian?: GarmyHandle } & Record<string, unknown>; disablePlugin(id: string): Promise<void>; manifests: Record<string, unknown> } };

/** The path of the note that is open in the active tab, "" when none is. */
export const activePath = (obsidian: ObsidianHelpers): Promise<string> => obsidian.evaluate((app: App) => app.workspace.getActiveFile()?.path ?? "");

/** The text of a note by vault path. */
export const readNote = (obsidian: ObsidianHelpers, path: string): Promise<string> => obsidian.evaluate(async (app: App, p: string) => {
    const file = app.vault.getFileByPath(p);
    if (!file) throw new Error(`No note at ${p}.`);
    return app.vault.read(file);
}, path);

export async function openWizard(win: Page): Promise<void> {
    await win.evaluate(() => (globalThis as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("garmidian:open-wizard"));
    await win.locator(".garmy-wizard").waitFor({ timeout: 5_000 });
}

/**
 * Replaces the plugin's transport with a fake Garmin that serves `days` days of synthetic data:
 * steps, resting HR, stress, sleep, HRV and a run every third day. No swimming, cycling or readiness,
 * so the wizard must not offer them. `mode` picks a failure instead: 401, offline or 429.
 */
export type GarminMode = "ok" | "401" | "offline" | "429";

export function fakeGarmin(obsidian: ObsidianHelpers, days: number, mode: GarminMode = "ok", delayMs = 0): Promise<FakeHandle> {
    // The factory runs in the page: it cannot see anything of this file, so everything comes through `arg`.
    return obsidian.replace(
        "garmidian",
        "http",
        (arg: { days: number; mode: GarminMode; delayMs: number }) => {
            const pad = (x: number): string => String(x).padStart(2, "0");
            const iso = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
            const dates: string[] = [];
            for (let i = arg.days - 1; i >= 0; i--) dates.push(iso(Date.now() - i * 864e5));
            const within = (url: string): string[] => {
                const q = new URL(url);
                const a = q.searchParams.get("startDate") ?? url.split("/").slice(-2)[0] ?? "";
                const b = q.searchParams.get("endDate") ?? url.split("/").slice(-1)[0] ?? "";
                return dates.filter((d) => d >= a && d <= b);
            };
            const respond = (req: { url: string; method: string }): Promise<{ status: number; text: string }> => {
                if (arg.mode === "offline") return Promise.reject(new Error("offline"));
                if (arg.mode === "401") return Promise.resolve({ status: 401, text: "" });
                if (arg.mode === "429") return Promise.resolve({ status: 429, text: "" });
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
            return (req: { url: string; method: string }) => (arg.delayMs ? new Promise((r) => setTimeout(r, arg.delayMs)).then(() => respond(req)) : respond(req));
        },
        { days, mode, delayMs },
    );
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
