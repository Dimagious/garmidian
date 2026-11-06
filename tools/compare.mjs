// Compare what Garmy maps from the Personal API with what Health Sync / garmin-repair wrote into the real vault.
import { execFileSync } from "node:child_process";
import { GarminClient, iso } from "../.e2e/client.mjs";
import { readDays } from "/Users/dyurkin/projects/garmy-spike/lib/profile.mjs";
const key = execFileSync("/usr/bin/security", ["find-generic-password", "-s", "garmin-personal-api", "-w"]).toString().trim();
const http = async (r) => { const res = await fetch(r.url, { method: r.method, headers: r.headers }); return { status: res.status, text: await res.text() }; };
const res = await new GarminClient(http, key).backfill(iso(Date.now() - 364 * 864e5), iso(Date.now()));
const mine = new Map(res.records.map((r) => [r.date, r.fields]));
const real = new Map(readDays("/Users/dyurkin/my-obsidian-vault/01-Areas/Personal/Дневник").map((r) => [r.date, r.fm]));
const FIELDS = ["steps", "resting_hr", "stress", "distance_km", "sleep_score", "sleep_duration", "hrv", "run_km", "run_min", "bike_km", "bike_min", "swim_km", "swim_min", "strength_min"];
const stat = {};
const examples = {};
for (const [date, a] of mine) {
  const b = real.get(date); if (!b) continue;
  for (const f of FIELDS) {
    const x = a[f], y = b[f];
    if (x === undefined && y === undefined) continue;
    const s = (stat[f] ??= { both: 0, equal: 0, close: 0, onlyApi: 0, onlyVault: 0 });
    if (x === undefined) { s.onlyVault++; (examples[f + ":onlyVault"] ??= []).push(`${date} vault=${y}`); continue; }
    if (y === undefined) { s.onlyApi++; continue; }
    s.both++;
    if (x === y) s.equal++;
    else if (typeof x === "number" && typeof y === "number" && Math.abs(x - y) <= Math.max(1, Math.abs(y) * 0.03)) s.close++;
    else (examples[f] ??= []).push(`${date} api=${x} vault=${y}`);
  }
}
console.log("days from API:", mine.size, " requests:", res.requests, " warnings:", res.warnings.length);
console.table(stat);
for (const [k, v] of Object.entries(examples)) console.log(k, v.length, "e.g.", v.slice(0, 3).join(" ; "));
