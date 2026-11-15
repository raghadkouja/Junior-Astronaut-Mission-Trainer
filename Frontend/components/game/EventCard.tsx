"use client";

import { useEffect } from "react";
import type { Choice, StoryEvent } from "@/lib/turn-game/story";

// The story card: the narrator's scene, a real fact, and the choices.
// Keys 1–3 pick a choice; Enter continues an info card.

const WORD: Record<string, string> = { power: "PWR", oxygen: "O₂", food: "FOOD", temp: "HEAT" };

function costs(c: Choice): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  for (const [k, v] of Object.entries(c.effects ?? {})) {
    if (typeof v === "number" && v !== 0) out.push({ text: `${v > 0 ? "▲" : "▼"}${Math.abs(v)} ${WORD[k] ?? k}`, cls: v > 0 ? "up" : "dn" });
  }
  if (c.useTurn) out.push({ text: "USES 1 ACTION", cls: "dn" });
  if (c.risk) out.push({ text: `${Math.round(c.risk.chance * 100)}% RISK: ${c.risk.label.toUpperCase()}`, cls: "dn" });
  if (c.costNote) out.push({ text: c.costNote.toUpperCase(), cls: "dn" });
  return out;
}

type Props = {
  event: StoryEvent;
  radiation?: string | null;
  onChoose: (index: number) => void;
};

export default function EventCard({ event, radiation, onChoose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= event.choices.length) {
        e.preventDefault();
        onChoose(n - 1);
      } else if (e.key === "Enter" && event.choices.length === 1) {
        e.preventDefault();
        onChoose(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onChoose]);

  return (
    <div className="og-event" role="dialog" aria-modal="true" aria-labelledby="og-event-title">
      <div className="og-eventcard og-frame">
        <p className="og-kicker">
          {/^(houston|comms)$/i.test(event.speaker) ? "📡" : "🎙"} {event.speaker.toUpperCase()}
        </p>
        <h2 id="og-event-title">{event.title}</h2>
        <p className="og-eventtext">{event.text}</p>
        {radiation && <p className="og-eventrad">☢ {radiation}</p>}
        {event.fact && (
          <aside className="og-fact">
            <b>DID YOU KNOW?</b> {event.fact.text}
            <span className="og-source">
              Source:{" "}
              {event.fact.url ? (
                <a href={event.fact.url} target="_blank" rel="noreferrer">
                  {event.fact.source}
                </a>
              ) : (
                event.fact.source
              )}
            </span>
          </aside>
        )}
        <div className="og-choices">
          {event.choices.map((c, i) => (
            <button key={c.label} className="og-choice" onClick={() => onChoose(i)} autoFocus={i === 0}>
              <span className="og-key">{i + 1}</span>
              <span className="og-choicelbl">{c.label}</span>
              {costs(c).length > 0 && (
                <span className="og-cost">
                  {costs(c).map((x) => (
                    <span key={x.text} className={x.cls}>
                      {x.text}
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
