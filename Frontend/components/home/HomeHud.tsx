"use client";

// components/home/HomeHud.tsx  (UPDATED)
// SPEED: only the selected planet video is loaded (before, BOTH videos,
// including a 4K one, played at the same time). On slow computers a
// still picture is shown instead of the video.
// NEW: mission plan for the 5-day story, live NASA solar flare count,
// and a SETTINGS (ESC) button.

import { useEffect, useState, useSyncExternalStore } from "react";
import { MISSION, START } from "@/lib/mission/config";
import type { Dest } from "@/lib/mission/config";
import type { SpaceWeather } from "@/lib/mission/nasaData";
import { destinations } from "@/lib/turn-game/destinations";
import { guessQuality } from "@/components/game/outpostEngine";
import "./hud.css";
import { setSettings, useSettings } from "@/lib/settings";
import { speak } from "@/lib/narrator";
import { funFacts } from "@/lib/turn-game/funFacts";

type Props = {
  screen: "title" | "name";
  dest: Dest;
  setDest: (d: Dest) => void;
  name: string;
  setName: (n: string) => void;
  onLaunch: () => void; // title -> name screen
  onBegin: () => void; // name screen -> Houston call
  onSettings: () => void;
  weather: SpaceWeather | null;
};

const keys = Object.keys(destinations) as Dest[];
const noop = () => () => {};

// Where each target sits on the radar (Earth is the centre).
// The Moon is drawn close and Mars near the edge so kids "see" the distance.
const blips: Record<Dest, { x: number; y: number }> = {
  moon: { x: 128, y: 78 },
  mars: { x: 44, y: 150 },
};

function level(v: number) {
  if (v >= 80) return { word: "HARD", cls: "hot" };
  if (v >= 60) return { word: "TRICKY", cls: "warm" };
  return { word: "OK", cls: "cool" };
}

function useEarthClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now ?? "--:--:--";
}
function useRotatingFact(dest: Dest) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, [dest]);
  const list = funFacts[dest];
  return list[i % list.length];
}

function Radar({ dest, setDest }: { dest: Dest; setDest: (d: Dest) => void }) {
  return (
    <svg className="radar" viewBox="0 0 200 200" role="group" aria-label="Navigation radar: pick a destination">
      <defs>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      {[90, 66, 42, 18].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} className="ring" />
      ))}
      <line x1="10" y1="100" x2="190" y2="100" className="ring" />
      <line x1="100" y1="10" x2="100" y2="190" className="ring" />
      <g className="sweep">
        <path d="M100 100 L190 100 A90 90 0 0 0 163.6 36.4 Z" fill="url(#sweep)" />
      </g>
      {/* Earth = home base at the centre */}
      <circle cx="100" cy="100" r="5" className="earth" />
      <text x="100" y="117" className="blip-label dim">EARTH</text>

      {keys.map((k) => {
        const b = blips[k];
        const on = dest === k;
        return (
          <g
            key={k}
            className={`blip ${k} ${on ? "on" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`Select ${destinations[k].name}`}
            onClick={() => setDest(k)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDest(k)}
          >
            <circle cx={b.x} cy={b.y} r="16" className="hit" />
            {on && <circle cx={b.x} cy={b.y} r="11" className="lock" />}
            <circle cx={b.x} cy={b.y} r="5" className="dot" />
            <text x={b.x} y={b.y - 15} className="blip-label">
              {destinations[k].name.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Reticle() {
  return (
    <svg className="reticle" viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="190" className="r-outer" />
      <g className="r-spin">
        {Array.from({ length: 36 }, (_, i) => (
          <line
            key={i}
            x1="200"
            y1="14"
            x2="200"
            y2={i % 3 === 0 ? 30 : 22}
            transform={`rotate(${i * 10} 200 200)`}
          />
        ))}
      </g>
      <circle cx="200" cy="200" r="150" className="r-dash" />
      <path d="M200 70 L188 92 H212 Z" className="r-tri" />
      <path d="M60 200 H110 M290 200 H340 M200 310 V340" className="r-cross" />
    </svg>
  );
}

// Round dial like the cockpit reference; shows the supplies you start with.
function Dial({ label, value }: { label: string; value: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <div className="dial">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="dial-bg" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className="dial-fg"
          strokeDasharray={`${(value / 100) * circ} ${circ}`}
        />
        <text x="32" y="36">{value}</text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

function Waveform() {
  const bars = [4, 9, 6, 14, 10, 18, 12, 22, 15, 9, 19, 13, 24, 16, 8, 20, 11, 17, 7, 13, 21, 10, 15, 6];
  return (
    <div className="hud-wave" aria-hidden="true">
      {bars.map((h, i) => (
        <span key={i} style={{ height: `${h * 4}%`, animationDelay: `${(i % 6) * 0.15}s` }} />
      ))}
    </div>
  );
}

export default function HomeHud({ screen, dest, setDest, name, setName, onLaunch, onBegin, onSettings, weather }: Props) {
  const d = destinations[dest];
    const settings = useSettings();
  const narratorOn = settings.narrator > 0;

  function toggleNarrator() {
    if (narratorOn) {
      setSettings({ narrator: 0 });
      window.speechSynthesis?.cancel(); // stop talking right away
    } else {
      setSettings({ narrator: 7 });
      speak(`Narrator on. ${fact.text}`);
    }
  }
  const fact = useRotatingFact(dest);
  const clock = useEarthClock();
  const cleanName = name.trim();
  // slow computer → show a still picture instead of the video
  const still = useSyncExternalStore(noop, () => guessQuality() === "low", () => false);
  const bigRisk = d.stats.find(([l]) => l === "BIG RISK")?.[1] ?? "";

  return (
    <main className={`hud-home ${dest}`}>
      <div className="hud-bg" aria-hidden="true" />

      {/* ===== Top status strip ===== */}
      <header className="hud-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nasa-logo.png"
          alt="NASA logo"
          className="hud-logo"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <div className="hud-strip frame">
          <span>SYSTEM: <b>OUTPOST TRAINER</b></span>
          <span>TARGET: <b>{d.name.toUpperCase()}</b></span>
          <span>RADIO DELAY: <b>{d.delay}</b></span>
          <span>EARTH TIME: <b>{clock}</b></span>
        </div>
        <div className="hud-online">
          <i className="led" /> SYSTEMS ONLINE
        </div>
      </header>

      {/* ===== Main cockpit ===== */}
      <section className="hud-main">
        {/* Left: navigation radar + destination facts */}
        <aside className="hud-panel frame">
          <p className="panel-title">NAV · TAP A TARGET</p>
          <Radar dest={dest} setDest={setDest} />
          <ul className="readout">
            {d.stats.map(([label, value]) => (
              <li key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </li>
            ))}
            <li>
              <span>DISTANCE</span>
              <b>{d.distance}</b>
            </li>
          </ul>

          <p className="panel-title gap">MISSION PLAN</p>
          <ul className="readout">
            <li>
              <span>RESCUE SHIP</span>
              <b>in {MISSION.days} {dest === "mars" ? "sols" : "days"}</b>
            </li>
            <li>
              <span>ONE DAY</span>
              <b>{MISSION.daySeconds / 60} real minutes</b>
            </li>
            <li>
              <span>AT NIGHT</span>
              <b className="warm">0 solar power</b>
            </li>
            <li>
              <span>SUN (30 DAYS)</span>
              <b className={weather?.live ? "" : "warm"}>
                {weather ? `${weather.counts.X} X · ${weather.counts.M} M flares ${weather.live ? "· LIVE" : "· ARCHIVED"}` : "checking NASA…"}
              </b>
            </li>
          </ul>
        </aside>

        {/* Centre: viewport with planet video and targeting reticle */}
        <div className="hud-view frame">
          {still ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={dest} className="hud-video show" src={d.poster} alt={`${d.name} from space`} />
          ) : (
            <video
              key={dest}
              ref={(v) => {
                if (v) {
                  v.muted = true;
                  v.play().catch(() => {}); // if the browser still says no, the poster stays
                }
              }}
              className="hud-video show"
              src={d.video}
              poster={d.poster}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          )}
          <div className="hud-scan" />
          <Reticle />
          <span className="corner tl" /><span className="corner tr" />
          <span className="corner bl" /><span className="corner br" />
          <div className="target-chip">PRIMARY TARGET: {d.name.toUpperCase()}</div>

          <div className="hud-content">
            {screen === "title" ? (
              <>
                <h1 className="hud-title">
                  Junior Astronaut
                  <span>Mission Trainer</span>
                </h1>
                <p className="hud-sub">
                  Last Light at Nova Outpost: survive 5 days alone. Balance battery,
                  oxygen, food and heat, fix what breaks, and hide from real solar storms.
                </p>
                <p className="hud-blurb" key={fact.text}>
                    {fact.text}{" "}
                    <a className="hud-source" href={fact.url} target="_blank" rel="noreferrer">
                        Source: {fact.source}
                    </a>
                </p>
              </>
            ) : (
              <>
                <h1 className="hud-title small">Welcome aboard!</h1>
                <p className="hud-sub">What should Mission Control call you, astronaut?</p>
                <input
                  className="hud-input"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 16))}
                  onKeyDown={(e) => e.key === "Enter" && onBegin()}
                  placeholder="Your name"
                  aria-label="Your astronaut name"
                  autoFocus
                />
                <button className="hud-launch" onClick={onBegin} disabled={!cleanName}>
                  BEGIN TRAINING
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right: challenge meter + comms signal */}
        <aside className="hud-panel frame">
          <p className="panel-title">CHALLENGE METER</p>
          {d.gauges.map(([label, value]) => {
            const lv = level(value);
            const lit = Math.round(value / 10);
            return (
              <div key={label} className="seg-gauge">
                <div className="seg-label">
                  <span>{label}</span>
                  <b className={lv.cls}>{lv.word}</b>
                </div>
                <div className="segs" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} challenge`}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <i key={i} className={i < lit ? `lit ${lv.cls}` : ""} />
                  ))}
                </div>
              </div>
            );
          })}

          <p className="panel-title gap">STARTING SUPPLIES</p>
          <div className="dials">
            <Dial label="BATTERY" value={START.battery} />
            <Dial label="OXYGEN" value={START.oxygen} />
            <Dial label="FOOD" value={START.food} />
          </div>

          <p className="panel-title gap">SIGNAL TO EARTH</p>
          <Waveform />
          <p className="signal-note">
            Messages take <b>{d.delay}</b> to reach Earth. Radio travels at the
            speed of light, but space is huge!
          </p>

          <div className="hud-warn">⚠ BIG RISK: {String(bigRisk).toUpperCase()}</div>
        </aside>
      </section>

      {/* ===== Control deck ===== */}
      <footer className="hud-deck frame">
        <div className="deck-group">
          <p className="panel-title">CHOOSE DESTINATION</p>
          <div className="dest-keys">
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => setDest(k)}
                className={`dest-key ${k} ${dest === k ? "active" : ""}`}
                aria-pressed={dest === k}
              >
                <span className="dk-dot" />
                {destinations[k].name.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {screen === "title" ? (
          <button className="hud-launch big" onClick={onLaunch}>
            ▶ LAUNCH MISSION
          </button>
        ) : (
          <p className="deck-hint">Type your name in the window above ↑</p>
        )}
        <button
          className={`dest-key ${narratorOn ? "active" : ""}`}
          onClick={toggleNarrator}
          aria-pressed={narratorOn}
          title="Read the game out loud"
        >
          {narratorOn ? "🔊 NARRATOR: ON" : "🔈 NARRATOR: OFF"}
        </button>
        <button className="dest-key" onClick={onSettings} title="Music and sound volume">
          ⚙ SETTINGS · ESC
        </button>
        <p className="hud-credit">Video &amp; logo: NASA</p>
      </footer>
    </main>
  );
}
