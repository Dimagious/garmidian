/** One day of Garmin data, already in the frontmatter names the dashboards use. */
export interface DayRecord {
  date: string; // YYYY-MM-DD
  fields: Record<string, number | string>;
}

export interface DataProfile {
  days: number;
  span: number;
  first: string | null;
  last: string | null;
  count: Record<string, number>;
  nonzero: Record<string, number>;
  /** sum of a numeric field over the n days ending at `last` */
  sumLast(field: string, n: number): number;
}
