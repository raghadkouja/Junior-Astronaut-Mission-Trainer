// Test of the turn-based story logic. No website needed.
// Run from the Frontend folder:  npx tsx lib/turn-game/try-story.ts

import {
  canAct,
  choose,
  currentEvent,
  currentNotice,
  dismissNotice,
  dayOf,
  endingText,
  isDay,
  narratorHint,
  nextTurn,
  radiationNow,
  retryDay,
  startState,
  totalTurns,
} from "./gameLogic";
import type { Action, Dest, GameState } from "./gameLogic";

function line(dest: Dest, s: GameState, label: string) {
  const d = `${dest === "moon" ? "Day" : "Sol"} ${dayOf(dest, Math.min(s.turn, totalTurns(dest, s)))}`;
  console.log(
    `${label.padEnd(34)} ${d.padEnd(6)} turn ${String(s.turn).padStart(2)}/${totalTurns(dest, s)} ${isDay(dest, s.turn) ? "☀" : "☾"}  ` +
      `PWR ${String(Math.round(s.power)).padStart(3)}  O2 ${String(Math.round(s.oxygen)).padStart(3)}  FOOD ${String(Math.round(s.food)).padStart(3)}  ` +
      `TEMP ${String(Math.round(s.temp)).padStart(3)}°C  rad ${s.radiationMsv.toFixed(1).padStart(5)} mSv  [${s.status}]` +
      (s.flags.length ? `  flags: ${s.flags.join(",")}` : ""),
  );
}

// ---- 1. A full Moon run with a sensible plan ----
console.log("=== Moon, sensible plan ===");
let s = startState("moon", 42);
const plan: Action[] = [
  "greenhouse", "comms", "recycle", "conserve", "greenhouse", "conserve", "recycle", "conserve", // day 1
  "greenhouse", "conserve", "recycle", "greenhouse", "conserve", "heater", "conserve",          // day 2 (+ the flare)
  "clean", "greenhouse", "heater", "conserve", "recycle", "greenhouse", "conserve", "heater",   // day 3
  "heater", "recycle", "greenhouse", "conserve", "heater", "recycle", "greenhouse", "heater",   // day 4 (shadow)
  "heater", "recycle", "heater", "greenhouse", "conserve", "heater", "recycle", "heater", "heater",
];
const answers: Record<string, number> = { moon_day2: 0, moon_day3: 1, moon_day4: 0, moon_day5: 0 };
let p = 0;
line("moon", s, "start");
while (s.status === "playing") {
  const note = currentNotice(s);
  if (note) {
    console.log(`   CARD  ${note.title}: ${note.text.slice(0, 120)}${note.text.length > 120 ? "..." : ""}`);
    s = dismissNotice(s);
    continue;
  }
  const ev = currentEvent(s);
  if (ev) {
    const i = answers[ev.id] ?? 0;
    console.log(`   EVENT ${ev.title} -> "${ev.choices[i].label}"`);
    s = choose("moon", s, i);
    line("moon", s, "   after choice");
    continue;
  }
  let a = plan[p++ % plan.length];
  if (!canAct("moon", s, a).ok) a = "conserve";
  s = nextTurn("moon", s, a);
  line("moon", s, a);
}
console.log("   ending:", endingText("moon", s));

// ---- 2. Lots of games: can you win? can you lose? ----
function play(dest: Dest, seed: number, pick: (s: GameState) => Action): GameState {
  let g = startState(dest, seed);
  for (let guard = 0; guard < 300 && g.status === "playing"; guard++) {
    if (currentNotice(g)) { g = dismissNotice(g); continue; }
    const ev = currentEvent(g);
    if (ev) g = choose(dest, g, Math.floor(((seed + guard) * 7919) % ev.choices.length));
    else g = nextTurn(dest, g, pick(g));
  }
  return g;
}
const ACTIONS: Action[] = ["greenhouse", "recycle", "conserve", "heater"];
const random = (seed: number) => (g: GameState) => ACTIONS[(seed * 31 + g.turn * 17) % 4];
const smart = (dest: Dest) => (g: GameState): Action => {
  if (canAct(dest, g, "clean").ok && isDay(dest, g.turn)) return "clean";
  if (g.temp <= 10) return "heater";
  if (g.oxygen < 35) return "recycle";
  if (g.food < 35) return "greenhouse";
  if (!isDay(dest, g.turn + 1) && g.power < 70) return "conserve";
  if (g.temp < 16 && g.power > 40) return "heater";
  return g.power > 50 ? "greenhouse" : "conserve";
};
for (const dest of ["moon", "mars"] as Dest[]) {
  for (const [name, policy] of [["random", null], ["smart", smart(dest)]] as const) {
    let won = 0, hero = 0;
    const why: Record<string, number> = {};
    for (let seed = 1; seed <= 300; seed++) {
      const g = play(dest, seed, policy ?? random(seed));
      if (g.status === "won") { won++; if (g.ending === "hero") hero++; }
      else { const k = (g.lossReason ?? "").split(",")[0].slice(0, 32); why[k] = (why[k] ?? 0) + 1; }
    }
    console.log(`${dest} ${name.padEnd(6)}: won ${won}/300 (hero ${hero})  losses:`, why);
  }
  for (const only of ACTIONS) {
    let won = 0;
    for (let seed = 1; seed <= 100; seed++) if (play(dest, seed, () => only).status === "won") won++;
    console.log(`${dest} always ${only.padEnd(10)}: won ${won}/100`);
  }
}

// ---- 3. Rules ----
console.log("\n=== Rules ===");
let r = startState("moon", 5);
console.log("act during day-1 card? ", canAct("moon", r, "greenhouse").reason);
r = choose("moon", r, 0);
console.log("clean clean panels?    ", canAct("moon", r, "clean").reason);
console.log("hint:                  ", narratorHint("moon", r, "Raghad"));
r = nextTurn("moon", r, "comms");
console.log("call Houston (Moon):   ", currentNotice(r)?.title, "|", currentNotice(r)?.text.slice(0, 80) + "...");
r = dismissNotice(r);
for (let i = 0; i < 7; i++) r = nextTurn("moon", r, "greenhouse"); // -> end of day 1
console.log("end of day 1 card:     ", currentNotice(r)?.title, "|", currentNotice(r)?.text);
r = dismissNotice(r);
console.log("day 2 event:           ", currentEvent(r)?.title, "| radiation now", radiationNow("moon", r).toFixed(1), "mSv/day");
const kept = choose("moon", r, 1);
console.log("keep working:          ", kept.log);
const sheltered = choose("moon", r, 0);
console.log("shelter:               ", sheltered.log.split(" Solar")[0], "| turn", sheltered.turn);

let m = choose("mars", startState("mars", 9), 0);
m = nextTurn("mars", m, "comms");
console.log("call Houston (Mars):   ", currentNotice(m)?.title);
m = dismissNotice(m);
m = nextTurn("mars", m, "greenhouse");
console.log("next action (Mars):    ", currentNotice(m)?.title, "|", currentNotice(m)?.text.slice(0, 90) + "...");

// Blackout + loss explanation
let b = choose("moon", startState("moon", 3), 0);
b = { ...b, power: 1, turn: 25 }; // day 4: the base is in shadow
b = nextTurn("moon", b, "greenhouse");
console.log("no battery:            ", b.log.match(/There wasn't[^.]*\./)?.[0]);
console.log("blackout:              ", b.log.match(/BLACKOUT[^.]*\./)?.[0], "| O2", b.oxygen, "temp", b.temp);
let f = { ...choose("moon", startState("moon", 3), 0), temp: 0.5 };
f = nextTurn("moon", f, "conserve");
console.log("froze:                 ", f.status, "|", f.lossReason);
const again = retryDay(f);
console.log("try today again:       ", again.status, "turn", again.turn, "temp", again.temp, "event:", currentEvent(again)?.title ?? "none");
