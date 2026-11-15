// =========================================================
// components/game/outpostEngine.ts  (UPDATED)
// Top-down outpost world (canvas). No React inside.
//
// NEW in this version:
//   • 7 stations: habitat (heater + storm shelter), greenhouse, air
//     recycler, battery bank, solar array, comms dish, landing pad
//   • broken stations flash red with sparks and a ⚠ tag
//   • smooth real-time day/night, solar-storm / dust / cold effects
//   • SHIFT = sprint, SPACE / ENTER / F = use (E is the inventory)
//   • speed: low-quality mode for slow computers (auto-detected),
//     cached labels and lights, 30 fps cap in low mode
// =========================================================

export type StationId = "habitat" | "greenhouse" | "recycle" | "conserve" | "solar" | "comms" | "beacon" | "lab" | "bed";
export type WorldDest = "moon" | "mars";
export type FloatText = { text: string; color: string };
// A little cut-scene that plays while a job runs. setProgress() moves it along.
export type Scene = "harvest" | "shelter" | "clean" | "feed" | null;
export type RatInfo = { health: number; shielded: boolean; fed: boolean }; // the rat lab
export type OutpostStatus = { power: number; oxygen: number; food: number };
export type Quality = "high" | "low";
export type StationInfo = { verb: string; broken: boolean; blocked: boolean };
export type WeatherFx = { storm: 0 | 1 | 2; dust: boolean; cold: boolean };

export type OutpostOptions = {
  dest: WorldDest;
  name: string;
  zoom?: number;
  quality?: Quality;
  onNear?: (id: StationId | null) => void;
  onUse?: (id: StationId) => void;
  onFrame?: (dt: number) => void; // runs every animation frame (the mission clock uses it)
  onQuality?: (q: Quality) => void; // engine switched to low quality because frames were slow
  onRover?: () => void; // the player checked what the rover found
};

export type Outpost = {
  setDest(d: WorldDest): void;
  setName(n: string): void;
  setDarkness(v: number): void; // 0 = noon, 1 = midnight
  setStatus(s: OutpostStatus): void;
  setStations(info: Partial<Record<StationId, StationInfo>>): void;
  setWeather(w: WeatherFx): void;
  setPaused(p: boolean): void;
  setHidden(h: boolean): void; // astronaut is inside the storm shelter
  setProgress(p: number | null): void; // task progress ring 0..1
  setScene(s: Scene): void; // "harvest" = pick plants, "shelter" = walk into the habitat, "clean" = wipe the solar panels
  setPanelDust(d: number): void; // 0 = clean solar panels, 1 = very dusty
  playFix(id: StationId, tool: "drill" | "tape"): void; // repair animation: power drill + sparks, or duct tape
  setRats(r: RatInfo): void; // rat lab: health, in the shielded room, fed today
  setSleeping(on: boolean): void; // asleep in the bed inside the base
  setCanSprint(on: boolean): void;
  setSpeedMul(m: number): void;
  setBeacon(on: boolean): void;
  setLanding(on: boolean): void;
  setQuality(q: Quality): void;
  isSprinting(): boolean;
  goUse(id: StationId): void;
  feedback(id: StationId, items: FloatText[]): void;
  destroy(): void;
};

// ---------- World layout (in 16px tiles) ----------
const T = 16;
const WT = 44;
const HT = 28;
const WW = WT * T;
const WH = HT * T;

type Rect = { x: number; y: number; w: number; h: number };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x: x * T, y: y * T, w: w * T, h: h * T });

const HAB = R(18, 3, 9, 6);
const SOLAR = R(4, 3, 9, 5);
const GREEN = R(4, 14, 10, 7); //  left column, under the solar array
const RECYC = R(33, 12, 6, 5); //  right column, a bit away from the rover dock
const BATT = R(32, 4, 6, 4);
const DISH = R(21, 13, 3, 3); //  middle column, under the habitat door
const PAD = R(18.5, 20, 8, 6); // bottom middle, centered under the habitat
const DOCK = R(28, 10, 3, 2); // rover charging dock (flat: you can walk over it)
const LAB = R(32, 20, 7, 5); //   rat lab: right column, bottom row
const MAST = { x: PAD.x + PAD.w - 14, y: PAD.y + 4, w: 8, h: 10 };
// Inside the base: walls with a door gap at the bottom, and furniture you bump into
const WALL = 6;
const BASE_WALLS: Rect[] = [
  { x: HAB.x, y: HAB.y, w: HAB.w, h: WALL },
  { x: HAB.x, y: HAB.y, w: WALL, h: HAB.h },
  { x: HAB.x + HAB.w - WALL, y: HAB.y, w: WALL, h: HAB.h },
  { x: HAB.x, y: HAB.y + HAB.h - WALL, w: HAB.w / 2 - 11, h: WALL },
  { x: HAB.x + HAB.w / 2 + 11, y: HAB.y + HAB.h - WALL, w: HAB.w / 2 - 11, h: WALL },
];
const BED: Rect = { x: HAB.x + 10, y: HAB.y + 10, w: 32, h: 18 };
const LOCKERS: Rect = { x: HAB.x + 52, y: HAB.y + 8, w: 40, h: 10 };
const HEATER: Rect = { x: HAB.x + HAB.w - 36, y: HAB.y + 9, w: 26, h: 12 };
const TABLE: Rect = { x: HAB.x + 16, y: HAB.y + 52, w: 26, h: 14 };
const SHELTER_ROOM: Rect = { x: HAB.x + HAB.w - 46, y: HAB.y + HAB.h - 46, w: 40, h: 40 };
const COUNTER: Rect = { x: HAB.x + 8, y: HAB.y + HAB.h - 16, w: 44, h: 9 }; // dining nook food counter
const HEATER_SPOT = { x: HEATER.x + HEATER.w / 2, y: HEATER.y + HEATER.h + 10 };
const SOLIDS = [...BASE_WALLS, BED, LOCKERS, HEATER, TABLE, SHELTER_ROOM, COUNTER, SOLAR, GREEN, RECYC, BATT, DISH, MAST, LAB];

const STATIONS: Record<StationId, { rect: Rect; spot: { x: number; y: number }; label: string }> = {
  habitat: { rect: HAB, spot: { x: HAB.x + HAB.w / 2, y: HAB.y + HAB.h + 14 }, label: "BASE · HEATER" },
  greenhouse: { rect: GREEN, spot: { x: GREEN.x + GREEN.w + 10, y: GREEN.y + GREEN.h / 2 + 8 }, label: "GREENHOUSE" },
  recycle: { rect: RECYC, spot: { x: RECYC.x - 10, y: RECYC.y + RECYC.h / 2 + 8 }, label: "AIR RECYCLER" },
  conserve: { rect: BATT, spot: { x: BATT.x + BATT.w / 2, y: BATT.y + BATT.h + 14 }, label: "BATTERY BANK" },
  solar: { rect: SOLAR, spot: { x: SOLAR.x + SOLAR.w / 2, y: SOLAR.y + SOLAR.h + 14 }, label: "SOLAR ARRAY" },
  comms: { rect: DISH, spot: { x: DISH.x + DISH.w / 2, y: DISH.y - 10 }, label: "COMMS DISH · EARTH" },
  beacon: { rect: PAD, spot: { x: PAD.x + PAD.w / 2 - 12, y: PAD.y + PAD.h / 2 + 4 }, label: "LANDING PAD · BEACON" },
  lab: { rect: LAB, spot: { x: LAB.x - 10, y: LAB.y + LAB.h / 2 + 8 }, label: "RAT LAB" },
  bed: { rect: BED, spot: { x: BED.x + BED.w + 8, y: BED.y + BED.h - 2 }, label: "BED" },
};
const STATION_IDS = Object.keys(STATIONS) as StationId[];

// ---------- Colours ----------
const PAL = {
  mars: {
    base: ["#c56a3d", "#bf6538", "#ca7143", "#ba6135"],
    speck: ["#a8522b", "#d98757", "#9a4a27", "#e39a6a"],
    crater: "#a5522c",
    craterIn: "#b45c33",
    rim: "#dc8c5c",
    rock: ["#6e3220", "#8f4529", "#57271a"],
    rockHi: "#b8653c",
    path: "#b05b34",
    accent: "#ff8a3d",
    accent2: "#c4502a",
    soil: "#5b3424",
    space: "#1a0b08",
  },
  moon: {
    base: ["#8f919d", "#8b8d99", "#9395a1", "#878995"],
    speck: ["#6f717c", "#a9abb6", "#5f616b", "#b8bac4"],
    crater: "#74767f",
    craterIn: "#7f818b",
    rim: "#aeb0ba",
    rock: ["#4a4c57", "#5f616c", "#3a3b44"],
    rockHi: "#8b8d98",
    path: "#7e808b",
    accent: "#b9c8ff",
    accent2: "#7f8fe0",
    soil: "#4a3428",
    space: "#05060c",
  },
};

const INK = "#1a1530";
const HUD_C = "#3be8ff";
const AMBER = "#ffb347";
const HOT = "#ff5a4f";

// ---------- Astronaut pixel maps (12 x 16) ----------
const BODY_FRONT = [
  "....KKKK....",
  "...KWWWWK...",
  "..KWVVVVWK..",
  "..KWVHVVWK..",
  "..KWVVVVWK..",
  "...KWWWWK...",
  "..KKWAAWKK..",
  ".KWWWAAWWWK.",
  ".KWKWWWWKWK.",
  ".KWKWGGWKWK.",
  ".KGKWWWWKGK.",
  "..K.WWWW.K..",
  "...KWWWWK...",
];
const BODY_BACK = [
  "....KKKK....",
  "...KWWWWK...",
  "..KWWWWWWK..",
  "..KWWGWWWK..",
  "..KWWWWWWK..",
  "...KWWWWK...",
  "..KKBBBBKK..",
  ".KWBBBBBBWK.",
  ".KWBBAABBWK.",
  ".KWBBBBBBWK.",
  ".KGKBBBBKGK.",
  "..K.WWWW.K..",
  "...KWWWWK...",
];
const BODY_SIDE = [
  "....KKKK....",
  "...KWWWWK...",
  "..KWWWVVVK..",
  "..KWWWVHVK..",
  "..KWWWVVVK..",
  "...KWWWWK...",
  "..KBKWWAK...",
  "..KBKWWAWK..",
  "..KBKWWWWK..",
  "..KBKWGWWK..",
  "...KKWWWK...",
  "....KWWK....",
  "....KWWK....",
];
const LEGS_FRONT = [
  ["...KWKKWK...", "...KWKKWK...", "...KGKKGK..."],
  ["...KWKKWK...", "...KGKKWK...", "......KGK..."],
  ["...KWKKWK...", "...KWKKGK...", "...KGK......"],
];
const LEGS_SIDE = [
  ["....KWWK....", "....KWWK....", "....KGGK...."],
  ["...KWKKWK...", "..KWK..KWK..", "..KGK..KGK.."],
  ["....KWWK....", "....KWWK....", "....KGGK...."],
];

type Facing = "down" | "up" | "left" | "right";

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inside = (x: number, y: number, r: Rect, pad = 0) =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

// Collision: the astronaut's feet are a small box under (x, y)
const hitbox = (x: number, y: number): Rect => ({ x: x - 4, y: y - 5, w: 8, h: 5 });
const blocked = (x: number, y: number) =>
  x < 6 || x > WW - 6 || y < 8 || y > WH - 2 || SOLIDS.some((r) => overlaps(hitbox(x, y), r));

// Can the astronaut walk in a straight line from a to b?
function lineClear(ax: number, ay: number, bx: number, by: number) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 2);
  for (let i = 1; i <= steps; i++) {
    if (blocked(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps)) return false;
  }
  return true;
}

// ---------- Pathfinding (A* on an 8px grid) so the astronaut walks around buildings ----------
const C = 8;
const GW = WW / C;
const GH = WH / C;
const WALK = new Uint8Array(GW * GH);
for (let gy = 0; gy < GH; gy++)
  for (let gx = 0; gx < GW; gx++) WALK[gy * GW + gx] = blocked(gx * C + C / 2, gy * C + C / 2) ? 0 : 1;
const cellOf = (x: number, y: number) => {
  const gx = clamp(Math.floor(x / C), 0, GW - 1);
  const gy = clamp(Math.floor(y / C), 0, GH - 1);
  return gy * GW + gx;
};
const centre = (i: number) => ({ x: (i % GW) * C + C / 2, y: Math.floor(i / GW) * C + C / 2 });

// Nearest walkable cell (for clicks on rocks/buildings or a start inside a wall edge)
function nearestWalkable(i: number) {
  if (WALK[i]) return i;
  const seen = new Uint8Array(GW * GH);
  const q = [i];
  seen[i] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (WALK[c]) return c;
    const cx = c % GW;
    for (const n of [c - GW, c + GW, cx > 0 ? c - 1 : -1, cx < GW - 1 ? c + 1 : -1]) {
      if (n >= 0 && n < GW * GH && !seen[n]) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  return i;
}

function findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
  if (lineClear(sx, sy, tx, ty)) return [{ x: tx, y: ty }];
  const start = nearestWalkable(cellOf(sx, sy));
  const goal = nearestWalkable(cellOf(tx, ty));
  const gx = goal % GW;
  const gy = Math.floor(goal / GW);
  const H = (i: number) => Math.hypot((i % GW) - gx, Math.floor(i / GW) - gy);
  const g = new Float32Array(GW * GH).fill(Infinity);
  const from = new Int32Array(GW * GH).fill(-1);
  const open: number[] = [start];
  const inOpen = new Uint8Array(GW * GH);
  inOpen[start] = 1;
  g[start] = 0;
  let found = false;
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (g[open[k]] + H(open[k]) < g[open[bi]] + H(open[bi])) bi = k;
    const c = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    inOpen[c] = 0;
    if (c === goal) {
      found = true;
      break;
    }
    const cx = c % GW;
    const cy = Math.floor(c / GW);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        if (!WALK[n]) continue;
        if (dx && dy && (!WALK[cy * GW + nx] || !WALK[ny * GW + cx])) continue; // no corner cutting
        const cost = g[c] + (dx && dy ? 1.414 : 1);
        if (cost < g[n]) {
          g[n] = cost;
          from[n] = c;
          if (!inOpen[n]) {
            inOpen[n] = 1;
            open.push(n);
          }
        }
      }
  }
  if (!found) return [];
  const cells: { x: number; y: number }[] = [];
  for (let c = goal; c !== -1; c = from[c]) cells.unshift(centre(c));
  if (!blocked(tx, ty)) cells.push({ x: tx, y: ty });
  // Smooth: skip ahead to the farthest point we can walk to in a straight line
  const out: { x: number; y: number }[] = [];
  let cur = { x: sx, y: sy };
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !lineClear(cur.x, cur.y, cells[j].x, cells[j].y)) j--;
    out.push(cells[j]);
    cur = cells[j];
    i = j + 1;
  }
  return out;
}

type Ctx = CanvasRenderingContext2D;
function px(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}
// Pixel-style filled circle
function disc(g: Ctx, cx: number, cy: number, r: number, c: string) {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    g.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

// ---------- Static ground (built once per destination) ----------
function buildGround(dest: WorldDest): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = WW;
  c.height = WH;
  const g = c.getContext("2d")!;
  const p = PAL[dest];
  const rnd = mulberry32(dest === "mars" ? 7 : 11);

  for (let ty = 0; ty < HT; ty++)
    for (let tx = 0; tx < WT; tx++) px(g, tx * T, ty * T, T, T, p.base[(rnd() * p.base.length) | 0]);

  // Trodden paths between the habitat door and each station
  const door = { x: HAB.x + HAB.w / 2, y: HAB.y + HAB.h + 6 };
  const trail = (bx: number, by: number) => {
    const steps = Math.hypot(bx - door.x, by - door.y) / 2;
    for (let i = 0; i <= steps; i++) {
      const x = door.x + ((bx - door.x) * i) / steps;
      const y = door.y + ((by - door.y) * i) / steps;
      for (let k = 0; k < 6; k++) {
        if (rnd() < 0.55) px(g, Math.round(x + (rnd() - 0.5) * 18), Math.round(y + (rnd() - 0.5) * 12), 2, 2, p.path);
      }
    }
  };
  for (const id of STATION_IDS) trail(STATIONS[id].spot.x, STATIONS[id].spot.y);
  trail(SOLAR.x + SOLAR.w / 2, SOLAR.y + SOLAR.h + 8);
  trail(DISH.x + DISH.w / 2, DISH.y - 6);

  const clear = (x: number, y: number, pad: number) =>
    !SOLIDS.some((r) => inside(x, y, r, pad)) &&
    !STATION_IDS.some((id) => Math.hypot(STATIONS[id].spot.x - x, STATIONS[id].spot.y - y) < 30) &&
    Math.hypot(door.x - x, door.y - y) > 30;

  // Craters
  for (let i = 0; i < 14; i++) {
    const r = 5 + ((rnd() * 10) | 0);
    const x = (rnd() * WW) | 0;
    const y = (rnd() * WH) | 0;
    if (!clear(x, y, r + 12)) continue;
    disc(g, x + 1, y + 1, r + 1, p.rim);
    disc(g, x, y, r, p.crater);
    disc(g, x + 1, y + 1, Math.max(1, r - 2), p.craterIn);
  }
  // Speckles
  for (let i = 0; i < 2600; i++) {
    const s = rnd() < 0.8 ? 1 : 2;
    px(g, (rnd() * WW) | 0, (rnd() * WH) | 0, s, s, p.speck[(rnd() * p.speck.length) | 0]);
  }
  // Pebble clusters (like the inspo's rock patches)
  for (let i = 0; i < 90; i++) {
    const cx = (rnd() * WW) | 0;
    const cy = (rnd() * WH) | 0;
    if (!clear(cx, cy, 10)) continue;
    const n = 2 + ((rnd() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const x = cx + (((rnd() - 0.5) * 18) | 0);
      const y = cy + (((rnd() - 0.5) * 12) | 0);
      const r = 1 + ((rnd() * 2.4) | 0);
      disc(g, x, y + 1, r, "rgba(0,0,0,0.25)");
      disc(g, x, y, r, p.rock[(rnd() * p.rock.length) | 0]);
      px(g, x - r + 1, y - r + 1, 1, 1, p.rockHi);
    }
  }
  // A few big boulders
  for (let i = 0; i < 8; i++) {
    const x = (rnd() * WW) | 0;
    const y = (rnd() * WH) | 0;
    if (!clear(x, y, 20)) continue;
    disc(g, x + 2, y + 3, 6, "rgba(0,0,0,0.28)");
    disc(g, x, y, 6, p.rock[0]);
    disc(g, x - 1, y - 1, 4, p.rock[1]);
    px(g, x - 3, y - 4, 2, 1, p.rockHi);
  }
  return c;
}

// Soft round light, drawn once and reused (much cheaper than a new gradient every frame)
function makeLightSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// Should we start in low quality? (low memory or few CPU cores)
export function guessQuality(): Quality {
  if (typeof navigator === "undefined") return "high";
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  if ((mem !== undefined && mem <= 4) || cores <= 2) return "low";
  return "high";
}

// ---------- Engine ----------
export function createOutpost(canvas: HTMLCanvasElement, opts: OutpostOptions): Outpost {
  const screen = canvas.getContext("2d", { alpha: false })!;
  const buf = document.createElement("canvas");
  const ctx = buf.getContext("2d")!;
  const overlay = document.createElement("canvas");
  const octx = overlay.getContext("2d")!;
  const lightSprite = makeLightSprite();

  let dest = opts.dest;
  let name = opts.name;
  let ground = buildGround(dest);
  const zoomOpt = opts.zoom ?? 0;
  let zoom = 3;
  let quality: Quality = opts.quality ?? "high";
  let dark = 0;
  let darkGoal = 0;
  let night = false;
  let paused = false;
  let hidden = false;
  let progress: number | null = null;
  // ----- job scenes (harvest, shelter) -----
  type ScenePoint = {
    p: number; x: number; y: number; face?: Facing;
    pick?: { c: number; at: number; done: boolean }; // greenhouse plant to pick
    wipe?: { c: number; from: number; to: number; done: boolean }; // solar panel column to mop
  };
  let scene: Scene = null;
  let sceneOk = false; // false = the astronaut wasn't by the door, so only the progress ring shows
  let scenePath: ScenePoint[] = [];
  let restoreAt = 0; // after walking into the shelter: step back out if the shelter didn't happen
  const picked = new Map<number, number>(); // greenhouse plant (row*10+col) → time it has regrown
  const fedAt = [-99, -99, -99]; // rat lab: when each food bowl was last filled
  let panelDust = 0; // 0 = clean solar panels, 1 = very dusty
  let fix: { tool: "drill" | "tape"; until: number } | null = null; // repair animation
  // ----- the science rover: drives around, finds something ("!"), then goes home to charge -----
  const DOCK_SPOT = { x: DOCK.x + DOCK.w / 2, y: DOCK.y + DOCK.h - 8 };
  type RoverState = "charge" | "drive" | "found" | "happy" | "home";
  const rover = {
    x: DOCK_SPOT.x, y: DOCK_SPOT.y, face: 1, state: "charge" as RoverState, timer: 12,
    route: [] as { x: number; y: number }[], wheel: 0, moving: false,
  };
  let pendingRover = false; // walking over to the rover after clicking it
  let rats: RatInfo = { health: 100, shielded: false, fed: false };
  let sleeping = false;
  let zzzAt = 0;
  // bootprints in the dust
  const prints: { x: number; y: number; born: number }[] = [];
  let stepDist = 0;
  let leftFoot = false;
  // Is the astronaut inside the base? (then the roof comes off and you see the rooms)
  const insideBase = () =>
    player.x > HAB.x + WALL && player.x < HAB.x + HAB.w - WALL && player.y > HAB.y + WALL && player.y < HAB.y + HAB.h - 1;
  // Inside, the base's job (heater / shelter) is done at the heater, not the front door
  const reachRect = (id: StationId) => (insideBase() && id === "habitat" ? HEATER : STATIONS[id].rect);
  const spotOf = (id: StationId) => (insideBase() && id === "habitat" ? HEATER_SPOT : STATIONS[id].spot);
  let canSprint = true;
  let speedMul = 1;
  let beaconOn = false;
  let landing = false;
  let landT = 0;
  let weather: WeatherFx = { storm: 0, dust: false, cold: false };
  let status: OutpostStatus = { power: 70, oxygen: 80, food: 70 };
  let stationInfo: Partial<Record<StationId, StationInfo>> = {};

  const player = { x: HAB.x + HAB.w / 2, y: HAB.y + HAB.h + 26, facing: "down" as Facing, walk: 0, moving: false };
  let target: { x: number; y: number } | null = null;
  let route: { x: number; y: number }[] = [];
  let lastUse = -1;
  let font = "ui-monospace, Menlo, Consolas, monospace";
  let pendingUse: StationId | null = null;
  let stuckFor = 0;
  let near: StationId | null = null;
  let sprinting = false;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let cam = { x: 0, y: 0 };
  let t = 0;
  const keys = new Set<string>();
  const pulse: Record<StationId, number> = { habitat: 0, greenhouse: 0, conserve: 0, recycle: 0, solar: 0, comms: 0, beacon: 0, lab: 0, bed: 0 };
  const floats: { x: number; y: number; text: string; color: string; age: number }[] = [];
  const parts: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number }[] = [];
  const dust: { x: number; y: number; v: number }[] = [];
  for (let i = 0; i < 70; i++) dust.push({ x: Math.random(), y: Math.random(), v: 0.5 + Math.random() });

  // ----- sizing -----
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = quality === "low" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    zoom = zoomOpt > 0 ? zoomOpt : clamp(Math.round(cssW / 480), 2, 5);
    buf.width = Math.ceil(cssW / zoom) + 1;
    buf.height = Math.ceil(cssH / zoom) + 1;
    overlay.width = buf.width;
    overlay.height = buf.height;
    font = getComputedStyle(canvas).fontFamily || font;
    tagCache.clear();
  }
  const tagCache = new Map<string, HTMLCanvasElement>();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ----- input -----
  const isTyping = (el: EventTarget | null) =>
    el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

  const MOVE = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"];
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "shift") {
      keys.add("shift");
      return;
    }
    if (MOVE.includes(k)) {
      if (k.startsWith("arrow")) e.preventDefault();
      if (!paused) keys.add(k);
    } else if ((k === " " || k === "enter" || k === "f") && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (e.repeat) return; // holding the key must not fire job after job
      if (paused || sleeping) return;
      if (roverNear()) readRover();
      else if (near) interact(near);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const onBlur = () => keys.clear();

  const toWorld = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom + cam.x, y: (clientY - r.top) / zoom + cam.y };
  };
  const onPointerDown = (e: PointerEvent) => {
    if (paused || sleeping) return;
    const w = toWorld(e.clientX, e.clientY);
    if (rover.state === "found" && Math.abs(w.x - rover.x) < 12 && w.y > rover.y - 22 && w.y < rover.y + 4) {
      // clicked the rover: read it, or walk over first
      if (roverNear()) readRover();
      else {
        pendingUse = null;
        walkTo(rover.x, rover.y + 8);
        pendingRover = true;
      }
      return;
    }
    pendingRover = false;
    let hit: StationId | undefined;
    if (insideBase() && inside(w.x, w.y, HAB, 0)) {
      // inside the base: click the bed or the heater, or just walk around the room
      hit = inside(w.x, w.y, BED, 4) ? "bed" : inside(w.x, w.y, HEATER, 4) ? "habitat" : undefined;
      if (!hit) {
        pendingUse = null;
        walkTo(w.x, w.y);
        return;
      }
    } else hit = STATION_IDS.find((id) => id !== "bed" && inside(w.x, w.y, STATIONS[id].rect, 6));
    if (hit) {
      if (near === hit) interact(hit);
      else api.goUse(hit);
      return;
    }
    pendingUse = null;
    walkTo(clamp(w.x, 8, WW - 8), clamp(w.y, 10, WH - 4));
  };

  function walkTo(x: number, y: number) {
    const path = findPath(player.x, player.y, x, y);
    target = path.shift() ?? null;
    route = path;
    stuckFor = 0;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);

  function interact(id: StationId) {
    target = null;
    route = [];
    pendingUse = null;
    if (t - lastUse < 0.35) return;
    lastUse = t;
    faceToward(reachRect(id));
    opts.onUse?.(id);
  }
  function faceToward(r: Rect) {
    const dx = r.x + r.w / 2 - player.x;
    const dy = r.y + r.h / 2 - player.y;
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }

  // Which station is the astronaut standing next to? (closest one wins)
  function nearest(): StationId | null {
    if (insideBase()) {
      // inside the base only the bed and the heater are in reach
      let pick: StationId | null = null;
      let pickD = 16;
      for (const id of ["bed", "habitat"] as StationId[]) {
        const r = reachRect(id);
        const dx = Math.max(r.x - player.x, 0, player.x - (r.x + r.w));
        const dy = Math.max(r.y - (player.y - 3), 0, player.y - 3 - (r.y + r.h));
        const d = Math.hypot(dx, dy);
        if (d < pickD) {
          pickD = d;
          pick = id;
        }
      }
      return pick;
    }
    let best: StationId | null = null;
    let bestD = Infinity;
    for (const id of STATION_IDS) {
      if (id === "bed") continue;
      const r = STATIONS[id].rect;
      if (!inside(player.x, player.y - 3, r, 24)) continue;
      const dx = Math.max(r.x - player.x, 0, player.x - (r.x + r.w));
      const dy = Math.max(r.y - player.y, 0, player.y - (r.y + r.h));
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  // ----- movement with collision -----
  function step(dt: number) {
    if (sleeping) {
      // tucked in bed: no walking, just Zzz
      player.moving = false;
      sprinting = false;
      if (!paused && t > zzzAt) {
        zzzAt = t + 0.8;
        floats.push({ x: BED.x + 8, y: BED.y + 4, text: Math.random() < 0.5 ? "z" : "Z", color: "#cfe8ff", age: 0 });
      }
      return;
    }
    if (restoreAt && t > restoreAt) {
      restoreAt = 0;
      if (!hidden) place(STATIONS.habitat.spot);
    }
    if (fix) {
      if (t >= fix.until) fix = null;
      else {
        // stand still and work on the machine
        player.moving = false;
        sprinting = false;
        if (!paused) fixSparks(dt);
        return;
      }
    }
    if (sceneOk && progress !== null) {
      runScene(dt);
      return;
    }
    const k = keys;
    let dx = (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0);
    let dy = (k.has("arrowdown") || k.has("s") ? 1 : 0) - (k.has("arrowup") || k.has("w") ? 1 : 0);
    sprinting = k.has("shift") && canSprint && !paused && !hidden;
    const speed = 64 * speedMul * (sprinting ? 1.75 : 1);

    if (paused || hidden) dx = dy = 0;
    if (dx || dy) {
      target = null;
      route = [];
      pendingUse = null;
      pendingRover = false;
    } else if (target && !paused && !hidden) {
      let tx = target.x - player.x;
      let ty = target.y - player.y;
      let d = Math.hypot(tx, ty);
      while (d < 1.5 && route.length) {
        target = route.shift()!;
        tx = target.x - player.x;
        ty = target.y - player.y;
        d = Math.hypot(tx, ty);
      }
      if (d < 1.5) {
        target = null;
        if (pendingUse) interact(pendingUse);
        if (pendingRover) {
          pendingRover = false;
          if (roverNear()) readRover();
        }
      } else {
        dx = tx / d;
        dy = ty / d;
      }
    }
    const len = Math.hypot(dx, dy) || 1;
    const mx = (dx / len) * speed * dt;
    const my = (dy / len) * speed * dt;
    const bx = player.x;
    const by = player.y;
    if (mx && !blocked(player.x + mx, player.y)) player.x += mx;
    if (my && !blocked(player.x, player.y + my)) player.y += my;

    const moved = Math.hypot(player.x - bx, player.y - by);
    player.moving = moved > 0.01;
    if (player.moving && !insideBase()) {
      // bootprints in the dust, left-right-left (they fade away after a while)
      stepDist += moved;
      if (stepDist > 7) {
        stepDist = 0;
        leftFoot = !leftFoot;
        const across = Math.abs(player.x - bx) > Math.abs(player.y - by);
        const side = leftFoot ? -2 : 2;
        prints.push({ x: player.x + (across ? 0 : side), y: player.y + (across ? side / 2 : 0), born: t });
        if (prints.length > 160) prints.shift();
      }
    }
    if (!player.moving) sprinting = false;
    if (target) {
      stuckFor = moved < speed * dt * 0.2 ? stuckFor + dt : 0;
      if (stuckFor > 0.35) {
        target = null;
        route = [];
        if (pendingUse && inside(player.x, player.y - 3, reachRect(pendingUse), 26)) interact(pendingUse);
        if (pendingRover && roverNear()) readRover();
        pendingRover = false;
        pendingUse = null;
        stuckFor = 0;
      }
    }
    if (player.moving) {
      player.walk += dt * (sprinting ? 14 : 9);
      if (Math.abs(mx) > Math.abs(my)) player.facing = mx > 0 ? "right" : "left";
      else if (my) player.facing = my > 0 ? "down" : "up";
      if (sprinting && Math.random() < dt * 20) {
        const p = PAL[dest];
        parts.push({ x: player.x + (Math.random() - 0.5) * 6, y: player.y, vx: (Math.random() - 0.5) * 10, vy: -6, life: 0, max: 0.5, c: p.speck[1], s: 1 });
      }
    }

    const n = hidden ? null : nearest();
    if (n !== near) {
      near = n;
      opts.onNear?.(near);
    }
  }

  // ----- job scenes -----
  function place(spot: { x: number; y: number }) {
    player.x = spot.x;
    player.y = spot.y;
    player.facing = "down";
    player.moving = false;
  }

  // Turn a list of stops into timed points. "wait" = share of the job spent standing still there.
  function planScene(
    stops: { x: number; y: number; wait?: number; face?: Facing; pickCol?: number; wipeCol?: number }[],
  ): ScenePoint[] {
    let dist = 0;
    for (let i = 1; i < stops.length; i++) dist += Math.hypot(stops[i].x - stops[i - 1].x, stops[i].y - stops[i - 1].y);
    const waits = stops.reduce((a, st) => a + (st.wait ?? 0), 0);
    const walk = Math.max(0.05, 1 - waits);
    const out: ScenePoint[] = [];
    let p = 0;
    stops.forEach((st, i) => {
      if (i > 0) p += (walk * Math.hypot(st.x - stops[i - 1].x, st.y - stops[i - 1].y)) / (dist || 1);
      out.push({ p, x: st.x, y: st.y });
      if (st.wait) {
        const pick = st.pickCol === undefined ? undefined : { c: st.pickCol, at: p + st.wait * 0.6, done: false };
        const wipe = st.wipeCol === undefined ? undefined : { c: st.wipeCol, from: p, to: p + st.wait, done: false };
        p += st.wait;
        out.push({ p, x: st.x, y: st.y, face: st.face, pick, wipe });
      }
    });
    return out;
  }

  function startScene(sc: Exclude<Scene, null>) {
    target = null;
    route = [];
    pendingUse = null;
    const from = { x: player.x, y: player.y };
    if (sc === "harvest") {
      const { x, y, w } = GREEN;
      if (player.x < x + w) return; // not on the door side
      const aisle = y + 51; // walk in through the door, just above the third row of plants
      const a = 4 + Math.floor(Math.random() * 3); // two plants near the door (columns 2..6)
      const b = a - 1 - Math.floor(Math.random() * 2);
      const col = (c: number) => x + 18 + c * 20;
      scenePath = planScene([
        from,
        { x: x + w + 4, y: aisle },
        { x: col(a), y: aisle, wait: 0.14, face: "down", pickCol: a },
        { x: col(b), y: aisle, wait: 0.14, face: "down", pickCol: b },
        { x: x + w + 4, y: aisle },
        STATIONS.greenhouse.spot,
      ]);
    } else if (sc === "clean") {
      const { x, y, h } = SOLAR;
      if (player.y < y + h) return; // not in front of the panels
      const front = y + h + 6; // stand at the front edge and wipe each column of panels
      const colX = (c: number) => x + 6 + c * 34 + 15;
      scenePath = planScene([
        from,
        { x: colX(0), y: front, wait: 0.11, face: "up", wipeCol: 0 },
        { x: colX(1), y: front, wait: 0.11, face: "up", wipeCol: 1 },
        { x: colX(2), y: front, wait: 0.11, face: "up", wipeCol: 2 },
        { x: colX(3), y: front, wait: 0.11, face: "up", wipeCol: 3 },
        STATIONS.solar.spot,
      ]);
    } else if (sc === "feed") {
      const { x, y } = LAB;
      if (player.x > x) return; // not by the lab door
      const floor = y + 51; // walk in through the door, just under the cages
      const bowl = (c: number) => x + 26 + c * 20; // stand under each food bowl
      scenePath = planScene([
        from,
        { x: x - 6, y: floor },
        { x: bowl(0), y: floor, wait: 0.12, face: "up", pickCol: 0 },
        { x: bowl(1), y: floor, wait: 0.12, face: "up", pickCol: 1 },
        { x: bowl(2), y: floor, wait: 0.12, face: "up", pickCol: 2 },
        { x: x - 6, y: floor },
        STATIONS.lab.spot,
      ]);
    } else {
      if (player.y < HAB.y + HAB.h) return; // not in front of the habitat
      const spot = STATIONS.habitat.spot;
      scenePath = planScene([from, spot, { x: spot.x, y: HAB.y + HAB.h - 3 }]);
    }
    sceneOk = true;
  }

  function endScene(was: Exclude<Scene, null>) {
    if (was === "harvest") place(STATIONS.greenhouse.spot);
    else if (was === "feed") place(STATIONS.lab.spot);
    else if (was === "clean") {
      place(STATIONS.solar.spot);
      panelDust = 0; // job done: the panels are clean (the next update confirms it)
    } else restoreAt = t + 0.5;
  }

  function runScene(dt: number) {
    const p = clamp(progress ?? 0, 0, 1);
    const k = scenePath;
    let i = 0;
    while (i < k.length - 2 && p > k[i + 1].p) i++;
    const a = k[i];
    const b = k[i + 1] ?? a;
    const f = b.p > a.p ? clamp((p - a.p) / (b.p - a.p), 0, 1) : 1;
    const nx = a.x + (b.x - a.x) * f;
    const ny = a.y + (b.y - a.y) * f;
    const mx = nx - player.x;
    const my = ny - player.y;
    player.moving = Math.hypot(mx, my) > 0.05;
    if (player.moving) {
      player.walk += dt * 9;
      if (Math.abs(mx) > Math.abs(my)) player.facing = mx > 0 ? "right" : "left";
      else player.facing = my > 0 ? "down" : "up";
    } else if (b.face) player.facing = b.face;
    player.x = nx;
    player.y = ny;
    sprinting = false;
    // picking: leaves fly while working, the plant becomes a sprout
    if (!player.moving && b.pick && !paused && Math.random() < dt * 14) (scene === "feed" ? foodPop : leafPop)(b.pick.c, 1);
    if (!player.moving && b.wipe && !paused && Math.random() < dt * 30) dustPuff(b.wipe.c);
    for (const q of k) {
      if (q.wipe && !q.wipe.done && p >= q.wipe.to) {
        q.wipe.done = true;
        sparkle(q.wipe.c); // a freshly mopped column shines
      }
      if (!q.pick || q.pick.done || p < q.pick.at) continue;
      q.pick.done = true;
      if (scene === "feed") {
        fedAt[q.pick.c] = t; // bowl is full, the rat runs over to eat
        foodPop(q.pick.c, quality === "low" ? 4 : 8);
        continue;
      }
      picked.set(20 + q.pick.c, t + 8);
      leafPop(q.pick.c, quality === "low" ? 5 : 10);
    }
  }

  function leafPop(c: number, n: number) {
    const lx = GREEN.x + 18 + c * 20;
    const ly = GREEN.y + 14 + 2 * 24 - 3;
    for (let j = 0; j < n; j++) {
      parts.push({
        x: lx + (Math.random() - 0.5) * 6, y: ly, vx: (Math.random() - 0.5) * 24, vy: -14 - Math.random() * 20,
        life: 0, max: 0.5 + Math.random() * 0.4, c: Math.random() < 0.25 ? "#ff6a5a" : "#7dffb0", s: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  // Solar cleaning: how much of a panel column has been wiped (0..1), and where the wipe line is
  function colClean(c: number) {
    if (scene !== "clean" || !sceneOk || progress === null) return 0;
    const w = scenePath.find((q) => q.wipe?.c === c)?.wipe;
    return w ? clamp((progress - w.from) / (w.to - w.from), 0, 1) : 0;
  }
  const wipeLine = (c: number) => SOLAR.y + 74 - colClean(c) * 68; // panels span y+6 .. y+74
  const dirtColor = () => (dest === "mars" ? "#c9773f" : "#a7a9b4");
  function dustPuff(c: number) {
    if (panelDust < 0.02) return;
    parts.push({
      x: SOLAR.x + 8 + c * 34 + Math.random() * 26, y: wipeLine(c), vx: (Math.random() - 0.5) * 30, vy: -8 - Math.random() * 14,
      life: 0, max: 0.4 + Math.random() * 0.4, c: dirtColor(), s: Math.random() < 0.3 ? 2 : 1,
    });
  }

  function sparkle(c: number) {
    for (let j = 0; j < (quality === "low" ? 5 : 10); j++) {
      parts.push({
        x: SOLAR.x + 8 + c * 34 + Math.random() * 26, y: SOLAR.y + 8 + Math.random() * 64, vx: 0, vy: -6 - Math.random() * 8,
        life: 0, max: 0.5 + Math.random() * 0.4, c: Math.random() < 0.5 ? "#ffffff" : "#bff6ff", s: 1,
      });
    }
  }

  // The mop on a long pole: held upright while walking, swooped across the panels while scrubbing
  function drawMop() {
    const sx = Math.round(player.x);
    const sy = Math.round(player.y);
    const p = clamp(progress ?? 0, 0, 1);
    const w = scenePath.find((q) => q.wipe && p >= q.wipe.from && p <= q.wipe.to)?.wipe;
    let hx: number;
    let hy: number;
    if (w) {
      hx = Math.round(SOLAR.x + 21 + w.c * 34 + Math.sin(t * 14) * 10); // swoop left and right
      hy = Math.round(wipeLine(w.c)); //                                  while moving up the column
    } else {
      hx = sx + 7;
      hy = sy - 27;
    }
    const fx = hx < sx ? sx - 4 : sx + 4; // the hand holding the pole
    const fy = sy - 9;
    const dx = hx - fx;
    const dy = hy - fy;
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) px(ctx, Math.round(fx + (dx * i) / n), Math.round(fy + (dy * i) / n), 1, 1, "#d8b07a");
    // mop head: yellow sponge with white strings
    px(ctx, hx - 6, hy - 2, 12, 4, INK);
    px(ctx, hx - 5, hy - 1, 10, 2, "#ffd25a");
    for (let f = 0; f < 5; f++) px(ctx, hx - 5 + f * 2, hy + 2, 1, 2 + (f % 2), "#e8eef8");
  }

  // ----- repairs: the astronaut holds a power drill (or a roll of duct tape) -----
  function toolPose() {
    const f = player.facing;
    const dx = f === "right" ? 1 : f === "left" ? -1 : 0;
    const dy = f === "down" ? 1 : f === "up" ? -1 : 0;
    const hx = Math.round(player.x) + (dx !== 0 ? dx * 6 : 5); // the hand
    const hy = Math.round(player.y) - 8 + (dy < 0 ? -2 : 0);
    return { dx, dy, hx, hy, tipX: hx + dx * 8, tipY: hy + dy * 8 };
  }

  function fixSparks(dt: number) {
    if (!fix) return;
    const { dx, dy, tipX, tipY } = toolPose();
    const rate = fix.tool === "drill" ? 45 : 8;
    const n = quality === "low" ? 1 : 2;
    for (let j = 0; j < n; j++) {
      if (Math.random() > dt * rate) continue;
      const sp = 20 + Math.random() * 35;
      const a = Math.random() * Math.PI * 2;
      parts.push({
        x: tipX, y: tipY,
        vx: Math.cos(a) * sp * 0.6 - dx * 10, vy: Math.sin(a) * sp * 0.6 - dy * 10 - 10,
        life: 0, max: 0.25 + Math.random() * 0.3,
        c: fix.tool === "drill" ? ["#fff3b0", "#ffd25a", "#ff9d3d"][j % 3] : "#c9ced9",
        s: 1,
      });
    }
  }

  function drawTool() {
    if (!fix) return;
    const { dx, dy, hx, hy } = toolPose();
    if (fix.tool === "drill") {
      // orange power drill with a spinning bit
      px(ctx, hx - 3, hy - 3, 7, 5, INK);
      px(ctx, hx - 2, hy - 2, 5, 3, "#ff8a3d");
      px(ctx, hx - 1, hy + 2, 3, 3, INK); // grip
      const spin = Math.floor(t * 30) % 2 === 0;
      for (let i = 1; i <= 5; i++) {
        px(ctx, hx + dx * (3 + i), hy + dy * (3 + i), 1, 1, (i + (spin ? 1 : 0)) % 2 ? "#e8eef8" : "#8a90a0");
      }
    } else {
      // a roll of grey duct tape, with a strip flapping toward the machine
      px(ctx, hx - 3, hy - 3, 6, 6, INK);
      px(ctx, hx - 2, hy - 2, 4, 4, "#a9b0c0");
      px(ctx, hx - 1, hy - 1, 2, 2, INK);
      const wob = Math.round(Math.sin(t * 16));
      for (let i = 1; i <= 5; i++) {
        px(ctx, hx + dx * (2 + i) + (dx === 0 ? wob : 0), hy + dy * (2 + i) + (dy === 0 ? wob : 0), 2, 1, "#c9ced9");
      }
    }
  }

  // ----- rover -----
  function roverGo(x: number, y: number) {
    rover.route = findPath(rover.x, rover.y, x, y);
    return rover.route.length > 0;
  }
  function pickRoverSpot() {
    for (let k = 0; k < 20; k++) {
      const x = 40 + Math.random() * (WW - 80);
      const y = 40 + Math.random() * (WH - 70);
      if (blocked(x, y)) continue;
      if (STATION_IDS.some((id) => inside(x, y, STATIONS[id].rect, 34))) continue; // stay clear of buildings
      if (Math.hypot(x - DOCK_SPOT.x, y - DOCK_SPOT.y) < 120) continue; //            go somewhere far-ish
      if (roverGo(x, y)) return true;
    }
    return false;
  }
  function updateRover(dt: number) {
    rover.timer -= dt;
    rover.moving = false;
    if (rover.state === "charge") {
      if (rover.timer <= 0) {
        if (pickRoverSpot()) rover.state = "drive";
        else rover.timer = 5;
      }
    } else if (rover.state === "found" || rover.state === "happy") {
      if (rover.timer <= 0) {
        rover.state = "home"; // after the beep (or if nobody came), drive home
        roverGo(DOCK_SPOT.x, DOCK_SPOT.y);
      }
    } else {
      let left = 26 * dt; // slow and steady
      while (left > 0 && rover.route.length) {
        const tg = rover.route[0];
        const dx = tg.x - rover.x;
        const dy = tg.y - rover.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.3) rover.face = dx > 0 ? 1 : -1;
        if (d <= left) {
          rover.x = tg.x;
          rover.y = tg.y;
          rover.route.shift();
          left -= d;
        } else {
          rover.x += (dx / d) * left;
          rover.y += (dy / d) * left;
          left = 0;
        }
        rover.moving = true;
      }
      if (rover.moving) rover.wheel += dt * 10;
      if (!rover.route.length) {
        if (rover.state === "drive") {
          rover.state = "found";
          rover.timer = 25;
        } else {
          rover.state = "charge";
          rover.timer = 22;
          rover.x = DOCK_SPOT.x;
          rover.y = DOCK_SPOT.y;
        }
      }
    }
  }
  const roverNear = () =>
    rover.state === "found" && !hidden && Math.hypot(player.x - rover.x, player.y - rover.y) < 24;
  function readRover() {
    if (rover.state !== "found") return;
    rover.state = "happy";
    rover.timer = 1.2;
    floats.push({ x: rover.x, y: rover.y - 12, text: "BEEP BOOP!", color: AMBER, age: 0 });
    opts.onRover?.();
  }

  // The astronaut sprite turned on its side, lying in bed (head on the pillow)
  function drawSleeper() {
    const colors: Record<string, string> = {
      K: INK, W: "#f2f4f8", G: "#a9b0c0", V: "#1b2a6b", H: "#7fe0ff", A: PAL[dest].accent, B: "#c9ced9",
    };
    const rows = [...BODY_FRONT, ...LEGS_FRONT[0]];
    const ox = BED.x + 3;
    const oy = BED.y + 3;
    for (let ry = 0; ry < rows.length; ry++)
      for (let rx = 0; rx < 12; rx++) {
        const ch = rows[ry][rx];
        if (ch === "." || ch === undefined) continue;
        ctx.fillStyle = colors[ch];
        ctx.fillRect(ox + ry, oy + rx, 1, 1);
      }
  }

  // ----- bootprints -----
  function drawPrints() {
    while (prints.length && t - prints[0].born > 25) prints.shift();
    const c = dest === "mars" ? "92,40,24" : "40,42,52";
    for (const p of prints) {
      ctx.fillStyle = `rgba(${c},${0.45 * (1 - (t - p.born) / 25)})`;
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
    }
  }

  // ----- inside the base (roof off): bed, lockers, heater, table, storm shelter -----
  function drawBaseInside() {
    const { x, y, w, h } = HAB;
    const p = PAL[dest];
    shadow(HAB);
    px(ctx, x, y, w, h, INK);
    px(ctx, x + 2, y + 2, w - 4, h - 4, "#8a90a0"); // walls
    px(ctx, x + WALL, y + WALL, w - WALL * 2, h - WALL * 2, "#cfd4de"); // floor
    for (let gx = x + WALL + 12; gx < x + w - WALL; gx += 12) px(ctx, gx, y + WALL, 1, h - WALL * 2, "#c2c7d2");
    for (let gy = y + WALL + 12; gy < y + h - WALL; gy += 12) px(ctx, x + WALL, gy, w - WALL * 2, 1, "#c2c7d2");
    px(ctx, x + w / 2 - 11, y + h - WALL, 22, WALL, "#a7adbb"); // doorway
    for (let i = 0; i < 4; i++) px(ctx, x + 14 + i * 32, y + 1, 18, 3, night ? "#9ff2ff" : "#7fb2e6"); // windows
    // bed with a pillow and blanket (and the astronaut tucked in when asleep)
    px(ctx, BED.x, BED.y, BED.w, BED.h, INK);
    px(ctx, BED.x + 1, BED.y + 1, BED.w - 2, BED.h - 2, "#9fc0ea"); // light blue sheet (so the white suit stands out)
    px(ctx, BED.x + 2, BED.y + 3, 8, BED.h - 6, "#dfe9f7"); //          pillow
    if (sleeping) drawSleeper(); // the astronaut lying down, head on the pillow
    const bx0 = sleeping ? BED.x + 18 : BED.x + 11; // blanket over the legs while sleeping
    const rise = sleeping && Math.sin(t * 2.2) > 0 ? 1 : 0; // slow breathing
    px(ctx, bx0, BED.y + 2 - rise, BED.x + BED.w - 2 - bx0, BED.h - 4 + rise, p.accent2);
    px(ctx, bx0, BED.y + 2 - rise, 2, BED.h - 4 + rise, p.accent);
    // lockers
    px(ctx, LOCKERS.x, LOCKERS.y, LOCKERS.w, LOCKERS.h, INK);
    for (let i = 0; i < 4; i++) {
      px(ctx, LOCKERS.x + 1 + i * 10, LOCKERS.y + 1, 8, LOCKERS.h - 2, "#c3c8d4");
      px(ctx, LOCKERS.x + 7 + i * 10, LOCKERS.y + 4, 1, 2, INK);
    }
    // heater: fins glow bright right after you turn it up
    px(ctx, HEATER.x, HEATER.y, HEATER.w, HEATER.h, INK);
    px(ctx, HEATER.x + 1, HEATER.y + 1, HEATER.w - 2, HEATER.h - 2, "#6b7080");
    for (let i = 0; i < 6; i++) px(ctx, HEATER.x + 2 + i * 4, HEATER.y + 2, 2, HEATER.h - 4, pulse.habitat > 0 ? "#ffb35a" : "#c46a3a");
    // ---- dining nook (just for looks): rug, table set for two, chairs, a flower, a food counter ----
    const T0 = TABLE;
    px(ctx, T0.x - 8, T0.y - 8, T0.w + 16, T0.h + 16, "#a85a44"); // rug
    px(ctx, T0.x - 6, T0.y - 6, T0.w + 12, T0.h + 12, "#c9775a");
    for (let i = 0; i < 6; i++) {
      px(ctx, T0.x - 4 + i * 7, T0.y - 5, 2, 1, "#f2c26b");
      px(ctx, T0.x - 4 + i * 7, T0.y + T0.h + 4, 2, 1, "#f2c26b");
    }
    // chairs with backs
    px(ctx, T0.x - 8, T0.y + 3, 6, 8, INK);
    px(ctx, T0.x - 7, T0.y + 4, 4, 6, "#5b8def");
    px(ctx, T0.x - 9, T0.y + 1, 2, 12, INK);
    px(ctx, T0.x + T0.w + 2, T0.y + 3, 6, 8, INK);
    px(ctx, T0.x + T0.w + 3, T0.y + 4, 4, 6, "#5b8def");
    px(ctx, T0.x + T0.w + 7, T0.y + 1, 2, 12, INK);
    // table, set for two: a space meal and a fresh salad from the greenhouse
    px(ctx, T0.x, T0.y, T0.w, T0.h, INK);
    px(ctx, T0.x + 1, T0.y + 1, T0.w - 2, T0.h - 2, "#f2f4f8");
    px(ctx, T0.x + 2, T0.y + 4, 6, 6, "#c3c8d4");
    px(ctx, T0.x + 3, T0.y + 5, 4, 4, "#ffffff");
    px(ctx, T0.x + 4, T0.y + 6, 2, 2, AMBER);
    px(ctx, T0.x + T0.w - 8, T0.y + 4, 6, 6, "#c3c8d4");
    px(ctx, T0.x + T0.w - 7, T0.y + 5, 4, 4, "#ffffff");
    px(ctx, T0.x + T0.w - 6, T0.y + 6, 2, 2, "#7dffb0");
    px(ctx, T0.x + 9, T0.y + 3, 2, 3, "#3be8ff"); // cups
    px(ctx, T0.x + T0.w - 11, T0.y + 3, 2, 3, "#3be8ff");
    px(ctx, T0.x + 12, T0.y + 7, 3, 4, "#8a90a0"); // little vase with a flower
    px(ctx, T0.x + 13, T0.y + 3, 1, 4, "#2f8f3a");
    px(ctx, T0.x + 12, T0.y + 1, 3, 3, "#ff9ad8");
    px(ctx, T0.x + 13, T0.y + 2, 1, 1, "#ffd25a");
    if (night) {
      ctx.fillStyle = "rgba(255,210,120,0.16)"; // cozy lamp light over the table
      ctx.fillRect(T0.x - 4, T0.y - 4, T0.w + 8, T0.h + 8);
    }
    // food counter: a food warmer, a water jug, and a fruit bowl
    px(ctx, COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h, INK);
    px(ctx, COUNTER.x + 1, COUNTER.y + 1, COUNTER.w - 2, COUNTER.h - 2, "#e3e7ef");
    px(ctx, COUNTER.x + 3, COUNTER.y + 1, 12, 6, "#6b7080");
    px(ctx, COUNTER.x + 5, COUNTER.y + 2, 6, 3, Math.sin(t * 2) > 0 ? "#ffb35a" : "#c46a3a");
    px(ctx, COUNTER.x + 19, COUNTER.y + 1, 5, 6, "#3be8ff");
    px(ctx, COUNTER.x + 20, COUNTER.y + 2, 3, 2, "#bff6ff");
    px(ctx, COUNTER.x + 29, COUNTER.y + 3, 10, 4, "#c3c8d4");
    px(ctx, COUNTER.x + 30, COUNTER.y + 2, 2, 2, "#ff6a5a");
    px(ctx, COUNTER.x + 33, COUNTER.y + 2, 2, 2, "#7dffb0");
    px(ctx, COUNTER.x + 36, COUNTER.y + 2, 2, 2, "#ffd25a");
    // potted plants
    const pot = (ppx: number, ppy: number) => {
      px(ctx, ppx, ppy + 4, 5, 4, "#a85a44");
      px(ctx, ppx + 1, ppy, 3, 4, "#5fd35a");
      px(ctx, ppx - 1, ppy + 1, 2, 2, "#2f8f3a");
      px(ctx, ppx + 4, ppy + 1, 2, 2, "#2f8f3a");
    };
    pot(x + 96, y + 24);
    pot(x + 54, y + 76);
    // storm shelter: thick walls and a radiation sign
    const R2 = SHELTER_ROOM;
    px(ctx, R2.x, R2.y, R2.w, R2.h, INK);
    px(ctx, R2.x + 4, R2.y + 4, R2.w - 8, R2.h - 8, "#56607a");
    const sx = R2.x + R2.w / 2 - 6;
    px(ctx, sx, R2.y + 7, 12, 12, AMBER);
    px(ctx, sx + 5, R2.y + 12, 2, 2, INK);
    px(ctx, sx + 5, R2.y + 8, 2, 3, INK);
    px(ctx, sx + 1, R2.y + 15, 3, 2, INK);
    px(ctx, sx + 8, R2.y + 15, 3, 2, INK);
    if (hidden) {
      // the astronaut waits out the storm in here
      const save = { x: player.x, y: player.y, f: player.facing, m: player.moving };
      player.x = R2.x + R2.w / 2;
      player.y = R2.y + R2.h - 6;
      player.facing = "down";
      player.moving = false;
      drawPlayer();
      player.x = save.x;
      player.y = save.y;
      player.facing = save.f;
      player.moving = save.m;
    }
  }

  // ----- rat lab: three cages behind a window, and a thick shielded room for storms -----
  function drawLab() {
    const { x, y, w, h } = LAB;
    shadow(LAB);
    px(ctx, x, y, w, h, INK);
    px(ctx, x + 2, y + 2, w - 4, h - 4, "#e3e7ef");
    px(ctx, x + 2, y + 2, w - 4, 4, "#ffffff");
    px(ctx, x + 2, y + h - 10, w - 4, 8, "#c3c8d4");
    // door on the left (faces the path)
    px(ctx, x, y + h / 2 - 8, 5, 16, "#56607a");
    // window into the lab
    const wx = x + 10;
    const wy = y + 12;
    px(ctx, wx - 2, wy - 2, 66, 44, INK);
    px(ctx, wx, wy, 62, 40, night ? "#1b2a4a" : "#bfe9f5");
    for (let c = 0; c < 3; c++) {
      const cx = wx + 3 + c * 20;
      const cy = wy + 14;
      px(ctx, cx, cy, 17, 14, "#8a90a0"); // cage
      px(ctx, cx + 1, cy + 1, 15, 12, "#f2f4f8");
      if (!rats.shielded) {
        // a rat scurrying back and forth (slower when it's not healthy)
        const sp = rats.health > 50 ? 3 : 1.2;
        const eating = t - fedAt[c] < 4; // just got food: nibble at the bowl
        const rx = eating
          ? cx + 7 + (Math.sin(t * 20) > 0 ? 1 : 0)
          : cx + 2 + Math.round((Math.sin(t * sp + c * 2) * 0.5 + 0.5) * 7);
        px(ctx, rx, cy + 8, 4, 3, "#b9bec9");
        px(ctx, rx + 4, cy + 8, 1, 1, "#ff9ad8"); // nose
        px(ctx, rx - 2, cy + 10, 2, 1, "#ff9ad8"); // tail
      }
      for (let b = 0; b < 4; b++) px(ctx, cx + 3 + b * 4, cy + 1, 1, 12, "#a9b0c0"); // bars
      px(ctx, cx + 11, cy + 10, 4, 2, rats.fed || t - fedAt[c] < 5 ? "#ffd25a" : "#6b7080"); // food bowl: full after feeding
    }
    // rat health bar under the window
    const hp = clamp(rats.health / 100, 0, 1);
    px(ctx, wx, wy + 44, 62, 4, INK);
    px(ctx, wx + 1, wy + 45, Math.max(0, Math.round(60 * hp)), 2, hp > 0.6 ? "#7dffb0" : hp > 0.3 ? AMBER : HOT);
    if (inLab()) drawPlayer();
    // shielded room: thick walls, a radiation sign, and a light that turns green when the rats are inside
    const sx = x + w - 34;
    const sy = y + 10;
    px(ctx, sx, sy, 28, 48, INK);
    px(ctx, sx + 3, sy + 3, 22, 42, "#6b7080");
    px(ctx, sx + 8, sy + 8, 12, 12, AMBER);
    px(ctx, sx + 13, sy + 13, 2, 2, INK);
    px(ctx, sx + 13, sy + 9, 2, 3, INK);
    px(ctx, sx + 9, sy + 16, 3, 2, INK);
    px(ctx, sx + 16, sy + 16, 3, 2, INK);
    px(ctx, sx + 10, sy + 30, 8, 5, rats.shielded ? (Math.sin(t * 4) > -0.5 ? "#7dffb0" : "#3f9a68") : "#2a3a30");
    if (pulse.lab > 0) {
      ctx.fillStyle = `rgba(255,210,90,${pulse.lab * 0.3})`;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
  }

  function drawDock() {
    const { x, y, w, h } = DOCK;
    px(ctx, x + 2, y + 3, w, h, "rgba(0,0,0,0.25)");
    px(ctx, x, y, w, h, "#4a4e5c");
    px(ctx, x + 2, y + 2, w - 4, h - 4, "#6b7080");
    for (let k = 0; k < 4; k++) px(ctx, x + 4 + k * 9, y + 2, 4, 2, AMBER); // hazard stripes
    // charger post: the light blinks green while the rover charges
    px(ctx, x + w - 7, y - 10, 5, 14, INK);
    const on = rover.state === "charge" && Math.sin(t * 4) > 0;
    px(ctx, x + w - 6, y - 9, 3, 3, on ? "#7dffb0" : "#2a3a30");
  }

  function drawRover() {
    const x = Math.round(rover.x);
    const y = Math.round(rover.y);
    const f = rover.face;
    px(ctx, x - 9, y - 1, 18, 2, "rgba(0,0,0,0.3)"); // shadow
    const wob = rover.moving && Math.floor(rover.wheel) % 2 ? 1 : 0;
    for (let i = 0; i < 3; i++) {
      px(ctx, x - 8 + i * 6, y - 4, 4, 4, INK); // wheels
      px(ctx, x - 7 + i * 6, y - 3 + ((i + wob) % 2), 2, 1, "#5b6170");
    }
    px(ctx, x - 8, y - 10, 16, 6, INK); // body
    px(ctx, x - 7, y - 9, 14, 4, "#e3e7ef");
    px(ctx, x - 7, y - 9, 14, 1, "#ffffff");
    px(ctx, x - 6, y - 8, 5, 2, "#2346a8"); // little solar panel
    px(ctx, x + (f > 0 ? 1 : -5), y - 7, 4, 1, AMBER);
    const mx = x + f * 5;
    px(ctx, mx, y - 16, 1, 6, INK); // camera mast
    px(ctx, mx - 2, y - 19, 5, 4, INK); // camera head
    px(ctx, mx + (f > 0 ? 1 : -1), y - 18, 2, 2, rover.state === "happy" ? "#7dffb0" : "#3be8ff");
    if (rover.state === "charge") {
      const fill = Math.round(8 * clamp(1 - rover.timer / 22, 0, 1)); // battery filling up
      px(ctx, x - 5, y - 13, 10, 3, INK);
      px(ctx, x - 4, y - 12, fill, 1, "#7dffb0");
    }
  }

  // Rat food: little pellets bouncing into a bowl
  function foodPop(c: number, n: number) {
    const bx = LAB.x + 10 + 3 + c * 20 + 13;
    const by = LAB.y + 12 + 14 + 9;
    for (let j = 0; j < n; j++) {
      parts.push({
        x: bx + (Math.random() - 0.5) * 4, y: by, vx: (Math.random() - 0.5) * 16, vy: -8 - Math.random() * 10,
        life: 0, max: 0.35 + Math.random() * 0.3, c: Math.random() < 0.5 ? "#ffd25a" : "#c49a5a", s: 1,
      });
    }
  }
  // A bag of rat food, carried while feeding
  function drawFoodBag() {
    const bx = Math.round(player.x) + 3;
    const by = Math.round(player.y) - 15;
    px(ctx, bx - 1, by - 1, 6, 7, INK);
    px(ctx, bx, by, 4, 5, "#c49a5a");
    px(ctx, bx + 1, by + 1, 2, 1, "#ffd25a");
  }
  // The astronaut is inside the rat lab (drawn in front of the cages)
  const inLab = () => scene === "feed" && sceneOk && progress !== null && player.x > LAB.x + 1;

  // The astronaut is inside the greenhouse (drawn under the glass roof)
  const inGreenhouse = () => scene === "harvest" && sceneOk && progress !== null && player.x < GREEN.x + GREEN.w - 1;

  // ----- drawing: buildings -----
  function shadow(r: Rect) {
    px(ctx, r.x + 5, r.y + 7, r.w, r.h, "rgba(0,0,0,0.28)");
  }

  function drawHabitat() {
    const { x, y, w, h } = HAB;
    const p = PAL[dest];
    shadow(HAB);
    px(ctx, x, y, w, h, INK);
    px(ctx, x + 2, y + 2, w - 4, h - 4, "#d9dde6");
    px(ctx, x + 2, y + 2, w - 4, 5, "#f3f5fa");
    px(ctx, x + 2, y + h - 14, w - 4, 12, "#a7adbb");
    for (let i = 1; i < 4; i++) px(ctx, x + (i * w) / 4, y + 7, 1, h - 21, "#b9bfcc");
    px(ctx, x + 2, y + 50, w - 4, 6, p.accent2);
    px(ctx, x + 2, y + 50, w - 4, 2, p.accent);
    // roof unit + antenna
    px(ctx, x + w / 2 - 22, y - 6, 44, 11, INK);
    px(ctx, x + w / 2 - 20, y - 4, 40, 8, "#c3c8d4");
    for (let i = 0; i < 5; i++) px(ctx, x + w / 2 - 16 + i * 7, y - 2, 4, 4, "#8a90a0");
    px(ctx, x + w - 22, y - 16, 2, 16, INK);
    px(ctx, x + w - 23, y - 18, 4, 3, Math.sin(t * 3) > 0 ? HOT : "#6a2a2a");
    // windows
    for (let i = 0; i < 4; i++) {
      const wx = x + 14 + i * 32;
      px(ctx, wx, y + 18, 20, 13, INK);
      px(ctx, wx + 2, y + 20, 16, 9, night ? "#9ff2ff" : "#2b4a7a");
      if (!night) px(ctx, wx + 3, y + 21, 5, 2, "#7fb2e6");
    }
    // door
    px(ctx, x + w / 2 - 11, y + h - 24, 22, 24, INK);
    px(ctx, x + w / 2 - 9, y + h - 22, 18, 22, "#56607a");
    px(ctx, x + w / 2 - 1, y + h - 22, 2, 22, INK);
    px(ctx, x + w / 2 - 14, y + h - 27, 3, 3, Math.sin(t * 2) > -0.3 ? "#7dffb0" : "#2a5a40");
    // airlock step
    px(ctx, x + w / 2 - 13, y + h, 26, 4, "#8a90a0");
  }

  function drawSolar() {
    const { x, y } = SOLAR;
    const pw = 30;
    const ph = 20;
    // cable to habitat, with an energy pulse by day
    px(ctx, SOLAR.x + SOLAR.w, y + 40, HAB.x - (SOLAR.x + SOLAR.w), 2, INK);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const X = x + 6 + col * 34;
        const Y = y + 6 + row * 24;
        px(ctx, X + 3, Y + 4, pw, ph, "rgba(0,0,0,0.3)");
        px(ctx, X + pw / 2 - 1, Y + ph, 2, 4, "#555a6a");
        px(ctx, X, Y, pw, ph, "#0d1438");
        px(ctx, X + 1, Y + 1, pw - 2, ph - 2, night ? "#141c45" : "#2346a8");
        for (let gx = X + 7; gx < X + pw - 1; gx += 7) px(ctx, gx, Y + 1, 1, ph - 2, night ? "#1d2760" : "#5b8def");
        px(ctx, X + 1, Y + ph / 2, pw - 2, 1, night ? "#1d2760" : "#5b8def");
        if (!night) {
          // a sheen sweeping across the panels
          const sx = x + ((t * 50) % (SOLAR.w + 60)) - 30 + row * 6;
          const a = Math.max(X + 1, sx);
          const b = Math.min(X + pw - 1, sx + 4);
          if (b > a) px(ctx, a, Y + 1, b - a, ph - 2, "rgba(255,255,255,0.35)");
        }
        // dust on the panel (wiped away from the bottom up while cleaning)
        if (panelDust > 0.02) {
          const bottom = Math.min(Y + ph - 1, Math.floor(wipeLine(col)));
          if (bottom > Y + 1) {
            const al = 0.2 + 0.5 * clamp(panelDust / 0.5, 0, 1);
            ctx.fillStyle = dest === "mars" ? `rgba(196,120,64,${al})` : `rgba(160,160,170,${al})`;
            ctx.fillRect(X + 1, Y + 1, pw - 2, bottom - (Y + 1));
            for (let k = 0; k < 6; k++) {
              const sx = X + 3 + ((k * 7 + row * 5 + col * 3) % (pw - 6));
              const sy = Y + 3 + ((k * 5 + col * 7) % (ph - 6));
              if (sy < bottom) px(ctx, sx, sy, 2, 1, dirtColor());
            }
          }
        }
      }
    }
  }

  function drawCables() {
    const y1 = SOLAR.y + 40;
    const y2 = HAB.y + 40;
    px(ctx, HAB.x + HAB.w, y2, BATT.x - (HAB.x + HAB.w), 2, INK);
    if (!night) {
      const span1 = HAB.x - (SOLAR.x + SOLAR.w);
      const span2 = BATT.x - (HAB.x + HAB.w);
      const k = (t * 40) % 24;
      for (let o = k; o < span1; o += 24) px(ctx, SOLAR.x + SOLAR.w + o, y1, 3, 2, AMBER);
      for (let o = k; o < span2; o += 24) px(ctx, HAB.x + HAB.w + o, y2, 3, 2, AMBER);
    }
  }

  // The greenhouse's glass roof: drawn once, then reused every frame
  let roofArt: HTMLCanvasElement | null = null;
  function buildRoof() {
    const { w, h } = GREEN;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const frame = "rgba(220,248,255,0.32)";
    const rim = "rgba(235,252,255,0.7)";
    px(g, 5, 5, w - 10, h - 10, "rgba(160,240,255,0.12)"); // tinted glass
    px(g, 5, 5, w - 10, h / 2 - 6, "rgba(255,255,255,0.05)"); // sunny side of the roof
    for (let X = 8; X < w - 6; X += 20) px(g, X, 5, 1, h - 10, frame); // pane frames between the plants
    for (let Y = 26; Y < h - 6; Y += 24) px(g, 5, Y, w - 10, 1, frame);
    px(g, 5, h / 2 - 1, w - 10, 2, "rgba(240,252,255,0.5)"); // roof ridge
    px(g, 3, 3, w - 6, 2, rim); // metal rim (with a gap for the door on the right)
    px(g, 3, h - 5, w - 6, 2, rim);
    px(g, 3, 3, 2, h - 6, rim);
    px(g, w - 5, 3, 2, h / 2 - 11, rim);
    px(g, w - 5, h / 2 + 8, 2, h / 2 - 11, rim);
    for (let s = 0; s < 3; s++) {
      // reflections
      const sx = 20 + s * 50;
      for (let k = 0; k < 30; k++) px(g, sx + k, 6 + k, 2, 1, "rgba(255,255,255,0.2)");
    }
    return c;
  }

  function drawGreenhouse() {
    const { x, y, w, h } = GREEN;
    const p = PAL[dest];
    shadow(GREEN);
    px(ctx, x, y, w, h, INK);
    px(ctx, x + 2, y + 2, w - 4, h - 4, "#c3c8d4");
    px(ctx, x + 5, y + 5, w - 10, h - 10, p.soil);
    for (let r = 0; r < 4; r++) px(ctx, x + 8, y + 16 + r * 24, w - 16, 3, "#3d2218");
    // door gap on the right (faces the path)
    px(ctx, x + w - 5, y + h / 2 - 8, 5, 16, "#56607a");

    const f = status.food;
    const stage = f >= 70 ? 3 : f >= 40 ? 2 : f >= 15 ? 1 : 0;
    const leaf = stage === 0 ? "#a08a3a" : "#5fd35a";
    const leafD = stage === 0 ? "#6e5a22" : "#2f8f3a";
    const leafH = stage === 0 ? "#c4ad55" : "#a6f08a";
    let i = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        const cx = x + 18 + c * 20;
        const cy = y + 14 + r * 24;
        const sway = Math.sin(t * 2 + i++) > 0.6 ? 1 : 0;
        if ((picked.get(r * 10 + c) ?? 0) > t) {
          // just picked: a little sprout grows back
          px(ctx, cx - 1, cy + 2, 2, 3, leafD);
          px(ctx, cx - 2, cy + 1, 1, 1, leaf);
          px(ctx, cx + 1, cy + 1, 1, 1, leaf);
          continue;
        }
        px(ctx, cx - 1, cy + 2, 2, 3, leafD);
        if (stage >= 1 || stage === 0) {
          px(ctx, cx - 3 + sway, cy, 3, 2, leaf);
          px(ctx, cx + 1 + sway, cy - 1, 3, 2, leaf);
        }
        if (stage >= 2) {
          px(ctx, cx - 5 + sway, cy - 2, 4, 2, leaf);
          px(ctx, cx + 2 + sway, cy - 3, 4, 2, leaf);
          px(ctx, cx - 1 + sway, cy - 4, 2, 3, leafD);
        }
        if (stage >= 3) {
          px(ctx, cx - 2 + sway, cy - 6, 4, 3, leaf);
          px(ctx, cx - 1 + sway, cy - 6, 1, 1, leafH);
          if ((r + c) % 3 === 0) px(ctx, cx + 3, cy - 1, 2, 2, "#ff6a5a"); // tomatoes!
        }
        px(ctx, cx - 3 + sway, cy, 1, 1, leafH);
      }
    }
    if (inGreenhouse()) drawPlayer();
    // glass roof: panes in a metal frame, a ridge down the middle, and reflections
    roofArt ??= buildRoof();
    ctx.drawImage(roofArt, x, y);
    // grow lights along the rim
    for (let k = 0; k < 8; k++) px(ctx, x + 10 + k * 19, y + 3, 3, 2, night ? "#ff9ad8" : "#8a90a0");
    if (pulse.greenhouse > 0) {
      ctx.fillStyle = `rgba(125,255,176,${pulse.greenhouse * 0.35})`;
      ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    }
  }

  function drawRecycler() {
    const { x, y, w, h } = RECYC;
    shadow(RECYC);
    px(ctx, x, y, w, h, INK);
    px(ctx, x + 2, y + 2, w - 4, h - 4, "#c3c8d4");
    px(ctx, x + 2, y + 2, w - 4, 4, "#e3e7ef");
    // oxygen tanks: fill level = oxygen
    for (let k = 0; k < 2; k++) {
      const tx = x + 8 + k * 18;
      px(ctx, tx, y + 12, 14, 56, INK);
      px(ctx, tx + 2, y + 14, 10, 52, "#0d2234");
      const lvl = Math.round((52 * status.oxygen) / 100);
      px(ctx, tx + 2, y + 14 + 52 - lvl, 10, lvl, status.oxygen < 30 ? HOT : HUD_C);
      px(ctx, tx + 3, y + 15 + 52 - lvl, 2, Math.max(0, lvl - 2), "rgba(255,255,255,0.35)");
      px(ctx, tx + 4, y + 9, 6, 4, "#8a90a0");
    }
    // fan
    const fx = x + 66;
    const fy = y + 30;
    disc(ctx, fx, fy, 14, INK);
    disc(ctx, fx, fy, 12, "#3a4256");
    const spin = Math.floor(t * (pulse.recycle > 0 ? 24 : 8)) % 2;
    if (spin) {
      px(ctx, fx - 10, fy - 1, 21, 3, "#a7adbb");
      px(ctx, fx - 1, fy - 10, 3, 21, "#a7adbb");
    } else {
      for (let k = -7; k <= 7; k++) {
        px(ctx, fx + k, fy + k, 2, 2, "#a7adbb");
        px(ctx, fx + k, fy - k, 2, 2, "#a7adbb");
      }
    }
    disc(ctx, fx, fy, 3, "#e3e7ef");
    px(ctx, fx - 12, y + 56, 26, 12, INK);
    px(ctx, fx - 10, y + 58, 22, 8, "#0d2234");
    px(ctx, fx - 8, y + 60, 4, 4, status.oxygen < 30 ? HOT : "#7dffb0");
    px(ctx, fx - 2, y + 61, 10, 2, HUD_C);
  }

  function drawBattery() {
    const { x, y, w, h } = BATT;
    shadow(BATT);
    px(ctx, x, y, w, h, INK);
    px(ctx, x + 2, y + 2, w - 4, h - 4, "#3a4256");
    const lvl = status.power;
    const col = lvl < 30 ? HOT : lvl < 60 ? AMBER : HUD_C;
    const lowBlink = lvl < 30 && Math.sin(t * 8) > 0;
    for (let k = 0; k < 4; k++) {
      const cx = x + 8 + k * 21;
      px(ctx, cx + 4, y + 6, 8, 3, "#a7adbb");
      px(ctx, cx, y + 9, 16, 48, INK);
      px(ctx, cx + 2, y + 11, 12, 44, "#0d1438");
      // each cell holds a quarter of the charge
      const cell = clamp((lvl - k * 25) / 25, 0, 1);
      const fh = Math.round(44 * cell);
      if (fh > 0) px(ctx, cx + 2, y + 11 + 44 - fh, 12, fh, lowBlink ? "#7a2020" : col);
      for (let s = 1; s < 4; s++) px(ctx, cx + 2, y + 11 + s * 11, 12, 1, "rgba(0,0,0,0.35)");
    }
    if (pulse.conserve > 0) {
      ctx.fillStyle = `rgba(255,179,71,${pulse.conserve * 0.4})`;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
  }

  function drawDish() {
    const { x, y, w, h } = DISH;
    // shadow shaped like the dish and its base (a square shadow looked off-center)
    disc(ctx, x + w / 2 + 4, y + 20, 15, "rgba(0,0,0,0.22)");
    px(ctx, x + 10, y + h - 6, w - 14, 7, "rgba(0,0,0,0.22)");
    px(ctx, x + 6, y + h - 10, w - 12, 10, INK);
    px(ctx, x + 8, y + h - 8, w - 16, 6, "#8a90a0");
    px(ctx, x + w / 2 - 2, y + 18, 4, h - 26, INK);
    disc(ctx, x + w / 2, y + 16, 15, INK);
    disc(ctx, x + w / 2, y + 16, 13, "#e3e7ef");
    disc(ctx, x + w / 2 + 1, y + 17, 9, "#c3c8d4");
    px(ctx, x + w / 2 - 1, y + 4, 2, 12, INK);
    px(ctx, x + w / 2 - 2, y + 2, 4, 3, Math.sin(t * 2.5) > 0 ? HUD_C : "#1d4a55");
  }

  // ----- drawing: astronaut -----
  function drawPlayer() {
    const p = PAL[dest];
    const colors: Record<string, string> = {
      K: INK,
      W: "#f2f4f8",
      G: "#a9b0c0",
      V: "#1b2a6b",
      H: "#7fe0ff",
      A: p.accent,
      B: "#c9ced9",
    };
    const f = player.facing;
    const frame = player.moving ? 1 + (Math.floor(player.walk) % 2) : 0;
    const body = f === "down" ? BODY_FRONT : f === "up" ? BODY_BACK : BODY_SIDE;
    const legs = f === "left" || f === "right" ? LEGS_SIDE[frame] : LEGS_FRONT[frame];
    const rows = [...body, ...legs];
    const bob = player.moving && frame === 1 ? -1 : 0;
    // Whole art pixels; the camera snaps to the same grid, so the astronaut stays steady on screen
    const sx = Math.round(player.x);
    const sy = Math.round(player.y);
    const ox = sx - 6;
    const oy = sy - 16 + bob;
    // shadow
    px(ctx, sx - 5, sy - 1, 10, 2, "rgba(0,0,0,0.35)");
    px(ctx, sx - 4, sy - 2, 8, 4, "rgba(0,0,0,0.2)");
    for (let ry = 0; ry < rows.length; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < 12; rx++) {
        const ch = row[f === "left" ? 11 - rx : rx];
        if (ch === "." || ch === undefined) continue;
        ctx.fillStyle = colors[ch];
        ctx.fillRect(ox + rx, oy + ry, 1, 1);
      }
    }
    if (scene === "clean" && sceneOk && progress !== null) drawMop();
    if (fix) drawTool();
    if (scene === "feed" && sceneOk && progress !== null) drawFoodBag();
  }

  // ----- landing pad + beacon + rescue ship -----
  function drawPad() {
    const { x, y, w, h } = PAD;
    px(ctx, x + 3, y + 4, w, h, "rgba(0,0,0,0.25)"); // shadow
    px(ctx, x, y, w, h, INK); //                         bold black border
    px(ctx, x + 4, y + 4, w - 8, h - 8, "#6b7080"); //   concrete
    for (let gx = x + 36; gx < x + w - 8; gx += 32) px(ctx, gx, y + 7, 1, h - 14, "#5f6474"); // slab seams
    for (let gy = y + 36; gy < y + h - 8; gy += 32) px(ctx, x + 7, gy, w - 14, 1, "#5f6474");
    // yellow and black hazard stripes just inside the border
    const band = (bx: number, by: number, bw: number, bh: number, across: boolean) => {
      const len = across ? bw : bh;
      for (let k = 0; k < len; k += 6) {
        const c = (k / 6) % 2 ? INK : AMBER;
        if (across) px(ctx, bx + k, by, Math.min(6, len - k), bh, c);
        else px(ctx, bx, by + k, bw, Math.min(6, len - k), c);
      }
    };
    band(x + 4, y + 4, w - 8, 3, true);
    band(x + 4, y + h - 7, w - 8, 3, true);
    band(x + 4, y + 7, 3, h - 14, false);
    band(x + w - 7, y + 7, 3, h - 14, false);
    // touchdown target where the ship lands: a bold black ring that flashes green when the beacon is on
    const on = beaconOn && Math.sin(t * 6) > 0;
    const cx = x + w / 2;
    const cy = y + h / 2;
    disc(ctx, cx, cy, 22, on ? "#7dffb0" : INK);
    disc(ctx, cx, cy, 18, "#6b7080");
    disc(ctx, cx, cy, 5, on ? "#7dffb0" : INK);
    px(ctx, cx - 1, cy - 30, 2, 6, INK);
    px(ctx, cx - 1, cy + 24, 2, 6, INK);
    px(ctx, cx - 30, cy - 1, 6, 2, INK);
    px(ctx, cx + 24, cy - 1, 6, 2, INK);
    // corner lights
    for (const [lx, ly] of [[x + 10, y + 10], [x + w - 13, y + h - 13], [x + 10, y + h - 13]])
      px(ctx, lx, ly, 3, 3, on ? "#7dffb0" : "#2a3a30");
  }
  function drawMast() {
    const { x, y, w, h } = MAST;
    px(ctx, x + 2, y - 10, 3, h + 10, INK);
    px(ctx, x, y + h - 2, w, 3, INK);
    const blink = beaconOn ? (Math.sin(t * 8) > 0 ? "#7dffb0" : "#2a5a40") : "#5a2a2a";
    px(ctx, x + 1, y - 14, 5, 5, INK);
    px(ctx, x + 2, y - 13, 3, 3, blink);
  }
  function drawShip() {
    if (!landing) return;
    const p = Math.min(1, landT / 4);
    const sx = PAD.x + PAD.w / 2;
    const sy = PAD.y + PAD.h / 2 - 160 * (1 - p) * (1 - p);
    // shadow grows as the ship comes down
    const sh = Math.round(6 + 10 * p);
    px(ctx, sx - sh, PAD.y + PAD.h / 2 + 6, sh * 2, 3, "rgba(0,0,0,0.35)");
    px(ctx, sx - 9, sy - 28, 18, 30, INK);
    px(ctx, sx - 7, sy - 26, 14, 26, "#f2f4f8");
    px(ctx, sx - 4, sy - 34, 8, 8, INK);
    px(ctx, sx - 3, sy - 33, 6, 7, "#f2f4f8");
    px(ctx, sx - 3, sy - 20, 6, 5, "#3be8ff");
    px(ctx, sx - 13, sy - 4, 6, 8, INK);
    px(ctx, sx + 7, sy - 4, 6, 8, INK);
    if (p < 1) for (let i = 0; i < 3; i++) px(ctx, sx - 4 + i * 3, sy + 2, 2, 4 + ((t * 30 + i * 7) % 6), i % 2 ? AMBER : HOT);
  }

  // ----- broken stations: red flashing outline + sparks -----
  function drawBroken() {
    for (const id of STATION_IDS) {
      if (!stationInfo[id]?.broken) continue;
      const r = STATIONS[id].rect;
      if (Math.sin(t * 6) > -0.2) {
        ctx.strokeStyle = HOT;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
      }
      if (Math.random() < (quality === "low" ? 0.08 : 0.25)) {
        parts.push({
          x: r.x + Math.random() * r.w, y: r.y + Math.random() * r.h * 0.5,
          vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0, max: 0.35, c: Math.random() < 0.5 ? AMBER : "#fff6c0", s: 1,
        });
      }
    }
  }

  function drawProgress() {
    if (progress === null || hidden) return;
    const cx = Math.round(player.x);
    const cy = Math.round(player.y) - 26;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(2,6,13,0.8)";
    ctx.beginPath();
    ctx.arc(cx + 0.5, cy + 0.5, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#7dffb0";
    ctx.beginPath();
    ctx.arc(cx + 0.5, cy + 0.5, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }

  // ----- screen-space text (labels are drawn once and cached) -----
  function tagCanvas(text: string, bg: string, fg: string, border: string, size: number) {
    const key = `${text}|${bg}|${fg}|${border}|${size}|${dpr}`;
    let c = tagCache.get(key);
    if (c) return c;
    if (tagCache.size > 80) tagCache.clear();
    c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    g.font = `700 ${size}px ${font}`;
    const tw = g.measureText(text).width;
    const padX = 7;
    const h = size + 8;
    const w = Math.ceil(tw + padX * 2);
    c.width = Math.ceil((w + 2) * dpr);
    c.height = Math.ceil((h + 2) * dpr);
    g.scale(dpr, dpr);
    const cut = 5;
    g.beginPath();
    g.moveTo(1 + cut, 1);
    g.lineTo(1 + w, 1);
    g.lineTo(1 + w, 1 + h - cut);
    g.lineTo(1 + w - cut, 1 + h);
    g.lineTo(1, 1 + h);
    g.lineTo(1, 1 + cut);
    g.closePath();
    g.fillStyle = bg;
    g.fill();
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.stroke();
    g.font = `700 ${size}px ${font}`;
    g.fillStyle = fg;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 1 + w / 2, 1 + h / 2 + 0.5);
    tagCache.set(key, c);
    return c;
  }
  function tag(sx: number, sy: number, text: string, o: { bg: string; fg: string; border: string; size: number }) {
    const c = tagCanvas(text, o.bg, o.fg, o.border, o.size);
    const w = c.width / dpr;
    const h = c.height / dpr;
    screen.drawImage(c, Math.round((sx - w / 2) * dpr), Math.round((sy - h) * dpr));
  }
  const toScreen = (wx: number, wy: number) => ({ x: (wx - cam.x) * zoom, y: (wy - cam.y) * zoom });

  function drawScreenText() {
    screen.setTransform(1, 0, 0, 1, 0, 0);
    for (const id of STATION_IDS) {
      if (id === "bed" && !insideBase()) continue; // the bed label only shows inside
      const info = stationInfo[id];
      const r = STATIONS[id].rect;
      const s = toScreen(r.x + r.w / 2, r.y);
      const broken = !!info?.broken;
      const hot = near === id;
      tag(s.x, s.y - 8, broken ? `⚠ ${STATIONS[id].label}` : STATIONS[id].label, {
        bg: broken ? "rgba(60,6,6,0.9)" : "rgba(2,6,13,0.82)",
        fg: broken ? "#ffb4ad" : hot ? AMBER : HUD_C,
        border: broken ? HOT : hot ? AMBER : "rgba(59,232,255,0.55)",
        size: 10,
      });
    }
    if (hidden) {
      const hs = toScreen(HAB.x + HAB.w / 2, HAB.y);
      tag(hs.x, hs.y - 34, `${name.toUpperCase() || "ASTRONAUT"} IS SHELTERING INSIDE…`, {
        bg: "rgba(4,40,24,0.9)", fg: "#7dffb0", border: "#7dffb0", size: 11,
      });
    }
    if (!hidden && !sleeping) {
      const ps = toScreen(player.x, player.y - 17);
      tag(ps.x, ps.y - 4, name.toUpperCase() || "ASTRONAUT", { bg: "rgba(2,6,13,0.85)", fg: "#ffffff", border: "rgba(59,232,255,0.6)", size: 10 });
    }
    if (rover.state === "found") {
      // the rover found something: a bouncing "!" over its head
      const rs = toScreen(rover.x, rover.y - 20);
      const hop = Math.round(Math.abs(Math.sin(t * 6)) * 4);
      tag(rs.x, rs.y - 6 - hop, "!", { bg: AMBER, fg: "#1b0d00", border: "#ffe0a8", size: 16 });
      if (roverNear() && !paused)
        tag(rs.x, rs.y - 36, "[SPACE] SEE WHAT THE ROVER FOUND", { bg: AMBER, fg: "#1b0d00", border: "#ffe0a8", size: 12 });
    }
    if (near && !paused && !sleeping && !roverNear()) {
      const info = stationInfo[near];
      const r = reachRect(near);
      const s = toScreen(r.x + r.w / 2, r.y);
      const bounce = Math.round(Math.sin(t * 5) * 2);
      const blockedNow = !!info?.blocked;
      tag(s.x, s.y - 34 + bounce, `[SPACE] ${info?.verb ?? "USE"}`, {
        bg: info?.broken ? HOT : blockedNow ? "#5b6170" : AMBER,
        fg: info?.broken ? "#fff" : blockedNow ? "#e3e7ef" : "#1b0d00",
        border: info?.broken ? "#ffd0cc" : blockedNow ? "#9aa0ae" : "#ffe0a8",
        size: 12,
      });
    }
    screen.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of floats) {
      if (f.age < 0) continue;
      const s = toScreen(f.x, f.y);
      screen.globalAlpha = clamp(1.6 - f.age, 0, 1);
      screen.font = `800 15px ${font}`;
      screen.textAlign = "center";
      screen.textBaseline = "middle";
      screen.lineWidth = 4;
      screen.strokeStyle = "rgba(2,6,13,0.9)";
      const yy = s.y - 80 - f.age * 40;
      screen.strokeText(f.text, s.x, yy);
      screen.fillStyle = f.color;
      screen.fillText(f.text, s.x, yy);
      screen.globalAlpha = 1;
    }
  }

  // ----- night lighting (one cached light sprite, no per-frame gradients) -----
  function drawNight() {
    if (dark < 0.01) return;
    const W = overlay.width;
    const H = overlay.height;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = "source-over";
    octx.globalAlpha = 1;
    octx.clearRect(0, 0, W, H);
    octx.fillStyle = `rgba(4,8,38,${dark * 0.66})`;
    octx.fillRect(0, 0, W, H);
    octx.globalCompositeOperation = "destination-out";
    const light = (wx: number, wy: number, r: number, power = 1) => {
      const sx = wx - cam.x;
      const sy = wy - cam.y;
      if (sx < -r || sy < -r || sx > W + r || sy > H + r) return;
      octx.globalAlpha = power;
      octx.drawImage(lightSprite, sx - r, sy - r, r * 2, r * 2);
    };
    const powered = status.power > 0;
    if (powered) for (let i = 0; i < 4; i++) light(HAB.x + 24 + i * 32, HAB.y + 26, 34, 0.9);
    light(HAB.x + HAB.w / 2, HAB.y + HAB.h + 6, 34, 0.9);
    if (!hidden) light(player.x, player.y - 8, 56, 1);
    if (powered) light(GREEN.x + GREEN.w / 2, GREEN.y + GREEN.h / 2, 70, 0.75);
    light(RECYC.x + RECYC.w / 2, RECYC.y + RECYC.h / 2, 34, 0.7);
    light(BATT.x + BATT.w / 2, BATT.y + BATT.h / 2, 34, 0.7);
    light(DISH.x + DISH.w / 2, DISH.y + 4, 18, 0.8);
    light(rover.x + rover.face * 8, rover.y - 6, 22, 0.7); // rover headlights
    light(LAB.x + LAB.w / 2, LAB.y + LAB.h / 2, 44, 0.75);
    if (insideBase() || sleeping) light(HAB.x + HAB.w / 2, HAB.y + HAB.h / 2, 84, sleeping ? 0.7 : 0.9); // room lights (a night-light while sleeping)
    if (beaconOn) light(MAST.x + 3, MAST.y - 12, 40, 0.9);
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(overlay, 0, 0);
  }

  // ----- weather on top of the world (screen space of the small buffer) -----
  function drawWeather(dt: number) {
    const W = buf.width;
    const H = buf.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (weather.dust) {
      ctx.fillStyle = dest === "mars" ? "rgba(190,100,50,0.22)" : "rgba(150,150,160,0.16)";
      ctx.fillRect(0, 0, W, H);
      const n = quality === "low" ? 30 : dust.length;
      ctx.fillStyle = dest === "mars" ? "#e3a06a" : "#c9cbd4";
      for (let i = 0; i < n; i++) {
        const d = dust[i];
        d.x += dt * 0.12 * d.v;
        d.y += dt * 0.03 * d.v;
        if (d.x > 1) d.x -= 1;
        if (d.y > 1) d.y -= 1;
        ctx.fillRect((d.x * W) | 0, (d.y * H) | 0, d.v > 1.2 ? 2 : 1, 1);
      }
    }
    if (weather.cold) {
      ctx.fillStyle = "rgba(120,180,255,0.10)";
      ctx.fillRect(0, 0, W, H);
    }
    if (weather.storm === 1) {
      ctx.fillStyle = `rgba(255,120,40,${0.05 + 0.05 * Math.sin(t * 4)})`;
      ctx.fillRect(0, 0, W, H);
    } else if (weather.storm === 2) {
      ctx.fillStyle = `rgba(255,40,60,${0.12 + 0.08 * Math.sin(t * 7)})`;
      ctx.fillRect(0, 0, W, H);
      // radiation "sparkles": fast particles streaking down
      ctx.fillStyle = "rgba(255,220,240,0.8)";
      const n = quality === "low" ? 8 : 24;
      for (let i = 0; i < n; i++) {
        const sx = ((i * 97 + t * 260 * (1 + (i % 3))) % (W + 40)) - 20;
        const sy = ((i * 53 + t * 180 * (1 + (i % 2))) % (H + 40)) - 20;
        ctx.fillRect(sx | 0, sy | 0, 1, 3);
      }
    }
  }

  // ----- particles -----
  function burst(id: StationId) {
    const r = STATIONS[id].rect;
    const c = id === "greenhouse" ? "#7dffb0" : id === "recycle" ? HUD_C : id === "habitat" ? HOT : AMBER;
    const n = quality === "low" ? 10 : 22;
    for (let i = 0; i < n; i++) {
      parts.push({
        x: r.x + 8 + Math.random() * (r.w - 16), y: r.y + 8 + Math.random() * (r.h - 16),
        vx: (Math.random() - 0.5) * 20, vy: -18 - Math.random() * 26, life: 0, max: 0.8 + Math.random() * 0.6,
        c, s: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  // ----- main loop -----
  let last = performance.now();
  let lastDraw = 0;
  let raf = 0;
  // frame-time watchdog: switch to low quality if the computer struggles
  let slowSum = 0;
  let slowN = 0;
  let warm = 0;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    const dt = Math.min(0.05, rawDt);
    last = now;
    t += dt;
    step(dt);
    if (!paused) updateRover(dt);
    opts.onFrame?.(dt);

    // auto quality
    if (quality === "high" && !paused && document.visibilityState === "visible") {
      warm += dt;
      if (warm > 3) {
        slowSum += rawDt;
        slowN++;
        if (slowN >= 120) {
          if (slowSum / slowN > 0.028) api.setQuality("low");
          slowSum = 0;
          slowN = 0;
        }
      }
    }

    // throttle drawing: 30 fps in low quality, ~10 fps behind menus
    const minGap = paused ? 100 : quality === "low" ? 32 : 0;
    if (now - lastDraw < minGap) return;
    const ddt = Math.min(0.1, (now - lastDraw) / 1000 || dt);
    lastDraw = now;

    for (const id of STATION_IDS) pulse[id] = Math.max(0, pulse[id] - ddt * 1.4);
    dark += (darkGoal - dark) * Math.min(1, ddt * 2.5);
    night = dark > 0.5;
    if (landing) landT += ddt;
    for (const f of floats) f.age += ddt;
    while (floats.length && floats[0].age > 1.7) floats.shift();
    for (const p of parts) {
      p.life += ddt;
      p.x += p.vx * ddt;
      p.y += p.vy * ddt;
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life > parts[i].max) parts.splice(i, 1);
    if (parts.length > 300) parts.splice(0, parts.length - 300);

    const vw = buf.width;
    const vh = buf.height;
    cam = {
      x: vw >= WW ? Math.floor((WW - vw) / 2) : clamp(Math.round(player.x) - Math.floor(vw / 2), 0, WW - vw),
      y: vh >= WH ? Math.floor((WH - vh) / 2) : clamp(Math.round(player.y) - 8 - Math.floor(vh / 2), 0, WH - vh),
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL[dest].space;
    ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
    ctx.drawImage(ground, 0, 0);
    drawPad();
    drawCables();
    drawDock();
    drawPrints();

    const items: { y: number; draw: () => void }[] = [
      insideBase() || sleeping ? { y: HAB.y, draw: drawBaseInside } : { y: HAB.y + HAB.h, draw: drawHabitat },
      { y: SOLAR.y + SOLAR.h, draw: drawSolar },
      { y: GREEN.y + GREEN.h, draw: drawGreenhouse },
      { y: RECYC.y + RECYC.h, draw: drawRecycler },
      { y: BATT.y + BATT.h, draw: drawBattery },
      { y: DISH.y + DISH.h, draw: drawDish },
      { y: MAST.y + MAST.h, draw: drawMast },
      { y: rover.y, draw: drawRover },
      { y: LAB.y + LAB.h, draw: drawLab },
    ];
    if (!hidden && !sleeping && !inGreenhouse() && !inLab()) items.push({ y: player.y, draw: drawPlayer });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
    drawShip();
    drawBroken();

    for (const p of parts) {
      ctx.globalAlpha = clamp(1 - p.life / p.max, 0, 1);
      px(ctx, Math.round(p.x), Math.round(p.y), p.s, p.s, p.c);
    }
    ctx.globalAlpha = 1;

    const dest2 = route.length ? route[route.length - 1] : target;
    if (dest2) {
      const rr = Math.round(4 + Math.sin(t * 8));
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(dest2.x) - rr + 0.5, Math.round(dest2.y) - Math.round(rr / 2) + 0.5, rr * 2, rr);
    }
    drawProgress();
    drawNight();
    drawWeather(ddt);

    screen.setTransform(1, 0, 0, 1, 0, 0);
    screen.imageSmoothingEnabled = false;
    screen.drawImage(buf, 0, 0, vw * zoom * dpr, vh * zoom * dpr);
    drawScreenText();
  }
  raf = requestAnimationFrame(frame);

  const api: Outpost = {
    setDest(d) {
      if (d === dest) return;
      dest = d;
      ground = buildGround(d);
    },
    setName(n) { name = n; },
    setDarkness(v) { darkGoal = clamp(v, 0, 1); },
    setStatus(st) { status = st; },
    setStations(info) { stationInfo = info; },
    setWeather(w) { weather = w; },
    setPaused(p) {
      paused = p;
      if (p) {
        keys.clear();
        target = null;
        route = [];
        pendingUse = null;
      }
    },
    setHidden(h) {
      if (h === hidden) return;
      if (h) floats.push({ x: HAB.x + HAB.w / 2, y: HAB.y + HAB.h - 4, text: "SAFE INSIDE", color: "#7dffb0", age: 0 });
      else {
        restoreAt = 0;
        place(STATIONS.habitat.spot); // step out of the habitat door
      }
      hidden = h;
    },
    setProgress(p) { progress = p; },
    setPanelDust(d) { panelDust = clamp(d, 0, 1); },
    setRats(r) { rats = r; },
    setSleeping(on) {
      if (on === sleeping) return;
      sleeping = on;
      target = null;
      route = [];
      pendingUse = null;
      if (on) place(STATIONS.bed.spot); // climb into bed
      zzzAt = 0;
    },
    playFix(id, tool) {
      target = null;
      route = [];
      pendingUse = null;
      faceToward(STATIONS[id].rect);
      fix = { tool, until: t + 1.5 };
    },
    setScene(sc) {
      if (sc === scene) return;
      const was = scene;
      const ran = sceneOk;
      scene = sc;
      sceneOk = false;
      if (was && ran) endScene(was);
      if (sc) startScene(sc);
    },
    setCanSprint(on) { canSprint = on; },
    setSpeedMul(m) { speedMul = m; },
    setBeacon(on) { beaconOn = on; },
    setLanding(on) {
      if (on && !landing) landT = 0;
      landing = on;
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      resize();
      opts.onQuality?.(q);
    },
    isSprinting: () => sprinting,
    goUse(id) {
      if (paused || hidden || sleeping) return;
      if (near === id) return interact(id);
      const sp = spotOf(id);
      walkTo(sp.x, sp.y);
      pendingUse = target ? id : null;
    },
    feedback(id, items) {
      pulse[id] = 1;
      burst(id);
      items.forEach((it, i) => floats.push({ x: player.x, y: player.y, text: it.text, color: it.color, age: -i * 0.45 }));
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
    },
  };
  return api;
}

// ---------- Big astronaut portrait for the inventory screen ----------
export function drawPortrait(canvas: HTMLCanvasElement, dest: WorldDest) {
  const g = canvas.getContext("2d")!;
  const rows = [...BODY_FRONT, ...LEGS_FRONT[0]];
  const s = Math.floor(Math.min(canvas.width / 14, canvas.height / 18));
  const ox = Math.floor((canvas.width - 12 * s) / 2);
  const oy = Math.floor((canvas.height - rows.length * s) / 2);
  const colors: Record<string, string> = {
    K: INK, W: "#f2f4f8", G: "#a9b0c0", V: "#1b2a6b", H: "#7fe0ff", A: PAL[dest].accent, B: "#c9ced9",
  };
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < 12; x++) {
      const ch = rows[y][x];
      if (ch === "." || !ch) continue;
      g.fillStyle = colors[ch];
      g.fillRect(ox + x * s, oy + y * s, s, s);
    }
}
