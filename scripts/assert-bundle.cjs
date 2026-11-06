#!/usr/bin/env node
/**
 * The bundle has to run where the plugin claims to run.
 *
 * `manifest.json` says `isDesktopOnly: false`, and on a phone there is no
 * Node: no `process`, no `require`, no `__dirname`. Desktop Obsidian is
 * Electron and has all three, so a bundle that reaches for them works
 * perfectly on the machine it was built on and fails on every block on a
 * phone — which is exactly how 1.0.0 shipped. esbuild was told
 * `--platform=node`, so it took the `node` branch of the `yaml` package's
 * export map and bundled the build that reads `process.env`.
 *
 * Nothing in `src/` refers to any of this; it arrives through a dependency's
 * export conditions, which is why reading our own sources cannot catch it and
 * the built file has to be checked instead.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUNDLE = path.join(ROOT, "main.js");

/** Each pattern is something that only exists under Node. */
const FORBIDDEN = [
    { re: /\bprocess\s*\.\s*(env|emitWarning|platform|version|cwd|argv)\b/, what: "a `process` reference" },
    { re: /require\(\s*["']node:/, what: "a `node:` builtin import" },
    { re: /\b__dirname\b|\b__filename\b/, what: "`__dirname` or `__filename`" },
];

/**
 * Minification renames the variable but keeps the property, so the property
 * names are what we look for. These come from the `yaml` Node build.
 */
const MARKERS = ["LOG_TOKENS", "LOG_STREAM", "emitWarning"];

function main() {
    if (!fs.existsSync(BUNDLE)) {
        console.error("[bundle] main.js is missing — run `npm run build` first");
        process.exit(1);
    }

    const code = fs.readFileSync(BUNDLE, "utf8");
    const problems = [];

    for (const { re, what } of FORBIDDEN) {
        const hit = re.exec(code);
        if (hit) problems.push(`${what}: ${JSON.stringify(hit[0])}`);
    }
    for (const marker of MARKERS) {
        if (code.includes(marker)) {
            problems.push(`\`${marker}\`, which only the Node build of a dependency contains`);
        }
    }

    if (problems.length) {
        console.error("[bundle] main.js cannot run on mobile:");
        for (const p of problems) console.error("  - " + p);
        console.error("  Check the esbuild platform: an Obsidian plugin bundles as `browser`.");
        process.exit(1);
    }

    console.log(`[bundle] main.js is free of Node-only references (${Math.round(code.length / 1024)} KB)`);
}

main();
