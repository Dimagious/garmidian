#!/usr/bin/env node
/**
 * Assembles the deployable `_site/` directory: a copy of `site/` plus the
 * pictures of `docs/screens/` and `docs/listing/` flattened into
 * `_site/img/`, and `media/help-key.png` as `img/help-key.png`. Pictures are
 * not duplicated in the repo; this is the one place that stitches the two
 * together, and it is the same step whether it runs in the Pages workflow
 * or locally before a Playwright screenshot check.
 *
 * Shares `listImageSources` (and with it `IMAGE_DIRS` and `IMAGE_RENAME_MAP`)
 * with `scripts/site-check.cjs`, so what the checker accepts and what this
 * step copies can never drift apart.
 *
 * Then, on every `.html` page under `_site/`, in this order:
 *   1. the shared shell. A page holding `<!--shell:top tab="..."-->` and
 *      `<!--shell:bottom-->` gets `site/_shell.html` around its content: the
 *      part before the shell's `<!--shell:content-->` marker in place of the
 *      first placeholder, the part after it in place of the second, with
 *      `{{root}}`, `{{tab}}`, `{{folder}}` and `{{active:<folder>/}}` filled for that page
 *      (`fillShell` in `site-check.cjs`, which checks pages the same way).
 *      `_shell.html` is a source file and is not copied into `_site/`.
 *   2. `{{version}}` and `{{minAppVersion}}` from `manifest.json`. No page
 *      hand-writes a version: the Pages workflow deploys from a release tag
 *      (see `.github/workflows/pages.yml`), so `manifest.json` at that commit
 *      is already the version that just shipped.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { SHELL_FILE, fillShell, listImageSources } = require("./site-check.cjs");

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(from, to);
        else fs.copyFileSync(from, to);
    }
}

/** Replaces `{{version}}` and `{{minAppVersion}}` with the values from `manifest` (`{version, minAppVersion}`). */
function substitutePlaceholders(html, manifest) {
    return html.replaceAll("{{version}}", manifest.version).replaceAll("{{minAppVersion}}", manifest.minAppVersion);
}

/** One page as it deploys: the shell put around it, then the version placeholders filled. `pagePath` is relative to the site root. */
function assemblePage(html, shell, pagePath, manifest) {
    return substitutePlaceholders(fillShell(html, shell, pagePath), manifest);
}

/** Every `.html` file under `dir`, as forward-slash paths relative to it. */
function listHtml(dir, sub = "") {
    const result = [];
    for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
        const rel = sub ? `${sub}/${entry.name}` : entry.name;
        if (entry.isDirectory()) result.push(...listHtml(dir, rel));
        else if (entry.name.endsWith(".html")) result.push(rel);
    }
    return result;
}

function assemble(root) {
    const siteDir = path.join(root, "site");
    const outDir = path.join(root, "_site");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

    const shellPath = path.join(siteDir, SHELL_FILE);
    const shell = fs.existsSync(shellPath) ? fs.readFileSync(shellPath, "utf8") : null;

    fs.rmSync(outDir, { recursive: true, force: true });
    copyDir(siteDir, outDir);
    fs.rmSync(path.join(outDir, SHELL_FILE), { force: true });

    for (const page of listHtml(outDir)) {
        const pagePath = path.join(outDir, page);
        fs.writeFileSync(pagePath, assemblePage(fs.readFileSync(pagePath, "utf8"), shell, page, manifest));
    }

    const imgDir = path.join(outDir, "img");
    fs.mkdirSync(imgDir, { recursive: true });

    // Every picture under its `img/` name, from the same list the checker uses.
    for (const [name, file] of listImageSources(root)) {
        fs.copyFileSync(file, path.join(imgDir, name));
    }

    return outDir;
}

if (require.main === module) {
    const out = assemble(path.resolve(__dirname, ".."));
    console.log(`[assemble-site] wrote ${out}`);
}

module.exports = { assemble, assemblePage, substitutePlaceholders };
