// Builds the community directory pictures: a headline, a line of text and a real screenshot in a frame.
// Desktop 1200x800 (3:2) and phone 900x1600 (9:16). Sources come from `npm run capture` (docs/screens).
// Output: docs/listing/. usage: node tools/listing.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "listing");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const data = (rel) => `data:image/png;base64,${fs.readFileSync(path.join(ROOT, rel)).toString("base64")}`;
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif`;

const DESKTOP = [
  { out: "d1-key", src: "docs/screens/wizard-key-light.png", layout: "split", theme: "light",
    head: "Connect in one paste", sub: "Your Garmin key stays in Obsidian's secure storage and goes only to Garmin." },
  { out: "d2-choose", src: "docs/screens/wizard-choose-light.png", layout: "split", theme: "light",
    head: "Only what you actually have", sub: "No empty swim cards: the wizard offers the metrics and sports found in your data." },
  { out: "d3-recovery", src: "docs/screens/dashboard-1-light.png", layout: "bleed", theme: "light",
    head: "Recovery at a glance", sub: "Sleep, HRV, resting heart rate, Body Battery and stress, with this week against your usual." },
  { out: "d4-trends", src: "docs/screens/dashboard-3-dark.png", layout: "bleed", theme: "dark",
    head: "A year of trends in your notes", sub: "Charts, streaks and daily steps from a full year of Garmin history." },
  { out: "d5-training", src: "docs/screens/dashboard-5-light.png", layout: "bleed", theme: "light",
    head: "Every sport in one place", sub: "Weekly minutes, a month calendar and goals taken from your own numbers." },
];
const PHONE = [
  { out: "m1-key", src: "docs/screens/phone-key.png", head: "Set up in a minute", sub: "Paste a Garmin key, pick what to show." },
  { out: "m2-choose", src: "docs/screens/phone-choose.png", head: "Choose what to track", sub: "Only what exists in your data is offered." },
  { out: "m3-recovery", src: "docs/screens/phone-recovery.png", head: "Recovery at a glance", sub: "Cards that fit a small screen." },
  { out: "m4-week", src: "docs/screens/phone-week.png", head: "This week against your usual", sub: "A small trend under every number." },
  { out: "m5-charts", src: "docs/screens/phone-charts.png", head: "Charts that stay readable", sub: "A year of sleep, HRV and steps." },
];

const PALETTE = {
  light: { bg: "linear-gradient(135deg, #efe9ff 0%, #ffffff 62%)", head: "#1d1b2e", sub: "#5b5870", tag: "#7c5ce8", frame: "#e3ddf6" },
  dark: { bg: "linear-gradient(135deg, #2a2150 0%, #16151f 65%)", head: "#f4f2ff", sub: "#b9b4d6", tag: "#a88bff", frame: "#3a3360" },
};

const tag = (c) => `<div class="tag" style="color:${c.tag}"><svg width="22" height="22" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#7c5ce8"/><polyline points="5.5,17 10.5,17 13,11 16.5,22.5 19.5,14 21.5,17 26.5,17" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>GARMY FOR OBSIDIAN</div>`;

function desktopHtml(s) {
  const c = PALETTE[s.theme];
  const base = `*{box-sizing:border-box;margin:0}body{width:1200px;height:800px;overflow:hidden;font-family:${FONT};background:${c.bg};position:relative}
.tag{position:absolute;left:64px;top:44px;display:flex;gap:10px;align-items:center;font-size:15px;font-weight:700;letter-spacing:.12em}
h1{font-size:50px;line-height:1.06;font-weight:780;letter-spacing:-.02em;color:${c.head}}p{font-size:23px;line-height:1.38;color:${c.sub};margin-top:16px}
.shot{background:#fff url(${data(s.src)}) no-repeat;background-size:cover;border:1px solid ${c.frame};box-shadow:0 30px 80px rgba(40,25,110,.28)}`;
  if (s.layout === "split") {
    return `<style>${base}.text{position:absolute;left:64px;top:210px;width:430px}.shot{position:absolute;right:56px;top:70px;width:${s.out === "d1-key" ? 600 : 660}px;height:${s.out === "d1-key" ? 620 : 540}px;border-radius:20px;background-size:contain;background-position:center;background-color:transparent;border:none;box-shadow:none;filter:drop-shadow(0 26px 40px rgba(40,25,110,.28))}</style>
<body>${tag(c)}<div class="text"><h1>${s.head}</h1><p>${s.sub}</p></div><div class="shot"></div></body>`;
  }
  return `<style>${base}.text{position:absolute;left:64px;top:92px;width:820px}.shot{position:absolute;left:64px;right:64px;top:292px;bottom:-2px;border-radius:20px 20px 0 0;background-position:center top}</style>
<body>${tag(c)}<div class="text"><h1>${s.head}</h1><p>${s.sub}</p></div><div class="shot"></div></body>`;
}

function phoneHtml(s) {
  const c = PALETTE.light;
  return `<style>*{box-sizing:border-box;margin:0}body{width:900px;height:1600px;overflow:hidden;font-family:${FONT};background:${c.bg};position:relative;text-align:center}
.tag{position:absolute;left:0;right:0;top:64px;display:flex;gap:12px;align-items:center;justify-content:center;font-size:20px;font-weight:700;letter-spacing:.12em;color:${c.tag}}
.text{position:absolute;left:70px;right:70px;top:140px}h1{font-size:66px;line-height:1.05;font-weight:780;letter-spacing:-.02em;color:${c.head}}p{font-size:30px;line-height:1.35;color:${c.sub};margin-top:18px}
.phone{position:absolute;left:150px;top:470px;width:600px;height:992px;border-radius:68px;background:#17161d;padding:15px;box-shadow:0 40px 90px rgba(40,25,110,.35)}
.screen{width:100%;height:100%;border-radius:54px;background:#fff url(${data(s.src)}) no-repeat center -66px;background-size:100% auto}</style>
<body><div class="tag"><svg width="28" height="28" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#7c5ce8"/><polyline points="5.5,17 10.5,17 13,11 16.5,22.5 19.5,14 21.5,17 26.5,17" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>GARMY FOR OBSIDIAN</div>
<div class="text"><h1>${s.head}</h1><p>${s.sub}</p></div><div class="phone"><div class="screen"></div></div></body>`;
}

// The Chromium this Playwright wants may not be installed; any recent one from the cache renders these pages.
// Set CHROMIUM_PATH to choose, otherwise the newest in ~/Library/Caches/ms-playwright is used.
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = path.join(process.env.HOME ?? "", "Library", "Caches", "ms-playwright");
  if (!fs.existsSync(cache)) return undefined;
  for (const dir of fs.readdirSync(cache).filter((d) => d.startsWith("chromium-") && !d.includes("headless")).sort().reverse()) {
    for (const arch of ["chrome-mac-arm64", "chrome-mac"]) {
      const exe = path.join(cache, dir, arch, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}
const browser = await chromium.launch({ executablePath: findChromium() });
for (const [list, html, w, h] of [[DESKTOP, desktopHtml, 1200, 800], [PHONE, phoneHtml, 900, 1600]]) {
  for (const s of list) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(html(s), { waitUntil: "load" });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `${s.out}.png`) });
    await page.close();
    process.stdout.write(`${s.out}.png\n`);
  }
}
await browser.close();
