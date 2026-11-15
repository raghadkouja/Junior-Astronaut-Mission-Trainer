// =====================================================================
// lib/mission/sim.ts  (NEW: replaces lib/turn-game/gameLogic.ts)
// The rules of the mission. Runs on a REAL-TIME clock: day turns into
// night as seconds pass, not as turns. No React in this file.
//
// For speed, tick() changes the state object in place (it runs 30–60
// times a second). The screen copies what it needs a few times a second.
// =====================================================================

import {
  BREAKDOWN, COMMS, FACTS_EVERY, FAULTS, MISSION, OUTSIDE_TEMP, PARTS, RADIATION, RATES, RATS, SLEEP, START, TASKS, TEMP,
} from "./config";
import type { Dest, Effects, PartId, StationId, SystemId, TaskId } from "./config";
import { factsFor } from "./facts";
import type { SpaceWeather, Flare } from "./nasaData";
import { prettyDate } from "./nasaData";
import { SURPRISES, dayScript, moldScript } from "./story";
import type { SurpriseId } from "./story";

// ---------- Types ----------
export type Choice = { id: string; label: string; cost: string; disabled?: boolean };
export type Card = {
  id: string;
  kind: "day" | "report" | "event" | "houston" | "alert" | "storm";
  kicker: string;
  title: string;
  lines: string[];
  fact?: { text: string; credit: string };
  badge?: { live: boolean; text: string };
  choices?: Choice[];
};
export type Toast = { id: number; text: string; kind: "info" | "warn" | "bad" | "good" | "fact" };
export type Status = "playing" | "won" | "lost";
export type Ending = "hero" | "close" | "failed";

export type Sim = {
  dest: Dest;
  rnd: () => number;
  weather: SpaceWeather;
  day: number;
  t: number; //        seconds into the current day
  elapsed: number; //  seconds since the mission started
  battery: number;
  oxygen: number;
  food: number;
  tempC: number;
  solarEff: number; // 1 = clean panels, lower = dusty
  doseMsv: number; //  total radiation dose this mission
  stormDose: number; //dose from the current/last storm
  sick: boolean;
  storm: { phase: "none" | "warning" | "active"; endsAt: number; flare: Flare | null; n: number };
  dustUntil: number;
  coldUntil: number;
  coldDay: boolean;
  commsWeak: boolean;
  broken: Partial<Record<SystemId, { patched: boolean; tasksLeft: number; since: number }>>;
  parts: Record<PartId, number>;
  tasksDone: number;
  nextBreakAt: number;
  nextFactAt: number;
  facts: string[];
  factPool: string[];
  sheltering: boolean;
  rats: { health: number; fedToday: boolean; shielded: boolean; exposedSecs: number }; // the rat lab
  sleeping: boolean; //     asleep in bed: the night runs faster
  sleepSpeed: number; //    how much faster time runs while asleep
  sleptTonight: boolean;
  restMul: number; //       job time today: rested 0.8, normal 1, tired 1.2
  task: { id: TaskId; station: StationId; left: number; total: number } | null;
  call: { arrivesAt: number } | null;
  oneWayLabel: string;
  roundTripSec: number;
  beaconOn: boolean;
  overtime: number; // -1 = not in overtime
  blackout: boolean;
  status: Status;
  ending: Ending | null;
  failMeter: "oxygen" | "food" | "temp" | null;
  failWhy: string[];
  cards: Card[];
  toasts: Toast[];
  toastId: number;
  log: string[];
  events: { at: number; id: string }[]; // today's scheduled story events (t in seconds)
  surprisesLeft: SurpriseId[];
  dayStart: { battery: number; oxygen: number; food: number; tempC: number };
  done: Record<string, boolean>; //       objective flags
  stats: {
    greenhouse: number; recycle: number; heater: number; conserve: number; clean: number; call: number;
    repairs: number; patches: number; breakdowns: number;
    sprintSecs: number; blackoutSecs: number; coldSecs: number; exposedStormSecs: number;
    brokenSecs: Record<SystemId, number>;
  };
};

// ---------- Small helpers ----------
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

export function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (rnd: () => number, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
function shuffle<T>(rnd: () => number, a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

function toast(s: Sim, text: string, kind: Toast["kind"] = "info") {
  s.toasts.push({ id: ++s.toastId, text, kind });
  if (s.toasts.length > 30) s.toasts.splice(0, s.toasts.length - 30);
}
function note(s: Sim, text: string) {
  s.log.unshift(`${clockLabel(s)} ${text}`);
  if (s.log.length > 8) s.log.length = 8;
}

// ---------- Time of day ----------
export function dayPhase(s: Sim) {
  return s.t / MISSION.daySeconds; // 0..1
}
// 0 = night, 1 = full sun. Each day starts in sunlight; dusk fades out
// before sunset and dawn fades in at the very end of the night.
export function sunLevel(s: Sim) {
  const p = dayPhase(s);
  const tw = MISSION.twilight;
  if (p < MISSION.sunset - tw) return 1;
  if (p < MISSION.sunset) return (MISSION.sunset - p) / tw;
  if (p > 1 - tw) return (p - (1 - tw)) / tw;
  return 0;
}
export const isDaylight = (s: Sim) => sunLevel(s) > 0.5;

export function clockLabel(s: Sim) {
  const mins = (6 * 60 + dayPhase(s) * 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function outsideTempC(s: Sim) {
  const o = OUTSIDE_TEMP[s.dest];
  const sun = sunLevel(s);
  let v = o.night + (o.day - o.night) * sun;
  if (s.coldDay || s.elapsed < s.coldUntil) v = Math.min(v, o.night);
  return Math.round(v);
}

export function solarOutput(s: Sim) {
  // per second, before costs
  let out = RATES.solarMax[s.dest] * sunLevel(s) * s.solarEff;
  if (isBroken(s, "solar")) out *= 0.5;
  if (s.elapsed < s.dustUntil) out *= 0.3;
  return out;
}

// ---------- Create a mission ----------
export function newSim(dest: Dest, weather: SpaceWeather, seed = Date.now()): Sim {
  const rnd = mulberry32(seed);
  const parts = {} as Record<PartId, number>;
  (Object.keys(PARTS) as PartId[]).forEach((p) => (parts[p] = PARTS[p].start));

  let oneWayLabel: string;
  let roundTripSec: number;
  if (dest === "moon") {
    oneWayLabel = `${COMMS.moonOneWaySec} seconds`;
    roundTripSec = COMMS.moonOneWaySec * 2;
  } else {
    const mins = between(rnd, COMMS.marsOneWayMin.min, COMMS.marsOneWayMin.max);
    oneWayLabel = `${mins} minutes`;
    roundTripSec = (mins * 2 * 60) / COMMS.marsSpeedUp;
  }

  const s: Sim = {
    dest, rnd, weather,
    day: 1, t: 0, elapsed: 0,
    battery: START.battery, oxygen: START.oxygen, food: START.food, tempC: START.tempC,
    solarEff: 1, doseMsv: 0, stormDose: 0, sick: false,
    storm: { phase: "none", endsAt: 0, flare: null, n: 0 },
    dustUntil: 0, coldUntil: 0, coldDay: false, commsWeak: false,
    broken: {}, parts,
    tasksDone: 0, nextBreakAt: BREAKDOWN.firstAfterTasks,
    nextFactAt: between(rnd, FACTS_EVERY.min, FACTS_EVERY.max),
    facts: [], factPool: shuffle(rnd, factsFor(dest).map((f) => f.id)),
    sheltering: false, task: null, call: null,
    rats: { health: RATS.start, fedToday: false, shielded: false, exposedSecs: 0 },
    sleeping: false, sleepSpeed: 1, sleptTonight: false, restMul: 1,
    oneWayLabel, roundTripSec,
    beaconOn: false, overtime: -1, blackout: false,
    status: "playing", ending: null, failMeter: null, failWhy: [],
    cards: [], toasts: [], toastId: 0, log: [], events: [],
    surprisesLeft: shuffle(rnd, Object.keys(SURPRISES) as SurpriseId[]),
    dayStart: { battery: START.battery, oxygen: START.oxygen, food: START.food, tempC: START.tempC },
    done: {},
    stats: {
      greenhouse: 0, recycle: 0, heater: 0, conserve: 0, clean: 0, call: 0,
      repairs: 0, patches: 0, breakdowns: 0,
      sprintSecs: 0, blackoutSecs: 0, coldSecs: 0, exposedStormSecs: 0,
      brokenSecs: { habitat: 0, greenhouse: 0, recycle: 0, conserve: 0, solar: 0, comms: 0 },
    },
  };
  // Unlock the APOD fact first so the Fact Book is never empty
  unlockFact(s, "apod", true);
  startDay(s, 1);
  return s;
}

function startDay(s: Sim, day: number) {
  s.day = day;
  s.t = 0;
  s.dayStart = { battery: s.battery, oxygen: s.oxygen, food: s.food, tempC: s.tempC };
  s.coldDay = day === 4;
  s.commsWeak = day === 4;
  s.sick = false;
  s.stormDose = 0; // the storm meter starts fresh each day
  s.rats.fedToday = false; // the lab rats need food every day
  if (day > 1) {
    s.restMul = s.sleptTonight ? SLEEP.restedMul : SLEEP.tiredMul;
    toast(
      s,
      s.sleptTonight
        ? "☀️ Good morning! You slept well, so jobs are faster today."
        : "🥱 You didn't sleep last night, so jobs take longer today.",
      s.sleptTonight ? "good" : "warn",
    );
  }
  s.sleeping = false;
  s.sleptTonight = false;
  if (day > 1) s.solarEff = Math.max(0.3, s.solarEff - RATES.dustPerDay[s.dest]);

  const script = dayScript(s.dest, day);
  s.cards.push({
    id: `day${day}`,
    kind: "day",
    kicker: `${s.dest === "mars" ? "SOL" : "DAY"} ${day} OF ${MISSION.days}`,
    title: script.title,
    lines: script.lines,
    fact: script.fact,
  });

  // Scheduled story beats (seconds into the day)
  const ev: { at: number; id: string }[] = [];
  if (day === 2) ev.push({ at: 25, id: "flare" });
  if (day === 3) ev.push({ at: 18, id: "dust" });
  if (day === 4) ev.push({ at: 30, id: "mold" });
  if (day === 5) ev.push({ at: 32, id: "flare" }, { at: 78, id: "coldSnapFinal" });
  // One random surprise per day from day 2 (replayability)
  if (day >= 2 && s.surprisesLeft.length) {
    let at = between(s.rnd, 50, 100);
    // keep it away from the storm window
    if (ev.some((e) => e.id === "flare" && Math.abs(e.at + RADIATION.warnSeconds - at) < 35)) at = Math.min(110, at + 30);
    ev.push({ at, id: `surprise:${s.surprisesLeft.shift()}` });
  }
  s.events = ev.sort((a, b) => a.at - b.at);
  note(s, `${s.dest === "mars" ? "Sol" : "Day"} ${day}: ${script.title}`);
}

// ---------- Facts ----------
// Just the first sentence of a fact (cards stay short; the Fact Book has the rest)
const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();

// The rover found something: unlock the next fact and show it on a card
export function roverFact(s: Sim) {
  if (s.status !== "playing") return;
  const fid = s.factPool[0];
  const f = fid ? factsFor(s.dest).find((x) => x.id === fid) : undefined;
  if (!f) {
    toast(s, "🤖 Beep boop! The rover has shown you everything it found. Great exploring!", "good");
    return;
  }
  unlockFact(s, f.id, true);
  s.cards.push({
    id: `rover-${Math.round(s.elapsed * 10)}`,
    kind: "event",
    kicker: "🤖 ROVER DISCOVERY",
    title: f.title,
    lines: [f.kid ?? firstSentence(f.text), "📘 Saved in your Fact Book (E)"], // short for young readers; the full fact + source is in the book
  });
}

function unlockFact(s: Sim, id?: string, quiet = false) {
  let fid = id;
  if (fid) s.factPool = s.factPool.filter((f) => f !== fid);
  else fid = s.factPool.shift();
  if (!fid || s.facts.includes(fid)) return;
  s.facts.push(fid);
  if (!quiet) {
    const f = factsFor(s.dest).find((x) => x.id === fid);
    toast(s, `📘 New fact unlocked: "${f?.title}". Press E to read it!`, "fact");
  }
}

// ---------- Which task a station does right now ----------
export type StationAction =
  | { kind: "task"; task: TaskId; verb: string }
  | { kind: "repair"; system: SystemId; verb: string }
  | { kind: "leave"; verb: string }
  | { kind: "blocked"; verb: string; reason: string };

export function stationAction(s: Sim, st: StationId): StationAction {
  if (s.sheltering) {
    return st === "habitat"
      ? { kind: "leave", verb: "LEAVE THE SHELTER" }
      : { kind: "blocked", verb: "IN SHELTER", reason: "You're hiding in the storm shelter." };
  }
  if (st === "habitat" && s.storm.phase !== "none") return { kind: "task", task: "shelter", verb: TASKS.shelter.verb };
  if (st === "lab") {
    if (s.storm.phase !== "none" && !s.rats.shielded) return { kind: "task", task: "shieldRats", verb: TASKS.shieldRats.verb };
    if (s.rats.shielded) return { kind: "blocked", verb: "RATS ARE SHIELDED", reason: "The rats are safe in the shielded room until the storm ends." };
    if (s.rats.fedToday) return { kind: "blocked", verb: "RATS ARE FED", reason: "The rats already ate today. Come back tomorrow!" };
    return { kind: "task", task: "feedRats", verb: TASKS.feedRats.verb };
  }
  if (st === "bed") {
    if (s.sleeping) return { kind: "blocked", verb: "SLEEPING", reason: "Zzz…" };
    if (s.storm.phase !== "none") return { kind: "blocked", verb: TASKS.sleep.verb, reason: "No sleeping in a radiation storm! Get to the shelter." };
    if (isDaylight(s)) return { kind: "blocked", verb: TASKS.sleep.verb, reason: "It's daytime! Go to bed after sunset." };
    return { kind: "task", task: "sleep", verb: TASKS.sleep.verb };
  }
  const sys = st === "beacon" ? null : (st as SystemId);
  // a patched system works again (until the patch fails), so only a real breakdown needs repair
  if (sys && isBroken(s, sys)) return { kind: "repair", system: sys, verb: `REPAIR: ${FAULTS[sys].name.toUpperCase()}` };

  const task: TaskId =
    st === "habitat" ? "heater" : st === "solar" ? "clean" : st === "comms" ? "call" : (st as TaskId);
  const def = TASKS[task];
  if (def.needsPower && s.blackout)
    return { kind: "blocked", verb: def.verb, reason: "BLACKOUT! No power. Conserve power at the battery bank first." };
  if (task === "clean" && s.solarEff > 0.97 && s.elapsed >= s.dustUntil)
    return { kind: "blocked", verb: def.verb, reason: "The solar panels are already clean." };
  if (task === "call" && s.call) return { kind: "blocked", verb: def.verb, reason: "Waiting for Houston's reply…" };
  if (task === "heater" && s.tempC >= TEMP.max) return { kind: "blocked", verb: def.verb, reason: "The cabin is already warm." };
  if (task === "beacon") {
    if (s.day < MISSION.days) return { kind: "blocked", verb: def.verb, reason: `The landing beacon is for rescue day (day ${MISSION.days}).` };
    if (s.beaconOn) return { kind: "blocked", verb: "BEACON IS ON", reason: "The beacon is on! The ship can find you." };
  }
  return { kind: "task", task, verb: def.verb };
}

// ---------- Player actions ----------
export function startTask(s: Sim, st: StationId): StationAction {
  const a = stationAction(s, st);
  if (s.status !== "playing" || s.task) return a;
  if (a.kind === "leave") {
    s.sheltering = false;
    toast(s, "You left the storm shelter.", s.storm.phase === "active" ? "warn" : "info");
    return a;
  }
  if (a.kind !== "task") {
    if (a.kind === "blocked") toast(s, a.reason, "warn");
    return a;
  }
  const secs = TASKS[a.task].secs * (s.sick ? 2 : 1) * s.restMul;
  s.task = { id: a.task, station: st, left: secs, total: secs };
  return a;
}

function apply(s: Sim, e: Effects) {
  if (e.battery) s.battery = clamp(s.battery + e.battery);
  if (e.oxygen) s.oxygen = clamp(s.oxygen + e.oxygen);
  if (e.food) s.food = clamp(s.food + e.food);
  if (e.tempC) s.tempC = clamp(s.tempC + e.tempC, -20, TEMP.max);
}

export type Diff = { battery: number; oxygen: number; food: number; tempC: number };
export const snapshot = (s: Sim): Diff => ({ battery: s.battery, oxygen: s.oxygen, food: s.food, tempC: s.tempC });

function finishTask(s: Sim) {
  const tk = s.task!;
  s.task = null;
  const def = TASKS[tk.id];
  if (tk.id === "sleep") {
    s.sleeping = true;
    s.sleptTonight = true;
    // the rest of the night always takes about SLEEP.realSeconds of real time
    s.sleepSpeed = Math.max(1, (MISSION.daySeconds - s.t) / SLEEP.realSeconds);
    toast(s, "😴 Good night! The night passes quickly while you sleep.", "info");
    note(s, "🛏️ Went to sleep.");
    if (!s.facts.includes("sleep-85")) unlockFact(s, "sleep-85");
    return;
  }
  if (tk.id === "shelter") {
    s.sheltering = true;
    s.done.sheltered = true;
    toast(s, "🛡️ You're in the storm shelter. Stay until the storm passes!", "good");
    note(s, "Hid in the storm shelter.");
    return;
  }
  apply(s, def.effects);
  if (tk.id === "clean") {
    s.solarEff = 1;
    s.done.cleaned = true;
  }
  if (tk.id === "beacon") {
    s.beaconOn = true;
    s.done.beacon = true;
    toast(s, "🚨 Landing beacon ON. The rescue ship can find the pad!", "good");
  }
  if (tk.id === "call") sendCall(s);
  if (tk.id === "feedRats") feedRats(s);
  if (tk.id === "shieldRats") {
    s.rats.shielded = true;
    toast(s, "🐀 The lab rats are safe in the shielded room. Now protect yourself!", "good");
  }
  const k = tk.id as keyof Sim["stats"];
  if (typeof s.stats[k] === "number") (s.stats[k] as number)++;
  s.done[tk.id] = true;
  note(s, `${def.icon} ${def.label.toLowerCase()}: ${describe(def.effects)}`);
  afterWork(s);
}

function describe(e: Effects) {
  const parts: string[] = [];
  if (e.battery) parts.push(`${e.battery > 0 ? "+" : ""}${e.battery} battery`);
  if (e.oxygen) parts.push(`${e.oxygen > 0 ? "+" : ""}${e.oxygen} oxygen`);
  if (e.food) parts.push(`${e.food > 0 ? "+" : ""}${e.food} food`);
  if (e.tempC) parts.push(`${e.tempC > 0 ? "+" : ""}${e.tempC} °C`);
  return parts.join(", ") || "done";
}

// After any finished job: maybe unlock a fact. After station jobs (not repairs):
// patches wear out and something new may break.
function afterWork(s: Sim, wear = true) {
  s.tasksDone++;
  if (s.tasksDone >= s.nextFactAt) {
    unlockFact(s);
    s.nextFactAt = s.tasksDone + between(s.rnd, FACTS_EVERY.min, FACTS_EVERY.max);
  }
  if (!wear) {
    s.nextBreakAt++; // repairs never bring the next breakdown closer
    return;
  }
  // Duct-tape patches wear out
  for (const id of Object.keys(s.broken) as SystemId[]) {
    const b = s.broken[id]!;
    if (b.patched) {
      b.tasksLeft--;
      if (b.tasksLeft <= 0) {
        b.patched = false;
        b.since = s.elapsed;
        toast(s, `⚠ The duct-tape patch on the ${FAULTS[id].name.toLowerCase()} failed!`, "bad");
      }
    }
  }
  if (s.tasksDone >= s.nextBreakAt) {
    breakSomething(s);
    s.nextBreakAt = s.tasksDone + between(s.rnd, BREAKDOWN.everyMin, BREAKDOWN.everyMax);
  }
}

export function breakSomething(s: Sim, only?: SystemId[]) {
  const pool = (only ?? (["habitat", "greenhouse", "recycle", "conserve", "solar", "comms"] as SystemId[])).filter(
    (id) => !s.broken[id],
  );
  if (!pool.length) return;
  const id = pool[Math.floor(s.rnd() * pool.length)];
  s.broken[id] = { patched: false, tasksLeft: 0, since: s.elapsed };
  s.stats.breakdowns++;
  toast(s, `⚠ BREAKDOWN: ${FAULTS[id].problem} Go fix it!`, "bad");
  note(s, `⚠ ${FAULTS[id].name}`);
}

// Is a system working right now? (patched counts as working)
export const isBroken = (s: Sim, id: SystemId) => !!s.broken[id] && !s.broken[id]!.patched;

// Called by the repair mini-game when the player wins it.
//   "part"      = proper fix with the right spare part (permanent)
//   "tape"      = duct-tape patch (fails again after a couple of jobs)
//   "improvise" = no part, no tape: borrow wires from other machines.
//                 Always possible, but costs a lot of battery and is only a patch.
export type RepairMode = "part" | "tape" | "improvise";
export const IMPROVISE_BATTERY = 10;

export function repair(s: Sim, id: SystemId, mode: RepairMode) {
  const f = FAULTS[id];
  if (!s.broken[id]) return false;
  if (mode === "part") {
    if (s.parts[f.part] <= 0) return false;
    s.parts[f.part]--;
    delete s.broken[id];
    s.stats.repairs++;
    toast(s, `🔧 Fixed! ${f.name} repaired with a ${PARTS[f.part].name.toLowerCase()}.`, "good");
    note(s, `🔧 fixed ${f.name.toLowerCase()}`);
  } else {
    if (mode === "tape") {
      if (s.parts.tape <= 0) return false;
      s.parts.tape--;
    } else {
      s.battery = clamp(s.battery - IMPROVISE_BATTERY);
    }
    s.broken[id] = { patched: true, tasksLeft: BREAKDOWN.patchLastsTasks, since: s.elapsed };
    s.stats.patches++;
    toast(
      s,
      mode === "tape"
        ? `🩹 Patched with duct tape. It will hold for about ${BREAKDOWN.patchLastsTasks} more jobs.`
        : `🛠 Improvised fix using borrowed wires (−${IMPROVISE_BATTERY} battery). It will hold for about ${BREAKDOWN.patchLastsTasks} more jobs.`,
      "warn",
    );
    note(s, `🩹 patched ${f.name.toLowerCase()}`);
  }
  if (!s.blackout) s.battery = clamp(s.battery - 4); // power tools
  s.done.repaired = true;
  afterWork(s, false);
  return true;
}

// ---------- Comms ----------
function sendCall(s: Sim) {
  if (s.commsWeak) {
    toast(
      s,
      s.dest === "mars"
        ? "📡 Only static… The Sun is between Earth and Mars. You're on your own today."
        : "📡 Only static… The radio link is too weak today. You're on your own.",
      "warn",
    );
    return;
  }
  s.call = { arrivesAt: s.elapsed + s.roundTripSec };
  s.done.called = true;
  toast(
    s,
    `📡 Message sent! It takes ${s.oneWayLabel} to reach Earth, and the same to come back.` +
      (s.dest === "mars" ? " (sped up: 1 minute = 1 second)" : ""),
    "info",
  );
}

function houstonReply(s: Sim): Card {
  const lines: string[] = [];
  const worst = [
    { k: "battery", v: s.battery, tip: "Your battery is low. Conserve power, and save big jobs for daytime when the panels work." },
    { k: "oxygen", v: s.oxygen, tip: "Oxygen is low. Recycle the air or run the greenhouse." },
    { k: "food", v: s.food, tip: "Food is low. Run the greenhouse soon." },
    { k: "temp", v: ((s.tempC - TEMP.fail) / (TEMP.goalMax - TEMP.fail)) * 100, tip: "The cabin is getting cold. Turn up the heater in the habitat." },
  ].sort((a, b) => a.v - b.v)[0];
  lines.push(worst.v < 45 ? worst.tip : "Your numbers look steady. Nice flying, Commander.");
  const broken = (Object.keys(s.broken) as SystemId[]).filter((id) => isBroken(s, id));
  if (broken.length) lines.push(`Our sensors show ${broken.length} broken system${broken.length > 1 ? "s" : ""}: ${broken.map((b) => FAULTS[b].name.toLowerCase()).join(", ")}. Fix them before they cost you more.`);
  const next = s.events.find((e) => e.at > s.t);
  if (next?.id === "flare" && s.storm.phase === "none")
    lines.push("Our space weather team sees a solar flare coming later today. Be ready to shelter.");
  else if (s.day < MISSION.days) lines.push(`Tomorrow's forecast: "${dayScript(s.dest, s.day + 1).title}".`);
  unlockFact(s);
  return {
    id: `houston-${s.elapsed}`,
    kind: "houston",
    kicker: `REPLY FROM HOUSTON · round trip ${r1(s.roundTripSec)} s`,
    title: "Mission Control says…",
    lines,
    fact: { text: `Light (and radio) travels about 300,000 km every second. Your message took ${s.oneWayLabel} each way.`, credit: "NASA Deep Space Network" },
  };
}

// ---------- Story events ----------
function fire(s: Sim, id: string) {
  if (id === "flare") return startFlareWarning(s);
  if (id === "dust") {
    if (s.dest === "mars") s.dustUntil = s.elapsed + 40;
    s.solarEff = Math.min(s.solarEff, 0.45);
    s.dustUntil = Math.max(s.dustUntil, s.elapsed + (s.dest === "mars" ? 40 : 18));
    toast(s, s.dest === "mars" ? "🌪 Dust storm! Solar power drops way down." : "🌫 Dust is covering the solar panels!", "warn");
    note(s, "Dust on the solar panels.");
    return;
  }
  if (id === "coldSnapFinal") {
    s.coldUntil = s.elapsed + 30;
    toast(s, "🥶 Temperatures are dropping. Keep the cabin warm until the ship lands!", "warn");
    return;
  }
  if (id === "mold") {
    const m = moldScript();
    s.cards.push({
      id: "mold", kind: "event", kicker: "GREENHOUSE ALERT", title: m.title, lines: m.lines,
      choices: [
        { id: "mold:pull", label: "Pull out the moldy plants", cost: "−10 food, but it's safe" },
        { id: "mold:uv", label: "Zap it with UV light", cost: "−8 battery, works 70% of the time" },
      ],
    });
    return;
  }
  if (id.startsWith("surprise:")) {
    const sid = id.slice(9) as SurpriseId;
    const sc = SURPRISES[sid];
    const card: Card = { id, kind: "event", kicker: "SURPRISE!", title: sc.title, lines: [...sc.lines], fact: sc.fact };
    if (sid === "micrometeorite") {
      breakSomething(s, ["solar", "habitat", "comms", "greenhouse"]);
      card.choices = [{ id: "ok", label: "I'll fix it", cost: "Find the ⚠ building" }];
    } else if (sid === "stuckHatch") {
      card.choices = [
        { id: "hatch:force", label: "Force it open", cost: "−6 oxygen (air leaks out)" },
        { id: "hatch:tape", label: "Seal it with duct tape", cost: "−1 duct tape, −3 battery", disabled: s.parts.tape <= 0 },
      ];
    } else if (sid === "powerSurge") {
      s.battery = clamp(s.battery - 12);
      breakSomething(s, ["conserve"]);
      card.lines.push("Battery −12.");
      card.choices = [{ id: "ok", label: "Reset the breakers", cost: "Then repair the battery bank" }];
    } else if (sid === "coldSnap") {
      s.coldUntil = s.elapsed + 30;
      card.choices = [
        { id: "cold:heater", label: "Blast the heater now", cost: "+4 °C, −14 battery" },
        { id: "cold:layers", label: "Put on thermal layers", cost: "−6 food (your body burns energy to stay warm)" },
      ];
    } else {
      card.choices = [
        { id: "locker:search", label: "Search the locker", cost: "−5 oxygen (it takes a while)" },
        { id: "locker:skip", label: "Leave it", cost: "Save your air" },
      ];
    }
    s.cards.push(card);
  }
}

export function choose(s: Sim, cardId: string, choiceId: string) {
  const i = s.cards.findIndex((c) => c.id === cardId);
  if (i >= 0) s.cards.splice(i, 1);
  switch (choiceId) {
    case "mold:pull":
      s.food = clamp(s.food - 10);
      s.done.mold = true;
      note(s, "Pulled the moldy plants (−10 food).");
      break;
    case "mold:uv":
      s.battery = clamp(s.battery - 8);
      s.done.mold = true;
      if (s.rnd() < 0.7) {
        toast(s, "☀ The UV light killed the mold!", "good");
        note(s, "UV light stopped the mold.");
      } else {
        s.food = clamp(s.food - 10);
        breakSomething(s, ["greenhouse"]);
        note(s, "The mold spread. Greenhouse broken.");
      }
      break;
    case "hatch:force":
      s.oxygen = clamp(s.oxygen - 6);
      note(s, "Forced the hatch (−6 oxygen).");
      break;
    case "hatch:tape":
      s.parts.tape--;
      s.battery = clamp(s.battery - 3);
      note(s, "Sealed the hatch with duct tape.");
      break;
    case "cold:heater":
      s.tempC = clamp(s.tempC + 4, -20, TEMP.max);
      s.battery = clamp(s.battery - 14);
      note(s, "Blasted the heater (+4 °C, −14 battery).");
      break;
    case "cold:layers":
      s.food = clamp(s.food - 6);
      s.coldUntil = s.elapsed + 12; // layers help: the cold hurts for less time
      note(s, "Thermal layers on (−6 food).");
      break;
    case "locker:search": {
      s.oxygen = clamp(s.oxygen - 5);
      const pool: PartId[] = ["filter", "seal", "fuse", "cell", "panel", "wire", "tape"];
      const p = pool[Math.floor(s.rnd() * pool.length)];
      s.parts[p]++;
      toast(s, `🎁 Found a spare ${PARTS[p].name.toLowerCase()}!`, "good");
      note(s, `Found a ${PARTS[p].name.toLowerCase()}.`);
      break;
    }
  }
}

export function dismissCard(s: Sim, cardId: string) {
  const i = s.cards.findIndex((c) => c.id === cardId);
  if (i >= 0) s.cards.splice(i, 1);
}

function startFlareWarning(s: Sim) {
  const flare = s.weather.storms[s.storm.n === 0 ? 0 : 1];
  s.storm = { phase: "warning", endsAt: s.elapsed + RADIATION.warnSeconds, flare, n: s.storm.n + 1 };
  s.stormDose = 0;
  const when = prettyDate(flare.peak);
  s.cards.push({
    id: `storm${s.storm.n}`,
    kind: "storm",
    kicker: "⚠ SPACE WEATHER ALERT",
    title: `${flare.classType} solar flare detected!`,
    lines: [
      `Particles will hit the base in ${RADIATION.warnSeconds} seconds and the storm lasts ${RADIATION.stormSeconds} seconds.`,
      "Run to the HABITAT and press SPACE to hide in the storm shelter. Or keep working and risk a big radiation dose.",
      `Bigger flare = bigger storm. "${flare.classType}" means ${flare.strengthX >= 1 ? `${r1(flare.strengthX)}× the X-class threshold` : "a medium (M-class) flare"}.`,
    ],
    badge: {
      live: flare.live,
      text: flare.live
        ? `LIVE NASA DONKI: real flare from ${flare.region}, ${when}`
        : `ARCHIVED NASA DONKI: real flare from ${flare.region}, ${when}${flare.note ? `. ${flare.note}` : ""}`,
    },
  });
  note(s, `Flare warning: ${flare.classType}.`);
}

// ---------- The main clock ----------
export type TickInput = { sprinting: boolean };

export function tick(s: Sim, dt: number, input: TickInput) {
  if (s.status !== "playing") return;
  if (s.sleeping) dt *= s.sleepSpeed; // the night passes faster while you sleep
  s.t += dt;
  s.elapsed += dt;

  // Scheduled story beats
  while (s.events.length && s.events[0].at <= s.t) fire(s, s.events.shift()!.id);

  // Houston's reply arrives
  if (s.call && s.elapsed >= s.call.arrivesAt) {
    s.call = null;
    s.cards.push(houstonReply(s));
  }

  // Task in progress
  if (s.task) {
    s.task.left -= dt;
    if (s.task.left <= 0) finishTask(s);
  }

  const cold = s.coldDay || s.elapsed < s.coldUntil;
  const sun = sunLevel(s);

  // --- Battery: solar in, life support out
  let dBattery = solarOutput(s) - RATES.batteryBase;
  if (isBroken(s, "conserve")) dBattery -= 0.12;
  // --- Oxygen
  let dOxygen = -RATES.oxygenUse;
  if (input.sprinting && !s.sheltering) {
    dOxygen -= RATES.sprintOxygen;
    s.stats.sprintSecs += dt;
  }
  if (isBroken(s, "recycle")) dOxygen -= 0.07;
  if (isBroken(s, "habitat")) dOxygen -= 0.12;
  // --- Food
  let dFood = -RATES.foodUse;
  if (isBroken(s, "greenhouse")) dFood -= 0.04;
  // --- Cabin temperature
  let dTemp = -(RATES.cabinCoolNight + (RATES.cabinCoolDay - RATES.cabinCoolNight) * sun);
  if (cold) {
    dTemp *= RATES.coldMultiplier;
    s.stats.coldSecs += dt;
  }

  // Blackout: the real punishment for an empty battery
  if (s.blackout) {
    dOxygen -= RATES.blackout.oxygen;
    dTemp -= RATES.blackout.temp;
    dFood -= RATES.blackout.food;
    s.stats.blackoutSecs += dt;
  }

  s.battery = clamp(s.battery + dBattery * dt);
  s.oxygen = clamp(s.oxygen + dOxygen * dt);
  s.food = clamp(s.food + dFood * dt);
  s.tempC = clamp(s.tempC + dTemp * dt, -20, TEMP.max);

  for (const id of Object.keys(s.broken) as SystemId[]) if (isBroken(s, id)) s.stats.brokenSecs[id] += dt;

  // Blackout on / off
  if (!s.blackout && s.battery <= 0) {
    s.blackout = true;
    s.task = s.task && TASKS[s.task.id].needsPower ? null : s.task;
    toast(s, "🔌 BLACKOUT! The battery is empty. Air machines and heater are OFF!", "bad");
    note(s, "BLACKOUT: battery empty.");
    if (!s.done.blackoutCard) {
      s.done.blackoutCard = true;
      s.cards.push({
        id: "blackout", kind: "alert", kicker: "⚠ BLACKOUT", title: "The battery ran out!",
        lines: [
          "With no power, the air recycler, the heater and the grow lights all switch off.",
          "Oxygen and cabin temperature are now dropping FAST.",
          "Go to the BATTERY BANK and Conserve Power, and wait for sunlight to recharge the panels.",
        ],
        fact: { text: "On the ISS, power runs everything: making oxygen, cleaning the air and keeping the crew warm. That's why its solar arrays are as big as a football field.", credit: "NASA ISS" },
      });
    }
  } else if (s.blackout && s.battery >= 4) {
    s.blackout = false;
    toast(s, "💡 Power restored.", "good");
  }

  // --- Solar storm
  const bg = RADIATION.mSvPerDay[s.dest] / MISSION.daySeconds; // per real second (1 game day = 1 real day of dose)
  s.doseMsv += bg * dt * (s.sheltering ? 0.5 : 1);
  if (s.storm.phase === "warning" && s.elapsed >= s.storm.endsAt) {
    s.storm.phase = "active";
    s.storm.endsAt = s.elapsed + RADIATION.stormSeconds;
    toast(s, s.sheltering ? "☢ The storm hit. You're safe in the shelter." : "☢ THE STORM HIT! Get to the shelter!", s.sheltering ? "info" : "bad");
  } else if (s.storm.phase === "active") {
    const total = clamp((s.storm.flare?.strengthX ?? 1) * RADIATION.stormDosePerX, RADIATION.stormDoseMin, RADIATION.stormDoseMax);
    const rate = total / RADIATION.stormSeconds;
    const got = rate * dt * (s.sheltering ? 1 - RADIATION.shelterBlocks : 1);
    s.stormDose += got;
    s.doseMsv += got;
    if (!s.sheltering) s.stats.exposedStormSecs += dt;
    if (!s.rats.shielded) {
      // rats left in their normal cages get radiation too
      s.rats.health = clamp(s.rats.health - RATS.stormLossPerSec * dt);
      s.rats.exposedSecs += dt;
    }
    if (!s.sick && s.stormDose >= RADIATION.sickAt) {
      s.sick = true;
      s.done.overdosed = true;
      toast(s, "🤒 Flight surgeon: big radiation dose! You must rest. Jobs take longer and no sprinting today.", "bad");
      note(s, `Radiation dose ${Math.round(s.stormDose)} mSv: ordered to rest.`);
    }
    if (s.elapsed >= s.storm.endsAt) {
      s.storm.phase = "none";
      s.done[`storm${s.storm.n}`] = true;
      if (s.sheltering) {
        s.sheltering = false;
        toast(s, `✅ Storm over. You stayed safe: only ${r1(s.stormDose)} mSv.`, "good");
      } else {
        toast(s, `Storm over. You got ${r1(s.stormDose)} mSv from the storm.`, s.stormDose > 20 ? "warn" : "info");
      }
      note(s, `Storm dose: ${r1(s.stormDose)} mSv.`);
      if (s.rats.exposedSecs < 1) s.done[`ratsSafe${s.day}`] = true;
      else toast(s, `🐀 The lab rats were left out in the storm. Rat health: ${Math.round(s.rats.health)}%.`, "warn");
      s.rats.shielded = false; // back to their normal cages
      s.rats.exposedSecs = 0;
    }
  }

  // --- Fail?
  // Alarm: wake up if something needs attention
  if (s.sleeping && (s.oxygen < 20 || s.food < 10 || s.tempC < TEMP.danger || s.blackout || s.storm.phase !== "none" || s.overtime >= 0))
    wakeUp(s, "⏰ Alarm! Something needs your attention, so you woke up.");
  if (s.oxygen <= 0) return fail(s, "oxygen");
  if (s.food <= 0) return fail(s, "food");
  if (s.tempC <= TEMP.fail) return fail(s, "temp");

  // --- End of day / rescue
  if (s.overtime >= 0) {
    s.overtime -= dt;
    if (s.beaconOn) return win(s, false);
    if (s.overtime <= 0) return win(s, true);
  } else if (s.t >= MISSION.daySeconds) {
    if (s.day < MISSION.days) {
      ratsEndOfDay(s);
      s.cards.push(dayReport(s));
      startDay(s, s.day + 1);
    } else if (s.beaconOn) {
      return win(s, false);
    } else {
      s.overtime = MISSION.overtimeSeconds;
      s.t = MISSION.daySeconds - 0.001;
      toast(s, "🚀 The rescue ship is here but can't find the landing pad! Power the beacon!", "bad");
    }
  }
}

// ---------- Sleep ----------
export function wakeUp(s: Sim, why?: string) {
  if (!s.sleeping) return;
  s.sleeping = false;
  toast(s, why ?? "You woke up early. You can go back to bed until morning.", why ? "warn" : "info");
}

// ---------- Rat lab ----------
function feedRats(s: Sim) {
  s.rats.fedToday = true;
  s.done.fedRats = true;
  // each feeding teaches something from NASA's real Rodent Research
  const next = factsFor(s.dest).find((f) => f.id.startsWith("rats-") && !s.facts.includes(f.id));
  if (next) unlockFact(s, next.id);
  else toast(s, "🐀 The lab rats munch happily. Healthy rats mean good science!", "good");
}
function ratsEndOfDay(s: Sim) {
  if (s.done[`ratsDay${s.day}`]) return;
  s.done[`ratsDay${s.day}`] = true;
  if (!s.rats.fedToday) {
    s.rats.health = clamp(s.rats.health - RATS.hungerLoss);
    note(s, `🐀 The lab rats went hungry. Rat health ${Math.round(s.rats.health)}%.`);
  }
}
const ratLine = (s: Sim) =>
  `Lab rats: ${Math.round(s.rats.health)}% healthy${s.rats.fedToday ? "" : " (they went hungry today!)"}`;

function dayReport(s: Sim): Card {
  const a = s.dayStart;
  const ch = (label: string, from: number, to: number, unit = "") =>
    `${label}: ${Math.round(from)}${unit} → ${Math.round(to)}${unit}`;
  const lines = [
    ch("Battery", a.battery, s.battery),
    ch("Oxygen", a.oxygen, s.oxygen),
    ch("Food", a.food, s.food),
    ch("Cabin", a.tempC, s.tempC, " °C"),
  ];
  const lesson =
    s.battery < 25
      ? "Your battery ended low. Remember: at night the solar panels make nothing."
      : s.tempC < TEMP.goalMin
        ? "The cabin ended chilly. The heater costs a lot of battery, so plan for it."
        : s.oxygen < 35
          ? "Oxygen ended low. Recycling air early saves you from a scary night."
          : "Good balance! Every system depends on the others.";
  return {
    id: `report${s.day}`,
    kind: "report",
    kicker: `END OF ${s.dest === "mars" ? "SOL" : "DAY"} ${s.day}`,
    title: "Narrator's report",
    lines: [...lines, ratLine(s), lesson],
  };
}

function win(s: Sim, late: boolean) {
  ratsEndOfDay(s);
  s.status = "won";
  const lowest = Math.min(s.battery, s.oxygen, s.food, ((s.tempC - TEMP.fail) / (TEMP.goalMin - TEMP.fail)) * 100);
  s.ending = late || lowest < 20 || s.done.overdosed ? "close" : "hero";
  if (late) s.failWhy.push("The beacon was off, so the ship had to search for the pad by radar. That was close!");
  if (s.done.overdosed)
    s.failWhy.push(`You stayed outside during a solar storm and got a big radiation dose (${Math.round(s.doseMsv)} mSv in total). Real astronauts always shelter!`);
}

function fail(s: Sim, m: "oxygen" | "food" | "temp") {
  s.status = "lost";
  s.ending = "failed";
  s.failMeter = m;
  const st = s.stats;
  const why: string[] = [];
  if (m === "oxygen") {
    why.push("You ran out of oxygen.");
    if (st.blackoutSecs > 5) why.push(`The battery was empty for ${Math.round(st.blackoutSecs)} seconds. With no power the air recycler stopped.`);
    if (st.brokenSecs.recycle > 10) why.push(`The air recycler was broken for ${Math.round(st.brokenSecs.recycle)} seconds.`);
    if (st.brokenSecs.habitat > 10) why.push(`The airlock leaked air for ${Math.round(st.brokenSecs.habitat)} seconds.`);
    if (st.sprintSecs > 25) why.push(`You sprinted for ${Math.round(st.sprintSecs)} seconds. Running makes you breathe harder!`);
    if (st.recycle + st.greenhouse < s.day * 2) why.push("The air recycler and greenhouse weren't run often enough.");
  } else if (m === "food") {
    why.push("You ran out of food.");
    if (st.greenhouse < s.day) why.push(`You ran the greenhouse only ${st.greenhouse} time${st.greenhouse === 1 ? "" : "s"}.`);
    if (st.brokenSecs.greenhouse > 10) why.push(`The greenhouse was broken for ${Math.round(st.brokenSecs.greenhouse)} seconds.`);
  } else {
    why.push("The cabin got too cold (hypothermia).");
    if (st.coldSecs > 20) why.push("Cold shadows and cold snaps made the cabin cool much faster.");
    if (st.blackoutSecs > 5) why.push("During the blackout the heater was off.");
    if (st.brokenSecs.habitat > 10) why.push(`The heater fuse was broken for ${Math.round(st.brokenSecs.habitat)} seconds.`);
    if (st.heater < s.day) why.push(`You turned up the heater only ${st.heater} time${st.heater === 1 ? "" : "s"}.`);
  }
  if (why.length === 1) why.push("Try a different balance of jobs next time. Failure is how real engineers learn!");
  s.failWhy = why;
}

// ---------- Helpers for the screens ----------
export function narratorHint(s: Sim): string {
  if (s.blackout) return "BLACKOUT! Get to the battery bank and conserve power. Air and heat are off!";
  if (s.storm.phase === "warning" && !s.sheltering && !s.rats.shielded)
    return "A storm is coming! Shield the lab rats first, then hide in the habitat shelter.";
  if (s.storm.phase === "warning" && !s.sheltering) return "A storm is coming! Run to the habitat and hide in the shelter.";
  if (s.storm.phase === "active" && !s.sheltering) return "You're out in a radiation storm! Get to the shelter in the habitat!";
  if (s.sheltering) return "You're safe in the shelter. Wait for the storm to pass.";
  if (s.sleeping) return "Zzz… You're asleep and the night is passing fast. Press any key to wake up.";
  if (s.overtime >= 0) return "The ship can't find you! Power the landing beacon NOW!";
  const broken = (Object.keys(s.broken) as SystemId[]).find((id) => isBroken(s, id));
  if (s.oxygen < 25) return "Oxygen is low! Recycle the air or run the greenhouse.";
  if (s.tempC < TEMP.danger) return "It's freezing in here! Turn up the heater in the habitat.";
  if (s.food < 25) return "Food is running low. Run the greenhouse.";
  if (broken) return `Something's broken: ${FAULTS[broken].name.toLowerCase()}. Find the ⚠ and press SPACE to repair.`;
  if (s.day === MISSION.days && !s.beaconOn) return "Rescue day! Power the landing beacon before the day ends.";
  if (s.battery < 25 && !isDaylight(s)) return "Your battery is low and the panels are dark. What matters most?";
  if (dayPhase(s) > MISSION.sunset - 0.12 && dayPhase(s) < MISSION.sunset) return "Sunset is coming. Charge up before the panels go dark.";
  if (!s.rats.fedToday && dayPhase(s) > 0.35) return "The lab rats are hungry. Feed them at the rat lab (key 8).";
  if (!isDaylight(s) && !s.sleptTonight && s.day < MISSION.days)
    return "It's night. Go inside the base and sleep in your bed: the night passes faster and you'll be rested.";
  if (s.solarEff < 0.7) return "The solar panels are dusty. Cleaning them gives you more power.";
  if (s.tempC < TEMP.goalMin) return "The cabin is chilly. Turn up the heater when you can afford the battery.";
  return "All systems steady. Pick your next job. Every choice costs something!";
}

export type Objective = { text: string; done: boolean };
export function objectives(s: Sim): Objective[] {
  const d = s.done;
  const o: Objective[] = [];
  const day = s.day;
  if (day === 1) {
    o.push({ text: "Run the greenhouse 🌱", done: !!d.greenhouse });
    o.push({ text: "Recycle the air ♻️", done: !!d.recycle });
    o.push({ text: "Turn up the heater in the habitat 🔥", done: !!d.heater });
  }
  if (day === 2) {
    o.push({ text: "Hide in the storm shelter during the flare 🛡️", done: !!d.sheltered });
    o.push({ text: "Call Houston from the comms dish 📡", done: !!d.called });
  }
  if (day === 3) o.push({ text: "Clean the dusty solar panels 🧹", done: !!d.cleaned });
  if (day === 4) {
    o.push({ text: "Deal with the moldy lettuce 🥬", done: !!d.mold });
    o.push({ text: "Keep the cabin above 12 °C in the cold 🌡️", done: s.tempC >= TEMP.danger });
  }
  if (day === 5) {
    o.push({ text: "Power the landing beacon 🚨", done: s.beaconOn });
    o.push({ text: "Stay safe from the big storm 🛡️", done: !!d.storm2 && s.stormDose < RADIATION.sickAt });
    o.push({ text: "Survive until the ship lands 🚀", done: false });
  }
  if (day < MISSION.days) o.push({ text: "Sleep in your bed at night 🛏️", done: s.sleptTonight });
  o.push({ text: "Feed the lab rats 🐀", done: s.rats.fedToday });
  if (day === 2 || day === 5)
    o.push({ text: "Shield the lab rats from the storm 🐀🛡️", done: !!d[`ratsSafe${day}`] || (s.rats.shielded && s.rats.exposedSecs < 1) });
  const brokenNow = (Object.keys(s.broken) as SystemId[]).filter((id) => isBroken(s, id)).length;
  o.push({ text: brokenNow ? `Fix broken systems (${brokenNow} left) 🔧` : "All systems working 🔧", done: brokenNow === 0 });
  o.push({ text: `Keep the cabin in the goal zone (${TEMP.goalMin}–${TEMP.goalMax} °C) 🌡️`, done: s.tempC >= TEMP.goalMin && s.tempC <= TEMP.goalMax });
  return o;
}

export function tasksToNextFact(s: Sim) {
  return Math.max(0, s.nextFactAt - s.tasksDone);
}
