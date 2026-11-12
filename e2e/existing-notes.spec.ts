import type { ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { App } from "obsidian";
import { test, expect, openWizard, setKey, dashyReport, activePath, readNote, type GarmyApp } from "./fixtures";

const day = (i: number): string => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);

/** Daily notes the way Garmin Health Sync leaves them: numbers in the properties of a note named by date. */
async function seedDiary(obsidian: ObsidianHelpers, from: number, to: number): Promise<void> {
    await obsidian.evaluate(async (app: App, [a, b]: [number, number]) => {
        if (!app.vault.getAbstractFileByPath("Diary")) await app.vault.createFolder("Diary");
        for (let i = a; i < b; i++) {
            const d = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
            await app.vault.create(`Diary/${d}.md`, `---\nsteps: ${6000 + (i % 7) * 500}\nsleep_score: ${70 + (i % 15)}\nhrv: ${44 + (i % 9)}\nresting_hr: ${48 + (i % 4)}\n---\n`);
        }
    }, [from, to]);
    await obsidian.waitForMetadataCache();
}

test.describe("notes the user already has", () => {
    test("a dashboard is built from existing daily notes without a key, and can be rebuilt later", async ({ win, obsidian }) => {
        await setKey(win, "");
        await seedDiary(obsidian, 0, 6);
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
        await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/Garmin dashboard/);
        const path = await activePath(obsidian);

        const young = await readNote(obsidian, path);
        expect(young).toContain("%% garmy:start %%");
        expect(young).toContain('garmy: "1|Diary|');
        expect(young).toContain("a week of data"); // 6 days is too young for charts

        // the user writes around the dashboard, and the diary grows
        await obsidian.evaluate(async (app: App, p: string) => {
            const file = app.vault.getFileByPath(p);
            if (!file) throw new Error(`No note at ${p}.`);
            await app.vault.process(file, (d) => d.replace("%% garmy:start %%", "My own sentence above.\n\n%% garmy:start %%"));
        }, path);
        await seedDiary(obsidian, 6, 40);
        await obsidian.runCommand("garmidian:rebuild-dashboard");
        await expect.poll(() => readNote(obsidian, path), { timeout: 10_000 }).toContain("dashy-chart");

        const grown = await readNote(obsidian, path);
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

    test("notes named in the user's own daily note format are found too", async ({ win, obsidian }) => {
        await setKey(win, "");
        await obsidian.evaluate(async (app: GarmyApp) => {
            const p = app.plugins.plugins.garmidian;
            if (!p) throw new Error("not loaded");
            p.dailyFormat = () => "DD.MM.YYYY";
            await app.vault.createFolder("Tagebuch");
            for (let i = 1; i <= 6; i++) await app.vault.create(`Tagebuch/${String(i).padStart(2, "0")}.10.2026.md`, `---\nsteps: ${5000 + i * 100}\nhrv: ${40 + i}\n---\n`);
        });
        await obsidian.waitForMetadataCache();
        await openWizard(win);
        await win.locator(".garmy-find-notes").click();
        await expect(win.locator(".garmy-notes-folder")).toContainText("Tagebuch: 6");
        await win.locator(".garmy-notes-folder").click();
        await win.locator(".garmy-preview-btn").waitFor({ timeout: 10_000 });
        await win.locator(".garmy-preview-btn").click();
        await win.locator(".garmy-create").click();
        await expect.poll(() => activePath(obsidian)).toMatch(/^Garmy\/Garmin dashboard/);
        const text = await readNote(obsidian, await activePath(obsidian));
        expect(text).toContain('garmy: "1|Tagebuch|');
        expect(text).toContain("|DD.MM.YYYY\"");
    });
});
