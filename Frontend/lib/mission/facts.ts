// =====================================================================
// lib/mission/facts.ts  (NEW)
// The Research Fact Book. A new card unlocks every 2–3 finished tasks
// and every time Houston answers a call. Every fact names its source.
// =====================================================================

import type { Dest } from "./config";

export type FactSource = "DONKI" | "OSDR" | "Diviner" | "RadLab" | "CSA" | "APOD" | "NASA" | "Mars";

export type Fact = {
  id: string;
  title: string;
  text: string;
  source: FactSource;
  credit: string; // who published it
  kid?: string; // one short line for pop-up cards (ages 7–12); the Fact Book shows the full text
  url?: string;
  only?: Dest; // show only on this destination
};

export const FACTS: Fact[] = [
  // ---- Space weather (DONKI) ----
  {
    id: "flare-what",
    title: "What is a solar flare?",
    text: "A solar flare is a sudden flash of energy from the Sun. Scientists sort them by strength: C (small), M (10× bigger) and X (10× bigger again). An X9 flare is nine times the start of the X class!",
    source: "DONKI", credit: "NASA DONKI space weather database",
    url: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
  },
  {
    id: "flare-2024",
    title: "The biggest flare in 7 years",
    kid: "In 2024 the Sun fired an X9 flare, its biggest in years!",
    text: "On October 3, 2024, sunspot region 13842 fired an X9.0 flare, the strongest of the Sun's current 11-year cycle so far.",
    source: "DONKI", credit: "NASA DONKI / NOAA GOES",
    url: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
  },
  {
    id: "flare-mars-2017",
    title: "A storm you could measure on Mars",
    text: "In September 2017 an X8.2 flare sent particles all the way to Mars. Curiosity's radiation detector saw the dose on the ground more than double.",
    source: "DONKI", credit: "NASA / JPL Curiosity RAD",
  },
  // ---- Radiation (RadLab-style ISS dosimetry) ----
  {
    id: "rad-iss",
    title: "Radiation on the Space Station",
    text: "Astronauts on the ISS wear dosimeters (radiation badges). They usually get about 0.2 to 0.5 millisieverts (mSv) each day, which is many times more than people on Earth.",
    source: "RadLab", credit: "NASA crew dosimetry (OCHMO brief)",
    url: "https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf",
  },
  {
    id: "rad-limits",
    title: "Safety limits for astronauts",
    kid: "NASA limits how much space radiation each astronaut can get in a lifetime.",
    text: "NASA keeps each astronaut's lifetime space radiation under 600 mSv, and the dose from one solar storm under 250 mSv. That's why storm shelters matter.",
    source: "RadLab", credit: "NASA-STD-3001 (OCHMO)",
    url: "https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf",
  },
  {
    id: "rad-moon",
    title: "Radiation on the Moon",
    text: "China's Chang'e 4 lander measured about 1.37 mSv per day on the Moon's surface. That's 2–3 times more than inside the ISS, because the Moon has no magnetic field or air.",
    source: "RadLab", credit: "Zhang et al. 2020, Science Advances",
  },
  {
    id: "rad-mars",
    title: "Radiation on Mars",
    text: "NASA's Curiosity rover measured about 0.64 mSv per day on the surface of Mars. The thin Martian air blocks a little, but not much.",
    source: "RadLab", credit: "Hassler et al. 2014, Science (Curiosity RAD)",
  },
  // ---- Temperature (LRO Diviner / Curiosity REMS) ----
  {
    id: "div-coldest",
    title: "The coldest place ever measured",
    text: "LRO's Diviner instrument found craters near the Moon's poles that never see sunlight. They can be about -249 °C (-416 °F), colder than Pluto!",
    source: "Diviner", credit: "NASA LRO Diviner (Paige et al.)",
    url: "https://www.lroc.asu.edu/",
  },
  {
    id: "div-swing",
    title: "Hot days, freezing nights",
    kid: "The Moon's ground goes from oven-hot (120 °C) to freezing (-130 °C)!",
    text: "Near the Moon's equator the ground reaches about 120 °C (250 °F) at noon and drops to about -130 °C (-208 °F) at night. A Moon day lasts about two Earth weeks.",
    source: "Diviner", credit: "NASA LRO Diviner / CSA",
    only: "moon",
  },
  {
    id: "rems-mars",
    title: "Mars weather report",
    kid: "On Mars it swings from about 0 °C to -70 °C every single day!",
    text: "Curiosity's weather station at Gale Crater measured air around 0 °C in the afternoon and about -70 °C before dawn, a 70-degree swing every single sol.",
    source: "Mars", credit: "NASA/JPL Curiosity REMS",
    only: "mars",
  },
  {
    id: "iss-cabin",
    title: "The comfy zone",
    text: "Inside the ISS, the temperature is kept between about 18 and 27 °C (65–80 °F). That's your goal zone on the thermometer.",
    source: "NASA", credit: "NASA ISS Environmental Control & Life Support",
  },
  // ---- Astronaut health (OSDR / Human Research Program) ----
  {
    id: "osdr-bones",
    title: "Bones in space",
    text: "Without gravity pulling on them, astronauts' bones lose about 1–1.5% of their strength each month. That's why ISS crews exercise about 2 hours every day.",
    source: "OSDR", credit: "NASA Human Research Program",
    url: "https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/",
  },
  {
    id: "osdr-sleep",
    title: "16 sunrises a day",
    text: "The ISS circles Earth every 90 minutes, so astronauts see 16 sunrises a day! NASA uses special lights (bluer in the morning, redder at night) to help them sleep.",
    source: "OSDR", credit: "NASA sleep & circadian research",
  },
  {
    id: "osdr-lettuce",
    title: "First space salad",
    kid: "In 2015, astronauts ate lettuce they grew in space!",
    text: "On August 10, 2015, ISS astronauts ate red romaine lettuce they grew themselves in NASA's Veggie plant chamber.",
    source: "OSDR", credit: "NASA Veggie experiment",
  },
  // ---- Food (CSA toolkit) ----
  {
    id: "csa-farm",
    title: "Farming on the Moon",
    kid: "Farming on the Moon is hard: little water, no air, and lots of radiation.",
    text: "The Canadian Space Agency says Moon farms face 4 big problems: little water, no air, strong radiation, and dusty soil with no nutrients. Plants may grow in water instead of soil (hydroponics).",
    source: "CSA", credit: "CSA Food Production toolkit",
    url: "https://asc-csa.gc.ca/eng/youth-educators/toolkits/food-production",
  },
  {
    id: "csa-challenge",
    title: "Space farms help Earth too",
    text: "In 2024 the Canadian Space Agency and NASA picked winners of the Deep Space Food Challenge. Their indoor farms could also feed people in remote places on Earth, like Canada's North.",
    source: "CSA", credit: "Canadian Space Agency, Deep Space Food Challenge",
    url: "https://asc-csa.gc.ca/eng/youth-educators/toolkits/food-production",
  },
  {
    id: "csa-food",
    title: "Space food rules",
    text: "Food sent to space must not be crumbly (crumbs float into machines!) or fizzy, and comes in small packages. The Canadian Space Agency picks Canadian foods for its astronauts.",
    source: "CSA", credit: "CSA 'O Canada! Food on the ISS'",
  },
  // ---- Dust, rocks & radio ----
  {
    id: "dust-smell",
    title: "Moon dust smells like gunpowder",
    text: "Apollo astronauts said fresh Moon dust smelled like spent gunpowder once they took off their helmets. It is sharp, clingy and gets into everything.",
    source: "NASA", credit: "NASA Apollo crew reports",
    only: "moon",
  },
  {
    id: "lro-craters",
    title: "New craters every year",
    kid: "A NASA spacecraft spotted over 200 brand-new craters on the Moon!",
    text: "Comparing before-and-after photos, NASA's Lunar Reconnaissance Orbiter found over 200 brand-new impact craters made during its mission. Space rocks hit the Moon all the time.",
    source: "NASA", credit: "NASA LRO / LROC (Speyerer et al. 2016)",
    url: "https://www.lroc.asu.edu/posts/943",
  },
  {
    id: "mars-conjunction",
    title: "When the Sun blocks the radio",
    text: "About every two years the Sun sits between Earth and Mars. NASA stops sending commands to Mars rovers for about two weeks, so they must work on their own.",
    source: "Mars", credit: "NASA/JPL Mars solar conjunction",
    only: "mars",
  },
  {
    id: "mars-moxie",
    title: "Making oxygen on Mars",
    kid: "NASA's MOXIE machine made oxygen out of the air on Mars!",
    text: "NASA's MOXIE experiment on the Perseverance rover made 122 grams of oxygen from the Martian air between 2021 and 2023, enough for a small dog to breathe for about 10 hours.",
    source: "Mars", credit: "NASA/JPL MOXIE",
    only: "mars",
  },
  {
    id: "mars-dust",
    title: "Dust can end a mission",
    kid: "In 2018 a giant dust storm on Mars blocked the Sun and ended the Opportunity rover.",
    text: "In 2018 a planet-wide dust storm blocked the Sun and NASA's solar-powered Opportunity rover ran out of power after almost 15 years on Mars.",
    source: "Mars", credit: "NASA/JPL Opportunity",
    only: "mars",
  },
  {
    id: "apod",
    title: "A new sky every day",
    kid: "Since 1995, NASA has shared a new real space photo every single day!",
    text: "Since 1995, NASA's Astronomy Picture of the Day has shared a different real space photo every single day, each explained by a professional astronomer.",
    source: "APOD", credit: "NASA APOD",
    url: "https://apod.nasa.gov/apod/",
  },
  // ---- Rat lab (NASA Rodent Research on the ISS) ----
  {
    id: "rats-rr1",
    title: "Mice in orbit",
    kid: "In 2014, NASA sent 20 mice to live on the space station!",
    text: "NASA's first Rodent Research mission sent 20 mice to the International Space Station on September 21, 2014, aboard a SpaceX Dragon cargo capsule.",
    source: "OSDR", credit: "NASA Ames Research Center",
    url: "https://ntrs.nasa.gov/citations/20190001971",
  },
  {
    id: "rats-racetrack",
    title: "Racing in zero-g",
    text: "Mice on the space station floated and pushed off with their front paws. Within a few days, many began running laps around their habitat. Scientists called it 'race-tracking'.",
    source: "OSDR", credit: "NASA Ames Research Center",
    url: "https://ntrs.nasa.gov/citations/20160001706",
  },
  {
    id: "rats-habitat",
    title: "A home for space rodents",
    kid: "Space station rodent homes have food, water, fresh air, and day-night lights.",
    text: "Each Rodent Habitat on the space station can house 10 mice or 6 rats for up to 90 days, with food, water, fresh air, and lights that copy day and night.",
    source: "OSDR", credit: "ISS National Laboratory",
    url: "https://issnationallab.org/upward/rodent-rocket-research/",
  },
  {
    id: "rats-why",
    title: "Why send rodents?",
    kid: "Mice live about 2 years, so scientists can see how space affects bodies faster.",
    text: "Mice and rats live about two years and get many of the same illnesses and aging changes as people, just faster. That helps scientists learn how space affects bodies sooner.",
    source: "OSDR", credit: "ISS National Laboratory",
    url: "https://issnationallab.org/upward/rodent-rocket-research/",
  },
  // ---- Sleep ----
  {
    id: "sleep-85",
    title: "Bedtime in orbit",
    text: "NASA schedules 8.5 hours of sleep a night for astronauts. A 10-year study found they really slept only about 6 hours, so NASA now works hard to help crews rest.",
    source: "OSDR", credit: "NASA-funded astronaut sleep study (2014)",
    url: "https://www.space.com/26829-astronauts-space-station-sleep-deprivation.html",
  },
];

export function factsFor(dest: Dest): Fact[] {
  return FACTS.filter((f) => !f.only || f.only === dest);
}

export const SOURCE_LABEL: Record<FactSource, string> = {
  DONKI: "Space weather · DONKI",
  OSDR: "Astronaut health · OSDR / HRP",
  Diviner: "Temperature · LRO Diviner",
  RadLab: "Radiation · ISS dosimetry",
  CSA: "Food · CSA toolkit",
  APOD: "Sky photo · APOD",
  NASA: "NASA mission records",
  Mars: "Mars missions · NASA/JPL",
};
