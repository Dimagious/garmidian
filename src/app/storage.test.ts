import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import { dayParser } from "../core/dayname";
import { readRows, scanNotes, uniquePath, writeDays } from "./storage";

type Fm = Record<string, unknown>;

/** An in-memory vault: files with parsed properties, enough for writeDays and readRows. */
function fakeApp(initial: Record<string, Fm> = {}, cacheLag = false): { app: App; files: Map<string, Fm>; folders: Set<string>; rewrites: string[] } {
  const files = new Map<string, Fm>(Object.entries(initial));
  const folders = new Set<string>();
  const objects = new Map<string, TFile>();
  const rewrites: string[] = [];
  const fileFor = (p: string): TFile => { let f = objects.get(p); if (!f) { f = Object.assign(new TFile(), { path: p }); objects.set(p, f); } return f; };
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => (files.has(p) ? fileFor(p) : folders.has(p) ? { path: p } : null),
      createFolder: (p: string) => { folders.add(p); return Promise.resolve(); },
      create: (p: string, data: string) => {
        const fm: Fm = {};
        for (const line of data.split("\n").slice(1)) {
          if (line === "---") break;
          const i = line.indexOf(": ");
          const raw = line.slice(i + 2);
          fm[line.slice(0, i)] = raw.startsWith('"') ? (JSON.parse(raw) as string) : Number(raw);
        }
        files.set(p, fm);
        return Promise.resolve(fileFor(p));
      },
      getMarkdownFiles: () => [...files.keys()].map(fileFor),
    },
    metadataCache: { getFileCache: (f: TFile) => (cacheLag ? null : { frontmatter: files.get(f.path) }) },
    fileManager: {
      processFrontMatter: (f: TFile, fn: (fm: Fm) => void) => { rewrites.push(f.path); const fm = files.get(f.path) ?? {}; fn(fm); files.set(f.path, fm); return Promise.resolve(); },
    },
  } as unknown as App;
  return { app, files, folders, rewrites };
}

const rec = (date: string, fields: Record<string, number | string>) => ({ date, fields });

describe("writeDays", () => {
  it("creates a note per day with properties only, and the folder first", async () => {
    const { app, files, folders } = fakeApp();
    const res = await writeDays(app, "Garmy/data", [rec("2026-11-01", { steps: 100, sleep_duration: "7h 0min" })]);
    expect(res).toEqual({ created: 1, updated: 0, untouched: 0 });
    expect(files.get("Garmy/data/2026-11-01.md")).toEqual({ steps: 100, sleep_duration: "7h 0min" });
    expect(folders.has("Garmy")).toBe(true);
    expect(folders.has("Garmy/data")).toBe(true);
  });

  it("fills gaps in an old note and leaves its values alone", async () => {
    const { app, files } = fakeApp({ "D/2026-10-01.md": { steps: 100 } });
    const res = await writeDays(app, "D", [rec("2026-10-01", { steps: 999, hrv: 50 })], { overwriteFrom: "2026-11-04" });
    expect(res.updated).toBe(1);
    expect(files.get("D/2026-10-01.md")).toEqual({ steps: 100, hrv: 50 });
  });

  it("overwrites the latest days", async () => {
    const { app, files } = fakeApp({ "D/2026-11-05.md": { steps: 100, hrv: 30 } });
    await writeDays(app, "D", [rec("2026-11-05", { steps: 999, hrv: 50 })], { overwriteFrom: "2026-11-04" });
    expect(files.get("D/2026-11-05.md")).toEqual({ steps: 999, hrv: 50 });
  });

  it("does not rewrite a note that would not change", async () => {
    const { app, rewrites } = fakeApp({ "D/2026-11-05.md": { steps: 999 } });
    const res = await writeDays(app, "D", [rec("2026-11-05", { steps: 999 })], { overwriteFrom: "2026-11-04" });
    expect(res).toEqual({ created: 0, updated: 0, untouched: 1 });
    expect(rewrites).toEqual([]);
  });

  it("still works when the metadata cache has not caught up with an existing note", async () => {
    const { app, files, rewrites } = fakeApp({ "D/2026-11-05.md": { steps: 100 } }, true);
    const res = await writeDays(app, "D", [rec("2026-11-05", { steps: 999 })], { overwriteFrom: "2026-11-04" });
    expect(res.updated).toBe(1);
    expect(rewrites.length).toBe(1);
    expect(files.get("D/2026-11-05.md")).toEqual({ steps: 999 });
  });

  it("without overwriteFrom nothing is overwritten", async () => {
    const { app, files } = fakeApp({ "D/2026-11-05.md": { steps: 100 } });
    await writeDays(app, "D", [rec("2026-11-05", { steps: 999 })]);
    expect(files.get("D/2026-11-05.md")).toEqual({ steps: 100 });
  });

  it("handles a year of days in one call", async () => {
    const { app, files } = fakeApp();
    const days = Array.from({ length: 365 }, (_, i) => rec(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), { steps: i }));
    expect((await writeDays(app, "D", days)).created).toBe(365);
    expect(files.size).toBe(365);
  });
});

describe("readRows", () => {
  it("reads day notes of the folder back, in date order, ignoring other files", () => {
    const { app } = fakeApp({ "D/2026-11-02.md": { steps: 2 }, "D/2026-11-01.md": { steps: 1, tags: ["x"] }, "D/readme.md": { a: 1 }, "Other/2026-11-03.md": { steps: 3 } });
    const rows = readRows(app, "D");
    expect(rows.map((r) => r.date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(rows[0]?.fields).toEqual({ steps: 1 });
  });
  it("skips notes the cache does not know yet", () => {
    const { app } = fakeApp({ "D/2026-11-01.md": { steps: 1 } }, true);
    expect(readRows(app, "D")).toEqual([]);
  });
});

describe("readRows with another day format", () => {
  it("reads notes named in the given format and returns ISO dates", () => {
    const { app } = fakeApp({ "D/06.11.2026.md": { steps: 6 }, "D/05.11.2026.md": { steps: 5 }, "D/2026-11-04.md": { steps: 4 } });
    const rows = readRows(app, "D", dayParser("DD.MM.YYYY"));
    expect(rows.map((r) => r.date)).toEqual(["2026-11-05", "2026-11-06"]);
    expect(rows[1]?.fields).toEqual({ steps: 6 });
  });
});

describe("uniquePath", () => {
  it("numbers a name that is taken", async () => {
    const { app } = fakeApp({ "N/Dash.md": {}, "N/Dash 2.md": {} });
    expect(await uniquePath(app, "N", "Dash")).toBe("N/Dash 3.md");
    expect(await uniquePath(app, "N", "Fresh")).toBe("N/Fresh.md");
  });
});

describe("scanNotes", () => {
  it("lists the properties of the notes the cache knows", () => {
    const { app } = fakeApp({ "Diary/2026-11-01.md": { steps: 1 }, "x.md": { a: 2 } });
    expect(scanNotes(app)).toEqual([{ path: "Diary/2026-11-01.md", props: { steps: 1 } }, { path: "x.md", props: { a: 2 } }]);
  });
  it("skips notes the cache has not read yet", () => {
    expect(scanNotes(fakeApp({ "x.md": { a: 2 } }, true).app)).toEqual([]);
  });
});
