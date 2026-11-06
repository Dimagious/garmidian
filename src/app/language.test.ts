import { describe, expect, it } from "vitest";
import { compose } from "../core/compose";
import { buildProfile } from "../core/profile";
import { LANGS } from "../i18n";

const rows = Array.from({ length: 40 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
  fields: { steps: 8000, resting_hr: 50, stress: 25, sleep_score: 80, sleep_duration: "7h 0min", hrv: 50, body_battery: 80, run_km: 5, run_min: 30 } as Record<string, number | string>,
}));

describe("a dashboard in every language", () => {
  it.each(LANGS.map((l) => l.code))("%s composes a note whose YAML stays valid and mentions no missing label", (code) => {
    const { markdown } = compose(buildProfile(rows), { source: "Garmy/data", lang: code });
    expect(markdown).not.toContain("undefined");
    expect(markdown).not.toContain("—");
    // every label value that contains a YAML special character must be quoted, or Dashy cannot read the block
    for (const m of markdown.matchAll(/label: ([^,}\n]+)/g)) expect(m[1], m[0]).not.toMatch(/^[^"].*:/);
    for (const m of markdown.matchAll(/^title: (.+)$/gm)) expect(m[1]?.startsWith('"') || !/[:#]/.test(m[1] ?? ""), m[0]).toBe(true);
  });
  it("each language writes different words for the same dashboard", () => {
    const titles = LANGS.map((l) => /^# (.+)$/m.exec(compose(buildProfile(rows), { source: "Garmy/data", lang: l.code }).markdown)?.[1]);
    expect(new Set(titles).size).toBe(LANGS.length);
  });
});
