import { defineConfig } from "obsidian-plugin-dev-kit";

export default defineConfig({
    build: {
        // The wizard's help pictures are imported as data URLs.
        loader: { ".png": "dataurl" },
        // styles.css is hand-written, there is no CSS source to bundle.
        css: false,
    },
});
