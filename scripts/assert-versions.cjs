/**
 * The version has to say the same thing in four places, and nothing else
 * checks three of them: `package.json`, `manifest.json`, the `versions.json`
 * map the catalogue reads to decide what to serve an older Obsidian, and —
 * when the release workflow passes it — the tag being built.
 *
 * A release that disagrees with itself is not caught by any test: it builds,
 * it ships, and it comes back as a review rejection or as an update the
 * catalogue refuses to offer.
 */
const fs = require("fs");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const man = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));

/** Passed by `.github/workflows/release.yml` as the tag it is releasing. */
const tag = process.argv[2];

const problems = [];

if (pkg.version !== man.version) {
    problems.push(`package.json (${pkg.version}) != manifest.json (${man.version})`);
}

if (!Object.prototype.hasOwnProperty.call(versions, man.version)) {
    problems.push(
        `versions.json has no entry for ${man.version} — run \`node scripts/version-sync.cjs\``,
    );
} else if (versions[man.version] !== man.minAppVersion) {
    problems.push(
        `versions.json maps ${man.version} to Obsidian ${versions[man.version]}, `
        + `manifest.json says ${man.minAppVersion}`,
    );
}

if (tag && tag !== man.version) {
    problems.push(`tag ${tag} != manifest.json (${man.version})`);
}

if (problems.length) {
    for (const p of problems) console.error(`[version] ${p}`);
    process.exit(1);
}

console.log(
    `[version] OK: ${man.version}, needs Obsidian ${man.minAppVersion}, listed in versions.json`
    + (tag ? `, tag ${tag}` : ""),
);
