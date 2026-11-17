import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const inter = loadInter("normal", { weights: ["800"], subsets: ["latin"] }).fontFamily;
const BG = "linear-gradient(135deg, #17122b 0%, #2e2166 60%, #1b1538 100%)";
const PURPLE = "#8b5cf6";

export type ThumbVariant = "A" | "B" | "C" | "D" | "E" | "F" | "G";

/** Obsidian and Garmin marks with an arrow between them: the Obsidian icon is the app's own, the Garmin wordmark sits on a white card because it is black. */
const Marks: React.FC<{ size: number }> = ({ size }) => (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.2 }}>
        <Img src={staticFile("logos/obsidian.png")} style={{ width: size, height: size, filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.5))" }} />
        <div style={{ fontSize: size * 0.6, fontWeight: 800, color: PURPLE }}>+</div>
        <div style={{ background: "#fff", borderRadius: size * 0.2, padding: `${size * 0.22}px ${size * 0.3}px`, boxShadow: "0 10px 24px rgba(0,0,0,0.5)" }}>
            <Img src={staticFile("logos/garmin.svg")} style={{ width: size * 2.1, display: "block" }} />
        </div>
    </div>
);

/** The top of the author's real dashboard, cut out of the tall picture of scene 5. */
const Shot: React.FC<{ width: number; height: number; shift?: number }> = ({ width, height, shift = 0 }) => (
    <div style={{ width, height, borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 30px 70px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.12)" }}>
        <Img src={staticFile("garmin/note-real.png")} style={{ width, display: "block", marginTop: -shift }} />
    </div>
);

const Word: React.FC<{ children: React.ReactNode; size: number }> = ({ children, size }) => (
    <div style={{ fontSize: size, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1, textShadow: "0 6px 30px rgba(0,0,0,0.5)" }}>{children}</div>
);

/** A yellow sticker, tilted, the one thing in the frame that is not purple or white. */
const Free: React.FC<{ size: number; rotate?: number }> = ({ size, rotate = -8 }) => (
    <div style={{ display: "inline-block", transform: `rotate(${rotate}deg)`, background: "#facc15", color: "#17122b", fontSize: size, fontWeight: 800, letterSpacing: 1, padding: `${size * 0.12}px ${size * 0.4}px`, borderRadius: size * 0.25, boxShadow: "0 12px 30px rgba(0,0,0,0.55)" }}>FREE</div>
);

export const Thumb: React.FC<{ variant: ThumbVariant }> = ({ variant }) => {
    if (variant === "G") {
        // the picture Studio's AI drew (watch, key, arrow, dashboard); its "AUTO SYNC" line is covered by the floor colour and the two logos sit there instead
        return (
            <AbsoluteFill style={{ fontFamily: inter }}>
                <Img src={staticFile("logos/ai-base.png")} style={{ width: 1280, height: 720 }} />
                {/* the AI drew broken words on the window: each is covered by the colour around it and, where a label belongs, the right word is written */}
                {[
                    { x: 775, y: 100, w: 96, h: 19, bg: "rgb(31,31,30)", text: "Garmin dashboard", size: 10.5 },
                    { x: 916, y: 119, w: 128, h: 19, bg: "rgb(30,29,29)", text: "My Garmin dashboard", size: 11 },
                    { x: 816, y: 404, w: 52, h: 17, bg: "rgb(40,40,40)", text: "Resting HR", size: 10 },
                    { x: 1036, y: 513, w: 172, h: 21, bg: "rgb(34,34,34)", text: "", size: 10 },
                ].map((p) => (
                    <div key={p.x} style={{ position: "absolute", left: p.x, top: p.y, width: p.w, height: p.h, background: p.bg, filter: "blur(0.4px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, -apple-system, sans-serif", fontWeight: 500, fontSize: p.size, color: "#d4d4d4", whiteSpace: "nowrap" }}>{p.text}</div>
                ))}
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 190, background: "linear-gradient(to bottom, rgba(44,40,54,0) 0%, rgba(48,44,57,1) 22%, rgb(60,56,65) 100%)" }} />
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, display: "flex", justifyContent: "center" }}><Marks size={120} /></div>
            </AbsoluteFill>
        );
    }
    if (variant === "D") {
        // B with the new words and the sticker on the corner of the picture
        return (
            <AbsoluteFill style={{ background: BG, fontFamily: inter }}>
                <div style={{ position: "absolute", left: 50, top: 50 }}><Shot width={600} height={620} shift={0} /></div>
                <div style={{ position: "absolute", left: 470, top: 22 }}><Free size={64} rotate={8} /></div>
                <div style={{ position: "absolute", right: 50, top: 70, width: 540, display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
                    <Marks size={120} />
                    <div style={{ textAlign: "center" }}>
                        <Word size={92}>Your own</Word>
                        <Word size={92}><span style={{ color: PURPLE }}>Garmin</span></Word>
                        <Word size={92}>dashboard</Word>
                    </div>
                </div>
            </AbsoluteFill>
        );
    }
    if (variant === "E") {
        // A with the new words: the text left, the picture tilted right, the sticker over the picture
        return (
            <AbsoluteFill style={{ background: BG, fontFamily: inter }}>
                <div style={{ position: "absolute", left: 60, top: 60 }}><Marks size={100} /></div>
                <div style={{ position: "absolute", left: 60, top: 260 }}>
                    <Word size={104}>Your own</Word>
                    <Word size={104}>Garmin</Word>
                    <Word size={104}><span style={{ color: PURPLE }}>dashboard</span></Word>
                </div>
                <div style={{ position: "absolute", right: -60, top: 170, transform: "rotate(4deg)" }}><Shot width={520} height={600} shift={120} /></div>
                <div style={{ position: "absolute", right: 60, top: 70 }}><Free size={80} /></div>
            </AbsoluteFill>
        );
    }
    if (variant === "F") {
        // C with the new words and the sticker beside the logos
        return (
            <AbsoluteFill style={{ background: BG, fontFamily: inter, alignItems: "center" }}>
                <div style={{ marginTop: 44, display: "flex", alignItems: "center", gap: 40 }}><Marks size={120} /><Free size={70} /></div>
                <div style={{ marginTop: 30, textAlign: "center" }}><Word size={108}>Your own dashboard</Word></div>
                <div style={{ position: "absolute", bottom: -40, left: 190 }}><Shot width={900} height={380} shift={80} /></div>
            </AbsoluteFill>
        );
    }
    if (variant === "A") {
        return (
            <AbsoluteFill style={{ background: BG, fontFamily: inter }}>
                <div style={{ position: "absolute", left: 60, top: 70 }}><Marks size={110} /></div>
                <div style={{ position: "absolute", left: 60, top: 330 }}>
                    <Word size={120}>Garmin</Word>
                    <Word size={120}><span style={{ color: PURPLE }}>dashboards</span></Word>
                </div>
                <div style={{ position: "absolute", right: -40, top: 150, transform: "rotate(4deg)" }}><Shot width={560} height={600} shift={120} /></div>
            </AbsoluteFill>
        );
    }
    if (variant === "B") {
        return (
            <AbsoluteFill style={{ background: BG, fontFamily: inter }}>
                <div style={{ position: "absolute", left: 50, top: 50, width: 640, height: 620 }}><Shot width={640} height={620} shift={0} /></div>
                <div style={{ position: "absolute", right: 50, top: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
                    <Img src={staticFile("logos/obsidian.png")} style={{ width: 210, height: 210 }} />
                    <div style={{ background: "#fff", borderRadius: 26, padding: "28px 40px" }}><Img src={staticFile("logos/garmin.svg")} style={{ width: 330, display: "block" }} /></div>
                    <Word size={78}>Dashboard</Word>
                </div>
            </AbsoluteFill>
        );
    }
    return (
        <AbsoluteFill style={{ background: BG, fontFamily: inter, alignItems: "center" }}>
            <div style={{ marginTop: 50 }}><Marks size={130} /></div>
            <div style={{ marginTop: 40, textAlign: "center" }}><Word size={150}>Your dashboard</Word></div>
            <div style={{ position: "absolute", bottom: -150, left: 190 }}><Shot width={900} height={380} shift={80} /></div>
        </AbsoluteFill>
    );
};
