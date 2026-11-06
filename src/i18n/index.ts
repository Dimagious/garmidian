import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { pt } from "./pt";
import { ru } from "./ru";
import { LANGS, type Lang, type Locale, type SyncUi, type Ui } from "./types";

export { LANGS };
export type { Lang, Locale, Ui, SyncUi };
export { LABEL_KEYS } from "./types";

export const LOCALES: Record<Lang, Locale> = { en, ru, es, de, fr, pt, ja };

export const UI: Record<Lang, Ui> = Object.fromEntries(LANGS.map((l) => [l.code, LOCALES[l.code].ui])) as Record<Lang, Ui>;
export const SYNC_UI: Record<Lang, SyncUi> = Object.fromEntries(LANGS.map((l) => [l.code, LOCALES[l.code].sync])) as Record<Lang, SyncUi>;
/** Dashboard labels by language. */
export const T: Record<Lang, Record<string, string>> = Object.fromEntries(LANGS.map((l) => [l.code, LOCALES[l.code].labels])) as Record<Lang, Record<string, string>>;
export const UNITS: Record<Lang, Record<string, string>> = Object.fromEntries(LANGS.map((l) => [l.code, LOCALES[l.code].units])) as unknown as Record<Lang, Record<string, string>>;

/**
 * The language to use for an Obsidian language code ("de", "pt-BR", "zh-TW"...). Anything Garmy does not
 * speak falls back to English.
 */
export function pickLang(code: string): Lang {
  const base = code.toLowerCase().split(/[-_]/)[0] ?? "";
  return LANGS.find((l) => l.code === base)?.code ?? "en";
}
