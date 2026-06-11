"use client";

import type { CSSProperties } from "react";

type JarvisCoreProps = {
  activeMark?: "3" | "6" | "9" | null;
  analyser?: AnalyserNode | null;
  armAngle?: number;
  bias?: "long" | "short" | "neutral";
  pnl?: number;
  state?: "idle" | "listening" | "speaking";
};

export default function JarvisCore({
  activeMark = null,
  armAngle = 0,
  bias = "neutral",
  pnl = 0,
  state = "idle"
}: JarvisCoreProps) {
  return (
    <div
      className={`jarvis-core ${state}`}
      style={{ "--arm-angle": `${armAngle}deg` } as CSSProperties}
      aria-label={`Jarvis core ${state}`}
      role="img"
    >
      <div className="core-ring ring-a" />
      <div className="core-ring ring-b" />
      <div className="core-ring ring-c" />
      <div className={`core-hand ${activeMark ? "is-active" : ""}`} />
      <div className="core-369">
        <span className={`mark mark-three ${activeMark === "3" ? "is-active" : ""}`}>3</span>
        <span className={`mark mark-six ${activeMark === "6" ? "is-active" : ""}`}>6</span>
        <span className={`mark mark-nine ${activeMark === "9" ? "is-active" : ""}`}>9</span>
      </div>
      <div className="core-center">
        <span>AMD</span>
        <strong>{state.toUpperCase()}</strong>
      </div>
      <div className="core-readout bias-readout">{bias.toUpperCase()}</div>
      <div className="core-readout pnl-readout">${Math.round(pnl)}</div>
    </div>
  );
}
