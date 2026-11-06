import { describe, expect, it } from "vitest";
import { decodeMeta, encodeMeta, readRegionMeta, replaceRegion, splitComposed, withMeta, wrapRegion, type RegionMeta } from "./region";

const meta: RegionMeta = { v: 1, source: "Garmy/data", groups: ["recovery", "training"], noSports: [], lang: "en", races: null };
const noteOf = (body: string, m: RegionMeta = meta, extra = ""): string => withMeta(`---\ntags: [x]\n---\n\n# T\n\n${extra}${wrapRegion(body)}\n`, m);

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

describe("meta encoding", () => {
  it("is one short line", () => { expect(encodeMeta(meta)).toBe("1|Garmy/data|recovery,training||en||"); });
  it("round-trips, including optional parts", () => {
    const full: RegionMeta = { ...meta, races: "Races", dayFormat: "DD.MM.YYYY", noSports: [], groups: ["recovery"], lang: "de" };
    expect(decodeMeta(encodeMeta(full))).toEqual(full);
    expect(decodeMeta(encodeMeta(meta))).toEqual(meta);
  });
  it("survives the separators inside a folder name", () => {
    const odd: RegionMeta = { ...meta, source: "a|b,c%d", races: "R|1" };
    expect(decodeMeta(encodeMeta(odd))).toEqual(odd);
  });
  it("rejects garbage and other versions", () => {
    expect(decodeMeta("")).toBeNull();
    expect(decodeMeta("2|x|a|b|en||")).toBeNull();
    expect(decodeMeta("1||a|b|en||")).toBeNull();
    expect(decodeMeta("1|x|a")).toBeNull();
  });
});

describe("withMeta", () => {
  it("adds the property to existing frontmatter and keeps the rest", () => {
    const out = withMeta("---\ntags: [x]\n---\n\nbody\n", meta);
    expect(out).toBe('---\ntags: [x]\ngarmy: "1|Garmy/data|recovery,training||en||"\n---\n\nbody\n');
  });
  it("replaces the property instead of adding a second one", () => {
    const once = withMeta("---\ntags: [x]\n---\n\nbody\n", meta);
    const twice = withMeta(once, { ...meta, lang: "ru" });
    expect(twice.match(/^garmy:/gm)?.length).toBe(1);
    expect(twice).toContain("|ru|");
  });
  it("creates frontmatter when the note has none", () => {
    expect(withMeta("just text\n", meta).startsWith('---\ngarmy: "1|')).toBe(true);
  });
});

describe("region", () => {
  it("reads the choices back from the property", () => { expect(readRegionMeta(noteOf("body"))).toEqual(meta); });
  it("keeps the markers short and free of data", () => {
    expect(wrapRegion("body")).toBe("%% garmy:start %%\n\nbody\n\n%% garmy:end %%");
  });
  it("replaces only the region and keeps what the user wrote around it", () => {
    const note = noteOf("old", meta, "My intro\n\n") + "\nMy outro\n";
    const out = replaceRegion(note, "new", { ...meta, lang: "ru" }) ?? "";
    expect(out).toContain("My intro");
    expect(out).toContain("My outro");
    expect(out).toContain("\nnew\n");
    expect(out).not.toContain("old");
    expect(readRegionMeta(out)?.lang).toBe("ru");
  });
  it("returns null when there is no region", () => {
    expect(replaceRegion("plain note", "x", meta)).toBeNull();
    expect(readRegionMeta("plain note")).toBeNull();
  });
  it("needs both the markers and the property", () => {
    expect(readRegionMeta(`---\ntags: [x]\n---\n\n${wrapRegion("x")}\n`)).toBeNull(); // no property
    expect(readRegionMeta(withMeta("---\ntags: [x]\n---\n\nplain\n", meta))).toBeNull(); // no markers
  });
  it("ignores a broken property", () => {
    expect(readRegionMeta(`---\ngarmy: nonsense\n---\n\n${wrapRegion("x")}\n`)).toBeNull();
    expect(readRegionMeta(`---\ngarmy: "2|x|a|b|en||"\n---\n\n${wrapRegion("x")}\n`)).toBeNull();
  });
  it("replaces the first region only when the note has two", () => {
    const note = noteOf("a") + `\n${wrapRegion("b")}\n`;
    const out = replaceRegion(note, "z", meta) ?? "";
    expect(out).toContain("\nz\n");
    expect(out).toContain("\nb\n");
  });
  it("survives replacement text with dollar signs", () => {
    expect(replaceRegion(noteOf("old"), "cost $1 and $&", meta)).toContain("cost $1 and $&");
  });
});
