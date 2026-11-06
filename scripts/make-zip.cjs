const { execSync } = require("child_process");
const fs = require("fs");
const { id: PLUGIN_ID, name: PLUGIN_NAME } = JSON.parse(
    require("fs").readFileSync(require("path").join(__dirname, "..", "manifest.json"), "utf8")
);


// Obsidian release archives must contain only top-level plugin assets.
let files = ["main.js", "manifest.json", "styles.css"].filter((f) => fs.existsSync(f));

if (!files.length) {
    console.error(`[${PLUGIN_ID}] Nothing to pack. Build first.`);
    process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const name = `${PLUGIN_ID}-${pkg.version}.zip`;

if (fs.existsSync(name)) {
    fs.unlinkSync(name);
}

// Use system 'zip' if available (macOS/Linux). On Windows with Git Bash — also ok.
try {
    execSync(`zip -9 -r ${name} ${files.join(" ")}`, { stdio: "inherit" });
    console.log(`[${PLUGIN_ID}] Created ${name}`);
} catch (e) {
    console.error(`[${PLUGIN_ID}] Failed to create zip via system 'zip'. You can install 'zip' or use adm-zip.`);
    process.exit(1);
}
