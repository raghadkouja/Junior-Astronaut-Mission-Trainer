"use client";

/**
 * SettingsMenu.tsx  (NEW)
 * FILE LOCATION: Frontend/components/menus/SettingsMenu.tsx
 * STYLES:        Frontend/components/menus/menus.css
 *
 * Retro pause menu that opens with ESC (design from the TODO doc):
 *   MUSIC ........ ◀ ▮▮▮▮▮▮▯▯▯▯ ▶
 *   SOUNDS ....... ◀ ▮▮▮▮▮▮▮▯▯▯ ▶
 *   DEFAULT
 *   EXIT
 * Keyboard: ↑ ↓ (or W S) choose, ← → (or A D) change, ENTER select, ESC close.
 * Mouse/touch: click the arrows or the words.
 */

import { useEffect, useState } from "react";
import { resetSettings, setSettings, useSettings } from "@/lib/settings";
import { play } from "@/lib/sfx";
import "./menus.css";

type Row = "music" | "sounds" | "narrator" | "default" | "exit";

export default function SettingsMenu({
  onClose,
  onExit,
  exitLabel = "EXIT",
}: {
  onClose: () => void;
  onExit?: () => void; // leave the mission (hidden on the title screen)
  exitLabel?: string;
}) {
  const s = useSettings();
  const rows: Row[] = onExit ? ["music", "sounds", "narrator", "default", "exit"] : ["music", "sounds", "narrator", "default"];
  const [sel, setSel] = useState(0);

  function change(row: Row, d: number) {
    if (row === "music") setSettings({ music: s.music + d });
    if (row === "sounds") setSettings({ sounds: s.sounds + d });
    if (row === "narrator") setSettings({ narrator: s.narrator + d });
    play("move");
  }
  function activate(row: Row) {
    if (row === "default") {
      resetSettings();
      play("click");
    } else if (row === "exit") {
      onExit?.();
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const row = rows[sel];
      if (k === "arrowup" || k === "w") {
        e.preventDefault();
        setSel((sel + rows.length - 1) % rows.length);
        play("move");
      } else if (k === "arrowdown" || k === "s") {
        e.preventDefault();
        setSel((sel + 1) % rows.length);
        play("move");
      } else if (k === "arrowleft" || k === "a") {
        e.preventDefault();
        change(row, -1);
      } else if (k === "arrowright" || k === "d") {
        e.preventDefault();
        change(row, +1);
      } else if (k === "enter" || k === " ") {
        e.preventDefault();
        activate(row);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const bar = (v: number) => (
    <span className="sm-bar" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={i < v ? "on" : ""} />
      ))}
    </span>
  );

  return (
    <div className="sm-backdrop" role="dialog" aria-label="Settings" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sm-panel">
        <p className="sm-title">SETTINGS</p>
        <ul className="sm-list">
          {rows.map((row, i) => {
            const on = i === sel;
            const label = row === "exit" ? exitLabel : row.toUpperCase();
            const slider = row === "music" || row === "sounds" || row === "narrator";
            return (
              <li key={row} className={`sm-row ${on ? "sel" : ""}`} onPointerEnter={() => setSel(i)}>
                <span className="sm-cursor">{on ? "▶" : ""}</span>
                {slider ? (
                  <>
                    <span className="sm-label">{label}</span>
                    <span className="sm-dots" />
                    <button className="sm-arrow" aria-label={`Lower ${label}`} onClick={() => change(row, -1)}>◀</button>
                    {bar(row === "music" ? s.music : row === "sounds" ? s.sounds : s.narrator)}
                    <button className="sm-arrow" aria-label={`Raise ${label}`} onClick={() => change(row, +1)}>▶</button>
                  </>
                ) : (
                  <button className="sm-label sm-action" onClick={() => activate(row)}>
                    {label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="sm-help">↑↓ CHOOSE · ←→ CHANGE · ENTER SELECT · ESC RESUME</p>
      </div>
    </div>
  );
}
