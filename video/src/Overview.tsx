import React from "react";
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { CLIP_FILE, FPS, LEAD, MUSIC, OUTRO, OUTRO_START, SCENES, TALL, TOTAL, W, captionsOf, type Key, type Scene } from "./plan";

const inter = loadInter("normal", { weights: ["400", "600", "800"], subsets: ["latin"] }).fontFamily;

const PURPLE = "#8b5cf6";
const BG = "linear-gradient(135deg, #17122b 0%, #241a4d 55%, #1b1538 100%)";

/** The window the recording sits in: a margin, rounded corners and a shadow, so the picture is a screen and not the whole frame. */
const WIN = { x: 140, y: 100, w: W - 280, h: Math.round((W - 280) * 9 / 16) };

const camera = (keys: Key[] | undefined, seconds: number): { s: number; x: number; y: number } => {
    if (!keys || keys.length === 0) return { s: 1, x: 0.5, y: 0.5 };
    const ts = keys.map((k) => k.t);
    const ease = { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
    return {
        s: interpolate(seconds, ts, keys.map((k) => k.s), ease),
        x: interpolate(seconds, ts, keys.map((k) => k.x), ease),
        y: interpolate(seconds, ts, keys.map((k) => k.y), ease),
    };
};

const Plate: React.FC<{ text: string; local: number; at: number; dur: number }> = ({ text, local, at, dur }) => {
    const t = local / FPS;
    const opacity = interpolate(t, [at, at + 0.3, at + dur - 0.3, at + dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const lift = interpolate(t, [at, at + 0.3], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
        <div style={{ position: "absolute", left: WIN.x, top: 24, opacity, transform: `translateY(${lift}px)`, padding: "12px 22px", borderRadius: 14, background: "rgba(23,18,43,0.88)", color: "#fff", fontFamily: inter, fontWeight: 600, fontSize: 30, letterSpacing: 0.2, borderLeft: `6px solid ${PURPLE}` }}>
            {text}
        </div>
    );
};

const Caption: React.FC<{ scene: Scene; local: number }> = ({ scene, local }) => {
    const t = local / FPS - LEAD;
    const caps = React.useMemo(() => captionsOf(scene.text, scene.voiceSeconds), [scene]);
    const cap = caps.find((c) => t >= c.from && t < c.to);
    if (!cap) return null;
    const into = Math.min(1, (t - cap.from) / 0.12);
    return (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 54, display: "flex", justifyContent: "center", opacity: into }}>
            <div style={{ maxWidth: 1500, padding: "14px 30px", borderRadius: 16, background: "rgba(10,8,22,0.82)", color: "#fff", fontFamily: inter, fontWeight: 600, fontSize: 42, lineHeight: 1.25, textAlign: "center" }}>{cap.text}</div>
        </div>
    );
};

/** A tall picture shown at a width of 1060 px and moved up at an even pace, with a short rest at the top and at the bottom. */
const Pan: React.FC<{ src: string; seconds: number }> = ({ src, seconds }) => {
    const f = useCurrentFrame();
    const width = 1060;
    const height = (TALL.h / TALL.w) * width;
    const travel = Math.max(0, height - WIN.h);
    const rest = 1.4 * FPS;
    const y = interpolate(f, [rest, seconds * FPS - rest], [0, travel], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
    return (
        <div style={{ position: "absolute", inset: 0, background: "#fff", overflow: "hidden" }}>
            <Img src={staticFile(src)} style={{ position: "absolute", left: (WIN.w - width) / 2, top: -y, width, height }} />
        </div>
    );
};

const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
    const local = useCurrentFrame();
    const seconds = local / FPS;
    const cam = camera(scene.camera, seconds);
    const fadeIn = interpolate(local, [0, 9], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(local, [scene.frames - 9, scene.frames], [1, 0], { extrapolateLeft: "clamp" });
    const drift = interpolate(local, [0, scene.frames], [1, 1.015]);
    return (
        <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
            <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, borderRadius: 22, overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)", background: "#fff" }}>
                <div style={{ width: "100%", height: "100%", transform: `scale(${cam.s * drift})`, transformOrigin: `${cam.x * 100}% ${cam.y * 100}%` }}>
                    {scene.cuts.map((cut, i) => {
                        const offset = scene.cuts.slice(0, i).reduce((n, c) => n + c.len, 0);
                        return (
                            <Sequence key={i} from={Math.round(offset * FPS)} durationInFrames={i === scene.cuts.length - 1 ? undefined : Math.round(cut.len * FPS)} layout="none">
                                {cut.img && cut.pan ? (
                                    <Pan src={cut.img} seconds={scene.frames / FPS - offset} />
                                ) : cut.img ? (
                                    <Img src={staticFile(cut.img)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                    <OffthreadVideo src={staticFile(CLIP_FILE(scene.clip))} startFrom={Math.round(cut.from * FPS)} playbackRate={(cut.to - cut.from) / cut.len} muted style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
                                )}
                            </Sequence>
                        );
                    })}
                </div>
            </div>
            {scene.plates?.map((p) => <Plate key={p.text} text={p.text} local={local} at={p.at} dur={p.dur} />)}
            <Caption scene={scene} local={local} />
            <Sequence from={Math.round(LEAD * FPS)}>
                <Audio src={staticFile(scene.voiceFile)} />
            </Sequence>
        </AbsoluteFill>
    );
};

const Title: React.FC = () => {
    const f = useCurrentFrame();
    const rise = (from: number): { opacity: number; transform: string } => ({
        opacity: interpolate(f, [from, from + 14], [0, 1], { extrapolateRight: "clamp" }),
        transform: `translateY(${interpolate(f, [from, from + 14], [26, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })}px)`,
    });
    const out = interpolate(f, [Math.round(3.1 * FPS), Math.round(3.6 * FPS)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
        <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", fontFamily: inter, color: "#fff", opacity: out }}>
            <div style={{ ...rise(4), fontSize: 168, fontWeight: 800, letterSpacing: -4 }}>Garmy</div>
            <div style={{ ...rise(16), fontSize: 46, fontWeight: 400, opacity: 0.88 }}>Your Garmin data, as a dashboard in Obsidian</div>
            <div style={{ ...rise(30), marginTop: 36, fontSize: 30, fontWeight: 600, color: PURPLE }}>@Dimagious</div>
        </AbsoluteFill>
    );
};

const End: React.FC = () => {
    const f = useCurrentFrame();
    const a = interpolate(f, [0, 14], [0, 1], { extrapolateRight: "clamp" });
    const out = interpolate(f, [OUTRO * FPS - 20, OUTRO * FPS], [1, 0], { extrapolateLeft: "clamp" });
    return (
        <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", fontFamily: inter, color: "#fff", opacity: Math.min(a, out) }}>
            <div style={{ fontSize: 92, fontWeight: 800 }}>Try Garmy</div>
            <div style={{ marginTop: 22, fontSize: 44, fontWeight: 400, opacity: 0.9 }}>Obsidian › Settings › Community plugins › Browse › Garmy</div>
            <div style={{ marginTop: 44, fontSize: 36, fontWeight: 600, color: PURPLE }}>dimagious.github.io/garmidian</div>
        </AbsoluteFill>
    );
};

/** Quiet music: lower while the voice speaks, brought up between scenes, in at the start and out at the end. */
const musicVolume = (frame: number): number => {
    const loud = 0.22;
    const quiet = 0.07;
    const ramp = 0.35 * FPS;
    let duck = 0;
    for (const s of SCENES) {
        const from = s.start + LEAD * FPS;
        const to = from + s.voiceSeconds * FPS;
        duck = Math.max(duck, interpolate(frame, [from - ramp, from, to, to + ramp], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    }
    const base = loud + (quiet - loud) * duck;
    return base * interpolate(frame, [0, FPS, TOTAL - 4 * FPS, TOTAL], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

export const Overview: React.FC = () => (
    <AbsoluteFill style={{ background: BG }}>
        <Sequence from={0} durationInFrames={Math.round(3.6 * FPS)}><Title /></Sequence>
        {SCENES.map((s) => (
            <Sequence key={s.n} from={s.start} durationInFrames={s.frames}><SceneView scene={s} /></Sequence>
        ))}
        <Sequence from={OUTRO_START} durationInFrames={OUTRO * FPS}><End /></Sequence>
        <Audio src={staticFile(MUSIC.file)} volume={musicVolume} />
    </AbsoluteFill>
);

