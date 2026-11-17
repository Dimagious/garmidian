import manifest from "./manifest.json";

export const FPS = 30;
export const W = 1920;
export const H = 1080;

/** Silence before the voice starts in a scene and after it ends, seconds. */
export const LEAD = 0.4;
export const TAIL = 0.6;
export const INTRO = 3.6;
export const OUTRO = 5;

export type ClipName = keyof typeof manifest.clips;

/** A camera key: at `t` seconds into the scene the picture is scaled by `s` around (x, y), both 0 to 1 of the window. */
export interface Key { t: number; s: number; x: number; y: number }
/** A small label on top of the picture: shown from `at` for `dur` seconds. */
export interface Plate { at: number; dur: number; text: string }

interface SceneSetup {
    n: number;
    clip: ClipName;
    /** The part of the recording that belongs to the scene, in seconds. It is played faster or slower to fit the voice. */
    from: number;
    to: number;
    camera?: Key[];
    plates?: Plate[];
    /** Several pieces of the recording in a row, each played over `len` seconds of the scene; `from` and `to` are then not used. */
    cuts?: { from: number; to: number; len: number; img?: string; pan?: boolean }[];
}

/** Which part of which recording shows what the voice says. Times come from the contact sheets of the clips. */
export const SETUP: SceneSetup[] = [
    { n: 1, clip: "note", from: 2.5, to: 15.7, camera: [{ t: 0, s: 1, x: 0.5, y: 0.3 }, { t: 12, s: 1.08, x: 0.5, y: 0.4 }] },
    {
        n: 2, clip: "wizard", from: 0, to: 3,
        // Garmin Connect, one screen per thing the voice says (page-only screenshots of the real flow, the key blurred), then the wizard's key step
        cuts: [
            { img: "garmin/step-1.jpg", from: 0, to: 0, len: 8.2 },
            { img: "garmin/step-2.jpg", from: 0, to: 0, len: 1.2 },
            { img: "garmin/step-3.jpg", from: 0, to: 0, len: 2.6 },
            { img: "garmin/step-4.jpg", from: 0, to: 0, len: 4.0 },
            { from: 0, to: 3, len: 4.7 },
        ],
        camera: [
            { t: 0, s: 1, x: 0.5, y: 0.5 }, { t: 2.2, s: 1.5, x: 0.12, y: 0.1 }, { t: 8, s: 1.5, x: 0.12, y: 0.1 },
            { t: 8.6, s: 1.3, x: 0.5, y: 0.05 }, { t: 9.6, s: 1.6, x: 0.5, y: 0.03 }, { t: 12, s: 1.5, x: 0.5, y: 0 },
            { t: 16, s: 1.0, x: 0.5, y: 0.5 }, { t: 20.7, s: 1.0, x: 0.5, y: 0.5 },
        ],
        plates: [{ at: 2.6, dur: 5, text: "Garmin Connect › Settings › Personal API Key" }, { at: 12.2, dur: 3.8, text: "Shown only once" }],
    },
    { n: 3, clip: "wizard", from: 15, to: 33, plates: [{ at: 6, dur: 6, text: "About 17 requests for a year" }] },
    { n: 4, clip: "wizard", from: 33, to: 52.5, plates: [{ at: 2, dur: 6, text: "11 dashboards, one question each" }] },
    // the author's own Garmy data (Garmy/data of the real vault), one tall picture of the whole note that the camera pans down
    { n: 5, clip: "note", from: 0, to: 1, cuts: [{ img: "garmin/note-real.png", pan: true, from: 0, to: 0, len: 21 }], plates: [{ at: 1, dur: 6, text: "Drawn by Dashy, a free plugin" }] },
    // rebuild (the note), miles (the note converts), then four of the seven languages
    { n: 6, clip: "variants", from: 1.5, to: 22, cuts: [{ from: 1.5, to: 4.5, len: 4.2 }, { from: 4.5, to: 8, len: 2.3 }, { from: 13.5, to: 22, len: 3.1 }] },
    { n: 7, clip: "catalog", from: 1.5, to: 12.44, camera: [{ t: 0, s: 1, x: 0.5, y: 0.2 }, { t: 4, s: 1.45, x: 0.4, y: 0.12 }, { t: 9, s: 1.45, x: 0.4, y: 0.35 }], plates: [{ at: 0.5, dur: 6, text: "Settings › Community plugins › Browse" }] },
];

export interface Scene extends SceneSetup {
    title: string;
    text: string;
    voiceFile: string;
    voiceSeconds: number;
    /** Where the scene starts on the timeline and how long it is, in frames. */
    start: number;
    frames: number;
    cuts: { from: number; to: number; len: number; img?: string; pan?: boolean }[];
}

const sec = (s: number): number => Math.round(s * FPS);

export const SCENES: Scene[] = (() => {
    let at = sec(INTRO);
    return SETUP.map((setup) => {
        const m = manifest.scenes.find((s) => s.n === setup.n);
        if (!m) throw new Error(`No scene ${setup.n} in the manifest: run scripts/video/manifest.mjs`);
        const frames = sec(m.voiceSeconds + LEAD + TAIL);
        const scene: Scene = { ...setup, title: m.title, text: m.text, voiceFile: m.voiceFile, voiceSeconds: m.voiceSeconds, start: at, frames, cuts: setup.cuts ?? [{ from: setup.from, to: setup.to, len: frames / FPS }] };
        at += frames;
        return scene;
    });
})();

export const OUTRO_START = SCENES.reduce((end, s) => Math.max(end, s.start + s.frames), 0);
export const TOTAL = OUTRO_START + sec(OUTRO);
export const MUSIC = { file: manifest.musicFile, seconds: manifest.musicSeconds };
export const CLIP_FILE = (name: ClipName): string => `clips/${name}.webm`;

/** The narration cut into captions of about eight words, each shown for a share of the voice proportional to its length. */
export function captionsOf(text: string, voiceSeconds: number): { text: string; from: number; to: number }[] {
    // split after . ? ! only when a space follows, so a version number such as 2.2.0 stays whole
    const sentences = text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
    const chunks: string[] = [];
    for (const sentence of sentences) {
        const words = sentence.split(/\s+/);
        const parts = Math.max(1, Math.round(words.length / 8));
        const size = Math.ceil(words.length / parts);
        for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(" "));
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    let at = 0;
    return chunks.map((c) => {
        const len = (c.length / total) * voiceSeconds;
        const item = { text: c, from: at, to: at + len };
        at += len;
        return item;
    });
}

/** The tall picture of the note in scene 5, in pixels. */
export const TALL = { w: 780, h: 3395 };
