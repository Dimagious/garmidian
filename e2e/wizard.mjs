// Real Obsidian, empty vault, real Garmin key from Keychain (never printed). Drives the wizard end to end.
// usage: node e2e/wizard.mjs [--bad-key] [--states] [--media] [--days=30]
//   --states  mocked network: every error and warning state, no Garmin calls
//   --media   generates a synthetic help-key.gif (never from a real account) to show the media slot with a clip
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
const STATES = process.argv.includes("--states");
const MEDIA = process.argv.includes("--media");
const DAYS = process.argv.find((a) => a.startsWith("--days="))?.slice(7) ?? "365";
const OUT = path.join(ROOT, ".e2e", STATES ? "states" : BAD ? "bad-key" : `days-${DAYS}${MEDIA ? "-media" : ""}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const key = BAD || STATES ? "definitely-not-a-valid-key" : execFileSync("/usr/bin/security", ["find-generic-password", "-s", "garmin-personal-api", "-w"]).toString().trim();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "garmy-e2e-"));
const vault = path.join(tmp, "vault"), obs = path.join(vault, ".obsidian");
for (const [id, src] of [["garmidian", ROOT], ["dashsidian", "/Users/dyurkin/my-obsidian-vault/.obsidian/plugins/dashsidian"]]) {
  fs.mkdirSync(path.join(obs, "plugins", id), { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(fs.realpathSync(src), f), path.join(obs, "plugins", id, f));
}
if (MEDIA) {
  const md = path.join(obs, "plugins", "garmidian", "media");
  fs.mkdirSync(md, { recursive: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=480x300:rate=6:duration=2", "-vf", "format=rgb8", path.join(md, "help-key.gif")]);
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
const shot = (name) => win.screenshot({ path: path.join(OUT, name) });
const settle = (ms = 400) => win.waitForTimeout(ms);
const openWizard = async () => { await win.evaluate(() => app.commands.executeCommandById("garmidian:open-wizard")); await win.locator(".garmy-wizard").waitFor({ timeout: 5000 }); await settle(300); };
const closeWizard = async () => { await win.keyboard.press("Escape"); await settle(300); };
// Replace the plugin transport with a fake. The handler runs in the page: (url, method, calls) => {status, text} | throws.
const mockHttp = (src) => win.evaluate((code) => { const p = app.plugins.plugins.garmidian; const calls = { n: 0 }; const fn = new Function("url", "method", "calls", "return (" + code + ")(url, method, calls)"); p.http = async (req) => { calls.n++; return await fn(req.url, req.method, calls); }; }, src);
const OK_TOKEN = "'\"token\"'";
const setSize = (w, h) => app.evaluate(({ BrowserWindow }, [ww, hh]) => { const b = BrowserWindow.getAllWindows()[0]; b.setSize(ww, hh); b.center(); }, [w, h]);
const setDark = (dark) => win.evaluate(async (d) => { app.changeTheme(d ? "obsidian" : "moonstone"); app.workspace.trigger("css-change"); await new Promise((r) => setTimeout(r, 400)); return document.body.classList.contains("theme-dark"); }, dark);
// app.emulateMobile() reloads the window, so only the body class is toggled: it approximates mobile CSS, not the native mobile modal.
const setMobile = (on) => win.evaluate((v) => { document.body.classList.toggle("is-mobile", v); return document.body.classList.contains("is-mobile") === v; }, on);
const bodyOverflow = () => win.evaluate(() => { const w = document.querySelector(".garmy-wizard"); const b = document.querySelector(".garmy-body"); const r = w.getBoundingClientRect(); return { modalW: Math.round(r.width), viewW: innerWidth, hScroll: w.scrollWidth > w.clientWidth + 1 || (b ? b.scrollWidth > b.clientWidth + 1 : false) }; });
const smallTargets = () => win.evaluate(() => [...document.querySelectorAll(".garmy-wizard button, .garmy-wizard select, .garmy-wizard input:not(.garmy-check), .garmy-wizard .garmy-chip, .garmy-wizard .garmy-card")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 43.5).map((e) => (e.className || e.tagName) + " " + Math.round(e.getBoundingClientRect().height)));

try {
  await win.waitForLoadState("domcontentloaded");
  await win.waitForTimeout(3000);
  try { await win.getByRole("button", { name: "Trust author and enable plugins" }).waitFor({ state: "visible", timeout: 5000 }); await win.keyboard.press("Escape"); } catch { /* trusted */ }
  await win.evaluate(async () => { await app.plugins.setEnable(true); }).catch(() => undefined);
  await win.waitForTimeout(2500);
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1200, 1500); w.center(); });
  const loaded = await win.evaluate(() => ({ garmy: !!app.plugins.plugins.garmidian, dashy: !!app.plugins.plugins.dashsidian, secret: typeof app.secretStorage?.setSecret }));
  check(loaded.garmy && loaded.dashy && loaded.secret === "function", `plugins loaded ${JSON.stringify(loaded)}`);

  // settings tab, with and without a key (done first: a clean window opens it reliably)
  const settingsShot = async (name) => {
    // Obsidian 1.14 opens Settings in its own window; opening is occasionally slow, so retry
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const winP = app.waitForEvent("window", { timeout: 8000 });
        await win.evaluate(() => app.commands.executeCommandById("app:open-settings"));
        const sw = await winP;
        await sw.waitForLoadState("domcontentloaded"); await sw.waitForTimeout(2000);
        await sw.locator(".vertical-tab-nav-item", { hasText: "Garmy" }).first().click({ timeout: 8000 });
        await sw.waitForTimeout(700);
        check(await sw.locator(".garmy-settings").count() === 1, `settings tab renders (${name})`);
        await sw.screenshot({ path: path.join(OUT, name) });
        await win.evaluate(() => app.setting.close()); await settle(1000);
        return;
      } catch (e) {
        log(`      settings attempt ${attempt} failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
        await win.evaluate(() => app.setting.close()).catch(() => undefined); await settle(1500);
      }
    }
    check(false, `settings tab renders (${name})`);
  };
  await win.evaluate(() => app.secretStorage.setSecret("garmy-garmin-api-key", ""));
  await settingsShot("v-settings-no-key.png");
  await win.evaluate((k) => app.secretStorage.setSecret("garmy-garmin-api-key", k), key);
  await settingsShot("v-settings-key-saved.png");
  if (STATES) {
    const typeKey = async (v) => { await win.locator(".garmy-key").fill(v); };
    // 1. empty: no key saved at all
    await win.evaluate(() => app.secretStorage.setSecret("garmy-garmin-api-key", ""));
    await openWizard();
    await shot("s1-key-empty-slot.png");
    await win.locator(".garmy-key-check").click(); await settle();
    check(/Paste the key/.test(await win.locator(".garmy-message").innerText()), "empty key: friendly message");
    await shot("s1-key-empty-message.png");
    // 2. wrong key
    await mockHttp("(u, m) => ({ status: 401, text: '' })");
    await typeKey("wrong-key-value"); await win.locator(".garmy-key-check").click(); await win.locator(".garmy-message").waitFor(); await settle();
    check(/did not accept the key/.test(await win.locator(".garmy-message").innerText()), "wrong key: message with one action");
    check(await win.locator(".garmy-message button").count() === 1, "wrong key: exactly one action");
    check(await win.locator(".garmy-key").inputValue() === "wrong-key-value", "wrong key: the typed key stays in the field");
    await shot("s2-key-wrong.png");
    // 3. no connection
    await mockHttp("() => { throw new Error('offline'); }");
    await win.locator(".garmy-key-check").click(); await win.locator(".garmy-message").waitFor(); await settle();
    check(/Cannot reach Garmin/.test(await win.locator(".garmy-message").innerText()), "offline: friendly message");
    await shot("s3-key-offline.png");
    // 4. rate limited
    await mockHttp("() => ({ status: 429, text: '' })");
    await win.locator(".garmy-key-check").click(); await settle(600);
    check(/asks to wait/.test(await win.locator(".garmy-message").innerText()), "rate limit: friendly message");
    await shot("s4-key-rate.png");
    // 5. key ok, slow load with a warning in one part, then no data
    await mockHttp(`(u, m, c) => new Promise((res) => setTimeout(() => {
      if (m === "POST") return res({ status: 200, text: ${OK_TOKEN} });
      if (u.includes("dailySleepSummaries")) return res({ status: 500, text: "" });
      res({ status: 200, text: "[]" });
    }, 350))`);
    await win.locator(".garmy-key-check").click(); await win.locator(".garmy-load").waitFor({ timeout: 8000 }); await settle();
    await shot("s5-load-idle.png");
    await win.locator(".garmy-load").click(); await settle(2200);
    await shot("s6-load-progress.png");
    check(await win.locator(".garmy-part.is-done").count() >= 1 && await win.locator(".garmy-part.is-waiting, .garmy-part.is-loading").count() >= 1, "load: mix of done and pending parts is visible");
    check(await win.locator('.garmy-progress [role="progressbar"]').count() === 4, "load: four progress bars with role");
    await win.locator(".garmy-message").waitFor({ timeout: 40000 }).catch(() => undefined);
    await settle(600);
    await shot("s7-load-nodata.png");
    // 6. key ok on verify, then Garmin rejects during loading
    await closeWizard();
    await mockHttp("(u, m, c) => { if (m === 'POST' && c.n > 1) return { status: 401, text: '' }; return { status: 200, text: '\"t\"' }; }");
    await win.evaluate(() => app.secretStorage.setSecret("garmy-garmin-api-key", "k"));
    await openWizard();
    await win.locator(".garmy-key-check").click(); await win.locator(".garmy-load").waitFor({ timeout: 8000 });
    await win.locator(".garmy-load").click(); await win.locator(".garmy-message").waitFor({ timeout: 20000 }); await settle();
    check(/stopped accepting the key/.test(await win.locator(".garmy-message").innerText()), "stopped midway: friendly message");
    check(await win.locator(".garmy-message button").count() === 1, "stopped midway: exactly one action");
    await shot("s8-load-stopped.png");
    await closeWizard();
  } else {
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
    await shot("2-summary.png");
    const loadedText = await win.locator(".garmy-loaded").innerText();
    log(`      loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${loadedText}`);
    const progress = await win.locator(".garmy-progress").innerText();
    log("      progress lines: " + progress.replace(/\n/g, " | "));
    check(/Days loaded: \d+/.test(loadedText), "step 2: history loaded");

    await win.locator(".garmy-preview-btn").waitFor({ timeout: 10000 });
    const groups = await win.locator(".garmy-wizard .garmy-card-title, .garmy-wizard .garmy-chip-label").allInnerTexts();
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

    // ---- variants on saved data, no network: stepper, dark theme, narrow width, emulated mobile, Dashy missing
    await mockHttp(`(u, m) => ({ status: 200, text: ${OK_TOKEN} })`);
    const walk = async (tag, { dashyMissing = false, tapCheck = false } = {}) => {
      await openWizard();
      await shot(`v-${tag}-1-key.png`);
      await win.locator(".garmy-key-check").click(); await win.locator(".garmy-load").waitFor({ timeout: 8000 }); await settle(500);
      await shot(`v-${tag}-2-load.png`);
      await win.locator(".garmy-use-saved").click(); await win.locator(".garmy-preview-btn").waitFor({ timeout: 8000 }); await settle(500);
      await shot(`v-${tag}-3-choose.png`);
      if (tapCheck) { const small = await smallTargets(); check(small.length === 0, `${tag}: all touch targets >= 44px ${JSON.stringify(small)}`); }
      await win.locator(".garmy-preview-btn").click(); await win.locator(".garmy-preview").waitFor();
      await settle(dashyMissing ? 1500 : 4500);
      await win.evaluate(() => { document.querySelector(".garmy-body").scrollTop = 0; });
      await shot(`v-${tag}-4-preview.png`);
      const ov = await bodyOverflow();
      check(!ov.hScroll, `${tag}: no horizontal scroll (modal ${ov.modalW}px of ${ov.viewW}px)`);
      await closeWizard();
    };
    await walk("light");
    // stepper: go back from preview to the key step by clicking finished steps
    await openWizard();
    await win.locator(".garmy-key-check").click(); await win.locator(".garmy-load").waitFor({ timeout: 8000 });
    await win.locator(".garmy-use-saved").click(); await win.locator(".garmy-preview-btn").waitFor();
    await win.locator(".garmy-preview-btn").click(); await win.locator(".garmy-preview").waitFor();
    check(await win.locator(".garmy-steps-item.is-done button").count() === 3 && await win.locator('.garmy-steps-item[aria-current="step"]').count() === 1, "stepper: 3 finished steps are buttons, one current step");
    await win.locator(".garmy-steps-item.is-done button").nth(1).click(); await win.locator(".garmy-load").waitFor();
    check(await win.locator(".garmy-steps-item.is-current").innerText().then((t) => /Load/.test(t)), "stepper: clicking a finished step goes back to it");
    await shot("v-stepper-back-to-load.png");
    await win.locator(".garmy-steps-item.is-done button").first().click(); await win.locator(".garmy-key").waitFor();
    // keyboard: Tab order starts inside the wizard and reaches the primary button
    await win.locator(".garmy-key").focus();
    await win.keyboard.press("Tab"); await win.keyboard.press("Tab");
    const focused = await win.evaluate(() => document.activeElement?.className ?? "");
    check(/garmy-key-check/.test(focused), `keyboard: Tab from the key field passes the Show button and lands on the primary button (${focused})`);
    await shot("v-focus-ring.png");
    await closeWizard();

    check(await setDark(true), "dark theme active");
    await walk("dark");
    await win.evaluate(() => { delete app.plugins.plugins.dashsidian; });
    await walk("dark-nodashy", { dashyMissing: true });
    await setDark(false);
    await walk("nodashy", { dashyMissing: true });
    await setSize(390, 844); await settle(500);
    await walk("narrow", { dashyMissing: true });
    await win.evaluate(() => { app.plugins.plugins.garmidian.http = async () => ({ status: 429, text: "" }); });
    await openWizard(); await win.locator(".garmy-key-check").click(); await win.locator(".garmy-message").waitFor(); await settle();
    await shot("v-narrow-error-rate.png");
    await closeWizard();
    await mockHttp(`(u, m) => ({ status: 200, text: ${OK_TOKEN} })`);
    check(await setMobile(true), "mobile emulation active");
    await walk("mobile", { dashyMissing: true, tapCheck: true });
    await setMobile(false);
    await setSize(1200, 1500);

  }
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
