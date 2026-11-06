// When a sync is due and how many days it has to cover. Pure, so the timing rules are unit-tested.
import { daysBetween } from "./dates";

export const FIRST_SYNC_DAYS = 14;
export const MAX_SYNC_DAYS = 60;
/** A sync always re-reads a few days before the last one: the latest days are still changing. */
export const SYNC_MARGIN_DAYS = 3;

export interface SyncState { syncHours: number; keyProblem: string; lastSyncAt: number; lastSync: string }

/** An automatic sync runs only when it is on, a key exists and works, and the interval has passed. */
export function shouldAutoSync(s: SyncState, hasKey: boolean, now: number): boolean {
  if (s.syncHours <= 0 || s.keyProblem !== "" || !hasKey) return false;
  return now - s.lastSyncAt >= s.syncHours * 3600e3;
}

/** How many days back from today a sync starts: since the last one plus a margin, within bounds. */
export function syncWindowDays(lastSync: string, today: string): number {
  if (!lastSync) return FIRST_SYNC_DAYS;
  return Math.min(MAX_SYNC_DAYS, Math.max(SYNC_MARGIN_DAYS, daysBetween(lastSync, today) + SYNC_MARGIN_DAYS));
}
