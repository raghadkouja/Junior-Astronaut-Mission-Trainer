// =========================================================
// Top-down outpost world (canvas). No React inside, so the
// same file runs the Next.js game and the standalone demo.
//
// The world is drawn as pixel art at 16px tiles, then scaled
// up by `zoom` with smoothing off so pixels stay crisp.
// =========================================================

export type StationId = "greenhouse" | "conserve" | "recycle" | "heater" | "clean" | "comms";
export type WorldDest = "moon" | "mars";
export type FloatText = { text: string; color: string };
export type OutpostStatus = { power: number; oxygen: number; food: number };

export type OutpostOptions = {
  dest: WorldDest;
  name: string;
  zoom?: number; // 0 = pick automatically from screen width
  showLabels?: boolean;
  nightDarkness?: number; // 0..1, how dark night gets
  onNear?: (id: StationId | null) => void; // astronaut walked up to / away from a station
  onUse?: (id: StationId) => void; // player used a station (E, tap, or arrived via goUse)
};

export type Outpost = {
  setDest(d: WorldDest): void;
  setName(n: string): void;
  setNight(night: boolean): void;
  setStatus(s: OutpostStatus): void;
  setZoom(z: number): void;
  setShowLabels(on: boolean): void;
  setNightDarkness(v: number): void;
  setPaused(p: boolean): void;
  goUse(id: StationId): void; // walk to a station, then use it
  goTo(id: StationId, hideSeconds?: number): void; // walk to a station WITHOUT using it (optionally go inside)
  harvest(items: FloatText[]): void; // walk into the greenhouse, pick plants, walk out, then show the results
  feedback(id: StationId, items: FloatText[]): void; // floating "+10 FOOD" text
  floatText(items: FloatText[]): void; // floating text without a station burst
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
const GREEN = R(5, 15, 10, 7);
const RECYC = R(31, 15, 6, 5);
const BATT = R(32, 4, 6, 4);
const DISH = R(21, 20, 3, 3);
const SOLIDS = [HAB, SOLAR, GREEN, RECYC, BATT, DISH];

const STATIONS: Record<StationId, { rect: Rect; spot: { x: number; y: number }; label: string; verb: string }> = {
  greenhouse: {
    rect: GREEN,
    spot: { x: GREEN.x + GREEN.w + 10, y: GREEN.y + GREEN.h / 2 + 8 },
    label: "GREENHOUSE",
    verb: "RUN GREENHOUSE",
  },
  recycle: {
    rect: RECYC,
    spot: { x: RECYC.x - 10, y: RECYC.y + RECYC.h / 2 + 8 },
    label: "AIR RECYCLER",
    verb: "RECYCLE AIR",
  },
  conserve: {
    rect: BATT,
    spot: { x: BATT.x + BATT.w / 2, y: BATT.y + BATT.h + 14 },
    label: "BATTERY BANK",
    verb: "CONSERVE POWER",
  },
  heater: {
    rect: HAB,
    spot: { x: HAB.x + HAB.w / 2, y: HAB.y + HAB.h + 14 },
    label: "HABITAT · HEATER",
    verb: "TURN UP THE HEATER",
  },
  clean: {
    rect: SOLAR,
    spot: { x: SOLAR.x + SOLAR.w / 2, y: SOLAR.y + SOLAR.h + 14 },
    label: "SOLAR ARRAY",
    verb: "CLEAN THE PANELS",
  },
  comms: {
    rect: DISH,
    spot: { x: DISH.x + DISH.w / 2, y: DISH.y - 12 },
    label: "COMMS · EARTH",
    verb: "CALL HOUSTON",
  },
};
const STATION_IDS = Object.keys(STATIONS) as StationId[];

// The habitat, solar array and dish are stations now, so no extra labels.
const DECOR_LABELS: { rect: Rect; label: string }[] = [];

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

// ---------- Engine ----------
export function createOutpost(canvas: HTMLCanvasElement, opts: OutpostOptions): Outpost {
  // The world is drawn 1:1 into a small buffer (one pixel = one art pixel),
  // then stretched to the screen in a single step. Text goes on top at full sharpness.
  const screen = canvas.getContext("2d")!;
  const buf = document.createElement("canvas");
  const ctx = buf.getContext("2d")!;
  const overlay = document.createElement("canvas");
  const octx = overlay.getContext("2d")!;

  let dest = opts.dest;
  let name = opts.name;
  let ground = buildGround(dest);
  let zoomOpt = opts.zoom ?? 0;
  let zoom = 3;
  let showLabels = opts.showLabels ?? true;
  let nightDarkness = opts.nightDarkness ?? 0.62;
  let night = false;
  let dark = 0;
  let paused = false;
  let status: OutpostStatus = { power: 70, oxygen: 80, food: 70 };

  const player = { x: HAB.x + HAB.w / 2, y: HAB.y + HAB.h + 22, facing: "down" as Facing, walk: 0, moving: false };
  let target: { x: number; y: number } | null = null; // the next waypoint
  let route: { x: number; y: number }[] = []; // waypoints after this one
  let lastUse = -1;
  let font = "ui-monospace, Menlo, Consolas, monospace";
  let pendingUse: StationId | null = null;
  let goal: { id: StationId; hide: number } | null = null; // walk here without using it
  let hiddenFor = 0; // seconds left inside a building (e.g. the storm shelter)
  let hiddenAt: StationId | null = null;
  // Greenhouse harvest scene: the astronaut follows these points inside
  let scene: { pts: { x: number; y: number; pause: number }[]; i: number; wait: number; items: FloatText[] } | null = null;
  const pickedUntil = new Map<number, number>(); // plant index -> time it has grown back
  let stuckFor = 0;
  let near: StationId | null = null;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let cam = { x: 0, y: 0 };
  let t = 0;
  const keys = new Set<string>();
  const pulse: Record<StationId, number> = { greenhouse: 0, conserve: 0, recycle: 0, heater: 0, clean: 0, comms: 0 };
  const floats: { x: number; y: number; text: string; color: string; age: number; delay: number }[] = [];
  const parts: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number }[] = [];

  // ----- sizing -----
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    zoom = zoomOpt > 0 ? zoomOpt : clamp(Math.round(cssW / 480), 2, 5);
    buf.width = Math.ceil(cssW / zoom) + 1;
    buf.height = Math.ceil(cssH / zoom) + 1;
    overlay.width = buf.width;
    overlay.height = buf.height;
    // Use the page's real font (Next.js gives Geist a generated name)
    font = getComputedStyle(canvas).fontFamily || font;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ----- input -----
  const isTyping = (el: EventTarget | null) =>
    el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
      if (k.startsWith("arrow")) e.preventDefault();
      keys.add(k);
    } else if ((k === "e" || k === " " || k === "enter") && !(e.target instanceof HTMLButtonElement)) {
      if (e.repeat) {
        e.preventDefault(); // holding the key down must not fire turn after turn
        return;
      }
      if (near && !paused) {
        e.preventDefault();
        use(near);
      }
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const onBlur = () => keys.clear();

  const toWorld = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom + cam.x, y: (clientY - r.top) / zoom + cam.y };
  };
  const onPointerDown = (e: PointerEvent) => {
    if (paused || hiddenFor > 0 || scene) return;
    const w = toWorld(e.clientX, e.clientY);
    const hit = STATION_IDS.find((id) => inside(w.x, w.y, STATIONS[id].rect, 6));
    if (hit) {
      if (near === hit) use(hit);
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

  function use(id: StationId) {
    target = null;
    route = [];
    pendingUse = null;
    if (hiddenFor > 0 || scene) return; // still inside a building
    if (t - lastUse < 0.35) return; // ignore accidental double taps
    lastUse = t;
    faceToward(STATIONS[id].rect);
    opts.onUse?.(id);
  }
  // Walk to a station without using it; go inside if asked
  function startGoal() {
    if (!goal || scene) return; // wait until the harvest scene is over
    const sp = STATIONS[goal.id].spot;
    walkTo(sp.x, sp.y);
    if (!target) arrive();
  }
  function arrive() {
    if (!goal) return;
    faceToward(STATIONS[goal.id].rect);
    if (goal.hide > 0) {
      hiddenFor = goal.hide;
      hiddenAt = goal.id;
      floats.push({ x: player.x, y: player.y, text: "SAFE INSIDE", color: "#7dffb0", age: 0, delay: 0 });
    }
    goal = null;
  }
  // ----- greenhouse harvest scene -----
  function startHarvest(items: FloatText[]) {
    const { x, y, w, h } = GREEN;
    const door = { x: x + w - 3, y: y + h / 2 + 4 };
    const aisle = y + 72; // between the 3rd and 4th rows of plants
    target = null;
    route = [];
    pendingUse = null;
    scene = {
      pts: [
        { x: door.x, y: door.y, pause: 0 },
        { x: x + w - 16, y: aisle, pause: 0 },
        { x: x + w - 62, y: aisle, pause: 0.7 }, // pick
        { x: x + 46, y: aisle, pause: 0.7 }, // pick
        { x: x + w - 16, y: aisle, pause: 0 },
        { x: door.x, y: door.y, pause: 0 },
        { x: STATIONS.greenhouse.spot.x, y: STATIONS.greenhouse.spot.y, pause: 0 },
      ],
      i: 0,
      wait: 0,
      items,
    };
  }
  function pickNearby() {
    let i = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++, i++) {
        const cx = GREEN.x + 18 + c * 20;
        const cy = GREEN.y + 14 + r * 24;
        if (Math.abs(cx - player.x) < 24 && Math.abs(cy - player.y) < 20) pickedUntil.set(i, t + 6);
      }
    }
  }
  function leafPop() {
    parts.push({
      x: player.x + (Math.random() - 0.5) * 18,
      y: player.y - 6 + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 24,
      vy: -22 - Math.random() * 22,
      life: 0,
      max: 0.5 + Math.random() * 0.4,
      c: Math.random() < 0.3 ? "#ff6a5a" : "#7dffb0",
      s: 2,
    });
  }
  function stepScene(dt: number) {
    const sc = scene!;
    if (sc.wait > 0) {
      sc.wait -= dt;
      player.moving = false;
      player.facing = "up";
      if (Math.random() < dt * 14) leafPop();
      return;
    }
    if (sc.i >= sc.pts.length) {
      // walked back out: show what the harvest did
      scene = null;
      player.facing = "down";
      pulse.greenhouse = 1;
      burst("greenhouse");
      sc.items.forEach((it, k) =>
        floats.push({ x: player.x, y: player.y, text: it.text, color: it.color, age: -k * 0.45, delay: 0 }),
      );
      if (goal) startGoal();
      return;
    }
    const p = sc.pts[sc.i];
    const dx = p.x - player.x;
    const dy = p.y - player.y;
    const d = Math.hypot(dx, dy);
    const sp = 80 * dt;
    if (d <= sp) {
      player.x = p.x;
      player.y = p.y;
      sc.i++;
      if (p.pause > 0) {
        sc.wait = p.pause;
        pickNearby();
      }
      return;
    }
    player.x += (dx / d) * sp;
    player.y += (dy / d) * sp;
    player.moving = true;
    player.walk += dt * 9;
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }

  function faceToward(r: Rect) {
    const dx = r.x + r.w / 2 - player.x;
    const dy = r.y + r.h / 2 - player.y;
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }

  // ----- movement with collision -----

  function step(dt: number) {
    if (scene) {
      stepScene(dt);
      return;
    }
    const k = keys;
    let dx = (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0);
    let dy = (k.has("arrowdown") || k.has("s") ? 1 : 0) - (k.has("arrowup") || k.has("w") ? 1 : 0);
    const speed = 64;

    if (hiddenFor > 0) {
      hiddenFor = Math.max(0, hiddenFor - dt);
      if (hiddenFor === 0) hiddenAt = null;
    }
    if (paused || hiddenFor > 0) dx = dy = 0;
    if (dx || dy) {
      target = null;
      route = [];
      pendingUse = null;
      goal = null;
    } else if (target && !paused && hiddenFor <= 0) {
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
        if (pendingUse) use(pendingUse);
        else if (goal) arrive();
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
    if (target) {
      stuckFor = moved < speed * dt * 0.2 ? stuckFor + dt : 0;
      if (stuckFor > 0.35) {
        target = null;
        route = [];
        // Close enough to the station? Use it anyway.
        if (pendingUse && inside(player.x, player.y - 3, STATIONS[pendingUse].rect, 26)) use(pendingUse);
        pendingUse = null;
        if (goal) arrive();
        stuckFor = 0;
      }
    }
    if (player.moving) {
      player.walk += dt * 9;
      if (Math.abs(mx) > Math.abs(my)) player.facing = mx > 0 ? "right" : "left";
      else if (my) player.facing = my > 0 ? "down" : "up";
    }

    const n = STATION_IDS.find((id) => inside(player.x, player.y - 3, STATIONS[id].rect, 24)) ?? null;
    if (n !== near) {
      near = n;
      opts.onNear?.(near);
    }
  }

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

  function drawGreenhouse() {
    const { x, y, w, h } = GREEN;
    let plant = 0;
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
        const picked = (pickedUntil.get(plant++) ?? 0) > t;
        if (picked) {
          // just harvested: a little sprout that will grow back
          px(ctx, cx - 1, cy + 2, 2, 3, leafD);
          px(ctx, cx - 2, cy + 1, 4, 1, leaf);
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
    // the astronaut working inside (drawn under the glass)
    if (scene) drawAstronaut();
    // glass roof shine
    ctx.fillStyle = "rgba(160,240,255,0.10)";
    ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    for (let s = 0; s < 3; s++) {
      const sx = x + 20 + s * 50;
      for (let k = 0; k < 30; k++) px(ctx, sx + k, y + 6 + k, 2, 1, "rgba(255,255,255,0.14)");
    }
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
    shadow(DISH);
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
    if (hiddenFor > 0 || scene) return; // inside a building
    drawAstronaut();
  }
  function drawAstronaut() {
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
  }

  // ----- drawing: screen-space text -----
  function tag(sx: number, sy: number, text: string, opts2: { bg: string; fg: string; border: string; size: number }) {
    screen.font = `700 ${opts2.size}px ${font}`;
    const tw = screen.measureText(text).width;
    const padX = 7;
    const h = opts2.size + 8;
    const x = Math.round(sx - tw / 2 - padX);
    const y = Math.round(sy - h);
    const w = Math.round(tw + padX * 2);
    const cut = 5;
    screen.beginPath();
    screen.moveTo(x + cut, y);
    screen.lineTo(x + w, y);
    screen.lineTo(x + w, y + h - cut);
    screen.lineTo(x + w - cut, y + h);
    screen.lineTo(x, y + h);
    screen.lineTo(x, y + cut);
    screen.closePath();
    screen.fillStyle = opts2.bg;
    screen.fill();
    screen.strokeStyle = opts2.border;
    screen.lineWidth = 1;
    screen.stroke();
    screen.fillStyle = opts2.fg;
    screen.textAlign = "center";
    screen.textBaseline = "middle";
    screen.fillText(text, sx, y + h / 2 + 0.5);
  }
  const toScreen = (wx: number, wy: number) => ({ x: (wx - cam.x) * zoom, y: (wy - cam.y) * zoom });

  function drawScreenText() {
    screen.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (showLabels) {
      const lab = (r: Rect, text: string, hot: boolean) => {
        const s = toScreen(r.x + r.w / 2, r.y);
        tag(s.x, s.y - 8, text, {
          bg: "rgba(2,6,13,0.82)",
          fg: hot ? AMBER : HUD_C,
          border: hot ? AMBER : "rgba(59,232,255,0.55)",
          size: 10,
        });
      };
      for (const d of DECOR_LABELS) lab(d.rect, d.label, false);
      for (const id of STATION_IDS) lab(STATIONS[id].rect, STATIONS[id].label, near === id);
    }
    // name tag over the astronaut (or "sheltering" over the building they're in)
    if (hiddenFor > 0 && hiddenAt) {
      const r = STATIONS[hiddenAt].rect;
      const s = toScreen(r.x + r.w / 2, r.y);
      tag(s.x, s.y - 36, `${name.toUpperCase() || "ASTRONAUT"} IS SHELTERING INSIDE…`, {
        bg: "rgba(2,6,13,0.9)",
        fg: "#7dffb0",
        border: "rgba(125,255,176,0.7)",
        size: 11,
      });
    } else {
      const ps = toScreen(player.x, player.y - 17);
      tag(ps.x, ps.y - 4, name.toUpperCase() || "ASTRONAUT", {
        bg: "rgba(2,6,13,0.85)",
        fg: "#ffffff",
        border: "rgba(59,232,255,0.6)",
        size: 10,
      });
    }
    // use prompt
    if (near && !paused && hiddenFor <= 0 && !scene) {
      const r = STATIONS[near].rect;
      const s = toScreen(r.x + r.w / 2, r.y);
      const bounce = Math.sin(t * 5) * 2;
      tag(s.x, s.y - 34 + bounce, `[E] ${STATIONS[near].verb}`, {
        bg: AMBER,
        fg: "#1b0d00",
        border: "#ffe0a8",
        size: 12,
      });
    }
    // floating results
    for (const f of floats) {
      if (f.age < 0) continue;
      const s = toScreen(f.x, f.y);
      const a = clamp(1.6 - f.age, 0, 1);
      screen.globalAlpha = a;
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

  // ----- night lighting -----
  function drawNight() {
    if (dark < 0.01) return;
    const W = overlay.width;
    const H = overlay.height;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = "source-over";
    octx.clearRect(0, 0, W, H);
    octx.fillStyle = `rgba(4,8,38,${dark})`;
    octx.fillRect(0, 0, W, H);
    octx.globalCompositeOperation = "destination-out";
    const light = (wx: number, wy: number, r: number, power = 1) => {
      const sx = wx - cam.x;
      const sy = wy - cam.y;
      if (sx < -r || sy < -r || sx > W + r || sy > H + r) return; // off screen
      const grad = octx.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, `rgba(0,0,0,${power})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      octx.fillStyle = grad;
      octx.fillRect(sx - r, sy - r, r * 2, r * 2);
    };
    for (let i = 0; i < 4; i++) light(HAB.x + 24 + i * 32, HAB.y + 26, 34, 0.9);
    light(HAB.x + HAB.w / 2, HAB.y + HAB.h + 6, 34, 0.9);
    light(player.x, player.y - 8, 52, 1); // helmet lamp
    light(GREEN.x + GREEN.w / 2, GREEN.y + GREEN.h / 2, 70, 0.75);
    light(RECYC.x + RECYC.w / 2, RECYC.y + RECYC.h / 2, 34, 0.7);
    light(BATT.x + BATT.w / 2, BATT.y + BATT.h / 2, 34, 0.7);
    light(DISH.x + DISH.w / 2, DISH.y + 4, 18, 0.8);
    octx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(overlay, 0, 0);
  }

  // ----- particles -----
  function burst(id: StationId) {
    const r = STATIONS[id].rect;
    const c = id === "greenhouse" ? "#7dffb0" : id === "recycle" ? HUD_C : AMBER;
    for (let i = 0; i < 22; i++) {
      parts.push({
        x: r.x + 8 + Math.random() * (r.w - 16),
        y: r.y + 8 + Math.random() * (r.h - 16),
        vx: (Math.random() - 0.5) * 20,
        vy: -18 - Math.random() * 26,
        life: 0,
        max: 0.8 + Math.random() * 0.6,
        c,
        s: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  // ----- main loop -----
  let last = performance.now();
  let raf = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    step(dt);

    for (const id of STATION_IDS) pulse[id] = Math.max(0, pulse[id] - dt * 1.4);
    const goal = night ? nightDarkness : 0;
    dark += (goal - dark) * Math.min(1, dt * 2.5);
    for (const f of floats) f.age += dt;
    while (floats.length && floats[0].age > 1.7) floats.shift();
    for (const p of parts) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life > parts[i].max) parts.splice(i, 1);

    // Camera follows the astronaut in whole art pixels; centre the world if the screen is bigger
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
    drawCables();

    // y-sort so the astronaut can walk behind buildings
    const items: { y: number; draw: () => void }[] = [
      { y: HAB.y + HAB.h, draw: drawHabitat },
      { y: SOLAR.y + SOLAR.h, draw: drawSolar },
      { y: GREEN.y + GREEN.h, draw: drawGreenhouse },
      { y: RECYC.y + RECYC.h, draw: drawRecycler },
      { y: BATT.y + BATT.h, draw: drawBattery },
      { y: DISH.y + DISH.h, draw: drawDish },
      { y: player.y, draw: drawPlayer },
    ];
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

    for (const p of parts) {
      ctx.globalAlpha = clamp(1 - p.life / p.max, 0, 1);
      px(ctx, Math.round(p.x), Math.round(p.y), p.s, p.s, p.c);
    }
    ctx.globalAlpha = 1;

    // click-to-walk marker (last stop of the route)
    const dest2 = route.length ? route[route.length - 1] : target;
    if (dest2) {
      const rr = Math.round(4 + Math.sin(t * 8));
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(dest2.x) - rr + 0.5, Math.round(dest2.y) - Math.round(rr / 2) + 0.5, rr * 2, rr);
    }

    drawNight();

    // One stretch to the screen, pixels kept sharp
    screen.setTransform(1, 0, 0, 1, 0, 0);
    screen.imageSmoothingEnabled = false;
    screen.drawImage(buf, 0, 0, vw * zoom * dpr, vh * zoom * dpr);
    drawScreenText();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const api: Outpost = {
    setDest(d) {
      if (d === dest) return;
      dest = d;
      ground = buildGround(d);
    },
    setName(n) {
      name = n;
    },
    setNight(n) {
      night = n;
    },
    setStatus(st) {
      status = st;
    },
    setZoom(z) {
      zoomOpt = z;
      resize();
    },
    setShowLabels(on) {
      showLabels = on;
    },
    setNightDarkness(v) {
      nightDarkness = clamp(v, 0, 0.9);
    },
    setPaused(p) {
      paused = p;
      if (p) {
        keys.clear();
        target = null;
        route = [];
        pendingUse = null;
      } else if (goal && !target && !scene) {
        startGoal(); // a walk that was asked for while a card was open
      }
    },
    goTo(id, hideSeconds = 0) {
      pendingUse = null;
      goal = { id, hide: hideSeconds };
      if (!paused) startGoal();
    },
    harvest(items) {
      startHarvest(items);
    },
    goUse(id) {
      if (paused || hiddenFor > 0 || scene) return;
      if (near === id) return use(id);
      walkTo(STATIONS[id].spot.x, STATIONS[id].spot.y);
      pendingUse = target ? id : null;
    },
    floatText(items) {
      items.forEach((it, i) =>
        floats.push({ x: player.x, y: player.y, text: it.text, color: it.color, age: -i * 0.45, delay: 0 }),
      );
    },
    feedback(id, items) {
      pulse[id] = 1;
      burst(id);
      // results float up from the astronaut's helmet
      items.forEach((it, i) =>
        floats.push({ x: player.x, y: player.y, text: it.text, color: it.color, age: -i * 0.45, delay: 0 }),
      );
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
