import { defineConfig } from "obsidian-plugin-dev-kit";

export default defineConfig({
    build: {
        // The wizard's help pictures are imported as data URLs.
        loader: { ".png": "dataurl" },
        // styles.css is hand-written, there is no CSS source to bundle.
        css: false,
    },
    demo: {
        // Garmy's films have always been a GIF and a poster, named film-<name>.gif and film-<name>-poster.png.
        mp4: false,
        // 160 colours at 8 fps: the default quantiser bands the gradients on the cards. The width is per film.
        gif: { colors: 160, fps: 8, width: 900 },
        films: {
            "film-wizard": { gif: { colors: 160, fps: 8, width: 1000 } },
            "film-rebuild": { gif: { colors: 160, fps: 8, width: 1000 } },
            "film-languages": { gif: { colors: 160, fps: 8, width: 760 } },
            "film-library": { gif: { colors: 160, fps: 8, width: 820 } },
        },
    },
    scan: {
        // The GitHub Pages site is a static web page, not plugin code, and none of it ships in main.js. The old
        // scorecard script and the lint config never read it; the plugin rules (popout windows, innerHTML) have no
        // meaning there.
        ignore: ["site/**"],
    },
});
