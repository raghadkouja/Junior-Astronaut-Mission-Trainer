"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ACTIONS,
  actionFails,
  actionsLeftToday,
  canAct,
  choose,
  config,
  cToF,
  currentEvent,
  currentNotice,
  dayOf,
  dismissNotice,
  endingText,
  isDay,
  narratorHint,
  nextTurn,
  panelsDusty,
  radiationHigh,
  radiationNow,
  retryDay,
  solarNow,
  totalTurns,
} from "@/lib/turn-game/gameLogic";
import type { Action, Dest, GameState } from "@/lib/turn-game/gameLogic";
import type { StoryEvent } from "@/lib/turn-game/story";
import { createOutpost } from "./outpostEngine";
import type { FloatText, Outpost, StationId } from "./outpostEngine";
import EventCard from "./EventCard";
import "./game.css";

// Each hotbar slot is one of the real game actions.
// The station ids in the world match the Action names in gameLogic.ts.
const SLOTS: { id: Action; key: string; icon: string; label: string; up: string[]; down: string[] }[] = [
  { id: "greenhouse", key: "1", icon: "🌱", label: "GREENHOUSE", up: ["FOOD", "O₂"], down: ["PWR"] },
  { id: "recycle", key: "2", icon: "💨", label: "RECYCLE AIR", up: ["O₂"], down: ["PWR"] },
  { id: "heater", key: "3", icon: "🔥", label: "HEATER", up: ["HEAT"], down: ["PWR"] },
  { id: "conserve", key: "4", icon: "🔋", label: "CONSERVE", up: ["PWR"], down: ["HEAT"] },
  { id: "clean", key: "5", icon: "🧹", label: "CLEAN PANELS", up: ["SOLAR"], down: ["O₂"] },
  { id: "comms", key: "6", icon: "📡", label: "CALL HOUSTON", up: ["ADVICE"], down: ["PWR"] },
];

type Props = {
  dest: Dest;
  name: string;
  game: GameState;
  setGame: (g: GameState) => void;
  paused?: boolean; // true while the Houston call is on screen
  onRetry: () => void;
  onBack: () => void;
};

// Turn the change between two states into "+10 FOOD" style floating text
function diff(a: GameState, b: GameState): FloatText[] {
  const out: FloatText[] = [];
  const add = (v: number, label: string, color: string) => {
    const r = Math.round(v);
    if (r !== 0) out.push({ text: `${r > 0 ? "+" : ""}${r} ${label}`, color: r > 0 ? color : "#ff9d95" });
  };
  add(b.power - a.power, "PWR", "#ffb347");
  add(b.oxygen - a.oxygen, "O₂", "#3be8ff");
  add(b.food - a.food, "FOOD", "#7dffb0");
  add(b.temp - a.temp, "°C", "#ff8f6b");
  return out;
}

export default function GameScreen({ dest, name, game, setGame, paused = false, onRetry, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Outpost | null>(null);
  const [near, setNear] = useState<StationId | null>(null);

  const cfg = config[dest];
  const total = totalTurns(dest, game);
  const day = isDay(dest, game.turn);
  const ended = game.status !== "playing";
  const notice = ended ? null : currentNotice(game); // message cards come first
  const event = ended || notice ? null : currentEvent(game);
  const card = !!notice || !!event;
  const shownTurn = Math.min(game.turn, total);
  const dayNum = dayOf(dest, shownTurn);
  const solar = solarNow(dest, game);
  const dusty = panelsDusty(game);
  const radHigh = radiationHigh(game);

  // Keep the latest values in refs so the engine's callbacks never go stale
  const live = useRef({ dest, game, ended, setGame, card });
  useLayoutEffect(() => {
    live.current = { dest, game, ended, setGame, card };
  });

  function act(a: Action) {
    const { dest: d, game: g, ended: over, setGame: set } = live.current;
    if (over) return;
    const next = nextTurn(d, g, a);
    if (next.turn !== g.turn || next.status !== g.status) {
      const ran = !actionFails(d, g, ACTIONS[a].effects);
      if (a === "greenhouse" && ran) engine.current?.harvest(diff(g, next)); // walk in and pick
      else engine.current?.feedback(a, diff(g, next));
    }
    set(next);
  }

  function answer(i: number) {
    const { dest: d, game: g, setGame: set } = live.current;
    const choice = currentEvent(g)?.choices[i];
    const next = choose(d, g, i);
    const items = diff(g, next);
    if (items.length) engine.current?.floatText(items);
    // e.g. "hide in the shelter": walk to the habitat and go inside
    if (choice?.walkTo) engine.current?.goTo(choice.walkTo, choice.hideSeconds ?? 0);
    set(next);
  }

  function readNotice() {
    const { game: g, setGame: set } = live.current;
    set(dismissNotice(g));
  }

  // Create the world once
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const e = createOutpost(c, {
      dest,
      name,
      onNear: setNear,
      onUse: (id) => act(id),
    });
    engine.current = e;
    return () => e.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => engine.current?.setDest(dest), [dest]);
  useEffect(() => engine.current?.setName(name), [name]);
  useEffect(() => engine.current?.setNight(!day), [day]);
  useEffect(() => engine.current?.setPaused(paused || ended || card), [paused, ended, card]);
  useEffect(
    () => engine.current?.setStatus({ power: Math.round(game.power), oxygen: Math.round(game.oxygen), food: Math.round(game.food) }),
    [game.power, game.oxygen, game.food],
  );

  // Number keys 1-6: walk to that station and use it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || live.current.card || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const slot = SLOTS.find((s) => s.key === e.key);
      if (slot && !live.current.ended) engine.current?.goUse(slot.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused]);

  const meters = [
    { cls: "power", label: "BATTERY", fill: Math.round(game.power), value: String(Math.round(game.power)), sub: "", low: game.power < 30 },
    { cls: "oxygen", label: "OXYGEN", fill: Math.round(game.oxygen), value: String(Math.round(game.oxygen)), sub: "", low: game.oxygen < 30 },
    { cls: "food", label: "FOOD", fill: Math.round(game.food), value: String(Math.round(game.food)), sub: "", low: game.food < 30 },
    {
      cls: "temp",
      label: "CABIN",
      fill: Math.round((Math.max(0, game.temp) / 30) * 100),
      value: `${Math.round(game.temp)}°C`,
      sub: `${cToF(game.temp)}°F`,
      low: game.temp < 10,
    },
  ];

  const won = game.status === "won";

  return (
    <main className={`og ${dest} ${day ? "" : "night"}`}>
      <canvas ref={canvasRef} className="og-canvas" aria-label="Outpost map. Walk to a station to use it." />
      <div className="og-scan" aria-hidden="true" />
      <span className="og-corner tl" /><span className="og-corner tr" />
      <span className="og-corner bl" /><span className="og-corner br" />

      {/* Top-left: who you are + the narrator's hint */}
      <div className="og-tl">
        <section className="og-cmd og-frame">
          <p className="og-kicker">COMMANDER</p>
          <h2 className="og-name">{name.toUpperCase()}</h2>
          <div className="og-chips">
            <span className="og-chip target">TARGET: {cfg.name.toUpperCase()}</span>
            <span className={`og-chip ${day ? "day" : "nite"}`}>{day ? "☀ DAY" : dest === "moon" ? "☾ SHADOW" : "☾ NIGHT"}</span>
          </div>
        </section>
        {!ended && !card && (
          <p className="og-hint og-frame">
            <b>🎙 NARRATOR:</b> {narratorHint(dest, game, name)}
          </p>
        )}
      </div>

      {/* Top-right: clock, solar and radiation */}
      <div className="og-tr">
        <section className="og-clock og-frame">
          <span className="og-sol">
            {cfg.dayWord} {dayNum} · {day ? "DAYTIME" : dest === "moon" ? "IN SHADOW" : "NIGHTTIME"}
          </span>
          <b className="og-turn">
            TURN {String(shownTurn).padStart(2, "0")} / {total}
          </b>
          {!ended && (
            <span className="og-left">
              {actionsLeftToday(dest, game)} ACTION{actionsLeftToday(dest, game) === 1 ? "" : "S"} LEFT TODAY
            </span>
          )}
        </section>
        <section className={`og-solar og-frame ${solar > 0 ? "" : "off"}`}>
          <i className="og-sun" /> SOLAR {solar > 0 ? `+${Math.round(solar)} / TURN` : "OFFLINE"}
          {dusty ? " · DUSTY" : ""}
        </section>
        {radHigh && (
          <section className="og-solar og-frame og-rad" role="status">
            ☢ RADIATION HIGH · {radiationNow(dest, game).toFixed(0)} mSv/day
          </section>
        )}
        <button className="og-btn" onClick={onBack}>‹ CHANGE DESTINATION</button>
      </div>

      {/* Bottom-left: last report */}
      <section className="og-log og-frame">
        <p className="og-kicker">LAST REPORT</p>
        <p className="og-report">{game.log || "Awaiting orders… walk to a station and press E."}</p>
        <p className="og-tip">WASD / ARROWS · CLICK TO WALK · E TO USE · 1–6 QUICK</p>
        <p className="og-credit">{cfg.note}</p>
      </section>

      {/* Bottom-centre: day/night timeline + hotbar */}
      <div className="og-bottom">
        <div className="og-timeline" title="Day and night schedule">
          {Array.from({ length: total }, (_, i) => {
            const t = i + 1;
            return (
              <span
                key={t}
                className={`og-tick ${isDay(dest, t) ? "d" : "n"} ${t === game.turn && !ended ? "now" : ""} ${t < game.turn ? "past" : ""}`}
              />
            );
          })}
        </div>
        <div className="og-hotbar og-frame">
          {SLOTS.map((s) => {
            const check = canAct(dest, game, s.id);
            return (
              <button
                key={s.id}
                className={`og-slot ${near === s.id ? "near" : ""} ${check.ok ? "" : "blocked"}`}
                disabled={ended || paused || card}
                onClick={() => engine.current?.goUse(s.id)}
                title={check.ok ? (near === s.id ? "Use now" : "Walk there and use it") : check.reason}
              >
                <span className="og-key">{s.key}</span>
                <span className="og-ico">{s.icon}</span>
                <span className="og-lbl">{s.label}</span>
                <span className="og-cost">
                  {s.up.map((u) => <span key={u} className="up">▲{u}</span>)}
                  {s.down.map((u) => <span key={u} className="dn">▼{u}</span>)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom-right: battery-style meters */}
      <section className="og-meters og-frame" aria-label="Supplies">
        {meters.map((m) => (
          <div key={m.cls} className={`og-meter ${m.cls} ${m.low ? "low" : ""}`}>
            <div className="og-cell" role="meter" aria-valuenow={m.fill} aria-valuemin={0} aria-valuemax={100} aria-label={m.label}>
              <i className="og-fill" style={{ height: `calc(${m.fill}% - 4px)` }} />
            </div>
            <b className="og-mval">{m.value}</b>
            {m.sub && <span className="og-msub">{m.sub}</span>}
            <span className="og-mlabel">{m.label}</span>
          </div>
        ))}
      </section>

      {/* Message card (Houston's answer, end of the day) */}
      {notice && !paused && (
        <EventCard
          event={{ id: "notice", dest, title: notice.title, speaker: notice.speaker, text: notice.text, choices: [{ label: "OK", info: true }] } satisfies StoryEvent}
          onChoose={readNotice}
        />
      )}

      {/* Story event waiting for an answer */}
      {event && !paused && (
        <EventCard
          event={event}
          radiation={radHigh ? `Radiation right now: ${radiationNow(dest, game).toFixed(0)} mSv per day (a normal day here is about ${cfg.radiationPerDay.toFixed(1)} mSv).` : null}
          onChoose={answer}
        />
      )}

      {ended && (
        <div className="og-end">
          <div className={`og-endcard og-frame ${game.status}`}>
            <p className="og-kicker">{won ? "MISSION COMPLETE" : "MISSION FAILED"}</p>
            <h2>
              {won
                ? game.ending === "hero"
                  ? `Hero ending, Commander ${name}! 🏆`
                  : `You made it, Commander ${name}! 😅`
                : "Emergency evacuation"}
            </h2>
            <p>{endingText(dest, game)}</p>
            <div className="og-endbtns">
              {!won && game.dayStart && (
                <button className="og-launch" onClick={() => setGame(retryDay(game))}>
                  ▶ TRY {cfg.dayWord} {dayOf(dest, game.dayStart.turn)} AGAIN
                </button>
              )}
              <button className={`og-launch ${won ? "" : "ghost"}`} onClick={onRetry}>
                {won ? "▶ PLAY AGAIN" : "START OVER"}
              </button>
              <button className="og-launch ghost" onClick={onBack}>CHANGE DESTINATION</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
