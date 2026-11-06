#!/usr/bin/env node
/**
 * Local mirror of the Obsidian community-plugins scorecard scanner.
 *
 * Goal: catch the exact warning patterns that drop the public score on
 * community.obsidian.md/plugins/<plugin-id> BEFORE we tag a release.
 *
 * Background: between 1.1.5 and 1.1.6 the public scorecard dropped
 * from 94% to 91%. Root cause was a `["forum","obsidian","md"]
 * .join(".")` workaround that the scanner flagged as
 * "Plugin assembles domain names at runtime from split/joined parts".
 * With this gate the next regression of that kind fails the release
 * audit locally — before the world sees the score drop.
 *
 * Scope: only checks our own source under `src/`. Third-party `atob`
 * / `btoa` from `yaml` ride along in the bundle and the scanner picks
 * them up as informational Disclosures (not Warnings) — we accept
 * those as the cost of YAML support.
 *
 * 2026-08-05 (eslint-plugin-obsidianmd 0.1.7 → 0.4.1 parity pass):
 * `obsidianmd/prefer-window-timers` FLIPPED direction — timers must
 * now use `window.setTimeout`/`window.clearTimeout`/etc., and
 * `activeWindow.<timer fn>()` is what gets flagged (popout windows
 * never needed `activeWindow` for timers specifically, only for
 * DOM/document access). `checkActiveDomBindings` below was updated to
 * match; `window.*` for non-timer members is still flagged as before.
 * Also added `checkSettingsTabHasGetSettingDefinitions` for the new
 * `obsidianmd/settings-tab/prefer-setting-definitions` rule.
 *
 * Run via `npm run scorecard:check`. Hooked into `release:check`.
 *
 * Exit code: 0 if clean, 1 if any FAIL pattern matched.
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src");

/**
 * Walk a directory, yield every file path matching one of `extensions`.
 * Skips anything that never reaches the bundle: tests, mocks, and the
 * browser preview stand. Nothing they do with bare `document` / `window`
 * can affect a popout window, because none of it is shipped — the stand
 * is a standalone page and esbuild only bundles what `src/main.ts` pulls in.
 */
const UNSHIPPED_PATH_SEGMENTS = ["/test/", "/__mocks__/", "/node_modules/", "/preview/"];
function isTestPath(p) {
    const norm = p.replace(/\\/g, "/");
    return UNSHIPPED_PATH_SEGMENTS.some((seg) => norm.includes(seg))
        || /\.test\.ts$/.test(norm)
        || /\.spec\.ts$/.test(norm);
}

function* walk(dir, extensions) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", "__mocks__", "test", "preview"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full, extensions);
            continue;
        }
        if (isTestPath(full)) continue;
        if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
        yield full;
    }
}

/** Hit found by a check. `severity` keys the report layout. */
function hit({ severity, rule, message, file, line, snippet }) {
    return { severity, rule, message, file, line, snippet };
}

/* ------------------------------------------------------------------ *
 *  Checks                                                            *
 * ------------------------------------------------------------------ */

/**
 * Scorecard Warning: "Plugin assembles domain names at runtime from
 * split/joined parts."
 *
 * Triggered by patterns like `["forum", "obsidian", "md"].join(".")`
 * or `"forum" + "." + "obsidian"` — anything that reconstructs a URL
 * host from string fragments. We disallow both `.join(".")` /
 * `.join("/")` on inline array literals AND chained string concats
 * with dot-literals between segments.
 *
 * False-positive risk: someone could use `.join(".")` on a legitimate
 * non-URL list. The fix in that case is to either use a different
 * separator or rename to make the non-URL intent obvious. The 0
 * matches we currently have means the rule is cheap to keep strict.
 */
function checkDomainAssembly() {
    const hits = [];
    const joinDotRe = /\[\s*"[^"]+"[\s\S]*?\]\s*\.\s*join\s*\(\s*["']\.["']\s*\)/;
    const joinSlashRe = /\[\s*"[^"]+"[\s\S]*?\]\s*\.\s*join\s*\(\s*["']\/["']\s*\)/;

    for (const file of walk(srcRoot, [".ts"])) {
        const text = fs.readFileSync(file, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (joinDotRe.test(line) || joinSlashRe.test(line)) {
                hits.push(hit({
                    severity: "FAIL",
                    rule: "no-domain-assembly",
                    message:
                        "Domain/URL assembled from array.join() — scorecard flags as evasion. " +
                        "Use a string literal.",
                    file: path.relative(repoRoot, file),
                    line: i + 1,
                    snippet: line.trim(),
                }));
            }
        }
    }
    return hits;
}

/**
 * Timer functions covered by the scanner's `obsidianmd/prefer-window-
 * timers` rule (0.4.x). Mirrors the rule's own `TIMER_FUNCTIONS` set
 * in `eslint-plugin-obsidianmd/dist/lib/rules/preferWindowTimers.js`.
 */
const TIMER_FUNCTIONS = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame"];
const timerFnAlternation = TIMER_FUNCTIONS.join("|");

/**
 * Scorecard Hygiene: `document.*` / `window.*` without the
 * `activeDocument` / `activeWindow` prefix break Obsidian popout
 * windows. CLAUDE.md notes this was the 1.0.6 scorecard cleanup
 * theme; regression here is invisible until popout users hit it.
 *
 * Timer functions are the one deliberate exception, and the scanner's
 * rule direction on them FLIPPED in eslint-plugin-obsidianmd 0.4.x
 * (2026-08-05 scorecard-parity pass): `window.setTimeout`/
 * `window.clearTimeout`/etc. are now required, and `activeWindow.*`
 * timers are flagged instead — see `obsidianmd/prefer-window-timers`.
 * Popout windows don't need `activeWindow` for timers specifically
 * (only for DOM/document access), so this brought the rule in line
 * with how the rest of the ecosystem already used timers.
 *
 * We allow `activeDocument.` / `activeWindow.` (for non-timer members)
 * / `window.open(` (which the scorecard permits for genuine
 * browser-tab opens) / `window.<timerFn>(` for the TIMER_FUNCTIONS set.
 */
/**
 * Blanks out comments so prose cannot trip a rule, keeping every newline so the
 * line numbers still point at the right place.
 *
 * Per-line stripping was the previous approach and it could not see a JSDoc
 * block: the inner lines carry neither `//` nor a complete `/* … *\/` pair, so
 * a sentence ending in "leaves the document." counted as a violation.
 */
function stripComments(text) {
    const blank = (m) => m.replace(/[^\n]/g, " ");
    return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

function checkActiveDomBindings() {
    const hits = [];

    // Allow comments to mention these symbols freely.
    const isBareDocument = (s) => /(?<![A-Za-z0-9_.])document\./.test(s);
    const isBareWindow = (s) => /(?<![A-Za-z0-9_.])window\./.test(s);
    const isBareTimerFn = new RegExp(`(?<![A-Za-z0-9_.])(?:${timerFnAlternation})\\s*\\(`);
    const isActiveWindowTimer = new RegExp(`activeWindow\\s*\\.\\s*(?:${timerFnAlternation})\\s*\\(`);

    for (const file of walk(srcRoot, [".ts"])) {
        const text = fs.readFileSync(file, "utf8");
        const lines = text.split("\n");
        const code = stripComments(text).split("\n");
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];

            // `window.open(` is a legitimate browser-tab open call;
            // the popup-blocked fallback in PackageSubmissionSection
            // relies on it. The scorecard treats it as expected.
            // `window.<timerFn>(` is the required form post-0.4.x.
            const codeNoWindowOpen = (code[i] ?? "")
                .replace(/window\.open\s*\(/g, "")
                .replace(new RegExp(`window\\s*\\.\\s*(?:${timerFnAlternation})\\s*\\(`, "g"), "");

            if (isBareDocument(codeNoWindowOpen)) {
                hits.push(hit({
                    severity: "FAIL",
                    rule: "no-bare-document",
                    message:
                        "`document.*` breaks Obsidian popout windows. " +
                        "Use `activeDocument.*` instead.",
                    file: path.relative(repoRoot, file),
                    line: i + 1,
                    snippet: raw.trim(),
                }));
            }
            if (isBareWindow(codeNoWindowOpen)) {
                hits.push(hit({
                    severity: "FAIL",
                    rule: "no-bare-window",
                    message:
                        "`window.*` (other than `window.open` / timer functions) breaks popouts. " +
                        "Use `activeWindow.*` instead.",
                    file: path.relative(repoRoot, file),
                    line: i + 1,
                    snippet: raw.trim(),
                }));
            }
            if (isActiveWindowTimer.test(code)) {
                hits.push(hit({
                    severity: "FAIL",
                    rule: "no-active-window-timer",
                    message:
                        "`activeWindow.<timer fn>()` is flagged by obsidianmd/prefer-window-timers (0.4.x). " +
                        "Use `window.setTimeout`/`window.clearTimeout`/etc. instead.",
                    file: path.relative(repoRoot, file),
                    line: i + 1,
                    snippet: raw.trim(),
                }));
            }
            if (isBareTimerFn.test(code)) {
                hits.push(hit({
                    severity: "FAIL",
                    rule: "no-bare-timers",
                    message:
                        "Bare timer calls break popouts. " +
                        "Use `window.setTimeout`/`window.clearTimeout`/etc.",
                    file: path.relative(repoRoot, file),
                    line: i + 1,
                    snippet: raw.trim(),
                }));
            }
        }
    }
    return hits;
}

/**
 * Scorecard Style: `el.createEl("div"|"span", {...})` with an options
 * object should use `createDiv`/`createSpan` instead. The scanner
 * flags this as `obsidianmd/no-forbidden-elements`. Local ESLint
 * catches it but we mirror here so the release gate sees one report.
 */
function checkCreateElDivSpan() {
    const hits = [];
    const re = /\.createEl\s*\(\s*["'](div|span)["']\s*,/;
    for (const file of walk(srcRoot, [".ts"])) {
        const text = fs.readFileSync(file, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
                hits.push(hit({
                    severity: "FAIL",
                    rule: "no-create-el-div-span",
                    message:
                        "`el.createEl(\"div\"|\"span\", {...})` should be `el.createDiv(...)` / `el.createSpan(...)`.",
                    file: path.relative(repoRoot, file),
                    line: i + 1,
                    snippet: lines[i].trim(),
                }));
            }
        }
    }
    return hits;
}

/**
 * Scorecard Type Safety: `@ts-expect-error` / `@ts-ignore` against
 * Obsidian's API. We type-augment in `src/types.ts` instead.
 */
function checkTsSuppressions() {
    const hits = [];
    const re = /@ts-(expect-error|ignore|nocheck)/;
    for (const file of walk(srcRoot, [".ts"])) {
        const text = fs.readFileSync(file, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
                hits.push(hit({
                    severity: "WARN",
                    rule: "ts-suppression",
                    message:
                        "TS suppression directive — prefer augmenting `App`/`HTMLElement` in `src/types.ts`.",
                    file: path.relative(repoRoot, file),
                    line: i + 1,
                    snippet: lines[i].trim(),
                }));
            }
        }
    }
    return hits;
}

/**
 * Scorecard CSS: `!important` is flagged as specificity-evasion.
 * We covered the 2 1.0.6 instances; this guard keeps the floor.
 * Source is `src/styles/*.css` (the built `styles.css` is generated).
 */
function checkCssImportant() {
    const hits = [];
    const stylesRoot = path.join(repoRoot, "src", "styles");
    if (!fs.existsSync(stylesRoot)) return hits;
    for (const file of walk(stylesRoot, [".css"])) {
        const text = fs.readFileSync(file, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (/!important/.test(lines[i])) {
                hits.push(hit({
                    severity: "WARN",
                    rule: "no-css-important",
                    message:
                        "`!important` lowers the CSS scorecard tier. Use class-doubled specificity or scoped selectors.",
                    file: path.relative(repoRoot, file),
                    line: i + 1,
                    snippet: lines[i].trim(),
                }));
            }
        }
    }
    return hits;
}

/**
 * Manifest: description must NOT begin with the plugin name (the
 * scorecard considers "<Name> is a …" redundant). Name comes from manifest.
 */
function checkManifestDescription() {
    const manifestPath = path.join(repoRoot, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const desc = String(manifest.description ?? "");
    const nameRe = new RegExp("^\\s*" + manifest.name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "\\b", "i");
    if (nameRe.test(desc)) {
        return [hit({
            severity: "FAIL",
            rule: "manifest-description-no-name-prefix",
            message:
                "manifest.json description must not start with the plugin name. " +
                `Current: ${JSON.stringify(desc.slice(0, 80))}`,
            file: "manifest.json",
            line: 1,
            snippet: desc.slice(0, 120),
        })];
    }
    return [];
}

/**
 * Scorecard (0.4.x): `obsidianmd/settings-tab/prefer-setting-definitions`
 * flags any `PluginSettingTab` subclass missing a `getSettingDefinitions()`
 * method. We only have one settings tab; mirror the rule by requiring the
 * method's presence there. See SettingsTab.ts for why it returns `[]`
 * rather than real per-field definitions.
 */
function checkSettingsTabHasGetSettingDefinitions() {
    // Search by content rather than by file name: the settings class may live
    // anywhere. That way this check moves to the next plugin unchanged.
    // `walk` is a generator: spread it before filtering. Calling `.filter` on it
    // directly only works where iterator helpers exist (Node >= 22), and there it
    // returns a lazy helper without `.length` — which made this check report
    // "no settings tab" and pass without ever reading a file.
    const files = [...walk(srcRoot, [".ts"])];
    if (!files.length) throw new Error(`scorecard-check: no TypeScript sources under ${srcRoot}`);
    const tabs = files.filter((f) => /class\s+\w+\s+extends\s+PluginSettingTab/.test(fs.readFileSync(f, "utf8")));

    if (!tabs.length) return [];   // no settings tab in the plugin — the rule does not apply

    const offenders = tabs.filter((f) => !/getSettingDefinitions\s*\(/.test(fs.readFileSync(f, "utf8")));
    return offenders.map((f) => hit({
        severity: "FAIL",
        rule: "settings-tab-missing-get-setting-definitions",
        message:
            "The PluginSettingTab subclass must implement getSettingDefinitions() " +
            "— flagged by obsidianmd/settings-tab/prefer-setting-definitions (0.4.x).",
        file: path.relative(repoRoot, f),
        line: 1,
        snippet: "",
    }));
}

/* ------------------------------------------------------------------ *
 *  Run                                                               *
 * ------------------------------------------------------------------ */

const allChecks = [
    { name: "domain-assembly", fn: checkDomainAssembly },
    { name: "active-dom-bindings", fn: checkActiveDomBindings },
    { name: "create-el-div-span", fn: checkCreateElDivSpan },
    { name: "ts-suppressions", fn: checkTsSuppressions },
    { name: "css-important", fn: checkCssImportant },
    { name: "manifest-description", fn: checkManifestDescription },
    { name: "settings-tab-get-setting-definitions", fn: checkSettingsTabHasGetSettingDefinitions },
];

const allHits = [];
for (const { name, fn } of allChecks) {
    try {
        const checkHits = fn();
        for (const h of checkHits) allHits.push({ ...h, check: name });
    } catch (err) {
        console.error(`[scorecard-check] ${name} threw:`, err);
        process.exit(2);
    }
}

const fails = allHits.filter((h) => h.severity === "FAIL");
const warns = allHits.filter((h) => h.severity === "WARN");

if (fails.length === 0 && warns.length === 0) {
    console.log("✅ scorecard-check: 0 issues");
    process.exit(0);
}

for (const h of fails) {
    console.error(`❌ [${h.rule}] ${h.file}:${h.line}`);
    console.error(`   ${h.message}`);
    console.error(`   ${h.snippet}`);
    console.error();
}
for (const h of warns) {
    console.warn(`⚠️  [${h.rule}] ${h.file}:${h.line}`);
    console.warn(`   ${h.message}`);
    console.warn(`   ${h.snippet}`);
    console.warn();
}

console.log(`Summary: ${fails.length} fail · ${warns.length} warn`);
process.exit(fails.length > 0 ? 1 : 0);
