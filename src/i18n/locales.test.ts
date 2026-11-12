import { describe, expect, it } from "vitest";
import { LABEL_KEYS, LANGS, LOCALES, pickLang } from "./index";

/** Names that must survive translation wherever the English text uses them. */
const BRANDS = ["Garmin", "Garmin Connect", "Personal API", "Dashy", "Obsidian", "Garmy", "Body Battery", "HRV"];

/** Every text in a locale, flattened to "path" -> text. Functions are called with sample arguments. */
function leaves(value: unknown, path: string, out: Map<string, string>): void {
  if (typeof value === "string") out.set(path, value);
  else if (typeof value === "function") out.set(path, String((value as (...a: unknown[]) => unknown)("Sample", 7)));
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
}
const flat = (code: (typeof LANGS)[number]["code"]): Map<string, string> => { const m = new Map<string, string>(); leaves(LOCALES[code], "", m); return m; };
const english = flat("en");

describe("locales", () => {
  it("offers English first, then Russian", () => { expect(LANGS.slice(0, 2).map((l) => l.code)).toEqual(["en", "ru"]); });

  it.each(LANGS.map((l) => l.code))("%s has every text, none empty", (code) => {
    const mine = flat(code);
    expect([...english.keys()].filter((k) => !mine.has(k))).toEqual([]);
    expect([...mine.keys()].filter((k) => !english.has(k))).toEqual([]);
    expect([...mine].filter(([, v]) => v.trim() === "").map(([k]) => k)).toEqual([]);
  });

  it.each(LANGS.map((l) => l.code))("%s has every dashboard label", (code) => {
    for (const k of LABEL_KEYS) expect(LOCALES[code].labels[k], k).toBeTruthy();
  });

  it.each(LANGS.map((l) => l.code))("%s uses no em dash", (code) => {
    expect([...flat(code)].filter(([, v]) => v.includes("—")).map(([k]) => k)).toEqual([]);
  });

  it.each(LANGS.map((l) => l.code))("%s keeps product names and terms as the English text has them", (code) => {
    const mine = flat(code);
    const lost: string[] = [];
    for (const [k, en] of english) for (const b of BRANDS) if (en.includes(b) && !(mine.get(k) ?? "").includes(b)) lost.push(`${k}: ${b}`);
    expect(lost).toEqual([]);
  });

  it.each(LANGS.map((l) => l.code))("%s keeps the lengths of lists", (code) => {
    expect(LOCALES[code].ui.stepNames.length).toBe(LOCALES.en.ui.stepNames.length);
    expect(LOCALES[code].ui.keyHow.length).toBe(LOCALES.en.ui.keyHow.length);
  });

  it.each(LANGS.filter((l) => l.code !== "en").map((l) => l.code))("%s is a real translation, not a copy of English", (code) => {
    const mine = flat(code);
    const same = [...mine].filter(([k, v]) => v === english.get(k) && v.length > 12);
    expect(same.map(([k]) => k), "long texts identical to English").toEqual([]);
  });

  it.each(LANGS.map((l) => l.code))("%s notice functions return text that mentions their argument", (code) => {
    const sync = LOCALES[code].sync;
    expect(sync.noticeSynced(42)).toContain("42");
    expect(sync.notesFolder("Diary", 9)).toMatch(/Diary/);
    expect(sync.notesFolder("Diary", 9)).toContain("9");
    expect(sync.setKeyRejected("2026-11-06")).toContain("2026-11-06");
  });

  it.each(LANGS.map((l) => l.code))("%s names the vault root when a folder-less match is listed", (code) => {
    const text = LOCALES[code].sync.notesFolder("", 4);
    expect(text).toContain("4");
    expect(text.trim()).not.toBe("");
    expect(text).not.toBe(LOCALES[code].sync.notesFolder("Diary", 4));
    expect(text).not.toContain("undefined");
  });

  it("units keep ms, bpm and km", () => {
    for (const l of LANGS) for (const u of ["ms", "bpm", "km"] as const) expect(LOCALES[l.code].units[u].length).toBeGreaterThan(0);
  });
});

describe("pickLang", () => {
  it("maps Obsidian language codes, with English as the fallback", () => {
    expect(pickLang("en")).toBe("en");
    expect(pickLang("ru")).toBe("ru");
    expect(pickLang("de")).toBe("de");
    expect(pickLang("pt-BR")).toBe("pt");
    expect(pickLang("pt")).toBe("pt");
    expect(pickLang("ja")).toBe("ja");
    expect(pickLang("fr_CA")).toBe("fr");
    expect(pickLang("ES")).toBe("es");
    expect(pickLang("zh-TW")).toBe("en");
    expect(pickLang("")).toBe("en");
  });
});
