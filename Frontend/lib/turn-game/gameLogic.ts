// =====================================================================
// gameLogic.ts — turn-based rules for the outpost (Moon and Mars).
// One station use = one turn. Every function takes a state and returns
// a NEW state, so it plugs straight into React state. No React here.
// Story events live in story.ts. Numbers are GAME VALUES unless a
// comment says REAL.
// =====================================================================

import { EVENTS, SURPRISES } from "./story";
import type { StoryEvent } from "./story";

export type Dest = "moon" | "mars";
export type Action = "greenhouse" | "recycle" | "conserve" | "heater" | "clean" | "comms";
export type Meter = "power" | "oxygen" | "food" | "temp";
export type Effects = Partial<Record<Meter, number>>;

type DestConfig = {
  name: string;
  dayWord: string; // "DAY" on the Moon, "SOL" on Mars
  days: number;
  turnsPerDay: number; // actions per day
  totalTurns: number; // days x turnsPerDay
  darkFromDay?: number; // Moon: the base slips into shadow from this day on
  daylightTurns?: number; // Mars: the first N turns of each sol are daytime
  // The numbers below are "per turn at 4 turns a day". They're scaled
  // automatically by pace() if turnsPerDay changes, so the balance holds.
  solar: number;
  use: { power: number; oxygen: number; food: number }; // used up every turn
  tempLoss: { light: number; dark: number }; // °C lost per turn on its own
  maxSurprises: number;
  radiationPerDay: number; // mSv per day on the surface
  houstonOneWay: string; // radio delay, for the Call Houston message
  note: string;
};

export const config: Record<Dest, DestConfig> = {
  moon: {
    name: "Moon",
    dayWord: "DAY",
    days: 5, // the rescue ship lands after day 5 (story plan)
    turnsPerDay: 8,
    totalTurns: 40,
    darkFromDay: 4, // story day 4: "Cold Shadows"
    solar: 18,
    use: { power: 4, oxygen: 3, food: 3 },
    tempLoss: { light: 1, dark: 2 },
    maxSurprises: 1,
    radiationPerDay: 1.369, // REAL: Chang'e 4 lander, Science Advances (2020)
    houstonOneWay: "about 1.3 seconds",
    note: "Near the Moon's south pole the Sun stays low on the horizon, so a base can get long stretches of sunlight and long stretches of shadow.",
  },
  mars: {
    name: "Mars",
    dayWord: "SOL",
    days: 5,
    turnsPerDay: 8,
    totalTurns: 40,
    daylightTurns: 4, // 4 daytime turns, then 4 night turns
    solar: 22,
    use: { power: 6, oxygen: 4.5, food: 4.5 },
    tempLoss: { light: 1, dark: 2.5 },
    maxSurprises: 2,
    radiationPerDay: 0.64, // REAL: Curiosity rover's RAD instrument
    houstonOneWay: "3 to 22 minutes",
    note: "A Mars day (a sol) lasts about 24 hours 39 minutes. Each sol here has 4 daytime turns and 4 night turns.",
  },
};

export const START = { power: 70, oxygen: 80, food: 70, temp: 21 };

// The ISS keeps its cabin at roughly this range (REAL, approx.: 18–26 °C).
export const COMFORT = { minC: 18, maxC: 26 };

export const RATES = {
  dustSolarFactor: 0.5, // dusty panels make half the power
  blackout: { oxygen: 12, temp: 6 }, // battery at 0: heat and air machines stop
  stormRadiationFactor: 20, // game value: unsheltered dose in a solar storm
  careerLimitMsv: 600, // REAL: NASA's career radiation limit for astronauts
};

export const ACTIONS: Record<Action, { label: string; effects: Effects; note: string }> = {
  greenhouse: {
    label: "Ran the greenhouse",
    effects: { power: -12, food: 10, oxygen: 6, temp: 1 },
    note: "The greenhouse grew food and a little oxygen, and the grow lights added a bit of warmth.",
  },
  recycle: {
    label: "Recycled the air",
    effects: { power: -10, oxygen: 14 },
    note: "The air recycler boosted oxygen, but used a lot of power.",
  },
  heater: {
    label: "Turned up the heater",
    effects: { power: -16, temp: 9 },
    note: "The heater warmed the cabin. It's the biggest power drain on the base.",
  },
  conserve: {
    label: "Conserved power",
    effects: { power: 4, temp: -1 },
    note: "You shut down extra systems to save power. The cabin got a bit colder.",
  },
  clean: {
    label: "Cleaned the solar panels",
    effects: { oxygen: -3 },
    note: "You went outside and brushed the dust off the panels. Your spacesuit used some oxygen.",
  },
  comms: { label: "Called Houston", effects: { power: -2 }, note: "" },
};

// A one-time message card (Houston's answer, the end-of-day summary).
export type Notice = { title: string; speaker: string; text: string };

export type HistoryEntry = {
  turn: number;
  day: number;
  label: string;
  kind: "action" | "choice" | "auto" | "blackout";
  changes: Effects;
};

export interface GameState {
  turn: number; // the action you're about to take (starts at 1)
  power: number;
  oxygen: number;
  food: number;
  temp: number; // cabin temperature in °C
  status: "playing" | "won" | "lost";
  log: string; // what the narrator says about the last move
  lossReason?: string;
  ending?: "hero" | "close";
  seed: number; // makes random events repeatable
  flags: string[];
  eventId: string | null; // an event waiting for an answer
  seen: string[];
  extraTurns: number;
  radiationMsv: number; // total radiation dose this mission (mSv, a REAL unit)
  history: HistoryEntry[];
  houstonReply?: string; // Mars: Houston's answer arrives after your next action
  notices: Notice[]; // message cards waiting to be read (show these before events)
  dayStart?: Omit<GameState, "dayStart">; // snapshot for "try today again"
}

const ALL_EVENTS: StoryEvent[] = [...EVENTS, ...SURPRISES];
const TODAY_ONLY = ["solarStorm", "shelter", "noRadio"];
const METERS: Meter[] = ["power", "oxygen", "food", "temp"];
const MAX: Record<Meter, number> = { power: 100, oxygen: 100, food: 100, temp: 30 };
const SURPRISE_CHANCE = 0.08;

// ---------- small helpers ----------

// Meters keep decimals inside the game; screens round them for display.
const clampMeter = (m: Meter, v: number) => Math.round(Math.max(0, Math.min(MAX[m], v)) * 100) / 100;

// All per-turn numbers were tuned for 4 turns a day; scale them to the real pace.
export function pace(dest: Dest): number {
  return 4 / config[dest].turnsPerDay;
}
function scaled(dest: Dest, fx: Effects): Effects {
  const k = pace(dest);
  const out: Effects = {};
  for (const m of METERS) if (fx[m]) out[m] = fx[m]! * k;
  return out;
}

// How many actions are left before today ends.
export function actionsLeftToday(dest: Dest, s: GameState): number {
  const per = config[dest].turnsPerDay;
  return per - ((s.turn - 1) % per);
}
const has = (s: GameState, flag: string) => s.flags.includes(flag);

function setFlag(s: GameState, flag: string): GameState {
  if (flag.startsWith("!")) return { ...s, flags: s.flags.filter((f) => f !== flag.slice(1)) };
  return has(s, flag) ? s : { ...s, flags: [...s.flags, flag] };
}

// Same seed + same moment = same roll, so a run can be replayed.
function roll(seed: number, ...salt: number[]): number {
  let a = (seed ^ salt.reduce((acc, n) => Math.imul(acc ^ n, 2654435761), 0x9e3779b9)) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return h;
}

export const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
// Small changes keep one decimal ("-0.5"), bigger ones are whole numbers.
const fmt = (v: number) => (Math.abs(v) < 1 ? v.toFixed(1) : String(Math.round(v)));

// ---------- read-only helpers for the screens ----------

export function totalTurns(dest: Dest, s?: GameState): number {
  return config[dest].totalTurns + (s?.extraTurns ?? 0);
}

export function dayOf(dest: Dest, turn: number): number {
  return Math.ceil(turn / config[dest].turnsPerDay);
}

export function isDay(dest: Dest, turn: number): boolean {
  const c = config[dest];
  if (c.daylightTurns !== undefined) return (turn - 1) % c.turnsPerDay < c.daylightTurns;
  if (c.darkFromDay !== undefined) return dayOf(dest, turn) < c.darkFromDay;
  return true;
}

// The message card to show right now (read these before the story event).
export function currentNotice(s: GameState): Notice | null {
  return s.notices?.[0] ?? null;
}

export function dismissNotice(s: GameState): GameState {
  return { ...s, notices: (s.notices ?? []).slice(1) };
}

export function currentEvent(s: GameState): StoryEvent | null {
  return s.eventId ? ALL_EVENTS.find((e) => e.id === s.eventId) ?? null : null;
}

// Radiation right now, in mSv per day (for a radiation meter during storms).
export function radiationNow(dest: Dest, s: GameState): number {
  const storm = has(s, "solarStorm") && !has(s, "shelter");
  return config[dest].radiationPerDay * (storm ? RATES.stormRadiationFactor : 1);
}

export function radiationHigh(s: GameState): boolean {
  return has(s, "solarStorm") && !has(s, "shelter");
}

export function solarNow(dest: Dest, s: GameState): number {
  if (!isDay(dest, s.turn)) return 0;
  return config[dest].solar * pace(dest) * (has(s, "dusty") ? RATES.dustSolarFactor : 1);
}

export function panelsDusty(s: GameState): boolean {
  return has(s, "dusty");
}

// True if the battery can't cover this action this turn (it won't run).
export function actionFails(dest: Dest, s: GameState, effects: Effects): boolean {
  const cost = (effects.power ?? 0) * pace(dest);
  if (cost >= 0) return false;
  return s.power + cost - config[dest].use.power * pace(dest) + solarNow(dest, s) <= 0;
}

// Screens use this to grey out a station and show why.
export function canAct(dest: Dest, s: GameState, action: Action): { ok: boolean; reason?: string } {
  if (s.status !== "playing") return { ok: false, reason: "The mission is over." };
  if (s.eventId || s.notices?.length) return { ok: false, reason: "Read the message first." };
  if (action === "clean" && !has(s, "dusty")) return { ok: false, reason: "The solar panels are already clean." };
  if (action === "comms" && has(s, "noRadio")) {
    return { ok: false, reason: "The radio link to Earth is too weak today. You'll have to decide on your own." };
  }
  return { ok: true };
}

// The narrator's hint before each choice.
export function narratorHint(dest: Dest, s: GameState, name: string): string {
  const c = config[dest];
  const day = isDay(dest, s.turn);
  const darkSoon = day && !isDay(dest, s.turn + 1);
  const who = name ? name.charAt(0).toUpperCase() + name.slice(1) : "Commander";
  if (radiationHigh(s)) return `${who}, radiation is high today. Every action outside the shelter adds to your dose.`;
  if (s.temp <= 8) return `${who}, the cabin is getting dangerously cold. Turn up the heater in the habitat!`;
  if (!day && s.power < 30) return `${who}, power is low and the panels are dark. Conserve power at the battery bank!`;
  if (s.oxygen < 30) return `${who}, oxygen is low. Walk to the air recycler!`;
  if (s.food < 30) return `${who}, food is running low. Tend the greenhouse!`;
  if (has(s, "dusty") && day) return `Dusty panels make half the power. Clean them at the solar array.`;
  if (darkSoon) {
    const what = dest === "moon" ? "A long shadow is coming" : "Night is coming";
    return `${what}, ${who}. Charge the batteries and warm the cabin while the sun is up.`;
  }
  if (s.temp < COMFORT.minC) return `The cabin is chilly (${Math.round(s.temp)} °C). Astronauts like it between ${COMFORT.minC} and ${COMFORT.maxC} °C.`;
  if (!day) return `It's dark, so the solar panels make no power. Watch your battery.`;
  if (s.power < 60) return `The sun is up, ${who}. A good time to recharge.`;
  return `All systems steady, ${who}. You have ${totalTurns(dest, s) - s.turn + 1} actions left until the ${c.name === "Moon" ? "rescue ship lands" : "mission ends"}.`;
}

// What Houston would tell you right now.
export function houstonAdvice(dest: Dest, s: GameState): string {
  const levels: [Meter, number][] = [
    ["power", s.power / 100],
    ["oxygen", s.oxygen / 100],
    ["food", s.food / 100],
    ["temp", s.temp / 25],
  ];
  levels.sort((a, b) => a[1] - b[1]);
  const worst = levels[0][0];
  if (levels[0][1] >= 0.6) {
    return dest === "moon"
      ? `"Everything looks good. Your base goes into shadow on day 4, so store up battery and heat before then."`
      : `"Everything looks good. Charge up in the daytime: Mars nights are cold and dark."`;
  }
  const tip: Record<Meter, string> = {
    power: "Your battery is your weakest point. Save power before it gets dark.",
    oxygen: "Watch your oxygen. The air recycler is your best friend.",
    food: "Food is your weakest point. Run the greenhouse soon.",
    temp: "The cabin is your weakest point. A cold base is dangerous, so plan a heater run.",
  };
  const darkSoon = isDay(dest, s.turn) && !isDay(dest, s.turn + 1);
  return `"${tip[worst]}${darkSoon ? " And darkness is coming, so charge up now." : ""}"`;
}

// ---------- starting ----------

export const startState = (dest?: Dest, seed: number = Date.now()): GameState => {
  const s: GameState = {
    turn: 1,
    ...START,
    status: "playing",
    log: "",
    seed,
    flags: [],
    eventId: null,
    seen: [],
    extraTurns: 0,
    radiationMsv: 0,
    history: [],
    notices: [],
  };
  return dest ? startDay(dest, s) : s;
};

// The morning of a new day: today-only flags reset, the story event opens.
function startDay(dest: Dest, s: GameState): GameState {
  let next: GameState = { ...s, flags: s.flags.filter((f) => !TODAY_ONLY.includes(f)) };
  const day = dayOf(dest, next.turn);
  const story = EVENTS.find((e) => e.dest === dest && e.day === day && !next.seen.includes(e.id));
  if (story) next = openEvent(next, story);
  const { dayStart: _old, ...snapshot } = next;
  void _old;
  return { ...next, dayStart: { ...snapshot, notices: [] } };
}

function openEvent(s: GameState, ev: StoryEvent): GameState {
  let next: GameState = { ...s, eventId: ev.id, seen: [...s.seen, ev.id] };
  for (const f of ev.setsFlags ?? []) next = setFlag(next, f);
  return next;
}

// Middle of a day: maybe a random surprise.
function maybeSurprise(dest: Dest, s: GameState): GameState {
  if (s.eventId || dayOf(dest, s.turn) < 2) return s;
  const seenSurprises = SURPRISES.filter((e) => s.seen.includes(e.id)).length;
  if (seenSurprises >= config[dest].maxSurprises) return s;
  if (roll(s.seed, s.turn, 7) >= SURPRISE_CHANCE) return s;
  const options = SURPRISES.filter((e) => e.dest === dest && !s.seen.includes(e.id));
  if (options.length === 0) return s;
  const pick = options[Math.floor(roll(s.seed, s.turn, 13) * options.length)];
  return openEvent(s, pick);
}

// ---------- changing meters ----------

function apply(s: GameState, effects: Effects, entry: Omit<HistoryEntry, "changes">): GameState {
  const next: GameState = { ...s };
  const changes: Effects = {};
  for (const m of METERS) {
    const d = effects[m];
    if (typeof d !== "number" || d === 0) continue;
    const before = next[m];
    next[m] = clampMeter(m, before + d);
    if (next[m] !== before) changes[m] = next[m] - before;
  }
  if (Object.keys(changes).length === 0) return next;
  return { ...next, history: [...next.history, { ...entry, changes }] };
}

const METER_WORD: Record<Meter, string> = { power: "battery", oxygen: "oxygen", food: "food", temp: "cabin heat" };

// Why the mission failed, in plain words, with the choices that caused it.
function explainLoss(dest: Dest, s: GameState, meter: Meter): string {
  const opening: Record<Meter, string> = {
    power: "The battery ran out.",
    oxygen: "You ran out of oxygen, so Mission Control called an emergency evacuation.",
    food: "You ran out of food, so Mission Control called an emergency evacuation.",
    temp: "The cabin got too cold to live in (hypothermia danger), so Mission Control called an emergency evacuation.",
  };
  const tips: Record<Meter, string> = {
    power: "Charge up while the sun is out.",
    oxygen: "Recycle the air before it gets low, and don't let the battery hit zero: that stops the air machines.",
    food: "Run the greenhouse more often. It also makes a little oxygen and warmth.",
    temp: "Run the heater before the dark days, and keep some battery for it.",
  };
  const causes = s.history
    .filter((h) => h.kind !== "auto" && (h.changes[meter] ?? 0) < 0)
    .sort((a, b) => (a.changes[meter] ?? 0) - (b.changes[meter] ?? 0))
    .slice(0, 3)
    .map((h) => `${config[dest].dayWord === "SOL" ? "Sol" : "Day"} ${h.day}: ${h.label} (${fmt(h.changes[meter] ?? 0)} ${METER_WORD[meter]})`);
  const everyday = Math.round(
    s.history.filter((h) => h.kind === "auto").reduce((sum, h) => sum + Math.min(0, h.changes[meter] ?? 0), 0),
  );
  const daily =
    everyday >= 0
      ? ""
      : meter === "temp"
        ? ` The cabin also lost ${-everyday} °C on its own (it cools fastest in the dark).`
        : ` Everyday use took ${-everyday} ${METER_WORD[meter]}.`;
  const why = causes.length
    ? ` What used it up: ${causes.join("; ")}.${daily}`
    : `${daily} Nothing refilled it in time.`;
  return `${opening[meter]}${why} Tip: ${tips[meter]}`;
}

function checkLoss(dest: Dest, s: GameState): GameState | null {
  for (const m of ["oxygen", "food", "temp"] as Meter[]) {
    if (s[m] <= 0) return { ...s, status: "lost", eventId: null, notices: [], lossReason: explainLoss(dest, s, m) };
  }
  return null;
}

function finish(s: GameState): GameState {
  const low = s.power < 20 || s.oxygen < 20 || s.food < 20 || s.temp < 8;
  return { ...s, status: "won", eventId: null, notices: [], ending: low ? "close" : "hero" };
}

// ---------- time passing ----------

// One turn goes by: the crew uses power, air, food and heat; the sun
// charges the battery in daylight; then the clock moves on.
function endTurn(
  dest: Dest,
  s0: GameState,
  label: string,
  kind: HistoryEntry["kind"],
  action0: Effects,
  notes: string[],
  actionNote?: string,
): GameState {
  const c = config[dest];
  const day = dayOf(dest, s0.turn);
  const light = isDay(dest, s0.turn);
  const base = { turn: s0.turn, day };
  let s = s0;

  // A reply from Houston that was still on its way (Mars delay)
  if (s.houstonReply) {
    notes.unshift("📡 Houston's reply finally arrived.");
    s = {
      ...s,
      houstonReply: undefined,
      notices: [
        ...(s.notices ?? []),
        {
          title: "Houston's reply arrived",
          speaker: "Houston",
          text: `${s.houstonReply} (Your question took ${config[dest].houstonOneWay} to reach Earth, and the answer took just as long to come back.)`,
        },
      ],
    };
  }

  // No battery for this machine? Then it doesn't run.
  const failed = actionFails(dest, s, action0);
  const action: Effects = failed ? {} : scaled(dest, action0);
  if (failed) notes.push("There wasn't enough battery left, so that machine couldn't run.");
  else if (actionNote) notes.push(actionNote);

  const solar = solarNow(dest, s);
  const k = pace(dest);
  const everyday: Effects = {
    power: -c.use.power * k + solar,
    oxygen: -c.use.oxygen * k,
    food: -c.use.food * k,
    temp: -(light ? c.tempLoss.light : c.tempLoss.dark) * k,
  };
  if (solar > 0) notes.push(`Solar panels made +${Math.round(solar)} power${has(s, "dusty") ? " (dusty: half power)" : ""}.`);
  else notes.push(dest === "moon" && !light ? "Shadow: the solar panels made no power." : "Night: the solar panels made no power.");

  // Add everything up first, then check the battery (like a real power budget)
  const raw = {} as Record<Meter, number>;
  for (const m of METERS) raw[m] = s[m] + (action[m] ?? 0) + (everyday[m] ?? 0);
  const entries: HistoryEntry[] = [];
  const record = (lbl: string, k: HistoryEntry["kind"], fx: Effects) => {
    const changes: Effects = {};
    for (const m of METERS) if (fx[m]) changes[m] = fx[m];
    if (Object.keys(changes).length) entries.push({ ...base, label: lbl, kind: k, changes });
  };
  record(failed ? `${label} (failed: no battery)` : label, kind, action);
  record(light ? "Everyday use (sunlight charging)" : "Everyday use in the dark", "auto", everyday);
  if (raw.power <= 0) {
    raw.oxygen -= RATES.blackout.oxygen * k;
    raw.temp -= RATES.blackout.temp * k;
    record("Blackout: heat and air machines stopped", "blackout", { oxygen: -RATES.blackout.oxygen * k, temp: -RATES.blackout.temp * k });
    notes.push("BLACKOUT! The battery is empty, so the heater and air machines shut down. Oxygen and cabin heat are dropping fast.");
  }
  s = { ...s, history: [...s.history, ...entries] };
  for (const m of METERS) s = { ...s, [m]: clampMeter(m, raw[m]) };

  const dose = (c.radiationPerDay / c.turnsPerDay) * (radiationHigh(s) ? RATES.stormRadiationFactor : 1);
  s = { ...s, radiationMsv: Math.round((s.radiationMsv + dose) * 100) / 100, turn: s.turn + 1, log: notes.join(" ") };

  const lost = checkLoss(dest, s);
  if (lost) return lost;
  if (s.turn > totalTurns(dest, s)) return finish(s);

  // A new day begins: the narrator sums up the day, then the next morning's story
  if ((s.turn - 1) % c.turnsPerDay === 0) {
    s = { ...s, notices: [...(s.notices ?? []), daySummary(dest, s, day)] };
    return startDay(dest, s);
  }
  return maybeSurprise(dest, s);
}

// The narrator's end-of-day card: what you did and what it caused.
function daySummary(dest: Dest, s: GameState, day: number): Notice {
  const c = config[dest];
  const word = c.dayWord === "SOL" ? "Sol" : "Day";
  const start = s.dayStart;
  const counts = new Map<string, number>();
  for (const h of s.history) {
    if (h.day !== day || h.kind !== "action") continue;
    const job = h.label.charAt(0).toLowerCase() + h.label.slice(1);
    counts.set(job, (counts.get(job) ?? 0) + 1);
  }
  const jobs = [...counts].map(([job, n]) => (n === 1 ? job : `${job} ${n === 2 ? "twice" : `${n} times`}`));
  const did = jobs.length ? `Today you ${jobs.length > 1 ? `${jobs.slice(0, -1).join(", ")} and ${jobs[jobs.length - 1]}` : jobs[0]}.` : "";
  const parts = start
    ? METERS.map((m) => {
        const d = Math.round(s[m] - start[m]);
        return d === 0 ? null : `${METER_WORD[m]} ${d > 0 ? "+" : ""}${d}${m === "temp" ? " °C" : ""}`;
      }).filter(Boolean)
    : [];
  const result = parts.length ? ` Since this morning: ${parts.join(", ")}.` : "";
  let next = "";
  if (dest === "moon" && c.darkFromDay === day + 1) {
    next = " Tomorrow your base slips into a long shadow: no solar power, and the cabin will cool fast. Charge up and warm up!";
  } else if (s.temp < 12) next = " The cabin is getting cold. Plan a heater run tomorrow.";
  else if (s.oxygen < 30) next = " Oxygen is low. Recycle the air tomorrow.";
  else if (s.food < 30) next = " Food is low. Tend the greenhouse tomorrow.";
  return {
    title: `End of ${word} ${day}`,
    speaker: "Narrator",
    text: `${did}${result}${next} ${word} ${day + 1} of ${totalTurns(dest, s) / c.turnsPerDay} starts now.`.trim(),
  };
}

// ---------- the two things a player can do ----------

// Use a station. Returns the same state with a message if it can't be done.
export function nextTurn(dest: Dest, s: GameState, action: Action): GameState {
  if (s.status !== "playing") return s;
  const check = canAct(dest, s, action);
  if (!check.ok) return { ...s, log: check.reason ?? s.log };

  const a = ACTIONS[action];
  const failed = actionFails(dest, s, a.effects);
  let next = s;
  let note = a.note;
  let laterReply: string | undefined;
  let card: Notice | undefined;
  if (action === "comms" && !failed) {
    const advice = houstonAdvice(dest, s);
    if (dest === "mars") {
      note = "📡 You radioed Houston. The reply is on its way.";
      card = {
        title: "Message sent to Houston",
        speaker: "Comms",
        text: `Mars is so far away that your message takes ${config.mars.houstonOneWay} to reach Earth, and the answer takes just as long to come back. Houston's reply will arrive after your next action. Out here, you have to keep working while you wait.`,
      };
      laterReply = advice;
    } else {
      note = "📡 You called Houston.";
      card = {
        title: "Houston answered",
        speaker: "Houston",
        text: `${advice} (The Moon is close: radio signals reach Earth in ${config.moon.houstonOneWay}, so the answer came back almost right away. On Mars it can take up to 44 minutes for a round trip!)`,
      };
    }
  }
  if (action === "clean") next = setFlag(next, "!dusty");
  if (card) next = { ...next, notices: [...(next.notices ?? []), card] };
  const after = endTurn(dest, next, a.label, "action", a.effects, [], note);
  return laterReply && after.status === "playing" ? { ...after, houstonReply: laterReply } : after;
}

// Answer the event that's on screen.
export function choose(dest: Dest, s: GameState, index: number): GameState {
  const ev = currentEvent(s);
  const ch = ev?.choices[index];
  if (!ev || !ch || s.status !== "playing") return s;

  const day = dayOf(dest, s.turn);
  const base = { turn: s.turn, day };
  let next: GameState = { ...s, eventId: null };
  const notes: string[] = [];
  if (ch.result) notes.push(ch.result);

  next = apply(next, ch.effects ?? {}, { ...base, label: ch.label.replace(/ \(.*\)$/, ""), kind: "choice" });
  if (ch.risk) {
    if (roll(s.seed, s.turn, hashId(ev.id)) < ch.risk.chance) {
      next = apply(next, ch.risk.effects, { ...base, label: ch.risk.label, kind: "choice" });
      notes.push(ch.risk.text);
    } else {
      notes.push(ch.risk.luckyText);
    }
  }
  for (const f of ch.flags ?? []) next = setFlag(next, f);
  if (ch.extraTurns) next = { ...next, extraTurns: next.extraTurns + ch.extraTurns };

  const lost = checkLoss(dest, next);
  if (lost) return lost;
  if (ch.useTurn) return endTurn(dest, next, ch.label.replace(/ \(.*\)$/, ""), "choice", {}, notes);
  return { ...next, log: notes.join(" ") || next.log };
}

// ---------- after the mission ----------

// Start today over (same events, so you can choose differently).
export function retryDay(s: GameState): GameState {
  if (!s.dayStart) return s;
  return { ...s.dayStart, notices: [], dayStart: s.dayStart, log: "Let's try today again." };
}

export function endingText(dest: Dest, s: GameState): string {
  const dose = `Your radiation dose this mission: ${s.radiationMsv.toFixed(1)} mSv. NASA's career limit for astronauts is ${RATES.careerLimitMsv} mSv.`;
  if (s.status === "lost") return s.lossReason ?? "";
  const place = dest === "moon" ? "The rescue ship has landed!" : `You survived all ${config.mars.days} sols on Mars!`;
  if (s.ending === "close") {
    const weakest = METERS.reduce((a, b) => (s[b] / MAX[b] < s[a] / MAX[a] ? b : a));
    return `${place} But your ${METER_WORD[weakest]} was almost empty. "That was close." ${dose}`;
  }
  return `${place} All four meters are in good shape. Hero ending! ${dose}`;
}
