#!/usr/bin/env node
/**
 * Takes the README pictures and clips from the real plugin in real Obsidian, on generated demo data.
 * Needs macOS Obsidian, a Dashy build (DASHY_DIST, default ../dashsidian) and ffmpeg.
 *
 *   npm run capture
 *
 * Output: docs/screens/*.png (stills) and docs/screens/*.gif (clips).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FRAMES = path.join(ROOT, ".capture", "frames");
const SHOTS = path.join(ROOT, "docs", "screens");
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });

// `npm run capture -- library` retakes only the test whose title contains that word, and leaves the other pictures alone.
const ONLY = process.argv[2] ?? "";
if (!ONLY) fs.rmSync(path.join(ROOT, ".capture"), { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

run("./scripts/e2e-setup.sh", []);
const env = { ...process.env, CAPTURE: "1" };
delete env.ELECTRON_RUN_AS_NODE;
execFileSync("npx", ["playwright", "test", "e2e/capture.spec.ts", "--reporter=list", ...(ONLY ? ["-g", ONLY] : [])], { cwd: ROOT, stdio: "inherit", env });

// Frames to GIF with a palette of its own: the default quantiser bands the gradients on the cards.
const reels = JSON.parse(fs.readFileSync(path.join(ROOT, ".capture", "reels.json"), "utf8"));
const WIDTH = { wizard: 1000, rebuild: 1000, languages: 760, library: 820 };
for (const [name, frames] of Object.entries(reels)) {
  if (!frames.length || (ONLY && !ONLY.includes(name))) continue;
  const list = frames.map((f, i) => `file '${path.join(FRAMES, f.file)}'\nduration ${(f.ms / 1000).toFixed(3)}`).join("\n")
    + `\nfile '${path.join(FRAMES, frames[frames.length - 1].file)}'\n`; // the concat demuxer drops the last duration without a repeat
  const listFile = path.join(ROOT, ".capture", `${name}.txt`);
  fs.writeFileSync(listFile, list);
  const out = path.join(SHOTS, `film-${name}.gif`);
  const w = WIDTH[name] ?? 900;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", `fps=8,scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    "-loop", "0", out], { cwd: ROOT, stdio: "inherit" });
  const mb = (fs.statSync(out).size / 1048576).toFixed(2);
  console.log(`${name}: ${frames.length} frames -> ${path.relative(ROOT, out)} (${mb} MB)`);
  // a still for the first frame, used as a poster by sites that do not play GIFs
  fs.copyFileSync(path.join(FRAMES, frames[0].file), path.join(SHOTS, `film-${name}-poster.png`));
}
