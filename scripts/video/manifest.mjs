// Reads docs/video/storyboard.md and the media in out/video, and writes video/src/manifest.json:
// the narration text of every scene, how long each voice file and each clip is. The Remotion composition
// takes all its timing from here, so a new voice line or a new take needs no edit in the code.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const media = path.join(root, "out", "video");

const duration = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());

const scenes = [];
let current = null;
for (const line of fs.readFileSync(path.join(root, "docs", "video", "storyboard.md"), "utf8").split("\n")) {
    const heading = /^### (\d+)\.\s+(.*?)\s*\(/.exec(line);
    if (heading) {
        current = { n: Number(heading[1]), title: heading[2], text: [] };
        scenes.push(current);
    } else if (/^## /.test(line)) current = null;
    else if (current && line.startsWith("> ")) current.text.push(line.slice(2).trim());
}

const out = {
    scenes: scenes.map((s) => ({
        n: s.n,
        title: s.title,
        text: s.text.join(" "),
        voiceFile: `voice-master/scene-${s.n}.mp3`,
        voiceSeconds: duration(path.join(media, "voice-master", `scene-${s.n}.mp3`)),
    })),
    clips: Object.fromEntries(["wizard", "note", "variants", "catalog"].map((c) => [c, duration(path.join(media, "clips", `${c}.webm`))])),
    musicFile: "music/intergalactic.mp3",
    musicSeconds: duration(path.join(media, "music", "intergalactic.mp3")),
};

fs.writeFileSync(path.join(root, "video", "src", "manifest.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`${out.scenes.length} scenes, clips ${JSON.stringify(out.clips)}`);
