"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { config } from "@/lib/turn-game/gameLogic";
import type { Dest } from "@/lib/turn-game/gameLogic";
import "./houston.css";

const PREFERRED_VOICES = ["Alex", "Aaron", "Google US English", "Microsoft Guy", "Microsoft David", "Fred", "Daniel"];

function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | undefined {
  const voices = synth.getVoices();
  for (const n of PREFERRED_VOICES) {
    const v = voices.find((x) => x.name.includes(n) && x.lang.startsWith("en"));
    if (v) return v;
  }
  return voices.find((v) => v.lang === "en-US") ?? voices.find((v) => v.lang.startsWith("en"));
}

function briefing(name: string, dest: Dest): string[] {
  const c = config[dest];
  const place = dest === "moon" ? "lunar" : "Martian";
  const delay =
    dest === "moon"
      ? "Radio signals take about one second to reach the Moon, so we can talk almost live."
      : "Radio signals take anywhere from 3 to 22 minutes to reach Mars, so on a real mission you would make many of these decisions on your own.";
  return [
    `${name}, this is Houston. Do you copy? Over.`,
    dest === "moon"
      ? `Welcome to Nova Outpost, Commander ${name}. A big solar storm damaged the base, and the rest of the crew was needed back on Earth, so you stayed to keep it running. The rescue ship lands in 5 days.`
      : `Welcome to your ${place} outpost, Commander ${name}. You have ${c.days} sols to keep the base running.`,
    delay,
    "Rule number one: when the sun goes down, your solar panels make no power. Charge your batteries while the sun is up.",
    "Watch your battery, oxygen, food, and cabin heat. You can run the greenhouse, recycle the air, turn up the heater, or conserve power. Every choice is a trade-off.",
    `Houston is counting on you, Commander ${name}. Good luck. Over.`,
  ];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Real NASA radio loops used short "Quindar" beeps before and after each transmission
async function beep(ctx: AudioContext | null, freq: number) {
  if (!ctx) return sleep(250);
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch {
    /* ignore audio errors */
  }
  return sleep(300);
}

export default function HoustonCall({
  name,
  dest,
  onDone,
}: {
  name: string;
  dest: Dest;
  onDone: () => void;
}) {
  const lines = useMemo(() => briefing(name, dest), [name, dest]);
  const [shown, setShown] = useState(0); // how many lines are on screen
  const [talking, setTalking] = useState(false);
  const [finished, setFinished] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next) window.speechSynthesis?.cancel();
  }

  useEffect(() => {
    let cancelled = false;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      ctx.resume();
    } catch {
      ctx = null;
    }

    const say = (text: string) =>
      new Promise<void>((resolve) => {
        const fallbackMs = 1200 + text.length * 70; // used when there's no voice or it's muted
        if (!synth || mutedRef.current) return void setTimeout(resolve, fallbackMs);
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice(synth);
        if (v) u.voice = v;
        u.lang = "en-US";
        u.rate = 0.95;
        u.pitch = 0.9;
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        u.onend = finish;
        u.onerror = finish;
        // safety net in case the browser never fires onend
        setTimeout(() => {
          if (!done) synth.cancel();
          finish();
        }, 2000 + text.length * 130);
        synth.speak(u);
      });

    (async () => {
      await sleep(600);
      for (let i = 0; i < lines.length; i++) {
        if (cancelled) return;
        setShown(i + 1);
        setTalking(true);
        await beep(ctx, 2525);
        if (cancelled) return;
        await say(lines[i]);
        if (cancelled) return;
        setTalking(false);
        await beep(ctx, 2475);
        await sleep(450);
      }
      if (!cancelled) setFinished(true);
    })();

    return () => {
      cancelled = true;
      synth?.cancel();
      ctx?.close().catch(() => {});
    };
  }, [lines]);

  return (
    <div className="houston" role="dialog" aria-label="Incoming transmission from Houston">
      <div className="rings"><i /><i /><i /></div>

      <p className="incoming">
        <span className="rec" /> INCOMING TRANSMISSION
      </p>
      <h2 className="from">MISSION CONTROL · HOUSTON, TEXAS</h2>

      <div className={`wave ${talking ? "talking" : ""}`}>
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 5) * 0.09}s` }} />
        ))}
      </div>

      <div className="captions">
        {lines.slice(0, shown).map((l, i) => (
          <p key={i} className={i === shown - 1 ? "line current" : "line"}>
            {i === shown - 1 && <b>HOUSTON: </b>}
            {l}
          </p>
        ))}
      </div>

      <div className="call-buttons">
        {finished && (
          <button className="launch" onClick={onDone}>
            📡 COPY THAT, HOUSTON!
          </button>
        )}
        <button className="small-btn" onClick={toggleMute}>
          {muted ? "🔇 Voice off" : "🔊 Voice on"}
        </button>
        {!finished && (
          <button className="small-btn" onClick={onDone}>
            Skip briefing ›
          </button>
        )}
      </div>
    </div>
  );
}