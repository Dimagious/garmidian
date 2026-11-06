import type { Page } from "@playwright/test";

/**
 * A believable year of Garmin data for pictures and clips. Nobody's real numbers: a seeded generator
 * with weekly rhythm, a slow fitness trend and a training week (swim Monday, run Tuesday and Thursday,
 * strength Wednesday, bike Saturday, long run Sunday). Same seed, same year, every time.
 */
export async function installDemoGarmin(win: Page, days: number, delayMs = 0, opts: { swim?: boolean } = {}): Promise<void> {
    await win.evaluate(([n, delay, swim]) => {
        const g = globalThis as unknown as { app: { plugins: { plugins: Record<string, { http: unknown }> } } };
        const plugin = g.app.plugins.plugins.garmidian;
        if (!plugin) throw new Error("garmidian is not loaded");
        let seed = 20261106;
        const rnd = (): number => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const noise = (amp: number): number => (rnd() - 0.5) * 2 * amp;
        const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
        const pad = (x: number): string => String(x).padStart(2, "0");
        const total = n as number;

        interface Day { date: string; steps: number; rhr: number; stress: number; sleepSecs: number; sleepScore: number; hrv: number; battery: number }
        const dayRows: Day[] = [];
        const acts: Array<{ activityType: { typeKey: string }; startTimeLocal: string; distance: number; duration: number }> = [];
        let prevHard = 0;
        for (let i = 0; i < total; i++) {
            const d = new Date(Date.now() - (total - 1 - i) * 864e5);
            const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const dow = d.getDay(); // 0 Sunday
            const progress = i / Math.max(1, total - 1);
            let hard = 0;
            const add = (typeKey: string, hour: number, meters: number, secs: number): void => { acts.push({ activityType: { typeKey }, startTimeLocal: `${date} ${pad(hour)}:10:00`, distance: Math.round(meters), duration: Math.round(secs) }); };
            let runBoost = 0;
            if (swim !== false && dow === 1 && rnd() < 0.75) { const km = 1.5 + rnd() * 1.2; add("lap_swimming", 7, km * 1000, km * 10 * 120 + noise(120)); hard += 0.5; }
            if (dow === 2 && rnd() < 0.88) { const km = 6 + rnd() * 3 + progress * 1.5; add("running", 6, km * 1000, km * (350 - progress * 14 + noise(12))); hard += 1; runBoost = 3500; }
            if (dow === 3 && rnd() < 0.65) { add("strength_training", 18, 0, 2700 + rnd() * 1200); hard += 0.6; }
            if (dow === 4 && rnd() < 0.85) { const km = 8 + rnd() * 4 + progress * 2; add("running", 6, km * 1000, km * (345 - progress * 14 + noise(12))); hard += 1.2; runBoost = 5000; }
            if (dow === 6 && rnd() < 0.6) { const km = 40 + rnd() * 35; add("cycling", 8, km * 1000, (km / (25 + rnd() * 5)) * 3600); hard += 1.4; }
            if (dow === 0 && rnd() < 0.8) { const km = 14 + rnd() * 7 + progress * 3; add("running", 8, km * 1000, km * (355 - progress * 15 + noise(12))); hard += 2; runBoost = 9000; }
            const weekend = dow === 0 || dow === 6;
            const sleepH = clamp(6.7 + (weekend ? 0.6 : 0) + noise(0.55) - prevHard * 0.08, 5.4, 9);
            const sleepScore = Math.round(clamp(66 + (sleepH - 6.5) * 9 + noise(5) + progress * 4, 52, 97));
            dayRows.push({
                date,
                steps: Math.round(clamp(7600 + (weekend ? 1400 : 0) + runBoost + noise(2300), 1800, 24000)),
                rhr: Math.round(clamp(55 - progress * 6 + noise(1.6) + prevHard * 0.6, 44, 62)),
                stress: Math.round(clamp(24 + (weekend ? -4 : 3) + noise(6) + prevHard, 12, 48)),
                sleepSecs: Math.round(sleepH * 3600),
                sleepScore,
                hrv: Math.round(clamp(46 + progress * 14 + noise(5) - prevHard * 2.5, 30, 78)),
                battery: Math.round(clamp(58 + sleepScore * 0.32 + noise(6), 48, 99)),
            });
            prevHard = hard;
        }
        const within = (url: string): Day[] => {
            const q = new URL(url);
            const a = q.searchParams.get("startDate") ?? url.split("/").slice(-2)[0] ?? "";
            const b = q.searchParams.get("endDate") ?? url.split("/").slice(-1)[0] ?? "";
            return dayRows.filter((d) => d.date >= a && d.date <= b);
        };
        const respond = (req: { url: string; method: string }): Promise<{ status: number; text: string }> => {
            const json = (v: unknown): Promise<{ status: number; text: string }> => Promise.resolve({ status: 200, text: JSON.stringify(v) });
            if (req.method === "POST") return Promise.resolve({ status: 200, text: "demo.jwt" });
            const u = req.url;
            if (u.includes("dailysummaries")) return json({ data: within(u).map((d) => ({ calendarDate: d.date, movement: { steps: { value: d.steps, distanceInMeters: d.steps * 0.75 } }, heartRate: { restingValue: d.rhr }, stress: { avgLevel: d.stress }, bodyBattery: { maxValue: d.battery, minValue: 22 } })) });
            if (u.includes("dailySleepSummariesByDate")) return json(within(u).map((d) => ({ calendarDate: d.date, sleepTimeSeconds: d.sleepSecs, sleepScores: { overall: { value: d.sleepScore } } })));
            if (u.includes("hrv/daily")) return json({ hrvSummaries: within(u).map((d) => ({ calendarDate: d.date, lastNightAvg: d.hrv })) });
            if (u.includes("activities/search")) {
                const q = new URL(u);
                const start = Number(q.searchParams.get("start") ?? "0");
                const a = q.searchParams.get("startDate") ?? "";
                const b = q.searchParams.get("endDate") ?? "";
                return json(acts.filter((x) => x.startTimeLocal.slice(0, 10) >= a && x.startTimeLocal.slice(0, 10) <= b).slice(start, start + 200));
            }
            return Promise.resolve({ status: 404, text: "" });
        };
        plugin.http = (req: { url: string; method: string }) => (delay ? new Promise((r) => setTimeout(r, delay as number)).then(() => respond(req)) : respond(req));
    }, [days, delayMs, opts.swim ?? true] as const);
}
