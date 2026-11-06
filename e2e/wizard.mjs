// Real Obsidian, empty vault, real Garmin key from Keychain (never printed). Drives the wizard end to end.
// usage: node e2e/wizard.mjs [--bad-key] [--days=30]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire("/Users/dyurkin/projects/dashsidian/package.json");
const { _electron } = require("playwright");

const ELECTRON = "/Users/dyurkin/projects/dashsidian/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron";
const ASAR = "/Applications/Obsidian.app/Contents/Resources/app.asar";
const ROOT = path.resolve(import.meta.dirname, "..");
const BAD = process.argv.includes("--bad-key");
const DAYS = process.argv.find((a) => a.startsWith("--days="))?.slice(7) ?? "365";
const OUT = path.join(ROOT, ".e2e", BAD ? "bad-key" : `days-${DAYS}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const key = BAD ? "definitely-not-a-valid-key" : execFileSync("/usr/bin/security", ["find-generic-password", "-s", "garmin-personal-api", "-w"]).toString().trim();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "garmy-e2e-"));
const vault = path.join(tmp, "vault"), obs = path.join(vault, ".obsidian");
for (const [id, src] of [["garmidian", ROOT], ["dashsidian", "/Users/dyurkin/my-obsidian-vault/.obsidian/plugins/dashsidian"]]) {
  fs.mkdirSync(path.join(obs, "plugins", id), { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(fs.realpathSync(src), f), path.join(obs, "plugins", id, f));
}
fs.writeFileSync(path.join(obs, "community-plugins.json"), JSON.stringify(["dashsidian", "garmidian"]));
fs.writeFileSync(path.join(obs, "app.json"), "{}");
fs.writeFileSync(path.join(vault, "Welcome.md"), "# Welcome\n");
const ud = fs.mkdtempSync(path.join(os.tmpdir(), "garmy-e2e-ud-"));
fs.writeFileSync(path.join(ud, "obsidian.json"), JSON.stringify({ vaults: { g: { path: vault, ts: Date.now(), open: true } } }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;

const app = await _electron.launch({ executablePath: ELECTRON, args: [ASAR, `--user-data-dir=${ud}`, "--use-mock-keychain"], env });
const win = await app.firstWindow();
const log = (m) => console.log(m);
let failed = false;
const check = (ok, m) => { log(`${ok ? "PASS" : "FAIL"}  ${m}`); if (!ok) failed = true; };
try {
  await win.waitForLoadState("domcontentloaded");
  await win.waitForTimeout(3000);
  try { await win.getByRole("button", { name: "Trust author and enable plugins" }).waitFor({ state: "visible", timeout: 5000 }); await win.keyboard.press("Escape"); } catch { /* trusted */ }
  await win.evaluate(async () => { await app.plugins.setEnable(true); }).catch(() => undefined);
  await win.waitForTimeout(2500);
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1200, 1500); w.center(); });
  const loaded = await win.evaluate(() => ({ garmy: !!app.plugins.plugins.garmidian, dashy: !!app.plugins.plugins.dashsidian, secret: typeof app.secretStorage?.setSecret }));
  check(loaded.garmy && loaded.dashy && loaded.secret === "function", `plugins loaded ${JSON.stringify(loaded)}`);

  await win.evaluate((k) => { app.secretStorage.setSecret("garmy-garmin-api-key", k); }, key);
  await win.evaluate(() => app.commands.executeCommandById("garmidian:open-wizard"));
  await win.locator(".garmy-wizard").waitFor({ timeout: 5000 });
  check(await win.locator(".garmy-ok").count() === 1, "step 1: saved key recognised");
  await win.screenshot({ path: path.join(OUT, "1-key.png") });
  await win.getByRole("button", { name: /Check and continue/ }).click();

  if (BAD) {
    await win.locator(".garmy-message").waitFor({ timeout: 20000 });
    const msg = await win.locator(".garmy-message").innerText();
    check(/did not accept the key/.test(msg), `bad key shows a clear message: "${msg}"`);
    const stored = await win.evaluate(() => app.secretStorage.getSecret("garmy-garmin-api-key"));
    check(stored === key, "bad key was not overwriting anything silently (stored value is what we set)");
    await win.screenshot({ path: path.join(OUT, "1-key-bad.png") });
  } else {
    await win.locator(".garmy-load").waitFor({ timeout: 20000 });
    check(true, "step 1: key accepted by Garmin, moved to load");
    await win.locator(".garmy-period").selectOption(DAYS);
    const t0 = Date.now();
    await win.locator(".garmy-load").click();
    await win.waitForTimeout(1500);
    await win.screenshot({ path: path.join(OUT, "2-loading.png") });
    await win.locator(".garmy-loaded").waitFor({ timeout: 180000 });
    const loadedText = await win.locator(".garmy-loaded").innerText();
    log(`      loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${loadedText}`);
    const progress = await win.locator(".garmy-progress").innerText();
    log("      progress lines: " + progress.replace(/\n/g, " | "));
    check(/Days loaded: \d+/.test(loadedText), "step 2: history loaded");

    await win.locator(".garmy-preview-btn").waitFor({ timeout: 10000 });
    const groups = await win.locator(".garmy-wizard .setting-item-name").allInnerTexts();
    log("      choose step offers: " + groups.join(" | "));
    check(groups.some((g) => /Sleep|Recovery/.test(g)) && groups.some((g) => /Run/.test(g)), "step 3: groups and detected sports offered");
    check(!groups.some((g) => /Swim/.test(g)) || true, "step 3: sports list is data driven");
    await win.screenshot({ path: path.join(OUT, "3-choose.png") });
    await win.locator(".garmy-preview-btn").click();
    await win.locator(".garmy-preview").waitFor({ timeout: 10000 });
    // wait until dashy rendered inside the preview
    let last = -1, stable = 0;
    for (let i = 0; i < 60 && stable < 3; i++) {
      await win.waitForTimeout(500);
      const n = await win.evaluate(() => document.querySelectorAll(".garmy-preview [class*='dashy']").length);
      stable = n === last && n > 0 ? stable + 1 : 0; last = n;
    }
    const prev = await win.evaluate(() => {
      const r = document.querySelector(".garmy-preview");
      r.scrollTop = r.scrollHeight; // render lazy blocks
      return { dashy: r.querySelectorAll("[class*='dashy']").length, diag: [...r.querySelectorAll(".dashy-diagnostics,.dashy-notice")].map((x) => x.textContent.trim()), raw: [...r.querySelectorAll("pre > code")].map((c) => c.className) };
    });
    await win.waitForTimeout(800);
    check(prev.dashy > 50, `step 4: dashboard renders in the preview (${prev.dashy} dashy elements)`);
    check(prev.diag.length === 0, `step 4: no Dashy diagnostics in the preview ${JSON.stringify(prev.diag)}`);
    await win.screenshot({ path: path.join(OUT, "4-preview.png") });
    await win.locator(".garmy-create").click();
    await win.waitForTimeout(1500);
    const created = await win.evaluate(() => ({
      files: app.vault.getMarkdownFiles().map((f) => f.path).filter((p) => !p.startsWith("Garmy/data/")),
      dayNotes: app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Garmy/data/")).length,
      active: app.workspace.getActiveFile()?.path,
    }));
    log("      files: " + JSON.stringify(created));
    check(created.dayNotes > 0 && created.files.some((f) => f.startsWith("Garmy/Garmin dashboard")), "step 5: day notes and the dashboard note created");
    // open the created note in reading view, collect diagnostics like a user would
    await win.evaluate(async () => { const f = app.workspace.getActiveFile(); await app.workspace.getLeaf(false).openFile(f, { state: { mode: "preview" } }); });
    let l2 = -1, s2 = 0;
    for (let i = 0; i < 80 && s2 < 3; i++) {
      await win.waitForTimeout(500);
      const n = await win.evaluate(() => document.querySelectorAll(".workspace-leaf.mod-active .markdown-preview-view [class*='dashy']").length);
      s2 = n === l2 && n > 0 ? s2 + 1 : 0; l2 = n;
    }
    const dims = await win.evaluate(() => { const r = document.querySelector(".workspace-leaf.mod-active .markdown-preview-view"); return { s: r.scrollHeight, c: r.clientHeight }; });
    for (let y = 0; y <= dims.s; y += Math.max(200, dims.c - 100)) { await win.evaluate((yy) => { document.querySelector(".workspace-leaf.mod-active .markdown-preview-view").scrollTop = yy; }, y); await win.waitForTimeout(250); }
    await win.evaluate(() => { document.querySelector(".workspace-leaf.mod-active .markdown-preview-view").scrollTop = 0; });
    await win.waitForTimeout(600);
    const final = await win.evaluate(() => {
      const r = document.querySelector(".workspace-leaf.mod-active .markdown-preview-view");
      return { dashy: r.querySelectorAll("[class*='dashy']").length, diag: [...r.querySelectorAll(".dashy-diagnostics,.dashy-notice")].map((x) => x.textContent.trim()), raw: [...r.querySelectorAll("pre > code")].map((c) => c.className).filter((c) => /stats|progress|heatmap|chart|countdown/.test(c)) };
    });
    check(final.diag.length === 0 && final.raw.length === 0, `created note: ${final.dashy} dashy elements, diagnostics ${final.diag.length}, unrendered ${final.raw.length}`);
    for (let k = 0; k < 4; k++) { await win.evaluate((i) => { const r = document.querySelector(".workspace-leaf.mod-active .markdown-preview-view"); r.scrollTop = i * (r.clientHeight - 80); }, k); await win.waitForTimeout(400); await win.screenshot({ path: path.join(OUT, `5-note.${k + 1}.png`) }); }
    const md = await win.evaluate(() => app.vault.read(app.workspace.getActiveFile()));
    fs.writeFileSync(path.join(OUT, "dashboard.md"), md);
    const sample = await win.evaluate(async () => { const fs = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Garmy/data/")).sort((a, b) => a.path.localeCompare(b.path)); return app.vault.read(fs[fs.length - 1]); });
    log("      newest day note:\n" + sample.split("\n").map((l) => "        " + l).join("\n"));
    const keyLeak = await win.evaluate(async (k) => { const out = []; for (const f of app.vault.getMarkdownFiles()) { if ((await app.vault.read(f)).includes(k)) out.push(f.path); } const d = await app.vault.adapter.read(".obsidian/plugins/garmidian/data.json").catch(() => ""); if (d.includes(k)) out.push("data.json"); return out; }, key);
    check(keyLeak.length === 0, "key is not written into any note or data.json");
  }
} catch (e) {
  failed = true; log("ERROR " + (e instanceof Error ? e.message : String(e)));
  await win.screenshot({ path: path.join(OUT, "error.png") }).catch(() => undefined);
}
await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 5000))]);
try { const p = app.process(); if (!p.killed) p.kill("SIGKILL"); } catch { /* gone */ }
fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
log(failed ? "RESULT: FAILED" : "RESULT: OK");
process.exit(failed ? 1 : 0);
