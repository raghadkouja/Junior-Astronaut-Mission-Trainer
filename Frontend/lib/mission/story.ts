// =====================================================================
// lib/mission/story.ts  (NEW)
// "Last Light at Nova Outpost": all the words the Narrator and Houston
// say live here, so writers can change the story without touching rules.
// =====================================================================

import type { Dest } from "./config";

export type DayScript = {
  title: string;
  lines: string[]; //           narrator sets the scene (science words explained in plain language)
  fact: { text: string; credit: string };
};

export const PLACE: Record<Dest, { base: string; where: string }> = {
  moon: { base: "Nova Outpost", where: "near the Moon's south pole, the real Artemis landing region" },
  mars: { base: "Nova Outpost", where: "in Jezero Crater on Mars, where the Perseverance rover explores" },
};

export function dayScript(dest: Dest, day: number): DayScript {
  const moon = dest === "moon";
  switch (day) {
    case 1:
      return {
        title: "The Long Day",
        lines: [
          `You wake up alone at ${PLACE[dest].base}, ${PLACE[dest].where}.`,
          "A solar storm damaged the base, so the rest of the crew flew home. A rescue ship lands in 5 days.",
          "Watch your 4 survival meters: Battery, Oxygen, Food and Cabin Temperature. They all drop a little every second.",
          "Walk to a building and press SPACE to use it. Every choice helps one thing and costs another.",
        ],
        fact: moon
          ? { text: "A day on the Moon lasts about 2 Earth weeks, then night lasts 2 weeks too. Our base runs a shorter pretend day so the crew can sleep normally.", credit: "NASA / LRO Diviner" }
          : { text: "A day on Mars is called a sol. It lasts 24 hours 39 minutes, just a little longer than an Earth day.", credit: "NASA / JPL" },
      };
    case 2:
      return {
        title: "Solar Flare Warning!",
        lines: [
          "Space weather scientists are watching the Sun today.",
          "A solar flare is a giant burst of energy from the Sun. It can throw out fast particles that are dangerous to astronauts (that's radiation).",
          "When the warning sounds, hide in the STORM SHELTER inside the base. You'll be safe, but you can't do any work while you hide.",
        ],
        fact: { text: "Astronauts on the Moon will need storm shelters, just like this one. NASA limits the dose from one solar storm to 250 mSv.", credit: "NASA-STD-3001 (OCHMO)" },
      };
    case 3:
      return moon
        ? {
            title: "Moon Dust Trouble",
            lines: [
              "Sharp, sticky Moon dust is drifting onto the solar panels.",
              "Dusty panels make less power, so your battery charges slower.",
              "Go outside and clean them (your spacesuit uses some oxygen), or watch your power fall.",
            ],
            fact: { text: "Apollo astronauts said Moon dust smelled like spent gunpowder and got into everything.", credit: "NASA Apollo crew reports" },
          }
        : {
            title: "Dust Storm!",
            lines: [
              "A Martian dust storm is rolling across Jezero Crater.",
              "Dust blocks sunlight, so the solar panels make much less power, and it settles on them too.",
              "Clean the panels after the storm passes, or watch your power fall.",
            ],
            fact: { text: "In 2018 a planet-wide dust storm ended NASA's solar-powered Opportunity rover after almost 15 years.", credit: "NASA / JPL" },
          };
    case 4:
      return moon
        ? {
            title: "Cold Shadows",
            lines: [
              "The base slips into a long shadow and the cold creeps in. Your cabin cools twice as fast today.",
              "The radio link to Earth is weak too, so nobody can tell you what to do. You must decide alone.",
              "And something is growing in the greenhouse that shouldn't be…",
            ],
            fact: { text: "Some craters near the Moon's poles never see sunlight. LRO's Diviner measured about -249 °C there, colder than Pluto.", credit: "NASA LRO Diviner" },
          }
        : {
            title: "Cold Night, No Radio",
            lines: [
              "A very cold night is coming. Your cabin cools twice as fast today.",
              "The Sun is between Earth and Mars (solar conjunction), so radio messages can't get through. You must decide alone.",
              "And something is growing in the greenhouse that shouldn't be…",
            ],
            fact: { text: "Every 2 years NASA stops sending commands to Mars for about 2 weeks during solar conjunction.", credit: "NASA / JPL" },
          };
    default:
      return {
        title: "The Big Storm",
        lines: [
          "Rescue day! The ship lands when this day ends.",
          "But a big solar storm is coming. You need to POWER THE LANDING BEACON (costs a lot of battery) AND stay safe from radiation AND stay warm.",
          "Plan your battery carefully. Survive until the ship lands!",
        ],
        fact: { text: "Mission planners always check space weather before launches and landings.", credit: "NASA Space Weather" },
      };
  }
}

// ---------- Random surprises: any day from 2 to 5, so no two games are the same ----------
export type SurpriseId = "micrometeorite" | "stuckHatch" | "powerSurge" | "coldSnap" | "locker";

export const SURPRISES: Record<SurpriseId, { title: string; lines: string[]; fact?: { text: string; credit: string } }> = {
  micrometeorite: {
    title: "Micrometeorite strike!",
    lines: ["A micrometeorite (a space rock smaller than a pea) zipped in at high speed and hit the base. Something broke!"],
    fact: { text: "NASA's LRO spotted over 200 brand-new craters on the Moon during its mission. Space rocks hit all the time.", credit: "NASA LRO (Speyerer et al. 2016)" },
  },
  stuckHatch: {
    title: "Stuck hatch!",
    lines: ["The airlock hatch is jammed with dust. You need to get it working."],
  },
  powerSurge: {
    title: "Power surge!",
    lines: ["ZAP! A power surge rushed through the wires. Some battery charge was lost and a battery cell shorted out."],
  },
  coldSnap: {
    title: "Sudden cold snap",
    lines: ["The outside temperature just plunged. The cabin is cooling fast for the next 30 seconds."],
  },
  locker: {
    title: "Forgotten storage locker",
    lines: ["You notice a dusty storage locker the crew left behind. There might be spare parts inside, but searching takes time."],
  },
};

export function moldScript(): { title: string; lines: string[] } {
  return {
    title: "Mold on the lettuce!",
    lines: [
      "Fuzzy white mold is growing on the greenhouse lettuce. On a space base, extra moisture can make mold grow.",
      "If it spreads, the whole greenhouse could stop working.",
    ],
  };
}
