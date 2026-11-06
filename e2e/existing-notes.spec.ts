import type { Page } from "@playwright/test";
import { test, expect, openWizard, setKey, dashyReport } from "./fixtures";

const day = (i: number): string => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);

/** Daily notes the way Garmin Health Sync leaves them: numbers in the properties of a note named by date. */
async function seedDiary(win: Page, from: number, to: number): Promise<void> {
    await win.evaluate(async ([a, b]) => {
        const app = (globalThis as unknown as { app: { vault: { create(p: string, d: string): Promise<unknown>; createFolder(p: string): Promise<unknown>; getAbstractFileByPath(p: string): unknown } } }).app;
        if (!app.vault.getAbstractFileByPath("Diary")) await app.vault.createFolder("Diary");
        for (let i = a as number; i < (b as number); i++) {
            const d = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
            await app.vault.create(`Diary/${d}.md`, `---\nsteps: ${6000 + (i % 7) * 500}\nsleep_score: ${70 + (i % 15)}\nhrv: ${44 + (i % 9)}\nresting_hr: ${48 + (i % 4)}\n---\n`);
        }
    }, [from, to]);
    await win.waitForTimeout(1_500);
}

const readNote = (win: Page, path: string): Promise<string> => win.evaluate(async (p) => {
    const a = (globalThis as unknown as { app: { vault: { getFileByPath(p: string): unknown; read(f: unknown): Promise<string> } } }).app;
    return a.vault.read(a.vault.getFileByPath(p));
}, path);

test.describe("notes the user already has", () => {
    test("a dashboard is built from existing daily notes without a key, and can be rebuilt later", async ({ win }) => {
        await setKey(win, "");
        await seedDiary(win, 0, 6);
        await openWizard(win);
        await win.locator(".garmy-find-notes").click();
        await expect(win.locator(".garmy-notes-folder")).toContainText("Diary: 6");
        await win.locator(".garmy-notes-folder").click();

        await win.locator(".garmy-preview-btn").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-preview").waitFor({ timeout: 10_000 });
        await expect.poll(() => win.locator(".garmy-preview [class*='dashy']").count(), { timeout: 20_000 }).toBeGreaterThan(5);
        expect((await dashyReport(win, ".garmy-preview")).diagnostics).toEqual([]);

        await win.locator(".garmy-create").click();
        await expect.poll(() => win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null } } }).app.workspace.getActiveFile()?.path ?? "")).toMatch(/^Garmy\/Garmin dashboard/);
        const path = await win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } } } }).app.workspace.getActiveFile().path);

        const young = await readNote(win, path);
        expect(young).toContain("%% garmy:start %%");
        expect(young).toContain('garmy: "1|Diary|');
        expect(young).toContain("a week of data"); // 6 days is too young for charts

        // the user writes around the dashboard, and the diary grows
        await win.evaluate(async (p) => {
            const a = (globalThis as unknown as { app: { vault: { getFileByPath(p: string): unknown; process(f: unknown, fn: (d: string) => string): Promise<string> } } }).app;
            await a.vault.process(a.vault.getFileByPath(p), (d) => d.replace("%% garmy:start %%", "My own sentence above.\n\n%% garmy:start %%"));
        }, path);
        await seedDiary(win, 6, 40);
        await win.evaluate(() => (globalThis as unknown as { app: { commands: { executeCommandById(id: string): boolean } } }).app.commands.executeCommandById("garmidian:rebuild-dashboard"));
        await expect.poll(() => readNote(win, path), { timeout: 10_000 }).toContain("dashy-chart");

        const grown = await readNote(win, path);
        expect(grown).toContain("My own sentence above.");
        expect(grown).not.toContain("a week of data");
        expect(grown).toContain("%% garmy:end %%");
    });

    test("when no notes carry Garmin numbers the user is told what is needed", async ({ win }) => {
        await setKey(win, "");
        await openWizard(win);
        await win.locator(".garmy-find-notes").click();
        await expect(win.locator(".garmy-notes-none")).toContainText("date in its name");
    });

    test("notes named in the user's own daily note format are found too", async ({ win }) => {
        await setKey(win, "");
        await win.evaluate(async () => {
            const g = globalThis as unknown as { app: { plugins: { plugins: Record<string, { dailyFormat: () => string }> }; vault: { create(p: string, d: string): Promise<unknown>; createFolder(p: string): Promise<unknown> } } };
            const p = g.app.plugins.plugins.garmidian;
            if (!p) throw new Error("not loaded");
            p.dailyFormat = () => "DD.MM.YYYY";
            await g.app.vault.createFolder("Tagebuch");
            for (let i = 1; i <= 6; i++) await g.app.vault.create(`Tagebuch/${String(i).padStart(2, "0")}.10.2026.md`, `---\nsteps: ${5000 + i * 100}\nhrv: ${40 + i}\n---\n`);
        });
        await win.waitForTimeout(1_500);
        await openWizard(win);
        await win.locator(".garmy-find-notes").click();
        await expect(win.locator(".garmy-notes-folder")).toContainText("Tagebuch: 6");
        await win.locator(".garmy-notes-folder").click();
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-create").click();
        await expect.poll(() => win.evaluate(() => (globalThis as unknown as { app: { workspace: { getActiveFile(): { path: string } | null } } }).app.workspace.getActiveFile()?.path ?? "")).toMatch(/^Garmy\/Garmin dashboard/);
        const text = await win.evaluate(async () => {
            const a = (globalThis as unknown as { app: { workspace: { getActiveFile(): unknown }; vault: { read(f: unknown): Promise<string> } } }).app;
            return a.vault.read(a.workspace.getActiveFile());
        });
        expect(text).toContain('garmy: "1|Tagebuch|');
        expect(text).toContain("|DD.MM.YYYY\"");
    });
});
