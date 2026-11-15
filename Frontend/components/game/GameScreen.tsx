"use client";



import { useCallback, useEffect, useRef, useState } from "react";
import { MISSION, RADIATION, RATS, ROCKS, TASKS, TEMP, radiationSpeed } from "@/lib/mission/config";
import type { Dest, PartId, StationId, SystemId, TaskId } from "@/lib/mission/config";
import type { Apod, SpaceWeather } from "@/lib/mission/nasaData";
import {
  choose, clockLabel, cToF, dayPhase, dismissCard, isBroken, newSim, objectives, outsideTempC,
  repair, roverFact, snapshot, wakeUp, collectRock, narratorHint, solarOutput, startTask, stationAction, sunLevel, tasksToNextFact, tick,
} from "@/lib/mission/sim";
import type { Card, Diff, RepairMode, Sim, Toast } from "@/lib/mission/sim";
import { createOutpost, guessQuality } from "./outpostEngine";
import type { FloatText, Outpost, Quality, StationInfo } from "./outpostEngine";
import EventCard from "./EventCard";
import RepairGame from "./RepairGame";
import SimEnded from "./SimEnded";
import InventoryPanel from "@/components/menus/InventoryPanel";
import type { Tab as InvTab } from "@/components/menus/InventoryPanel";
import { play } from "@/lib/sfx";
import "./game.css";
import { speak } from "@/lib/narrator";

// Hotbar: keys 1–8 walk to that station and use it
const SLOTS: { id: StationId; key: string; icon: string; label: string; task: TaskId }[] = [
  { id: "habitat", key: "1", icon: "🔥", label: "HEATER", task: "heater" },
  { id: "greenhouse", key: "2", icon: "🌱", label: "GREENHOUSE", task: "greenhouse" },
  { id: "recycle", key: "3", icon: "♻️", label: "RECYCLE AIR", task: "recycle" },
  { id: "conserve", key: "4", icon: "🔌", label: "CONSERVE", task: "conserve" },
  { id: "solar", key: "5", icon: "🧹", label: "CLEAN PANELS", task: "clean" },
  { id: "comms", key: "6", icon: "📡", label: "CALL HOUSTON", task: "call" },
  { id: "beacon", key: "7", icon: "🚨", label: "BEACON", task: "beacon" },
  { id: "lab", key: "8", icon: "🐀", label: "RAT LAB", task: "feedRats" },
];
const STATIONS: StationId[] = [...SLOTS.map((s) => s.id), "bed"]; // + the bed inside the base (no hotbar slot)

type Props = {
  dest: Dest;
  name: string;
  weather: SpaceWeather; // page.tsx waits for NASA data before showing the game
  apod: Apod | null;
  paused?: boolean; // true while the Houston call is on screen
  onRetry: () => void;
  onBack: () => void;
};

type Hud = ReturnType<typeof readHud>;

function readHud(s: Sim) {
  return {
    day: s.day,
    hint: narratorHint(s),
    clock: clockLabel(s),
    phase: dayPhase(s),
    sun: sunLevel(s),
    battery: s.battery,
    oxygen: s.oxygen,
    food: s.food,
    stamina: s.stamina,
    winded: s.winded,
    tempC: s.tempC,
    outside: outsideTempC(s),
    solarPct: Math.round((solarOutput(s) / 0.62) * 100),
    solarEff: s.solarEff,
    blackout: s.blackout,
    sick: s.sick,
    sheltering: s.sheltering,
    storm: s.storm.phase,
    stormLeft: Math.max(0, Math.ceil(s.storm.endsAt - s.elapsed)),
    stormDose: s.stormDose,
    flare: s.storm.flare?.classType ?? "",
    dose: s.doseMsv,
    dust: s.elapsed < s.dustUntil,
    cold: s.coldDay || s.elapsed < s.coldUntil,
    commsWeak: s.commsWeak,
    calling: s.call ? Math.max(0, Math.ceil(s.call.arrivesAt - s.elapsed)) : -1,
    overtime: s.overtime >= 0 ? Math.ceil(s.overtime) : -1,
    beaconOn: s.beaconOn,
    rats: { ...s.rats },
    sleeping: s.sleeping,
    log: s.log.slice(),
    objectives: objectives(s),
    slowed: radiationSpeed(s.doseMsv) < 0.999,
    status: s.status,
    ending: s.ending,
    failWhy: s.failWhy,
    stats: s.stats,
    tasksDone: s.tasksDone,
    facts: s.facts.length,
    oneWay: s.oneWayLabel,
    parts: { ...s.parts } as Record<PartId, number>,
    broken: (Object.keys(s.broken) as SystemId[]).filter((id) => isBroken(s, id)),
    patched: (Object.keys(s.broken) as SystemId[]).filter((id) => !isBroken(s, id)),
    actions: Object.fromEntries(STATIONS.map((id) => [id, stationAction(s, id)])) as Record<StationId, ReturnType<typeof stationAction>>,
  };
}

const level = (v: number) => (v >= 60 ? "ok" : v >= 30 ? "mid" : "low");

function floatsFor(a: Diff, b: Diff): FloatText[] {
  const out: FloatText[] = [];
  const add = (v: number, label: string, color: string) => {
    const r = Math.round(v);
    if (Math.abs(r) >= 2) out.push({ text: `${r > 0 ? "+" : ""}${r} ${label}`, color: r > 0 ? color : "#ff9d95" });
  };
  add(b.battery - a.battery, "PWR", "#ffb347");
  add(b.oxygen - a.oxygen, "O₂", "#3be8ff");
  add(b.food - a.food, "FOOD", "#7dffb0");
  add(b.tempC - a.tempC, "°C", "#ff9a6b");
  return out;
}

export default function GameScreen({ dest, name, weather, apod, paused = false, onRetry, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Outpost | null>(null);
  // One mission = one Sim object. tick() changes it in place every frame;
  // React reads a copy (hud) 5 times a second.
  const [sim] = useState<Sim>(() => newSim(dest, weather));
  const [hud, setHud] = useState<Hud>(() => readHud(sim));
  const [card, setCard] = useState<Card | null>(null);
  const [menu, setMenu] = useState<"none" | "inventory">("none");
  const [invTab, setInvTab] = useState<InvTab>("objectives");
  const [repairing, setRepairing] = useState<SystemId | null>(null);
  const [toasts, setToasts] = useState<(Toast & { born: number })[]>([]);
  const [near, setNear] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>("high");
  const [rocks, setRocks] = useState({ got: 0, total: 8 }); // space rocks picked up
  const [partyDone, setPartyDone] = useState(false); //       rescue party finished → show the end card
  const [simDone, setSimDone] = useState(false); //           lost: "training sim ended" scene finished
  const finishSim = useCallback(() => setSimDone(true), []);

  // live values for callbacks that outlive renders
  const live = useRef({ paused, menu, card, repairing });
  useEffect(() => {
    live.current = { paused, menu, card, repairing };
  });
  const blocked = () => {
    const l = live.current;
    return l.paused || l.menu !== "none" || !!l.card;
  };

  const pendingTask = useRef<{ station: StationId; before: Diff } | null>(null);
  const seenToast = useRef(0);
  const lastHud = useRef(0);
  const lastSync = useRef(0);
  const endHandled = useRef(false);

  const sync = useCallback(() => {
    const s = sim;
    const e = engine.current;
    if (!e) return;
    e.setDarkness(1 - sunLevel(s));
    e.setStatus({ power: s.battery, oxygen: s.oxygen, food: s.food });
    const info: Partial<Record<StationId, StationInfo>> = {};
    for (const id of STATIONS) {
      const a = stationAction(s, id);
      info[id] = { verb: a.verb, broken: a.kind === "repair", blocked: a.kind === "blocked" };
    }
    e.setStations(info);
    e.setWeather({
      storm: s.storm.phase === "warning" ? 1 : s.storm.phase === "active" ? 2 : 0,
      dust: s.elapsed < s.dustUntil,
      cold: s.coldDay || s.elapsed < s.coldUntil,
    });
    e.setHidden(s.sheltering);
    e.setCanSprint(!s.sick && !s.winded);
    // resting after a storm = 80% speed; a big total dose slows you down more
    e.setSpeedMul((s.sick ? 0.8 : 1) * radiationSpeed(s.doseMsv));
    e.setBeacon(s.beaconOn);
    e.setPanelDust(1 - s.solarEff);
    e.setRats({ health: s.rats.health, shielded: s.rats.shielded, fed: s.rats.fedToday });
    e.setSleeping(s.sleeping);

    // new toasts → screen + sounds
    const fresh = s.toasts.filter((t) => t.id > seenToast.current);
    if (fresh.length) {
      seenToast.current = fresh[fresh.length - 1].id;
      const now = performance.now();
      setToasts((old) => [...old.filter((t) => now - t.born < 5000), ...fresh.map((t) => ({ ...t, born: now }))].slice(-4));
      const kinds = fresh.map((t) => t.kind);
      speak(fresh[fresh.length - 1].text);
      if (fresh.some((t) => t.text.startsWith("⚠ BREAKDOWN") || t.text.includes("failed!"))) play("break");
      else if (kinds.includes("fact")) play("fact");
      else if (kinds.includes("bad")) play("alarm");
      else if (kinds.includes("good")) play("done");
    }
    // pop-up cards
    const top = s.cards[0] ?? null;
    if (top !== live.current.card) {
      if (top) speak([top.title, ...top.lines].join(". "));
      if (top?.kind === "storm") play("alarm");
      if (top?.kind === "houston") play("radio");
      setCard(top);
    }
  }, [sim]);

  function activateStation(id: StationId) {
    const s = sim;
    if (blocked() || live.current.repairing || s.status !== "playing") return;
    if (s.task) return;
    const a = stationAction(s, id);
    if (a.kind === "repair") {
      setRepairing(a.system);
      play("click");
      return;
    }
    const before = snapshot(s);
    const r = startTask(s, id);
    if (r.kind === "task") {
      pendingTask.current = { station: id, before };
      play("click");
    } else if (r.kind === "blocked") play("error");
    sync();
  }

  function finishRepair(mode: RepairMode) {
    if (repairing) {
      const before = snapshot(sim);
      repair(sim, repairing, mode);
      engine.current?.feedback(repairing, floatsFor(before, snapshot(sim)));
      engine.current?.playFix(repairing, mode === "tape" ? "tape" : "drill"); // drill + sparks, or duct tape
    }
    setRepairing(null);
    sync();
  }

  // ---- the engine + mission clock ----
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const q = guessQuality();
    setQuality(q);
    const e = createOutpost(c, {
      dest,
      name,
      quality: q,
      onNear: (id) => setNear(id),
      onUse: (id) => {
        const station = STATIONS.find((candidate) => candidate === id);
        if (station) activateStation(station);
      },
      onQuality: (quality) => setQuality(quality),
      onRock: (got, total) => {
        setRocks({ got, total });
        collectRock(sim, got, total);
        play("fixed");
        return `+${ROCKS.oxygen} OXYGEN`;
      },
      onRover: () => {
        roverFact(sim); // the rover's "!" → a fun fact card
        play("fact");
        sync();
      },
      onFrame: (dt) => {
        const s = sim;
        if (!blocked() && s.status === "playing") {
          const wasTask = s.task;
          tick(s, dt, { sprinting: e.isSprinting() });
          // a job just finished → floating numbers
          if (wasTask && !s.task && pendingTask.current) {
            e.feedback(pendingTask.current.station, floatsFor(pendingTask.current.before, snapshot(s)));
            pendingTask.current = null;
          }
        }
        e.setProgress(s.task ? 1 - s.task.left / s.task.total : null);
        // greenhouse = walk in and harvest, shelter = walk into the habitat, clean = wipe the solar panels
        const job = s.task?.id;
        e.setScene(
          job === "greenhouse" ? "harvest" : job === "shelter" ? "shelter" : job === "clean" ? "clean" : job === "feedRats" ? "feed" : null,
        );
        const now = performance.now();
        if (now - lastSync.current > 100) {
          lastSync.current = now;
          sync();
        }
        if (now - lastHud.current > 200) {
          lastHud.current = now;
          setHud(readHud(s));
        }
      },
    });
    engine.current = e;
    sync();
    return () => e.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showEnd = (hud.status === "lost" && simDone) || partyDone;
  const anyOverlay = paused || menu !== "none" || !!card || !!repairing || (hud.status !== "playing" && showEnd);
  useEffect(() => engine.current?.setPaused(anyOverlay), [anyOverlay]);
  useEffect(() => { speak(hud.hint, false); }, [hud.hint]);

  // win / lose
  useEffect(() => {
    if (hud.status === "playing" || endHandled.current) return;
    endHandled.current = true;
    if (hud.status === "won") {
      engine.current?.setLanding(true);
      play("win");
      // let the ship land and the party play before the end card appears
      window.setTimeout(() => setPartyDone(true), 9000); // ship lands (4 s) + 5 s of party
    } else play("lose");
  }, [hud]);

  // ---- keyboard: E inventory, ESC inventory → settings tab, 1–8 quick travel ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const l = live.current;
      if (l.paused || l.card || l.repairing) return;
      if (sim.sleeping) {
        // any key wakes you up
        e.preventDefault();
        wakeUp(sim);
        return;
      }
      const k = e.key.toLowerCase();
      if (l.menu === "none") {
        if (k === "escape") {
          e.preventDefault();
          setInvTab("settings");
          setMenu("inventory");
          play("click");
        } else if (k === "e" || k === "tab" || k === "i") {
          e.preventDefault();
          if (sim.status === "playing") {
            setInvTab("objectives");
            setMenu("inventory");
            play("click");
          }
        } else if (!e.repeat) {
          const slot = SLOTS.find((s) => s.key === k);
          if (slot) engine.current?.goUse(slot.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sim]);

  // expire toasts
  useEffect(() => {
    if (!toasts.length) return;
    const id = window.setTimeout(() => {
      const now = performance.now();
      setToasts((old) => old.filter((t) => now - t.born < 5000));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [toasts]);

  const s = sim;
  const isMars = dest === "mars";
  const dayWord = isMars ? "SOL" : "DAY";
  const phaseWord = hud.sun > 0.95 ? "DAYLIGHT" : hud.sun > 0.05 ? (hud.phase > 0.9 ? "SUNRISE" : "SUNSET") : "NIGHT";
  const tempPct = Math.max(0, Math.min(100, (hud.tempC / 32) * 100));
  const ended = hud.status !== "playing";

  const meters = [
    { cls: "power", label: "BATTERY",  v: hud.battery },
    { cls: "oxygen", label: "OXYGEN",  v: hud.oxygen },
    { cls: "food", label: "FOOD", v: hud.food },
    { cls: "stamina", label: "STAMINA", v: hud.stamina },
  ];

  const costChips = (task: TaskId) => {
    const e = TASKS[task].effects;
    const chips: { t: string; up: boolean }[] = [];
    if (e.food) chips.push({ t: "FOOD", up: e.food > 0 });
    if (e.oxygen) chips.push({ t: "O₂", up: e.oxygen > 0 });
    if (e.tempC) chips.push({ t: "°C", up: e.tempC > 0 });
    if (e.battery) chips.push({ t: "PWR", up: e.battery > 0 });
    return chips;
  };

  return (
    <main className={`og ${dest} ${hud.sun < 0.5 ? "night" : ""} ${quality === "low" ? "lowfx" : ""} ${hud.blackout ? "blackout" : ""}`}>
      <canvas ref={canvasRef} className="og-canvas" aria-label="Outpost map. Walk to a building and press space to use it." />
      <div className="og-scan" aria-hidden="true" />
      {hud.cold && <div className="og-frost" aria-hidden="true" />}

      {/* ---------- Top-left: commander + today's objectives ---------- */}
      <div className="og-tl">
        <section className="og-cmd og-frame">
          <p className="og-kicker">COMMANDER · {isMars ? "JEZERO CRATER, MARS" : "MOON SOUTH POLE"}</p>
          <h2 className="og-name">{name.toUpperCase()}</h2>
          <div className="og-chips">
            <span className="og-chip target">🚀 RESCUE: END OF {dayWord} {MISSION.days}</span>
            <span className={`og-chip ${hud.rats.health < 50 ? "hot" : ""}`}>🐀 RATS {Math.round(hud.rats.health)}%</span>
            {hud.sick && <span className="og-chip hot">🤒 RESTING</span>}
            {hud.slowed && <span className="og-chip hot">☢ SLOWED</span>}
            {hud.sheltering && <span className="og-chip ok">🛡️ SHELTERED</span>}
          </div>
          {!ended && (
            <div className="og-goals">
              <p className="og-kicker">
                {dayWord} {hud.day} OBJECTIVES · {hud.objectives.filter((o) => o.done).length}/{hud.objectives.length}
              </p>
              <ul>
                {hud.objectives.map((o) => (
                  <li key={o.text} className={o.done ? "done" : ""}>
                    <span className="og-box">{o.done ? "✔" : ""}</span>
                    {o.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* ---------- Top-right: real-time clock ---------- */}
      <div className="og-tr">
        <section className="og-clock og-frame">
          <span className="og-sol">
            {dayWord} {hud.day} / {MISSION.days} · {phaseWord}
          </span>
          <b className="og-turn">{hud.clock}</b>
          <div className="og-daybar" aria-label="Day and night">
            <i className="og-sunset" style={{ left: `${MISSION.sunset * 100}%` }} />
            <i className="og-now" style={{ left: `${hud.phase * 100}%` }}>{hud.sun > 0.5 ? "☀" : "☾"}</i>
          </div>
        </section>
        <section className={`og-solar og-frame ${hud.solarPct > 3 ? "" : "off"}`}>
          <i className="og-sun" /> SOLAR {hud.solarPct > 3 ? `${hud.solarPct}%` : "OFFLINE"}
          {hud.solarEff < 0.95 && <em> · DUSTY {Math.round(hud.solarEff * 100)}%</em>}
        </section>
        <section className="og-solar og-frame">
          🌡 OUTSIDE {hud.outside} °C <em>({isMars ? "Curiosity REMS" : "LRO Diviner"})</em>
        </section>
        <section className={`og-solar og-frame ${hud.commsWeak ? "off" : ""}`}>
          📡 RADIO DELAY {hud.oneWay}
          {hud.commsWeak ? " · NO SIGNAL" : hud.calling >= 0 ? ` · REPLY IN ${hud.calling}s` : ""}
        </section>
      </div>

      {/* ---------- Top-centre: alerts ---------- */}
      <div className="og-alerts" aria-live="polite">
        {hud.blackout && <p className="og-banner bad">🔌 BLACKOUT! Air &amp; heat are OFF. Conserve power at the battery bank!</p>}
        {hud.storm === "warning" && (
          <p className="og-banner warn">☢ {hud.flare} FLARE: STORM HITS IN {hud.stormLeft}s → SHELTER IN THE HABITAT</p>
        )}
        {hud.storm === "active" && (
          <p className="og-banner bad">☢ RADIATION STORM · {hud.stormLeft}s LEFT {hud.sheltering ? "· YOU ARE SAFE" : "· GET TO SHELTER!"}</p>
        )}
        {hud.overtime >= 0 && <p className="og-banner bad">🚀 SHIP CAN&apos;T FIND THE PAD! POWER THE BEACON ({hud.overtime}s)</p>}
        {toasts.map((t) => (
          <p key={t.id} className={`og-toast ${t.kind}`}>{t.text}</p>
        ))}
      </div>

      {/* ---------- Radiation meter (appears in storms) ---------- */}
      {(hud.storm !== "none" || hud.stormDose > 0.05) && !ended && (
        <section className="og-rad og-frame" aria-label="Radiation meter">
          <p className="og-kicker">☢ STORM RADIATION DOSE</p>
          <div className="og-radbar">
            <i className="fill" style={{ width: `${Math.min(100, (hud.stormDose / (RADIATION.sickAt * 1.4)) * 100)}%` }} />
            <i className="mark" style={{ left: `${(RADIATION.sickAt / (RADIATION.sickAt * 1.4)) * 100}%` }} title="Rest order" />
          </div>
          <p className="og-radtxt">
            <b>{hud.stormDose.toFixed(1)} mSv</b> · normal ISS day: {RADIATION.issPerDay.low}–{RADIATION.issPerDay.high} mSv · rest order at {RADIATION.sickAt}
          </p>
        </section>
      )}

      {/* ---------- Bottom-centre: station hotbar ---------- */}
      <div className="og-bottom">
        <div className="og-hotbar og-frame">
          {SLOTS.map((sl) => {
            const a = hud.actions[sl.id];
            const broken = a.kind === "repair";
            const dim = a.kind === "blocked";
            const label =
              sl.id === "habitat" && a.kind === "task" && a.task === "shelter" ? "SHELTER"
              : sl.id === "habitat" && a.kind === "leave" ? "LEAVE"
              : sl.id === "lab" && a.kind === "task" && a.task === "shieldRats" ? "SHIELD RATS"
              : sl.label;
            const icon = label === "SHELTER" || label === "LEAVE" || label === "SHIELD RATS" ? "🛡️" : sl.icon;
            return (
              <button
                key={sl.id}
                className={`og-slot ${near === sl.id ? "near" : ""} ${broken ? "broken" : ""} ${dim ? "dim" : ""}`}
                disabled={ended || anyOverlay}
                onClick={() => engine.current?.goUse(sl.id)}
                title={a.kind === "blocked" ? a.reason : a.verb}
              >
                <span className="og-key">{sl.key}</span>
                <span className="og-ico">{broken ? "⚠" : icon}</span>
                <span className="og-lbl">{broken ? "REPAIR" : label}</span>
                <span className="og-cost">
                  {!broken &&
                    label !== "SHELTER" &&
                    label !== "LEAVE" &&
                    label !== "SHIELD RATS" &&
                    costChips(sl.task).map((c) => (
                      <span key={c.t} className={c.up ? "up" : "dn"}>{c.up ? "▲" : "▼"}{c.t}</span>
                    ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- Bottom-right: survival meters ---------- */}
      <section className="og-meters og-frame" aria-label="Survival meters">
        {meters.map((m) => (
          <div key={m.cls} className={`og-meter ${m.cls} ${level(m.v)}`}>
            <div className="og-cell" role="meter" aria-valuenow={Math.round(m.v)} aria-valuemin={0} aria-valuemax={100} aria-label={m.label}>
              <i className="og-fill" style={{ height: `calc(${m.v}% - 4px)` }} />
            </div>
            <b className="og-mval">{Math.round(m.v)}</b>
            <span className="og-mlabel">{m.label}</span>
          </div>
        ))}
        <div className={`og-meter temp ${hud.tempC < TEMP.danger ? "low" : hud.tempC < TEMP.goalMin ? "mid" : "ok"}`}>
          <div className="og-thermo" role="meter" aria-valuenow={Math.round(hud.tempC)} aria-label="Cabin temperature">
            <i className="og-goal" style={{ bottom: `${(TEMP.goalMin / 32) * 100}%`, height: `${((TEMP.goalMax - TEMP.goalMin) / 32) * 100}%` }} title="Goal zone 18–27 °C (ISS)" />
            <i className="og-fill" style={{ height: `${tempPct}%` }} />
            <i className="og-bulb" />
          </div>
          <b className="og-mval" title={`Cabin temperature · ${cToF(hud.tempC)} °F`}>{Math.round(hud.tempC)}°</b>
        </div>
      </section>

      {/* ---------- Pop-ups ---------- */}
      {hud.sleeping && !card && !ended && (
        <button className="og-sleep" onClick={() => wakeUp(sim)}>
          <b>😴 Zzz…</b>
          <span>You&apos;re asleep. The night is passing fast.</span>
          <span>Press any key or click to wake up.</span>
        </button>
      )}
      {card && !paused && (
        <EventCard
          card={card}
          onChoose={(id) => {
            choose(s, card.id, id);
            play("click");
            sync();
          }}
          onClose={() => {
            dismissCard(s, card.id);
            play("click");
            sync();
          }}
        />
      )}
      {repairing && !card && (
        <RepairGame system={repairing} parts={hud.parts} onDone={finishRepair} onCancel={() => setRepairing(null)} />
      )}
      {menu === "inventory" && (
        <InventoryPanel
          key={invTab}
          initialTab={invTab}
          onClose={() => setMenu("none")}
          onExit={onBack}
          exitLabel="EXIT MISSION"
          data={{
            name, dest, parts: hud.parts, broken: hud.broken, patched: hud.patched, facts: s.facts,
            toNextFact: tasksToNextFact(s), objectives: hud.objectives, doseMsv: hud.dose, sick: hud.sick, weather, apod,
            log: hud.log, solarPct: hud.solarPct, solarEff: hud.solarEff, outsideC: hud.outside, oneWay: hud.oneWay,
            commsWeak: hud.commsWeak, calling: hud.calling,
          }}
        />
      )}

      {hud.status === "lost" && !simDone && <SimEnded name={name} onDone={finishSim} />}
      {ended && showEnd && menu === "none" && (
        <div className="og-end">
          <div className={`og-endcard og-frame ${hud.ending}`}>
            <p className="og-kicker">
              {hud.ending === "hero" ? "🏆 HERO ENDING" : hud.ending === "close" ? "😅 BARELY MADE IT" : "💀 MISSION FAILED"}
            </p>
            <h2>
              {hud.ending === "hero"
                ? `The rescue ship has landed. Great work, Commander ${name}!`
                : hud.ending === "close"
                  ? "That was close!"
                  : `${dayWord} ${hud.day}: the outpost went dark`}
            </h2>
            {hud.ending !== "failed" && (
              <p>{hud.ending === "hero" ? "All four meters stayed safe until the ship landed." : "One of your meters was almost empty when the ship landed."}</p>
            )}
            {hud.failWhy.map((w, i) => (
              <p key={i} className={i === 0 && hud.ending === "failed" ? "why big" : "why"}>{w}</p>
            ))}
            <ul className="og-endstats">
              <li>🔧 {hud.stats.repairs} repairs · 🩹 {hud.stats.patches} patches</li>
              <li>⚠ {hud.stats.breakdowns} breakdowns</li>
              <li>☢ {hud.dose.toFixed(1)} mSv total radiation</li>
              <li>📘 {hud.facts} facts collected</li>
              <li>🐀 Lab rats {Math.round(hud.rats.health)}% healthy{hud.rats.health >= RATS.bonusAt ? " · 🔬 SCIENCE BONUS!" : ""}</li>
              <li>
                🪨 {rocks.got}/{rocks.total} space rocks{rocks.got === rocks.total ? " · 🏅 ROCK HOUND!" : ""} ·{" "}
                {dest === "moon" ? "Apollo astronauts brought 382 kg of Moon rocks home!" : "Perseverance is saving Mars rocks for a trip to Earth!"}
              </li>
            </ul>
            {hud.ending === "failed" && <p className="why">Failure is a lesson, not a punishment. Real mission planners test ideas again and again.</p>}
            <div className="og-endbtns">
              <button className="og-launch" onClick={onRetry}>▶ TRY AGAIN</button>
              <button className="og-launch ghost" onClick={onBack}>CHANGE DESTINATION</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
