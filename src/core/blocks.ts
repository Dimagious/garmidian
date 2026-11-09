// Small writers for Dashy blocks: a row of keys, a list, a fenced block. Shared by every dashboard template.

export type Scalar = string | number | boolean | undefined | null;
export type Row = Record<string, Scalar>;

const needsQuote = (v: string): boolean => /[,:{}[\]#"'&*!|>%@`]/.test(v) || v !== v.trim() || v === "";
export const q = (v: Scalar): string => (typeof v === "string" && needsQuote(v) ? JSON.stringify(v) : String(v));
export const map = (o: Row): string =>
  "{ " + Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${q(v)}`).join(", ") + " }";
export const list = (rows: Row[]): string => rows.map((o) => "  - " + map(o)).join("\n");
export const fence = (lang: string, head: string[], rows?: Row[]): string =>
  "```" + lang + "\n" + head.join("\n") + (rows ? "\nitems:\n" + list(rows) : "") + "\n```";
export const series = (rows: Row[], key = "series"): string => `${key}:\n` + list(rows);

const RANGES = [7, 14, 30, 60, 90];
/** The longest standard chart window (7, 14, 30, 60 or 90 days) that the data covers; null under a week. */
export const rangeFor = (span: number): number | null => {
  const fit = RANGES.filter((r) => r <= span);
  return fit[fit.length - 1] ?? null; // not Array.at: the target is ES2020
};

// A goal is the last month's total plus a little, rounded up to a number a person would pick. The ladder is fine
// enough that the round-up stays within about a sixth: 110 becomes 120, not 200.
const LADDER = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10];
export function niceUp(x: number): number {
  if (x <= 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(x));
  const m = x / mag;
  const step = LADDER.find((s) => m <= s) ?? 10;
  return Number((step * mag).toPrecision(12));
}

/** A race can be named by one date (a start you have entered for) or by a folder of race notes. */
export const isRaceDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);
