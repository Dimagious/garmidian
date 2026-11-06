// Shape probe for the Body Battery endpoint. Key from Keychain, never printed.
import { execFileSync } from "node:child_process";
const key = execFileSync("/usr/bin/security", ["find-generic-password", "-s", "garmin-personal-api", "-w"]).toString().trim();
const B = "https://personal.connectapi.garmin.com";
const tok = (await (await fetch(B + "/personalapitoken-service/personal-api/personal-api-key/token", { method: "POST", headers: { Authorization: "ApiKey " + key } })).text()).trim().replace(/^"|"$/g, "");
const get = async (p) => { const r = await fetch(B + p, { headers: { Authorization: "Bearer " + tok } }); const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, j: t.slice(0, 150) }; } };
const shape = (v) => Array.isArray(v) ? `[${v.length}] ${v[0] ? shape(v[0]) : ""}` : v && typeof v === "object" ? "{" + Object.entries(v).map(([k, x]) => k + (typeof x === "object" && x ? ":" + (Array.isArray(x) ? "[" + x.length + "]" : "{}") : "=" + JSON.stringify(x))).join(", ").slice(0, 600) + "}" : typeof v;
for (const [a, b] of [["2026-11-01", "2026-11-05"], ["2026-10-06", "2026-11-05"], ["2026-09-05", "2026-11-05"]]) {
  const r = await get(`/wellness-service/wellness/bodyBattery/reports/daily?startDate=${a}&endDate=${b}`);
  console.log(a, b, r.s, Array.isArray(r.j) ? r.j.length + " items" : String(r.j).slice(0, 100));
  if (r.s === 200 && Array.isArray(r.j) && r.j[0]) console.log(shape(r.j[0]));
}
const sum = await get("/usersummary-service/v2/dailysummaries?startDate=2026-11-05&endDate=2026-11-05");
const d = sum.j.data?.[0] ?? {};
console.log("dailysummaries has bodyBattery:", JSON.stringify(d.bodyBattery ?? null).slice(0, 300));
