/**
 * `package.json` is where the version is bumped; everything else follows.
 *
 * `manifest.json` takes the same version, and `versions.json` gains an entry
 * mapping it to the Obsidian it needs — that map is how the catalogue decides
 * what to offer someone on an older Obsidian, and nothing else maintains it.
 */
const fs = require("fs");
const path = require("path");

const { id: PLUGIN_ID } = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")
);

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const man = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

const from = man.version;
const to = pkg.version;

if (from === to) {
    console.log(`[${PLUGIN_ID}] manifest.json is already in sync (${to})`);
} else {
    man.version = to;
    fs.writeFileSync("manifest.json", JSON.stringify(man, null, 2) + "\n", "utf8");
    console.log(`[${PLUGIN_ID}] manifest.json version updated: ${from} → ${to}`);
}

// Runs even when the manifest needed nothing: the two files can be in sync
// while the map is still missing the version, which is how it fell behind.
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
if (versions[to] === man.minAppVersion) {
    console.log(`[${PLUGIN_ID}] versions.json already lists ${to} (Obsidian ${man.minAppVersion})`);
} else {
    const was = versions[to];
    versions[to] = man.minAppVersion;
    fs.writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n", "utf8");
    console.log(
        was
            ? `[${PLUGIN_ID}] versions.json: ${to} now needs Obsidian ${man.minAppVersion} (was ${was})`
            : `[${PLUGIN_ID}] versions.json: ${to} → Obsidian ${man.minAppVersion}`
    );
}
