// =====================================================================
// lib/mission/config.ts  (NEW)
// Every number the mission uses lives here.
//   REAL  = measured / published value (source in the comment)
//   GAME  = tuned for fun and learning (change freely)
// =====================================================================

export type Dest = "moon" | "mars";
export type MeterId = "battery" | "oxygen" | "food" | "temp";

// ---------- Mission length (real-time clock, not turns) ----------
export const MISSION = {
  days: 5, //                 GAME  rescue ship lands at the end of day 5 (story)
  daySeconds: 120, //          GAME  one in-game day = 2 real minutes
  sunrise: 0.0, //             GAME  fraction of the day when the sun is fully up
  sunset: 0.62, //             GAME  daylight lasts 62% of each day
  twilight: 0.05, //           GAME  length of dawn / dusk fade
  overtimeSeconds: 30, //      GAME  extra time if the landing beacon is off
};

// ---------- Starting supplies ----------
export const START = { battery: 75, oxygen: 80, food: 70, tempC: 21 };

// ---------- How things change every real second ----------
export const RATES = {
  oxygenUse: 0.26, //          GAME  breathing (scaled from REAL 0.84 kg O2 / person / day, NASA BVAD)
  sprintOxygen: 0.22, //       GAME  extra O2 while sprinting: you breathe harder
  foodUse: 0.12, //            GAME
  batteryBase: 0.09, //        GAME  life support is always on
  solarMax: { moon: 0.62, mars: 0.54 }, // GAME  Mars gets ~43% of Earth's sunlight (REAL, NASA) vs ~100% at the Moon
  cabinCoolDay: 0.035, //      GAME  °C lost per second in daylight
  cabinCoolNight: 0.085, //     GAME  °C lost per second at night
  coldMultiplier: 1.7, //      GAME  cold shadow / cold snap cools the cabin this much faster
  dustPerDay: { moon: 0.04, mars: 0.08 }, // GAME  panels get dustier every day
  blackout: { oxygen: 0.42, temp: 0.12, food: 0.05 }, // GAME  extra losses when battery = 0
};

// ---------- Stamina (sprinting) ----------
// GAME: running in a bulky suit tires you out. Real moonwalkers moved in
// short hops and rested often; Apollo crews' heart rates were watched
// from Earth so they didn't overwork.
export const STAMINA = {
  max: 100,
  sprintDrain: 20, //   GAME  per second while sprinting (about 5 s of running)
  regen: 10, //         GAME  per second while walking or standing
  tiredRegen: 6, //     GAME  slower if you skipped sleep last night
  windedUntil: 35, //   GAME  hit 0 → no sprinting until it climbs back to this
};

// ---------- Cabin temperature ----------
export const TEMP = {
  goalMin: 18, //  REAL  ISS cabin is kept at about 18–27 °C (65–80 °F), NASA ECLSS
  goalMax: 27, //  REAL
  danger: 12, //   GAME  thermometer turns red
  fail: 5, //      GAME  hypothermia: mission fails
  max: 30, //      GAME  the heater can't go higher
};

// ---------- Outside temperature shown on the HUD ----------
// REAL Moon: LRO Diviner / CSA: about +120 °C in sunlight, about -130 °C at night (equator).
//      Diviner measured about -249 °C (26 K) inside permanently shadowed polar craters.
// REAL Mars: Curiosity REMS at Gale Crater: highs near 0 °C, lows near -70 °C.
export const OUTSIDE_TEMP = {
  moon: { day: 120, night: -130, shadowCrater: -249 },
  mars: { day: 0, night: -70, shadowCrater: -70 },
};

// ---------- Radiation (millisieverts, mSv) ----------
export const RADIATION = {
  // REAL background dose on the surface per day:
  //   Moon 1.37 mSv/day (Chang'e 4 LND, Zhang et al. 2020)
  //   Mars 0.64 mSv/sol (Curiosity RAD, Hassler et al. 2014)
  mSvPerDay: { moon: 1.37, mars: 0.64 },
  // REAL: ISS crews get about 0.2–0.5 mSv/day (NASA crew dosimetry / OCHMO).
  issPerDay: { low: 0.2, high: 0.5 },
  careerLimit: 600, //       REAL  NASA-STD-3001 career limit
  stormEventLimit: 250, //   REAL  NASA limit for one solar particle event
  shelterBlocks: 0.85, //    GAME  storm shelter blocks 85% of storm particles
  stormDosePerX: 15, //      GAME  unsheltered storm dose = 15 mSv per "X1" of flare strength
  stormDoseMin: 6,
  stormDoseMax: 160,
  sickAt: 50, //             GAME  flight surgeon orders rest above this storm dose
  warnSeconds: 20, //        GAME  warning before the storm hits
  stormSeconds: 30, //       GAME  how long the storm lasts
  // GAME: a big total dose makes you tired and slow (real radiation sickness
  // starts around 1000 mSv; scaled down for a 5-day game).
  slowFrom: 100, //          GAME  below this dose you move at full speed
  slowMax: 300, //           GAME  at or above this dose you are as slow as it gets
  slowestSpeed: 0.6, //      GAME  60% walking speed at slowMax
};

/** Walking-speed multiplier from total radiation dose (1 = full speed). */
export function radiationSpeed(doseMsv: number) {
  const t = Math.max(0, Math.min(1, (doseMsv - RADIATION.slowFrom) / (RADIATION.slowMax - RADIATION.slowFrom)));
  return 1 - t * (1 - RADIATION.slowestSpeed);
}

// ---------- One-way radio delay ----------
export const COMMS = {
  moonOneWaySec: 1.3, //               REAL  Earth–Moon ≈ 1.3 light-seconds
  marsOneWayMin: { min: 3, max: 22 }, // REAL  3–22 minutes depending on orbits
  marsSpeedUp: 60, //                   GAME  1 real minute of delay = 1 game second
};

// ---------- Breakdowns ----------
export const BREAKDOWN = {
  firstAfterTasks: 3, //  GAME  nothing breaks before 3 tasks
  everyMin: 4, //         GAME  then something breaks every 4–5 jobs
  everyMax: 5,
  patchLastsTasks: 3, //  GAME  a duct-tape patch fails again after 3 more jobs
};

export const FACTS_EVERY = { min: 2, max: 3 }; // GAME  a new fact every 2–3 tasks

// ---------- Stations & tasks (no free choices) ----------
export type StationId = "habitat" | "greenhouse" | "recycle" | "conserve" | "solar" | "comms" | "beacon" | "lab" | "bed";
export type TaskId =
  | "heater" | "shelter" | "greenhouse" | "recycle" | "conserve" | "clean" | "call" | "beacon" | "feedRats" | "shieldRats"
  | "sleep";
export type Effects = Partial<{ battery: number; oxygen: number; food: number; tempC: number }>;

export const TASKS: Record<
  TaskId,
  { label: string; verb: string; icon: string; secs: number; effects: Effects; needsPower: boolean; teaches: string }
> = {
  heater: {
    label: "HEATER", verb: "TURN UP THE HEATER", icon: "🔥", secs: 2.5,
    effects: { tempC: +7, battery: -14 }, needsPower: true,
    teaches: "Heat uses the same battery that makes your air.",
  },
  shelter: {
    label: "SHELTER", verb: "HIDE IN STORM SHELTER", icon: "🛡️", secs: 1.2,
    effects: {}, needsPower: false,
    teaches: "Thick walls and water tanks block solar storm particles.",
  },
  greenhouse: {
    label: "GREENHOUSE", verb: "RUN THE GREENHOUSE", icon: "🌱", secs: 3,
    effects: { food: +14, oxygen: +5, tempC: +0.5, battery: -8 }, needsPower: true,
    teaches: "Plants make food AND a little oxygen, but grow lights need power.",
  },
  recycle: {
    label: "RECYCLE AIR", verb: "RECYCLE THE AIR", icon: "♻️", secs: 3,
    effects: { oxygen: +22, battery: -12 }, needsPower: true,
    teaches: "Splitting water into oxygen takes a lot of electricity.",
  },
  conserve: {
    label: "CONSERVE", verb: "CONSERVE POWER", icon: "🔌", secs: 2,
    effects: { battery: +18, tempC: -1.5, oxygen: -2 }, needsPower: false,
    teaches: "Saving power means the heater and air machines rest too.",
  },
  clean: {
    label: "CLEAN PANELS", verb: "CLEAN THE SOLAR PANELS", icon: "🧹", secs: 4,
    effects: { oxygen: -4 }, needsPower: false,
    teaches: "Going outside uses spacesuit air, but clean panels make more power.",
  },
  call: {
    label: "CALL HOUSTON", verb: "CALL HOUSTON", icon: "📡", secs: 2,
    effects: { battery: -4 }, needsPower: true,
    teaches: "Radio signals take time to cross space.",
  },
  beacon: {
    label: "BEACON", verb: "POWER THE LANDING BEACON", icon: "🚨", secs: 3,
    effects: { battery: -20 }, needsPower: true,
    teaches: "The rescue ship needs the beacon to find the landing pad.",
  },
  feedRats: {
    label: "FEED RATS", verb: "FEED THE LAB RATS", icon: "🐀", secs: 3,
    effects: { food: -3 }, needsPower: false,
    teaches: "Animals in space need food, water and care every day, just like astronauts.",
  },
  shieldRats: {
    label: "SHIELD RATS", verb: "MOVE THE RATS TO THE SHIELDED ROOM", icon: "🛡️", secs: 1.5,
    effects: {}, needsPower: false,
    teaches: "Space radiation is dangerous for animals too, so they need shielding.",
  },
  sleep: {
    label: "SLEEP", verb: "GO TO SLEEP", icon: "🛏️", secs: 1,
    effects: {}, needsPower: false,
    teaches: "NASA schedules 8.5 hours of sleep a night for space station crews.",
  },
};

// ---------- Space rocks to collect ----------
export const ROCKS = {
  oxygen: 5, // GAME  oxygen you get from each rock
  // REAL: lunar regolith is about 40-45% oxygen by weight, locked inside minerals (ESA 2019; NASA CaRD)
};

// ---------- Sleep (bed inside the base) ----------
export const SLEEP = {
  realSeconds: 7, // GAME  a night's sleep always takes about 7 real seconds (the rest of the night speeds by)
  restedMul: 0.8, // GAME  jobs take 20% less time the day after you slept
  tiredMul: 1.2, //  GAME  jobs take 20% longer if you skipped sleep
  // REAL: NASA schedules 8.5 hours of sleep a night for ISS crews (they average about 6)
};

// ---------- Rat lab (inspired by NASA's Rodent Research missions on the ISS) ----------
export const RATS = {
  start: 100, //          GAME  rat health at the start (%)
  hungerLoss: 20, //      GAME  health lost at the end of a day they weren't fed
  stormLossPerSec: 1.2, // GAME  health lost per second while left out in a radiation storm
  bonusAt: 70, //         GAME  rats this healthy at the end = science bonus
  // REAL: each ISS Rodent Habitat holds 10 mice or 6 rats for up to 90 days (ISS National Lab)
};

// ---------- Systems that can break, and the spare part that fixes each ----------
export type SystemId = "habitat" | "greenhouse" | "recycle" | "conserve" | "solar" | "comms";
export type PartId = "filter" | "seal" | "fuse" | "cell" | "panel" | "wire" | "tape";

export const PARTS: Record<PartId, { name: string; icon: string; start: number }> = {
  filter: { name: "Air filter", icon: "🧽", start: 2 },
  seal: { name: "Pump seal", icon: "⭕", start: 1 },
  fuse: { name: "Heater fuse", icon: "🔶", start: 1 },
  cell: { name: "Battery cell", icon: "🔋", start: 1 },
  panel: { name: "Solar cell", icon: "🟦", start: 1 },
  wire: { name: "Wire kit", icon: "🧵", start: 1 },
  tape: { name: "Duct tape", icon: "🩹", start: 3 },
};

export const FAULTS: Record<
  SystemId,
  { name: string; part: PartId; problem: string; effect: string; steps: number }
> = {
  habitat: {
    name: "Airlock seal leak", part: "fuse", steps: 4,
    problem: "The airlock seal is leaking AND it blew the heater fuse!",
    effect: "Oxygen leaks out and the heater won't work.",
  },
  greenhouse: {
    name: "Water pump leak", part: "seal", steps: 4,
    problem: "The greenhouse water pump sprang a leak.",
    effect: "Plants can't grow and some food spoils.",
  },
  recycle: {
    name: "Clogged air filter", part: "filter", steps: 4,
    problem: "The air recycler's filter is clogged with dust.",
    effect: "No new oxygen, and the air gets stale faster.",
  },
  conserve: {
    name: "Battery cell short", part: "cell", steps: 5,
    problem: "A battery cell shorted out.",
    effect: "The battery slowly drains away.",
  },
  solar: {
    name: "Cracked solar cell", part: "panel", steps: 4,
    problem: "A tiny space rock cracked a solar cell.",
    effect: "Solar panels make half as much power.",
  },
  comms: {
    name: "Dish out of alignment", part: "wire", steps: 3,
    problem: "The comms dish got knocked out of line and a cable snapped.",
    effect: "You can't call Houston.",
  },
};

// ---------- Real solar flares (offline backup when DONKI can't be reached) ----------
// Sources: NASA DONKI flare records / NOAA GOES X-ray class; peak times in UTC.
export const ARCHIVED_FLARES = [
  { classType: "X9.0", peak: "2024-10-03T12:18Z", region: "AR 13842", note: "Strongest flare of Solar Cycle 25 so far." },
  { classType: "X8.7", peak: "2024-05-14T16:51Z", region: "AR 13664", note: "Same sunspot group behind the May 2024 'Gannon' storm." },
  { classType: "X7.1", peak: "2024-10-01T22:20Z", region: "AR 13842", note: "Came with a cloud of gas (CME) aimed at Earth." },
  { classType: "X5.8", peak: "2024-05-11T01:23Z", region: "AR 13664", note: "Part of the storm that made auroras visible far south." },
  { classType: "X5.1", peak: "2025-11-11T10:04Z", region: "AR 14274", note: "One of the biggest flares of 2025." },
  { classType: "X9.3", peak: "2017-09-06T12:02Z", region: "AR 12673", note: "Strongest flare of Solar Cycle 24." },
  { classType: "X8.2", peak: "2017-09-10T16:06Z", region: "AR 12673", note: "Its particles more than doubled radiation on Mars (Curiosity RAD)." },
];
