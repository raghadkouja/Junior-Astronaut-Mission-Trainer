// =====================================================================
// story.ts — the story events for "Last Light at Nova Outpost".
// Written from the team's story doc. Facts are REAL and list a source.
// Game numbers (effects) are GAME VALUES you can tune.
//
// How an event works:
//   • `day` events open on the morning of that day (the narrator's scene).
//   • `surprise` events can pop up in the middle of a day (random).
//   • `setsFlags` turn on when the event appears (e.g. "solarStorm").
//   • Every choice must cost something: an action (`useTurn`), a meter,
//     or a lasting problem (like dusty panels). Info cards just continue.
//   • Flags: "dusty" (half solar power), "solarStorm" (radiation is high
//     today), "shelter" (safe from radiation today), "noRadio" (can't call
//     Houston today). "!dusty" in `flags` turns a flag off.
// =====================================================================

import type { Action, Dest, Effects } from "./gameLogic";

export type Fact = { text: string; source: string; url?: string };

export type Choice = {
  label: string; // button text
  effects?: Effects; // meter changes right away
  useTurn?: boolean; // uses one action (the turn passes)
  flags?: string[]; // flags to turn on ("dusty") or off ("!dusty")
  extraTurns?: number; // e.g. the rescue ship is delayed
  risk?: { chance: number; effects: Effects; label: string; text: string; luckyText: string };
  result?: string; // what the narrator says afterwards
  costNote?: string; // a cost that isn't a number, shown on the button
  info?: boolean; // just a "continue" button on an info card
  walkTo?: Action; // the astronaut walks to this station after choosing
  hideSeconds?: number; // ...and goes inside for a moment (e.g. the storm shelter)
};

export type StoryEvent = {
  id: string;
  dest: Dest;
  day?: number; // opens on the morning of this day
  surprise?: boolean; // can pop up randomly in the middle of a day
  title: string;
  speaker: string;
  text: string;
  setsFlags?: string[];
  choices: Choice[];
  fact?: Fact;
};

const NASA_STORM_2024: Fact = {
  text: "In May 2024, the Sun launched a barrage of flares and at least seven clouds of particles toward Earth: the strongest solar storm to reach Earth in two decades.",
  source: "NASA Science: How NASA Tracked the Most Intense Solar Storm in Decades",
  url: "https://science.nasa.gov/science-research/heliophysics/how-nasa-tracked-the-most-intense-solar-storm-in-decades",
};

export const EVENTS: StoryEvent[] = [
  // ------------------------------- MOON -------------------------------
  {
    id: "moon_day1",
    dest: "moon",
    day: 1,
    title: "Day 1: The Long Day",
    speaker: "Narrator",
    text: "You wake up alone at Nova Outpost, near the Moon's south pole. The rescue ship lands in 5 days. Each day you can do 8 jobs: walk to a station and press E, or use the number keys. Keep all four meters up: battery, oxygen, food and cabin heat.",
    choices: [{ label: "Start Day 1", info: true }],
    fact: {
      text: "A day on the Moon lasts about two Earth weeks, and so does the night. Near the Moon's equator the ground heats to about 120 °C (250 °F) in sunlight and drops to about -130 °C (-208 °F) at night.",
      source: "NASA Lunar Reconnaissance Orbiter (Diviner instrument)",
      url: "https://science.nasa.gov/wp-content/uploads/2024/01/lrolitho7temperaturevariation27may2014.pdf",
    },
  },
  {
    id: "moon_day2",
    dest: "moon",
    day: 2,
    title: "Day 2: Solar Flare Warning!",
    speaker: "Narrator",
    text: "Alarm! A solar flare was spotted. A solar flare is a sudden burst of energy from the Sun. Its fast particles will hit the Moon today, and that radiation can make you sick.",
    setsFlags: ["solarStorm"],
    choices: [
      {
        label: "Hide in the storm shelter (uses 1 action)",
        useTurn: true,
        flags: ["shelter"],
        walkTo: "heater",
        hideSeconds: 3,
        result: "You waited in the thick-walled shelter until the worst passed. Safe, but you lost time.",
      },
      {
        label: "Keep working (risk radiation sickness)",
        costNote: "High radiation dose today",
        risk: {
          chance: 0.5,
          effects: { food: -10 },
          label: "Radiation sickness",
          text: "Uh oh: the radiation made you feel sick to your stomach, and you couldn't keep food down.",
          luckyText: "You got lucky this time, but your radiation dose went way up.",
        },
        result: "You kept working while the particles streamed in.",
      },
    ],
    fact: NASA_STORM_2024,
  },
  {
    id: "moon_day3",
    dest: "moon",
    day: 3,
    title: "Day 3: Moon Dust Trouble",
    speaker: "Narrator",
    text: "Sharp, sticky moon dust has coated the solar panels. Dusty panels make only half the power until someone cleans them.",
    setsFlags: ["dusty"],
    choices: [
      {
        label: "Go outside and clean them now (uses 1 action)",
        useTurn: true,
        effects: { oxygen: -3 },
        flags: ["!dusty"],
        walkTo: "clean",
        result: "The panels are sparkling again! Your spacesuit used a little oxygen out there.",
      },
      {
        label: "Clean them later",
        costNote: "Half solar power until cleaned",
        result: "The panels stay dusty for now. You can clean them any time at the solar array.",
      },
    ],
    fact: {
      text: "Apollo astronauts said moon dust smelled like spent gunpowder, and it got into everything.",
      source: "NASA Science: The Mysterious Smell of Moondust (2006)",
    },
  },
  {
    id: "moon_day4",
    dest: "moon",
    day: 4,
    title: "Day 4: Cold Shadows",
    speaker: "Narrator",
    text: "Your base has slipped into a long shadow. No sunlight means no solar power, and the cabin cools down fast. The radio link to Earth is too weak today, so no one can tell you what to do. And there's mold on the lettuce in the greenhouse!",
    setsFlags: ["noRadio"],
    choices: [
      {
        label: "Throw out the moldy lettuce",
        effects: { food: -10 },
        walkTo: "greenhouse",
        result: "You tossed the moldy plants. The rest of the greenhouse is safe.",
      },
      {
        label: "Clean the greenhouse carefully (uses 1 action)",
        useTurn: true,
        effects: { power: -4, food: -2 },
        walkTo: "greenhouse",
        result: "You scrubbed every tray and saved most of the plants.",
      },
    ],
    fact: {
      text: "Some craters near the Moon's poles never see sunlight. NASA's Lunar Reconnaissance Orbiter measured temperatures colder than -246 °C (-410 °F) inside them. Far from Earth, astronauts have to make their own decisions.",
      source: "NASA Science: Weather on the Moon",
      url: "https://science.nasa.gov/moon/sun-and-weather-overview/weather-on-the-moon/",
    },
  },
  {
    id: "moon_day5",
    dest: "moon",
    day: 5,
    title: "Day 5: The Big Storm",
    speaker: "Narrator",
    text: "Rescue day! The ship is on its way, but a big space storm is hitting. The pilots need your landing beacon to find you. Do you power the beacon, or protect yourself in the shelter?",
    setsFlags: ["solarStorm"],
    choices: [
      {
        label: "Power the landing beacon",
        effects: { power: -25 },
        walkTo: "comms",
        result: "The beacon is shining. The pilots can see you!",
      },
      {
        label: "Protect yourself in the shelter (uses 1 action)",
        useTurn: true,
        flags: ["shelter"],
        walkTo: "heater",
        hideSeconds: 3,
        extraTurns: 8,
        costNote: "Rescue delayed 1 day",
        result: "You stayed safe, but without the beacon the ship has to circle and wait. Rescue is delayed by one day.",
      },
    ],
    fact: {
      text: "NASA has a Moon to Mars Space Weather Analysis Office that watches the Sun and warns missions, so crews can get ready before a storm hits.",
      source: NASA_STORM_2024.source,
      url: NASA_STORM_2024.url,
    },
  },
  {
    id: "moon_day6",
    dest: "moon",
    day: 6,
    title: "Day 6: The Long Wait",
    speaker: "Narrator",
    text: "The storm has passed, and the rescue ship is circling for a safe landing. Hang on for one more day!",
    choices: [{ label: "Keep going", info: true }],
  },

  // ------------------------------- MARS -------------------------------
  {
    id: "mars_sol1",
    dest: "mars",
    day: 1,
    title: "Sol 1: Welcome to Mars",
    speaker: "Narrator",
    text: "A day on Mars is called a sol. You have 5 sols, and each sol has 4 daytime turns and 4 nighttime turns. Solar panels only work in the daytime, so plan for the dark. Keep all four meters up: battery, oxygen, food and cabin heat.",
    choices: [{ label: "Start Sol 1", info: true }],
    fact: {
      text: "A sol lasts about 24 hours and 39 minutes, a little longer than a day on Earth.",
      source: "NASA Science: Mars Facts",
    },
  },
  {
    id: "mars_sol3",
    dest: "mars",
    day: 3,
    title: "Sol 3: Dust Storm!",
    speaker: "Narrator",
    text: "A dust storm rolled over the base and covered the solar panels. Dusty panels make only half the power until someone cleans them.",
    setsFlags: ["dusty"],
    choices: [
      {
        label: "Go outside and clean them now (uses 1 action)",
        useTurn: true,
        effects: { oxygen: -3 },
        flags: ["!dusty"],
        walkTo: "clean",
        result: "The panels are clean again! Your spacesuit used a little oxygen out there.",
      },
      {
        label: "Clean them later",
        costNote: "Half solar power until cleaned",
        result: "The panels stay dusty for now. You can clean them any time at the solar array.",
      },
    ],
    fact: {
      text: "In 2018, a dust storm covered all of Mars. It blocked so much sunlight that NASA's Opportunity rover ran out of power.",
      source: "NASA JPL: Opportunity rover mission",
    },
  },
  {
    id: "mars_sol4",
    dest: "mars",
    day: 4,
    title: "Sol 4: Solar Flare Warning!",
    speaker: "Narrator",
    text: "Alarm! A solar flare was spotted. A solar flare is a sudden burst of energy from the Sun. Mars has only a thin atmosphere to protect you, so the radiation today can make you sick.",
    setsFlags: ["solarStorm"],
    choices: [
      {
        label: "Hide in the storm shelter (uses 1 action)",
        useTurn: true,
        flags: ["shelter"],
        walkTo: "heater",
        hideSeconds: 3,
        result: "You waited in the shelter until the worst passed. Safe, but you lost time.",
      },
      {
        label: "Keep working (risk radiation sickness)",
        costNote: "High radiation dose today",
        risk: {
          chance: 0.5,
          effects: { food: -10 },
          label: "Radiation sickness",
          text: "Uh oh: the radiation made you feel sick to your stomach, and you couldn't keep food down.",
          luckyText: "You got lucky this time, but your radiation dose went way up.",
        },
        result: "You kept working while the particles streamed in.",
      },
    ],
    fact: NASA_STORM_2024,
  },
];

// Random surprises: at most a couple per game, each one only once.
export const SURPRISES: StoryEvent[] = [
  {
    id: "micrometeorite",
    dest: "moon",
    surprise: true,
    title: "Surprise: Micrometeorite!",
    speaker: "Narrator",
    text: "Ping! A micrometeorite (a space rock smaller than a grain of sand) hit the habitat and made a tiny air leak.",
    choices: [
      { label: "Patch it now (uses 1 action)", useTurn: true, effects: { power: -2 }, walkTo: "heater", result: "Leak sealed. Good as new." },
      { label: "Put tape on it for now", effects: { oxygen: -8 }, result: "The tape mostly holds, but some air escaped." },
    ],
    fact: {
      text: "The Moon has almost no air, so space rocks of all sizes hit the ground instead of burning up like shooting stars do on Earth.",
      source: "NASA Science: Weather on the Moon",
      url: "https://science.nasa.gov/moon/weather-on-the-moon",
    },
  },
  {
    id: "stuck_hatch_moon",
    dest: "moon",
    surprise: true,
    title: "Surprise: Stuck Hatch!",
    speaker: "Narrator",
    text: "The airlock hatch is stuck, and cold is creeping in around the seal.",
    choices: [
      { label: "Fix the hatch (uses 1 action)", useTurn: true, walkTo: "heater", result: "Hatch fixed and sealed tight." },
      { label: "Block the draft with a blanket", effects: { temp: -4 }, result: "The blanket helps a little, but the cabin got colder." },
    ],
  },
  {
    id: "stuck_hatch_mars",
    dest: "mars",
    surprise: true,
    title: "Surprise: Stuck Hatch!",
    speaker: "Narrator",
    text: "The airlock hatch is stuck, and cold is creeping in around the seal.",
    choices: [
      { label: "Fix the hatch (uses 1 action)", useTurn: true, walkTo: "heater", result: "Hatch fixed and sealed tight." },
      { label: "Block the draft with a blanket", effects: { temp: -4 }, result: "The blanket helps a little, but the cabin got colder." },
    ],
  },
  {
    id: "power_surge_moon",
    dest: "moon",
    surprise: true,
    title: "Surprise: Power Surge!",
    speaker: "Narrator",
    text: "Zap! A power surge tripped the breakers all over the base.",
    choices: [
      { label: "Reset each system carefully (uses 1 action)", useTurn: true, walkTo: "conserve", result: "Everything is back online safely." },
      { label: "Flip everything back on at once", effects: { power: -15 }, result: "That worked, but the jolt drained the battery." },
    ],
  },
  {
    id: "power_surge_mars",
    dest: "mars",
    surprise: true,
    title: "Surprise: Power Surge!",
    speaker: "Narrator",
    text: "Zap! A power surge tripped the breakers all over the base.",
    choices: [
      { label: "Reset each system carefully (uses 1 action)", useTurn: true, walkTo: "conserve", result: "Everything is back online safely." },
      { label: "Flip everything back on at once", effects: { power: -15 }, result: "That worked, but the jolt drained the battery." },
    ],
  },
  {
    id: "cold_snap_moon",
    dest: "moon",
    surprise: true,
    title: "Surprise: Cold Snap!",
    speaker: "Narrator",
    text: "Brrr! A heater fan broke, and the cabin is cooling fast.",
    choices: [
      { label: "Fix the fan (uses 1 action)", useTurn: true, effects: { power: -2 }, walkTo: "heater", result: "The fan is spinning again." },
      { label: "Put on an extra layer", effects: { temp: -5 }, result: "You're bundled up, but the cabin got colder." },
    ],
  },
  {
    id: "cold_snap_mars",
    dest: "mars",
    surprise: true,
    title: "Surprise: Cold Snap!",
    speaker: "Narrator",
    text: "Brrr! A heater fan broke, and the cabin is cooling fast.",
    choices: [
      { label: "Fix the fan (uses 1 action)", useTurn: true, effects: { power: -2 }, walkTo: "heater", result: "The fan is spinning again." },
      { label: "Put on an extra layer", effects: { temp: -5 }, result: "You're bundled up, but the cabin got colder." },
    ],
  },
];
