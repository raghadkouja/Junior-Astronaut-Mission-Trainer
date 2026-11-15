import type { Dest } from "./gameLogic";

export type FunFact = { text: string; source: string; url: string };

const MOON_5 = "https://science.nasa.gov/moon/five-things-to-know-about-the-moon/";
const MOON_FACTS = "https://science.nasa.gov/moon/facts/";
const MARS_FACTS = "https://science.nasa.gov/mars/facts/";

export const funFacts: Record<Dest, FunFact[]> = {
  moon: [
    { text: "The Moon spins at the same speed it circles Earth, so we always see the same side!", source: "NASA", url: MOON_FACTS },
    { text: "The Moon is drifting away from Earth by about 4 cm (1.5 in) every year.", source: "NASA", url: MOON_5 },
    { text: "The Moon is about as wide as the United States.", source: "NASA", url: MOON_5 },
    { text: "All the other big planets could fit in the space between Earth and the Moon!", source: "NASA", url: MOON_5 },
    { text: "The Moon doesn't make its own light. It reflects light from the Sun.", source: "NASA", url: MOON_5 },
  ],
  mars: [
    { text: "Mars has the biggest volcano in the solar system: Olympus Mons, 3 times taller than Mount Everest!", source: "NASA", url: MARS_FACTS },
    { text: "Mars has two tiny potato-shaped moons named Phobos and Deimos.", source: "NASA", url: MARS_FACTS },
    { text: "In about 50 million years, Phobos may break apart and give Mars a dusty ring!", source: "NASA", url: MARS_FACTS },
    { text: "Mars has a canyon more than 10 times longer and wider than the Grand Canyon.", source: "NASA", url: MARS_FACTS },
    { text: "A year on Mars lasts 687 Earth days. That's a long wait for your birthday!", source: "NASA", url: MARS_FACTS },
  ],
};