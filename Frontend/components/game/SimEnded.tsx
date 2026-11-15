"use client";

/**
 * SimEnded.tsx
 * When the mission fails, the "VR training simulation" glitches and switches off
 * block by block, then reminds the player it was only practice. After ~5 seconds
 * (or a click) the mission report appears.
 */

import { useEffect, useRef, useState } from "react";

const BLOCK = 24; //        size of each "pixel" of the switch-off, in screen pixels
const DISSOLVE_MS = 1400; // how long the screen takes to go dark
const TOTAL_MS = 5000; //    then the mission report appears

export default function SimEnded({ name, onDone }: { name: string; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const w = (c.width = Math.max(1, Math.ceil(c.clientWidth / BLOCK)));
    const h = (c.height = Math.max(1, Math.ceil(c.clientHeight / BLOCK)));
    const cells = Array.from({ length: w * h }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    let start = 0;
    let shown = 0;
    let raf = 0;
    const frame = (now: number) => {
      if (!start) start = now;
      const k = Math.min(1, (now - start) / DISSOLVE_MS);
      const target = Math.floor(cells.length * k * k); // slow at first, then faster
      for (; shown < target; shown++) {
        const i = cells[shown];
        const r = Math.random();
        g.fillStyle = r < 0.05 ? "#3be8ff" : r < 0.09 ? "#ff4fd8" : "#02040d"; // a few glitchy colored blocks
        g.fillRect(i % w, Math.floor(i / w), 1, 1);
      }
      if (k < 1) raf = requestAnimationFrame(frame);
      else {
        g.fillStyle = "#02040d";
        g.fillRect(0, 0, w, h);
        setShowText(true);
      }
    };
    raf = requestAnimationFrame(frame);
    const end = window.setTimeout(onDone, TOTAL_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(end);
    };
  }, [onDone]);

  return (
    <button className="og-simend" onClick={onDone} aria-label="Skip to the mission report">
      <canvas ref={ref} />
      {showText && (
        <p>
          <b>TRAINING SIMULATION ENDED</b>
          <span>Good try, Cadet {(name || "Astronaut").toUpperCase()}! Real astronauts practice missions many times.</span>
          <small>Click to see your mission report</small>
        </p>
      )}
    </button>
  );
}
