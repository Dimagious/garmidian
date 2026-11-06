#!/usr/bin/env node
/**
 * Checks `README.md` before it ships. Node, no dependencies, same shape as
 * `scripts/site-check.cjs`: every function above `main()` takes plain
 * strings, sets and maps, not the filesystem, so they run the same way from
 * the CI step and from `src/test/readme-check.test.ts`, on fixtures without
 * a repo on disk.
 *
 * Checked, all against `README.md`:
 *   - every relative image or link (Markdown `![]()`/`[]()` and the raw
 *     `<img>`/`<source>`/`<a>` HTML the README also uses for its `<picture>`
 *     blocks) resolves to a file that exists, relative to the repo root. An
 *     absolute URL into this repository (`raw.githubusercontent.com/<owner>/
 *     garmidian/<ref>/<path>` or `github.com/<owner>/garmidian/blob/<ref>/
 *     <path>`) counts as `<path>`: the README is also read by Obsidian's
 *     plugin browser, so it links absolutely, and a renamed screenshot must
 *     still fail here rather than on the listing
 *   - every `[text](#anchor)` link resolves to a heading's GitHub-style slug
 *     or an explicit `id="..."` on the page
 *   - no em dash or en dash in the prose (fenced code blocks, inline code
 *     and raw HTML tags stripped first, so a dash a reader would never see
 *     is not flagged)
 */
"use strict";

const fs = require("fs");
const path = require("path");

/** A heading's visible text, stripped of the inline Markdown that would not appear in GitHub's rendered anchor: code backticks (kept content), bold, italic. */
function headingPlainText(rawHeadingText) {
    return rawHeadingText
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        .replace(/\*([^*]*)\*/g, "$1")
        .replace(/__([^_]*)__/g, "$1")
        .replace(/_([^_]*)_/g, "$1")
        .trim();
}

/**
 * GitHub's heading-to-anchor rule: lowercase, drop anything that is not a
 * letter, digit, space, hyphen or underscore, then turn runs of whitespace
 * into a single hyphen. Matches the anchors already in use in this README,
 * e.g. "## A habit tracker from daily note checkboxes" -> the very slug the
 * intro links to, `#a-habit-tracker-from-daily-note-checkboxes`.
 */
function slugifyHeading(headingText) {
    return headingPlainText(headingText)
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .trim()
        .replace(/\s+/g, "-");
}

/** `{ level, text }` for every ATX heading (`#` through `######`) in document order. Setext headings (underlined with `=`/`-`) are not used in this README and are out of scope. */
function extractHeadings(markdown) {
    const headings = [];
    const re = /^(#{1,6})\s+(.+?)\s*$/gm;
    let m;
    while ((m = re.exec(markdown)) !== null) {
        headings.push({ level: m[1].length, text: m[2] });
    }
    return headings;
}

/**
 * Every anchor id a `#anchor` link in this README can legally resolve to:
 * one slug per heading, GitHub's rule for a repeated slug applied (`-1`,
 * `-2`, ... appended to the second and later heading that slugifies to the
 * same text), plus any explicit `id="..."` on a raw HTML element.
 */
function collectAnchorIds(markdown) {
    const ids = new Set();
    const seen = new Map();
    for (const heading of extractHeadings(markdown)) {
        const base = slugifyHeading(heading.text);
        const count = seen.get(base) || 0;
        seen.set(base, count + 1);
        ids.add(count === 0 ? base : `${base}-${count}`);
    }
    for (const m of markdown.matchAll(/\bid="([^"]+)"/g)) {
        ids.add(m[1]);
    }
    return ids;
}

/** Every `#anchor` target linked from Markdown `[text](#anchor)` or raw `href="#anchor"`. */
function extractAnchorTargets(markdown) {
    const targets = [];
    for (const m of markdown.matchAll(/]\(#([^)\s]+)\)/g)) {
        targets.push(m[1]);
    }
    for (const m of markdown.matchAll(/href="#([^"]+)"/g)) {
        targets.push(m[1]);
    }
    return targets;
}

/** Anchor targets in `markdown` with no heading slug or explicit id to resolve to. */
function findDeadAnchors(markdown) {
    const ids = collectAnchorIds(markdown);
    return extractAnchorTargets(markdown).filter((t) => !ids.has(t));
}

/** True for a reference this check does not resolve against the filesystem: an anchor, a full URL, or a `mailto:`/`tel:`/`data:` link. */
function isExemptRef(ref) {
    return (
        ref === "" ||
        ref.startsWith("#") ||
        ref.startsWith("http://") ||
        ref.startsWith("https://") ||
        ref.startsWith("mailto:") ||
        ref.startsWith("tel:") ||
        ref.startsWith("data:")
    );
}

// This repository's own files, linked absolutely: the raw file, or its page
// on GitHub. The ref (`HEAD`, `master`) is one path segment; the rest is the
// path from the repo root.
const REPO_FILE_URL_RES = [
    /^https:\/\/raw\.githubusercontent\.com\/Dimagious\/garmidian\/[^/]+\/([^?#]+)/i,
    /^https:\/\/github\.com\/Dimagious\/garmidian\/blob\/[^/]+\/([^?#]+)/i,
];

/** The repo-relative path an absolute URL into this repository points at, or null for any other reference. */
function repoPathFromUrl(ref) {
    for (const re of REPO_FILE_URL_RES) {
        const m = ref.match(re);
        if (!m) continue;
        // A malformed escape is still a path to report, not a crash.
        try {
            return decodeURIComponent(m[1]);
        } catch {
            return m[1];
        }
    }
    return null;
}

/** A reference as a repo-relative path to check on disk, or null when there is nothing on disk to check. */
function localPathOf(ref) {
    if (!isExemptRef(ref)) return ref;
    return repoPathFromUrl(ref);
}

/**
 * Every relative image or link reference in the README, both the Markdown
 * forms (`![alt](path)`, `[text](path)`) and the raw HTML the `<picture>`
 * blocks use (`src="path"`, `srcset="path"`, `href="path"`), plus every
 * absolute URL into this repository mapped back to its path (see
 * `repoPathFromUrl`). Paths are relative to the repository root, where
 * `README.md` itself lives.
 */
function extractRelativeRefs(markdown) {
    const refs = new Set();
    const add = (ref) => {
        const local = localPathOf(ref);
        if (local !== null) refs.add(local);
    };
    for (const m of markdown.matchAll(/!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) add(m[1]);
    for (const m of markdown.matchAll(/\b(?:src|srcset|href)="([^"]+)"/g)) add(m[1]);
    return Array.from(refs).sort();
}

/** Relative refs for which `fileExists(ref)` is false. `fileExists` takes a path relative to the repo root. */
function findMissingRefs(markdown, fileExists) {
    return extractRelativeRefs(markdown).filter((ref) => !fileExists(ref));
}

/** Fenced code blocks (4-backtick first, since this README nests a 3-backtick example inside one), inline code and raw HTML tags stripped, leaving what a reader actually reads as prose. */
function stripToProse(markdown) {
    return markdown
        .replace(/````[\s\S]*?````/g, " ")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`[^`]*`/g, " ")
        .replace(/<[^>]+>/g, " ");
}

/** Em dashes and en dashes in the README's prose, each with a short surrounding snippet for the error list. */
function findTypographicDashes(markdown) {
    const text = stripToProse(markdown);
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

/** Runs every check against `markdown` and returns a list of human-readable issue strings, empty when the file is clean. */
function runChecks(markdown, { fileExists }) {
    const issues = [];

    for (const ref of findMissingRefs(markdown, fileExists)) {
        issues.push(`missing file: "${ref}" does not exist`);
    }
    for (const target of findDeadAnchors(markdown)) {
        issues.push(`dead anchor: (#${target}) has no matching heading or id`);
    }
    for (const snippet of findTypographicDashes(markdown)) {
        issues.push(`typographic dash in prose: "...${snippet}..."`);
    }

    return issues;
}

function main() {
    const root = path.resolve(__dirname, "..");
    const markdown = fs.readFileSync(path.join(root, "README.md"), "utf8");
    const fileExists = (ref) => fs.existsSync(path.join(root, ref));

    const issues = runChecks(markdown, { fileExists });

    if (issues.length > 0) {
        console.error(`[readme-check] ${issues.length} issue(s) found in README.md:\n`);
        for (const issue of issues) {
            console.error(`  - ${issue}`);
        }
        process.exit(1);
    }

    console.log("[readme-check] README.md is clean.");
}

module.exports = {
    headingPlainText,
    slugifyHeading,
    extractHeadings,
    collectAnchorIds,
    extractAnchorTargets,
    findDeadAnchors,
    isExemptRef,
    repoPathFromUrl,
    extractRelativeRefs,
    findMissingRefs,
    stripToProse,
    findTypographicDashes,
    runChecks,
};

if (require.main === module) {
    main();
}
