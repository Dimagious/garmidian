import { defineConfig } from "obsidian-plugin-dev-kit";

export default defineConfig({
    build: {
        // The wizard's help pictures are imported as data URLs.
        loader: { ".png": "dataurl" },
        // styles.css is hand-written, there is no CSS source to bundle.
        css: false,
    },
    scan: {
        // The GitHub Pages site is a static web page, not plugin code, and none of it ships in main.js. The old
        // scorecard script and the lint config never read it; the plugin rules (popout windows, innerHTML) have no
        // meaning there.
        ignore: ["site/**"],
    },
});
