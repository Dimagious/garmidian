import React from "react";
import { Composition, Still } from "remotion";
import { Overview } from "./Overview";
import { Thumb } from "./Thumb";
import { FPS, H, TOTAL, W } from "./plan";

export const RemotionRoot: React.FC = () => (
    <>
        <Composition id="GarmyOverview" component={Overview} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
        {(["A", "B", "C", "D", "E", "F", "G"] as const).map((v) => (
            <Still key={v} id={`Thumb${v}`} component={Thumb} width={1280} height={720} defaultProps={{ variant: v }} />
        ))}
    </>
);
