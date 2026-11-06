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
