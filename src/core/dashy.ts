// What Garmy needs to know about Dashy's public API (docs/API.md in Dashy 2.2.0): the shapes it returns, the version
// comparison, and the one rule that depends on the version.

export interface DashyFinding {
  level: "error" | "warning" | "notice";
  /** the text the user sees in the block, in the language Dashy speaks in this vault */
  message: string;
  /** 1-based line inside the block */
  line?: number;
}
export interface DashyCheckedBlock {
  /** 1-based line of the opening fence in the text */
  line: number;
  lang: string;
  /** `unknown` is a `dashy-` name Dashy does not have: nothing will draw it */
  status: "checked" | "elsewhere" | "unknown";
  owner?: string;
  findings: DashyFinding[];
}
export interface DashyApi {
  readonly apiVersion: number;
  readonly version: string;
  readonly schemaVersion: string;
  fences(): string[];
  check(text: string, sourcePath: string): Promise<DashyCheckedBlock[]>;
}

/** The schema that knows `goal: usual` on a progress bar (Dashy 2.2.0). An older Dashy shows an error in the bar. */
export const USUAL_GOAL_SCHEMA = "1.12.0";
/** Whole previous months `goal: usual` averages. Under this much history it would average a month the data barely covers. */
export const USUAL_GOAL_MIN_DAYS = 120;

/** `have` is `wanted` or later, compared part by part. */
export function schemaAtLeast(have: string, wanted: string): boolean {
  const a = have.split(".").map(Number);
  const b = wanted.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x > y;
  }
  return true;
}

/** The API of a Dashy that has one, or null: no `api`, or an `apiVersion` below 1. */
export function readDashyApi(plugin: unknown): DashyApi | null {
  const api = (plugin as { api?: Partial<DashyApi> } | undefined)?.api;
  if (!api || typeof api.apiVersion !== "number" || api.apiVersion < 1) return null;
  if (typeof api.schemaVersion !== "string" || typeof api.check !== "function") return null;
  return api as DashyApi;
}

/** Blocks that will not draw: an error finding, or a `dashy-` name Dashy lacks. */
export function brokenBlocks(blocks: DashyCheckedBlock[]): DashyCheckedBlock[] {
  return blocks.filter((b) => b.status === "unknown" || b.findings.some((f) => f.level === "error"));
}

/** Obsidian was still indexing when the check ran, so the block was not looked at: ask again. */
export const wasNotChecked = (blocks: DashyCheckedBlock[]): boolean =>
  blocks.some((b) => b.findings.length === 1 && b.findings[0]!.level === "notice" && /index/i.test(b.findings[0]!.message));
