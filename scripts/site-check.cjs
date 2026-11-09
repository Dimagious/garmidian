#!/usr/bin/env node
/**
 * Checks the GitHub Pages site in `site/` before it deploys. Node, no
 * dependencies: the CI job that runs this has nothing installed yet beyond
 * `npm ci` for the plugin itself, and this script does not need any of that.
 *
 * Checked on every page, `site/**\/*.html` except the shell source
 * `site/_shell.html` (see `fillShell` below), after the shell is filled in so
 * the explorer, tab bar and sprite are checked as the reader gets them.
 * Relative references resolve against the page's own folder, the way a
 * browser does: `../../img/x.png` on a guide is `img/x.png`, and a link
 * ending in `/` means that folder's `index.html`.
 *   - every reference that lands in `img/` (src, srcset, or an absolute
 *     og/twitter image URL) resolves to a file in `docs/screens/`,
 *     `docs/listing/` or the rename map below (`listImageSources`)
 *   - every `#anchor` link targets an `id` that exists on the page
 *   - every other relative link (assets/..., ../, not a full URL) points at
 *     a file that exists under `site/`, and its `#fragment`, if any, at an
 *     `id` on the target page
 *   - no path contains `.claude`
 *   - no em dash or en dash in the page's visible text (tags, scripts and
 *     styles stripped first; a dash inside a `<code>` sample or a CSS
 *     `content:` bullet is out of scope for this check and reviewed by hand)
 *   - the canonical link and the `og:url` meta tag both match the page's
 *     deployed URL: the site URL plus the page's folder
 *   - no request to a third-party origin: a `<link>` that fetches something
 *     (stylesheet, icon, preconnect, ...), a `<script src>`, an `<img src>`/
 *     `srcset`, or a CSS `url(...)` pointing at an absolute `http(s)://` URL
 *     (an `<a href>` is a link, not a request, and stays exempt; fonts are
 *     self-hosted under `site/assets/fonts/` for exactly this reason)
 * On the root page `site/index.html` only:
 *   - `sitemap.xml`, `robots.txt` and `llms.txt` exist next to it
 *   - `{{version}}` and `{{minAppVersion}}` placeholders are present, and no
 *     literal x.y.z version string sits next to the version label instead
 *     (the page never hand-writes a version; `scripts/assemble-site.cjs`
 *     fills the placeholders in from `manifest.json` at deploy time, on
 *     every page, so a guide may carry `{{version}}` too)
 * Across the site:
 *   - every page is listed in `sitemap.xml` and every guide
 *     (`guides/<slug>/index.html`) is linked from `guides/index.html`, so a
 *     new page cannot ship as an orphan
 *   - JSON-LD blocks parse, and the text files (`llms.txt`, `robots.txt`,
 *     `sitemap.xml`) carry no em or en dash either
 *
 * The functions above `main()` take plain strings, sets and maps, not the
 * filesystem, so they run the same way from the CI step and from
 * `src/test/site-check.test.ts`, on fixtures without a repo on disk.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SITE_URL = "https://dimagious.github.io/garmidian/";

// Pages refer to `img/<name>`; the deploy step fills that folder from these
// repo folders, flat and under their own names (a name that exists in two of
// them is an error). `docs/screens` holds the README pictures, `docs/listing`
// the community directory pictures.
const IMAGE_DIRS = ["docs/screens", "docs/listing"];

// Names that come from somewhere else: `img/<name>` -> path relative to the
// repo root. Kept in one place so this check and `assemble-site.cjs` agree.
const IMAGE_RENAME_MAP = {
    "help-key.png": "media/help-key.png",
};

// Nothing under `.claude` is ever published: it is this repository's private
// working notes.
const ALLOWED_CLAUDE_MENTIONS = new Set();

// The explorer, ribbon, tab bar, command palette and icon sprite every guide
// shares. A page that wants it holds two placeholders, `<!--shell:top
// tab="..."-->` and `<!--shell:bottom-->`; the shell file holds one
// `<!--shell:content-->` marker, and `fillShell` puts the part before it in
// place of the first placeholder and the part after it in place of the
// second. A source file, never published: `assemble-site.cjs` drops it.
const SHELL_FILE = "_shell.html";
const SHELL_TOP_RE = /<!--shell:top tab="([^"]*)"-->/g;
const SHELL_BOTTOM = "<!--shell:bottom-->";
const SHELL_CONTENT = "<!--shell:content-->";
// The view header's folder name (`{{folder}}` in the shell), by the page's
// first path segment: "Garmy vault / Guides / ...". The root page is "Home".
const SHELL_FOLDERS = { guides: "Guides" };

/** Strips `<script>...</script>` bodies, so a JS string literal like `"#" + id` is never read as an HTML attribute. */
function stripScripts(html) {
    return html.replace(/<script[\s\S]*?<\/script>/gi, " ");
}

/** The folder of a page path relative to `site/`, with a trailing slash: `"guides/x/"` for `"guides/x/index.html"`, `""` for the root page. */
function pageDirOf(pagePath) {
    return pagePath.slice(0, pagePath.lastIndexOf("/") + 1);
}

/** The deployed URL of a page: the site URL plus the page's folder (`index.html` is what a folder URL serves). */
function expectedUrlFor(pagePath) {
    return SITE_URL + pageDirOf(pagePath);
}

/** A full URL, a mail/tel link or a data URI: nothing on disk to resolve. */
function isNonRelative(ref) {
    return /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(ref);
}

/**
 * Resolves a relative reference from the page at `pagePath` the way a
 * browser does, returning `{ path, fragment }` with `path` relative to
 * `site/`. A reference ending in `/` (or `.`/`..`) is that folder's
 * `index.html`; an empty path (`#x`, `?q`) is the page itself. Returns null
 * for a reference that climbs above the site root or starts with `/`: the
 * site is served under `/garmidian/`, so a root-absolute path breaks there.
 */
function resolveRef(pagePath, ref) {
    const hashAt = ref.indexOf("#");
    const fragment = hashAt < 0 ? "" : ref.slice(hashAt + 1);
    const target = (hashAt < 0 ? ref : ref.slice(0, hashAt)).split("?")[0];
    if (target === "") return { path: pagePath, fragment };
    if (target.startsWith("/")) return null;
    const out = [];
    for (const seg of (pageDirOf(pagePath) + target).split("/")) {
        if (seg === "..") {
            if (out.length === 0) return null;
            out.pop();
        } else if (seg !== "." && seg !== "") {
            out.push(seg);
        }
    }
    const isDir = /(?:^|\/)\.{0,2}$/.test(target);
    const joined = out.join("/");
    return { path: isDir ? `${joined ? `${joined}/` : ""}index.html` : joined, fragment };
}

/**
 * Puts the shared shell around a page that asks for it (see `SHELL_FILE`),
 * filling the shell's own placeholders for this page: `{{root}}` is the way
 * back to the site root (`../../` from `guides/x/index.html`), `{{tab}}` the
 * page's `tab` attribute, `{{folder}}` the view header's folder name from
 * `SHELL_FOLDERS` ("Home" for the root page, empty for a folder it does not name), and
 * `{{active:<folder>/}}` becomes `active` on the page whose folder that is
 * and nothing elsewhere. A page with no shell
 * placeholder comes back unchanged. Throws, with the page named, on a
 * placeholder that is malformed, repeated or out of order, or on a shell
 * without exactly one content marker: a half-filled page must not deploy.
 */
function fillShell(html, shell, pagePath) {
    if (!html.includes("<!--shell:")) return html;
    const tops = Array.from(html.matchAll(SHELL_TOP_RE));
    const bottoms = html.split(SHELL_BOTTOM).length - 1;
    const markers = html.split("<!--shell:").length - 1;
    if (tops.length !== 1 || bottoms !== 1 || markers !== 2) {
        throw new Error(
            `${pagePath}: expected one <!--shell:top tab="..."--> and one ${SHELL_BOTTOM}, found ${tops.length} and ${bottoms} (${markers} shell placeholders in all)`
        );
    }
    const top = tops[0];
    if (html.indexOf(SHELL_BOTTOM) < top.index) {
        throw new Error(`${pagePath}: ${SHELL_BOTTOM} comes before <!--shell:top-->`);
    }
    if (shell === null) {
        throw new Error(`${pagePath}: uses the shell, but site/${SHELL_FILE} does not exist`);
    }
    const parts = shell.split(SHELL_CONTENT);
    if (parts.length !== 2) {
        throw new Error(`site/${SHELL_FILE}: expected one ${SHELL_CONTENT} marker, found ${parts.length - 1}`);
    }
    const dir = pageDirOf(pagePath);
    const depth = dir.split("/").length - 1;
    const root = depth === 0 ? "./" : "../".repeat(depth);
    const tab = top[1];
    const first = dir.split("/")[0];
    const folderName = depth === 0 ? "Home" : Object.prototype.hasOwnProperty.call(SHELL_FOLDERS, first) ? SHELL_FOLDERS[first] : "";
    const fill = (part) =>
        part
            .replaceAll("{{root}}", root)
            .replaceAll("{{tab}}", tab)
            .replaceAll("{{folder}}", folderName)
            .replace(/\{\{active:([^}]*)\}\}/g, (_, folder) => (folder === dir ? "active" : ""));
    // Function replacers: a `$&` or `$1` in the shell is text, not a pattern.
    return html.replace(top[0], () => fill(parts[0])).replace(SHELL_BOTTOM, () => fill(parts[1]));
}

/**
 * Every image the site can use, as `img/` name -> absolute file path: the
 * top-level files of each `IMAGE_DIRS` folder, then the rename map. Throws on
 * a name two sources share and on a rename target that does not exist, so
 * `assemble-site.cjs` and this check can never disagree about what ends up in
 * `_site/img/`.
 */
function listImageSources(root) {
    const sources = new Map();
    const add = (name, file, from) => {
        if (sources.has(name)) throw new Error(`image name "${name}" comes from two sources: ${from} and ${sources.get(name)}`);
        sources.set(name, file);
    };
    for (const dir of IMAGE_DIRS) {
        const abs = path.join(root, dir);
        if (!fs.existsSync(abs)) continue;
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            if (entry.isFile()) add(entry.name, path.join(abs, entry.name), `${dir}/${entry.name}`);
        }
    }
    for (const [name, rel] of Object.entries(IMAGE_RENAME_MAP)) {
        const file = path.join(root, rel);
        if (!fs.existsSync(file)) throw new Error(`IMAGE_RENAME_MAP: "${name}" points at ${rel}, which does not exist`);
        add(name, file, rel);
    }
    return sources;
}

/**
 * Every `img/...` path the page references, relative to `site/`: from
 * `src`/`srcset`/`poster` attributes resolved against the page's folder (so
 * `../../img/x.png` on `guides/x/index.html` is `img/x.png`), and from
 * absolute og/twitter image URLs.
 */
function extractImageRefs(html, pagePath = "index.html") {
    const noScripts = stripScripts(html);
    const refs = new Set();
    for (const m of noScripts.matchAll(/\b(?:src|srcset|poster)="([^"]+)"/g)) {
        if (isNonRelative(m[1])) continue;
        const resolved = resolveRef(pagePath, m[1]);
        if (resolved && resolved.path.startsWith("img/")) refs.add(resolved.path);
    }
    const prefix = `${SITE_URL}img/`;
    for (const m of noScripts.matchAll(/content="([^"]+)"/g)) {
        if (m[1].startsWith(prefix)) {
            refs.add(`img/${m[1].slice(prefix.length)}`);
        }
    }
    return Array.from(refs).sort();
}

/** Image references whose name is not in `availableImages` (the keys of `listImageSources`). */
function findMissingImages(html, availableImages, pagePath = "index.html") {
    return extractImageRefs(html, pagePath).filter((ref) => !availableImages.has(ref.slice("img/".length)));
}

/** Every `id="..."` on the page. */
function extractIds(html) {
    const ids = new Set();
    for (const m of stripScripts(html).matchAll(/\bid="([^"]+)"/g)) {
        ids.add(m[1]);
    }
    return ids;
}

/** Every `href="#..."` target, non-empty. */
function extractAnchorTargets(html) {
    const targets = [];
    for (const m of stripScripts(html).matchAll(/href="#([^"]+)"/g)) {
        targets.push(m[1]);
    }
    return targets;
}

/** Anchor targets with no matching `id` on the page. */
function findDeadAnchors(html) {
    const ids = extractIds(html);
    return extractAnchorTargets(html).filter((t) => !ids.has(t));
}

/** Every relative link or asset reference as written: not a same-page `#anchor` (checked separately), not a full URL, a data URI or a mail/tel link. */
function extractRelativeRefs(html) {
    const refs = new Set();
    const add = (v) => {
        if (v === "" || v.startsWith("#") || isNonRelative(v)) return;
        refs.add(v);
    };
    for (const m of stripScripts(html).matchAll(/\b(?:href|src)="([^"]+)"/g)) add(m[1]);
    // stripScripts drops the whole element, `src` included: an external
    // script would otherwise be the one reference a rename never breaks.
    for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) add(m[1]);
    return Array.from(refs).sort();
}

/**
 * Relative refs that do not resolve to a file: `fileExists` takes a path
 * relative to `site/`, after the ref is resolved from `pagePath` and its
 * `#fragment` dropped. A ref that lands in `img/` is left to
 * `findMissingImages`, and one that climbs above the site root is broken.
 */
function findBrokenRelativeRefs(html, fileExists, pagePath = "index.html") {
    return extractRelativeRefs(html).filter((ref) => {
        const resolved = resolveRef(pagePath, ref);
        if (!resolved) return true;
        if (resolved.path.startsWith("img/")) return false;
        return !fileExists(resolved.path);
    });
}

/**
 * Relative links into another page (`../../#install`, `../guides/#x`) whose
 * `#fragment` names no `id` on that page. `idsOf(path)` returns the ids of
 * the page at a `site/`-relative path, or null when it is not a page this
 * run knows; a missing file is `findBrokenRelativeRefs`'s to report.
 */
function findDeadCrossPageAnchors(html, pagePath, idsOf) {
    const dead = [];
    for (const ref of extractRelativeRefs(html)) {
        const resolved = resolveRef(pagePath, ref);
        if (!resolved || resolved.fragment === "") continue;
        const ids = idsOf(resolved.path);
        if (ids && !ids.has(resolved.fragment)) dead.push(ref);
    }
    return dead;
}

/**
 * Any occurrence of `.claude` anywhere in the page source other than the one
 * allowed mention: every other `.claude` path in this repository is local,
 * private working state and must never leak into a published file.
 */
function findClaudePathMentions(html) {
    const matches = [];
    const re = /\.claude[^\s"'<>]*/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (!ALLOWED_CLAUDE_MENTIONS.has(m[0])) {
            matches.push(m[0]);
        }
    }
    return matches;
}

const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
};

function decodeEntities(text) {
    return text
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&([a-zA-Z]+);/g, (whole, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : whole));
}

/** The text a reader actually sees: comments, `<script>` and `<style>` bodies and every tag stripped, entities decoded. */
function stripToVisibleText(html) {
    const withoutHidden = html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
    return decodeEntities(withoutHidden);
}

/** Em dashes and en dashes in visible text, each with a short surrounding snippet for the error list. */
function findTypographicDashes(html) {
    const text = stripToVisibleText(html);
    const found = [];
    const re = /[–—]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const start = Math.max(0, m.index - 24);
        const end = Math.min(text.length, m.index + 25);
        found.push(text.slice(start, end).replace(/\s+/g, " ").trim());
    }
    return found;
}

/** Missing entries from `["sitemap.xml", "robots.txt", "llms.txt"]`, given the set of file names present next to `index.html`. */
function findMissingSiteFiles(siteFiles) {
    return ["sitemap.xml", "robots.txt", "llms.txt"].filter((f) => !siteFiles.has(f));
}

/** The canonical link and the `og:url` meta both present and equal to `expectedUrl`; returns a list of problems, empty if fine. */
function checkCanonicalUrl(html, expectedUrl) {
    const problems = [];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/);
    const ogUrl = html.match(/<meta property="og:url" content="([^"]+)">/);
    if (!canonical) problems.push("no <link rel=\"canonical\"> tag");
    else if (canonical[1] !== expectedUrl) problems.push(`canonical is "${canonical[1]}", expected "${expectedUrl}"`);
    if (!ogUrl) problems.push('no <meta property="og:url"> tag');
    else if (ogUrl[1] !== expectedUrl) problems.push(`og:url is "${ogUrl[1]}", expected "${expectedUrl}"`);
    return problems;
}

const REQUIRED_VERSION_PLACEHOLDERS = ["{{version}}", "{{minAppVersion}}"];

/** Which of `{{version}}`/`{{minAppVersion}}` are missing from the page. Both must be present; `assemble-site.cjs` fills them in from `manifest.json` at deploy time. */
function findMissingVersionPlaceholders(html) {
    return REQUIRED_VERSION_PLACEHOLDERS.filter((placeholder) => !html.includes(placeholder));
}

/** A literal x.y.z version string sitting next to the "version" property label instead of the `{{version}}`/`{{minAppVersion}}` placeholders. */
function findHardcodedVersionStrings(html) {
    const row = html.match(/>version<\/div>\s*<div class="v">([\s\S]{0,200}?)<\/div>\s*<\/div>/);
    if (!row) return [];
    const semver = row[1].match(/\b\d+\.\d+\.\d+\b/);
    return semver ? [semver[0]] : [];
}

// A `<link>` with one of these `rel` values makes the browser fetch its
// `href`; `canonical`, `alternate` and the like just point at a URL and are
// not requests, so they are not in this set.
const FETCHING_LINK_RELS = new Set([
    "stylesheet",
    "icon",
    "shortcut icon",
    "preload",
    "prefetch",
    "preconnect",
    "dns-prefetch",
    "apple-touch-icon",
    "manifest",
]);

/** Every absolute `http(s)://` URL the page would actually make a request to: a fetching `<link>`, a `<script src>`, an `<img>`/`<source>` `src`/`srcset`, or a CSS `url(...)` inside a `<style>` block. An `<a href>` is not a request and is not included. */
function findThirdPartyRequestUrls(html) {
    const urls = [];

    for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
        const tag = m[1];
        const rel = tag.match(/\brel="([^"]+)"/i);
        const href = tag.match(/\bhref="(https?:\/\/[^"]+)"/i);
        if (href && rel && FETCHING_LINK_RELS.has(rel[1].toLowerCase())) {
            urls.push(href[1]);
        }
    }
    for (const m of html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"/gi)) {
        urls.push(m[1]);
    }
    for (const m of html.matchAll(/<(?:img|source|video)\b[^>]*\b(?:src|srcset|poster)="(https?:\/\/[^"]+)"/gi)) {
        urls.push(m[1]);
    }
    for (const block of html.match(/<style[\s\S]*?<\/style>/gi) || []) {
        for (const m of block.matchAll(/url\(\s*['"]?(https?:\/\/[^'")]+)['"]?\s*\)/gi)) {
            urls.push(m[1]);
        }
    }
    return urls;
}

const GUIDE_PAGE_RE = /^guides\/[^/]+\/index\.html$/;

/** JSON-LD blocks that do not parse, with the parser's message. */
function findBadJsonLd(html) {
    const bad = [];
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try {
            JSON.parse(m[1]);
        } catch (err) {
            bad.push(err.message);
        }
    }
    return bad;
}

/** Em or en dashes in a plain text file (`llms.txt`, `robots.txt`, `sitemap.xml`). */
function findDashesInText(text) {
    return Array.from(text.matchAll(/[–—]/g), (m) => text.slice(Math.max(0, m.index - 24), m.index + 25).replace(/\s+/g, " ").trim());
}

/** The `site/`-relative paths of every page an index page at `indexPath` links to. */
function linkedPages(indexPath, indexHtml) {
    const linked = new Set();
    for (const ref of extractRelativeRefs(indexHtml || "")) {
        const resolved = resolveRef(indexPath, ref);
        if (resolved) linked.add(resolved.path);
    }
    return linked;
}

/**
 * Pages a search engine or a reader could not reach: a page missing from
 * `sitemap.xml` (null when the file itself is missing, which the root page's
 * check already reports), and a guide, `guides/<slug>/index.html`, that
 * `guides/index.html` (null when absent) does not link to. `pagePaths` are
 * relative to `site/`.
 */
function findOrphanPages(pagePaths, sitemapXml, guidesIndexHtml) {
    const issues = [];
    const listed = new Set(Array.from((sitemapXml || "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g), (m) => m[1]));
    const guides = linkedPages("guides/index.html", guidesIndexHtml);
    for (const page of pagePaths) {
        const url = expectedUrlFor(page);
        if (sitemapXml !== null && !listed.has(url)) {
            issues.push(`${page} is not in sitemap.xml: add <loc>${url}</loc>`);
        }
        if (GUIDE_PAGE_RE.test(page) && !guides.has(page)) {
            issues.push(`${page} is not linked from guides/index.html`);
        }
    }
    return issues;
}

/**
 * Runs every check against one page (`pagePath` relative to `site/`, the
 * root page by default) and returns a list of human-readable issue strings,
 * empty when the page is clean. `idsOf` feeds the cross-page anchor check;
 * without it that check is skipped.
 */
function runChecks(html, { availableImages, siteFileExists, siteFiles, pagePath = "index.html", idsOf = () => null }) {
    const issues = [];
    const isRoot = pagePath === "index.html";

    for (const ref of findMissingImages(html, availableImages, pagePath)) {
        issues.push(`missing image: "${ref}" has no matching file in ${IMAGE_DIRS.join(", ")} or IMAGE_RENAME_MAP`);
    }
    for (const target of findDeadAnchors(html)) {
        issues.push(`dead anchor: href="#${target}" has no id="${target}" on the page`);
    }
    for (const ref of findBrokenRelativeRefs(html, siteFileExists, pagePath)) {
        issues.push(`broken relative link: "${ref}" does not exist under site/`);
    }
    for (const ref of findDeadCrossPageAnchors(html, pagePath, idsOf)) {
        issues.push(`dead anchor: href="${ref}" has no matching id on the page it points to`);
    }
    for (const mention of findClaudePathMentions(html)) {
        issues.push(`.claude path leaked into the page: "${mention}"`);
    }
    for (const snippet of findTypographicDashes(html)) {
        issues.push(`typographic dash in visible text: "...${snippet}..."`);
    }
    if (isRoot) {
        for (const missing of findMissingSiteFiles(siteFiles)) {
            issues.push(`missing site file: "${missing}"`);
        }
    }
    for (const problem of checkCanonicalUrl(html, expectedUrlFor(pagePath))) {
        issues.push(`canonical URL: ${problem}`);
    }
    if (isRoot) {
        for (const placeholder of findMissingVersionPlaceholders(html)) {
            issues.push(`missing version placeholder: "${placeholder}"`);
        }
        for (const version of findHardcodedVersionStrings(html)) {
            issues.push(`hardcoded version "${version}" next to the version label; use {{version}}/{{minAppVersion}} instead`);
        }
    }
    for (const url of findThirdPartyRequestUrls(html)) {
        issues.push(`third-party request: "${url}"`);
    }
    for (const message of findBadJsonLd(html)) {
        issues.push(`JSON-LD does not parse: ${message}`);
    }

    return issues;
}

/** Every file under `dir`, as forward-slash paths relative to it. */
function listFiles(dir) {
    const result = new Set();
    function walk(sub) {
        for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
            const rel = sub ? `${sub}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(rel);
            else result.add(rel);
        }
    }
    walk("");
    return result;
}

function main() {
    const root = path.resolve(__dirname, "..");
    const siteDir = path.join(root, "site");
    const read = (rel) => (fs.existsSync(path.join(siteDir, rel)) ? fs.readFileSync(path.join(siteDir, rel), "utf8") : null);

    const availableImages = new Set(listImageSources(root).keys());
    const allSiteFiles = listFiles(siteDir);
    const siteFiles = new Set(fs.readdirSync(siteDir));
    // The shell source exists on disk but is never deployed, so nothing may link to it.
    const siteFileExists = (rel) => rel !== SHELL_FILE && allSiteFiles.has(rel);
    const pagePaths = Array.from(allSiteFiles)
        .filter((rel) => rel.endsWith(".html") && rel !== SHELL_FILE)
        .sort();
    const shell = read(SHELL_FILE);

    const issues = [];
    const pages = new Map();
    for (const page of pagePaths) {
        try {
            pages.set(page, fillShell(read(page), shell, page));
        } catch (err) {
            issues.push(`site/${page}: ${err.message}`);
        }
    }
    const ids = new Map(Array.from(pages, ([page, html]) => [page, extractIds(html)]));
    const idsOf = (rel) => ids.get(rel) || null;
    for (const [page, html] of pages) {
        for (const issue of runChecks(html, { availableImages, siteFileExists, siteFiles, pagePath: page, idsOf })) {
            issues.push(`site/${page}: ${issue}`);
        }
    }
    for (const issue of findOrphanPages(pagePaths, read("sitemap.xml"), read("guides/index.html"))) {
        issues.push(`site/${issue}`);
    }
    for (const file of ["llms.txt", "robots.txt", "sitemap.xml"]) {
        for (const snippet of findDashesInText(read(file) || "")) {
            issues.push(`site/${file}: typographic dash: "...${snippet}..."`);
        }
    }

    if (issues.length > 0) {
        console.error(`[site-check] ${issues.length} issue(s) found in site/:\n`);
        for (const issue of issues) {
            console.error(`  - ${issue}`);
        }
        process.exit(1);
    }

    console.log(`[site-check] site/ is clean (${pagePaths.length} pages).`);
}

module.exports = {
    SITE_URL,
    IMAGE_DIRS,
    IMAGE_RENAME_MAP,
    SHELL_FILE,
    SHELL_FOLDERS,
    pageDirOf,
    expectedUrlFor,
    resolveRef,
    fillShell,
    listImageSources,
    extractImageRefs,
    findMissingImages,
    extractIds,
    extractAnchorTargets,
    findDeadAnchors,
    extractRelativeRefs,
    findBrokenRelativeRefs,
    findDeadCrossPageAnchors,
    findClaudePathMentions,
    stripToVisibleText,
    findTypographicDashes,
    findMissingSiteFiles,
    checkCanonicalUrl,
    findMissingVersionPlaceholders,
    findHardcodedVersionStrings,
    findThirdPartyRequestUrls,
    findBadJsonLd,
    findDashesInText,
    findOrphanPages,
    runChecks,
};

if (require.main === module) {
    main();
}
