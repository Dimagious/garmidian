// How new numbers from Garmin meet a note that already exists.
// The data folder belongs to Garmy, so the latest days are overwritten: a day written at 23:00 holds
// partial steps and must be refreshed the next morning. Older days only get missing fields filled,
// which also protects a user who points the data folder at notes that carry their own values.
import { addDays } from "./dates";

export type Fields = Record<string, number | string>;

/** Days counted back from today (today included) that Garmin may still change. */
export const OVERWRITE_DAYS = 3;

export function overwriteFrom(today: string): string {
  return addDays(today, -(OVERWRITE_DAYS - 1));
}

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === "";

/** The fields that have to be written into a note, given what it already holds. */
export function changesFor(existing: Record<string, unknown>, incoming: Fields, overwrite: boolean): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(incoming)) {
    const cur = existing[k];
    if (isEmpty(cur) || (overwrite && cur !== v)) out[k] = v;
  }
  return out;
}
