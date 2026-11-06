import { describe, expect, it } from "vitest";
import { readRegionMeta, replaceRegion, splitComposed, wrapRegion, type RegionMeta } from "./region";

const meta: RegionMeta = { v: 1, source: "Garmy/data", groups: ["recovery"], sports: ["run"], lang: "en", races: null };

describe("splitComposed", () => {
  it("separates frontmatter, title and body", () => {
    const r = splitComposed('---\ncreated: 2026-11-06\ntags:\n  - "#garmy"\n---\n\n# My dashboard\n\n## Recovery\n\nblocks\n');
    expect(r.frontmatter).toBe('---\ncreated: 2026-11-06\ntags:\n  - "#garmy"\n---');
    expect(r.title).toBe("# My dashboard");
    expect(r.body).toBe("## Recovery\n\nblocks");
  });
  it("copes with no frontmatter and no title", () => {
    expect(splitComposed("just text\n")).toEqual({ frontmatter: "", title: "", body: "just text" });
  });
});

describe("region", () => {
  it("wraps and reads back its choices", () => {
    expect(readRegionMeta(`intro\n\n${wrapRegion("body", meta)}\n\noutro`)).toEqual(meta);
  });
  it("replaces only the region and keeps what the user wrote around it", () => {
    const note = `my intro\n\n${wrapRegion("old", meta)}\n\nmy outro\n`;
    const out = replaceRegion(note, "new", { ...meta, lang: "ru" });
    expect(out).toContain("my intro");
    expect(out).toContain("my outro");
    expect(out).toContain("\nnew\n");
    expect(out).not.toContain("old");
    expect(readRegionMeta(out ?? "")?.lang).toBe("ru");
  });
  it("returns null when there is no region", () => {
    expect(replaceRegion("plain note", "x", meta)).toBeNull();
    expect(readRegionMeta("plain note")).toBeNull();
  });
  it("ignores a broken or foreign marker", () => {
    expect(readRegionMeta("%% garmy:start {not json} %%\nx\n%% garmy:end %%")).toBeNull();
    expect(readRegionMeta('%% garmy:start {"v":2} %%\nx\n%% garmy:end %%')).toBeNull();
  });
  it("survives a percent sign in a folder name and replacement text with dollar signs", () => {
    const odd: RegionMeta = { ...meta, source: "100%% data", races: "R%%" };
    const note = wrapRegion("old", odd);
    expect(readRegionMeta(note)).toEqual(odd);
    expect(replaceRegion(note, "cost $1 and $&", odd)).toContain("cost $1 and $&");
  });
  it("replaces the first region only when the note has two", () => {
    const note = `${wrapRegion("a", meta)}\n\n${wrapRegion("b", meta)}`;
    const out = replaceRegion(note, "z", meta) ?? "";
    expect(out).toContain("\nz\n");
    expect(out).toContain("\nb\n");
  });
});
