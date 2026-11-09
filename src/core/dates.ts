// Dates as YYYY-MM-DD strings. "Today" is the user's local day: toISOString() is UTC, which
// is yesterday for the first hours of a day in Europe and tomorrow in the evening in the Americas.
const DAY_MS = 864e5;

const pad = (n: number): string => String(n).padStart(2, "0");

export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Calendar arithmetic on date strings, immune to time zones and daylight saving. */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The ISO 8601 week of a date as "2026-W45", the name Dashy reads for a weekly note. */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // the Thursday of this week decides the year
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / DAY_MS - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}
