
import type { Dest } from "@/lib/mission/config";

export const destinations = {
  moon: {
    name: "Moon",
    video: "/moon.mp4",
    poster: "/moon-poster.jpg",
    blurb: "You're alone at Nova Outpost near the Moon's south pole. Keep the lights on for 5 days until the rescue ship lands.",
    stats: [
      ["GRAVITY", "0.17 g"],
      ["REAL DAY", "29.5 Earth days"],
      ["SUNLIGHT", "14 days on, 14 off"],
      ["HIGH RISK", "Freezing nights"],
    ],
    gauges: [["POWER", 70], ["RADIATION", 75], ["COLD", 85]],
    delay: "≈1.3 sec",
    distance: "384,400 km",
  },
  mars: {
    name: "Mars",
    video: "/mars.mp4",
    poster: "/mars-poster.jpg",
    blurb: "You're alone at Nova Outpost in Jezero Crater. Dust storms block the Sun and Earth is minutes away by radio.",
    stats: [
      ["GRAVITY", "0.38 g"],
      ["DAY LENGTH", "24 h 39 min"],
      ["SUNLIGHT", "~43% of Earth"],
      ["HIGH RISK", "Dust storms"],
    ],
    gauges: [["POWER", 85], ["RADIATION", 65], ["COLD", 75]],
    delay: "3–22 min",
    distance: "55–400 million km",
  },
} as const satisfies Record<Dest, unknown>;

export type DestInfo = (typeof destinations)[Dest];
