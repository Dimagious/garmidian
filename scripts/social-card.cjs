#!/usr/bin/env node
/**
 * Draws the card people see when a link to the site or the repository is
 * shared (1280x640, what GitHub's social preview and Open Graph want).
 *
 * It carries a real fragment of a real dashboard: `docs/screens/
 * dashboard-1-dark.png`, captured from running Obsidian by `npm run capture`.
 * Nothing in the picture is drawn by hand except the name and the tagline.
 *
 * Output: `docs/screens/social-preview.png`. The assembler copies it to
 * `img/social-preview.png`, which is what the pages' og:image points at. GitHub
 * keeps its own copy as an upload (Settings, General, Social preview; there is
 * no API for it), so upload the same file there by hand.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "docs/screens/dashboard-1-dark.png");
const OUT = path.join(ROOT, "docs/screens/social-preview.png");

/** What GitHub asks for, and refuses to scale gracefully away from. */
const CARD = { width: 1280, height: 640, maxBytes: 1024 * 1024 };

/** The part of the 2400x1720 capture worth showing: the recovery cards. */
const CROP = { x: 520, y: 600, width: 1450, height: 1000, shown: 600 };

const TAGLINE = "Your Garmin data,<br>as a dashboard<br>in your notes.";
const FOOTNOTE = "An Obsidian plugin for Dashy blocks";

function html() {
    // Inlined rather than linked: the page is loaded via setContent, so it has
    // no origin of its own and the browser refuses to read `file://` from it.
    const shot = "data:image/png;base64," + fs.readFileSync(SOURCE).toString("base64");
    const scale = CROP.shown / CROP.width;
    const px = (n) => `${Math.round(n)}px`;

    return `<!doctype html><meta charset="utf-8"><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            width: ${px(CARD.width)}; height: ${px(CARD.height)}; overflow: hidden;
            display: flex; align-items: center; gap: 56px; padding-left: 72px;
            background: #12191a;
            font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
            color: #e6efee;
        }
        .left { width: 480px; flex: none; }
        .mark { display: flex; align-items: center; gap: 18px; margin-bottom: 26px; }
        .name { font-size: 92px; font-weight: 700; letter-spacing: -2px; }
        .tag { font-size: 32px; line-height: 1.3; color: #9fb3b0; }
        .foot { margin-top: 34px; font-size: 21px; color: #62777a; }
        .shot {
            width: ${px(CROP.width * scale)}; height: ${px(CROP.height * scale)};
            flex: none; border-radius: 14px; border: 1px solid #2a3a3b;
            box-shadow: 0 28px 70px rgba(0, 0, 0, .55);
            background-image: url("${shot}");
            background-repeat: no-repeat;
            background-size: ${px(2400 * scale)} auto;
            background-position: -${px(CROP.x * scale)} -${px(CROP.y * scale)};
        }
    </style>
    <div class="left">
        <div class="mark">
            <svg width="76" height="76" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#2bb5a3"/><polyline points="5.5,17 10.5,17 13,11 16.5,22.5 19.5,14 21.5,17 26.5,17" fill="none" stroke="#05211d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="7" y="24.5" width="4" height="2" rx="1" fill="#05211d" fill-opacity=".55"/><rect x="12.5" y="24.5" width="7" height="2" rx="1" fill="#05211d" fill-opacity=".8"/><rect x="21" y="24.5" width="4" height="2" rx="1" fill="#05211d" fill-opacity=".55"/></svg>
            <div class="name">Garmy</div>
        </div>
        <div class="tag">${TAGLINE}</div>
        <div class="foot">${FOOTNOTE}</div>
    </div>
    <div class="shot"></div>`;
}

async function launch() {
    // The installed Playwright wants a Chromium build that is not in the cache,
    // and downloading one to draw a single picture is not worth 150 MB. The
    // browser on the machine renders this page identically.
    try {
        return await chromium.launch({ channel: "chrome" });
    } catch {
        console.log("[social-card] no system Chrome; falling back to Playwright's own browser");
        return await chromium.launch();
    }
}

(async () => {
    if (!fs.existsSync(SOURCE)) {
        console.error(`[social-card] ${path.relative(ROOT, SOURCE)} is missing - run \`npm run capture\` first`);
        process.exit(1);
    }

    const browser = await launch();
    const page = await browser.newPage({
        viewport: { width: CARD.width, height: CARD.height },
        deviceScaleFactor: 1,
    });
    await page.setContent(html());
    await page.screenshot({ path: OUT });
    await browser.close();

    const bytes = fs.statSync(OUT).size;
    if (bytes > CARD.maxBytes) {
        console.error(`[social-card] ${bytes} bytes - GitHub refuses anything over ${CARD.maxBytes}`);
        process.exit(1);
    }
    console.log(
        `[social-card] ${path.relative(ROOT, OUT)}: ${CARD.width}x${CARD.height}, ${Math.round(bytes / 1024)} KB`
    );
    console.log("[social-card] upload it by hand: Settings, General, Social preview (GitHub has no API for it)");
})();
