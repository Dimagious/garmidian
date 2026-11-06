import type { DataProfile, DayRecord } from "./types";

const DAY_MS = 864e5;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** What the user's data actually contains: which fields, how many days, which sports are real. */
export function buildProfile(rows: DayRecord[]): DataProfile {
  const count: Record<string, number> = {};
  const nonzero: Record<string, number> = {};
  const dated = rows.filter((r) => Object.keys(r.fields).length > 0).sort((a, b) => a.date.localeCompare(b.date));
  for (const { fields } of dated) {
    for (const [k, v] of Object.entries(fields)) {
      if (v === "" || v === null || v === undefined) continue;
      count[k] = (count[k] ?? 0) + 1;
      if (v !== 0) nonzero[k] = (nonzero[k] ?? 0) + 1;
    }
  }
  const first = dated[0]?.date ?? null;
  const last = dated[dated.length - 1]?.date ?? null;
  const span = first && last ? Math.round((Date.parse(last) - Date.parse(first)) / DAY_MS) + 1 : 0;
  return {
    days: dated.length, span, first, last, count, nonzero,
    sumLast(field, n) {
      if (!last) return 0;
      const to = Date.parse(last);
      const from = to - (n - 1) * DAY_MS;
      let sum = 0;
      for (const r of dated) {
        const t = Date.parse(r.date);
        const v = r.fields[field];
        if (t >= from && t <= to && isNum(v)) sum += v;
      }
      return sum;
    },
  };
}

export const has = (p: DataProfile, field: string): boolean => (p.count[field] ?? 0) > 0;
/** A sport counts only if the user really did it: the field exists AND some value is non-zero. */
export const did = (p: DataProfile, field: string): boolean => (p.nonzero[field] ?? 0) > 0;
