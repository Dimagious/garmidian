import { defineConfig } from "obsidian-plugin-dev-kit";

export default defineConfig({
    build: {
        // The wizard's help pictures are imported as data URLs.
        loader: { ".png": "dataurl" },
        // styles.css is hand-written, there is no CSS source to bundle.
        css: false,
    },
    demo: {
        // Garmy's films are GIFs, named film-<name>.gif. The README and the site embed the GIFs, nothing uses a poster
        // or a video, so neither is made.
        mp4: false,
        poster: false,
        // Every film is a tour (a wizard that ends on a dashboard, a library scrolled card by card, seven languages,
        // a dashboard that grows), so it does not end on the frame it starts with and the loop check has nothing to say.
        loop: "off",
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
