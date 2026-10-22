/* THE ARENA'S RULES: real-time battles (the Arena plan; phase 0 2026-10-22,
   phase 1 the same week).

   A FIXED-STEP SIMULATION AT `TPS` TICKS A SECOND. `tick(s, inputs)` moves a
   match on by one tick, in place, from the match and the two sides' inputs
   ALONE: every roll comes from `s.rs` (mulberry32), and nothing here reads a
   clock, the DOM or `Math.random`. So a seed and a list of inputs replay one
   match exactly - check.mjs does, and it is what CPU-vs-CPU balance runs and
   lockstep netcode (phase 3) stand on.

   DETERMINISTIC ON EVERY BROWSER: + - * / and Math.sqrt are exact in every
   engine; sin, cos, atan2, exp, pow and hypot are not (their last digits
   differ between V8, SpiderMonkey and JavaScriptCore), so none is used here -
   check.mjs refuses one. An aim arrives as a vector the input layer made.

   THE LEAGUE'S DAMAGE, IN REAL TIME: a hit is `battle.js`'s own formula
   (`rawDamage`: STAB, the type chart, burn halving, stat stages) times
   `DAMAGE`, so a super-effective hit means what it means in the League.
   Accuracy is aim - there are no random misses - and a match never writes a
   box entry.

   EVERY MOVE IS ONE OF EIGHT SHAPES (`shapeOf`), read off its own data plus
   short name lists for what the data cannot say (that Earthquake hits all
   around, that Hyper Beam is a beam): a shot, a beam, a melee blow, a dash, a
   pulse around the user, a field hazard, a self move, a multi-shot burst.
   A status move the shapes cannot play is left out of the kit, never faked.

   EACH ARENA IS ITS OWN GROUND (phase 2, `GROUND`), read off its floor's
   art: what lies there (water, a hot edge, tall grass, ice, falling rock),
   four blocks of cover in its own material, and two mirrored ZONES that open
   on a timer and pay whoever holds one for a second.

   Units are tiles and ticks. The court is W x H tiles inside a wall `INSET`
   deep (the arena floors' own walls). */
import { moveOf, rawDamage, CRIT, effectiveness, expected, fighter, movesAt, stageAt, neverHits, STRUGGLE, immuneTo } from "./battle.js";
import { TYPES } from "../data/types.js";
import { SPECIES, isForm, isEvent } from "../data/dex.js";
import { speciesById } from "./biomes.js";
import { hash } from "./daily.js";

export const TPS = 60;
export const W = 26, H = 16;                    // the floor, in tiles
export const INSET = 1.35;                      // its wall, inside which bodies stay
export const LIMIT = 5 * 60 * TPS;              // 5:00, then the clock decides
const sec = (s) => Math.round(s * TPS);

/* The floors (public/arena/<id>.webp, `npm run arenas` from art/arena/). */
export const ARENAS = [
  { id: "indigo", name: "Indigo Court" },
  { id: "moon", name: "Mt. Moon Cavern" },
  { id: "seaside", name: "Seaside Boardwalk" },
  { id: "caldera", name: "Ember Caldera" },
  { id: "grove", name: "Monsoon Grove" },
  { id: "rink", name: "Icefall Rink" },
];

/* THE GROUND, arena by arena. Tile rectangles [x0, y0, x1, y1] are measured
   on the floors themselves (art/arena/, on a tile grid): Seaside's water
   strips between the posts, the Grove's four corners of tall grass.
   `cover`: the material its four blocks are, and the types that break it
   fastest (`weak`) or barely (`resist`). `zone`: what holding a zone pays. */
export const GROUND = {
  indigo: { cover: "statue", weak: ["fighting", "ground"], zone: "pp" },
  moon: { cover: "boulder", weak: ["fighting", "water"], resist: ["rock", "steel"], zone: "dodge", rocks: true },
  seaside: { cover: "crate", weak: ["fire"], zone: "cure",
    water: [[1.2, 0, 10, 2.3], [15.5, 0, 24.8, 2.3], [1.2, 13.4, 10, 16], [15.5, 13.4, 24.8, 16]] },
  caldera: { cover: "basalt", weak: ["water", "ground"], zone: "cool", heat: 0.75, erode: true },
  grove: { cover: "tree", weak: ["fire", "ice"], zone: "heal",
    grass: [[2, 2, 5.2, 5.2], [20.8, 2, 24, 5.2], [2, 10.2, 5.2, 13.6], [20.6, 10.2, 24, 13.6]] },
  rink: { cover: "ice", weak: ["fire", "fighting"], zone: "swift", ice: true },
};
export const ZONE_SAYS = { pp: "+1 PP to your emptiest move", dodge: "Dodge ready at once", cure: "Cures burn and poison",
  cool: "-2 s on every cooldown", heal: "Heals 6% HP", swift: "+15% speed for 10 s" };
const T = (name) => TYPES.indexOf(name);
const inRects = (rects, x, y) => (rects ?? []).some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);

const R = 0.45;                                 // a body's radius
const X0 = INSET + R, X1 = W - INSET - R, Y0 = INSET + R, Y1 = H - INSET - R;
export const DODGE_CD = sec(1.6);
const DODGE = sec(0.3), DODGE_INV = sec(0.22), DODGE_DIST = 2.2;
const SWAP = sec(0.6), SWAP_CD = sec(4), SWAP_INV = sec(0.5), KO_WAIT = sec(1);
const STUN = sec(0.12), KB = sec(0.15), FLINCH = sec(0.25);
export const SHOT_SPEED = 10 / TPS;
const SHOT_RANGE = 9, SHOT_R = 0.35;
const MELEE_RANGE = 1.5, MELEE_COS = 0.64;      // an arc of about 100 degrees
const BEAM_LEN = 10, BEAM_W = 0.32;
const DASH = sec(0.2), DASH_DIST = 3.2;
const PULSE_R = 2.6;
const HAZARD_R = 1.1, HAZARD_T = sec(15), HAZARD_CD = sec(2), HAZARD_MAX = 3, PLACE = 5;
const ACTIVE = sec(0.1);
const BUFF_T = sec(10), STAGE_CAP = 2;
const SHIELD = sec(1);
const COVER_HALF = 0.6, COVER_HP = 160;
const COVER_AT = [[8, 5.2], [8, 10.8], [18, 5.2], [18, 10.8]];
const ZONE_R = 1.3, ZONE_HOLD = sec(1), ZONE_FIRST = sec(20), ZONE_OPEN = sec(12), ZONE_SHUT = sec(18);
const ZONE_AT = [[W / 2, INSET + 2.1], [W / 2, H - INSET - 2.1]];
const ROCKS_EVERY = sec(25), ROCKS_FIRST = sec(15), ROCK_WARN = sec(1.2), ROCK_R = 1;
const HEAT_BURN = sec(1), SWIFT = sec(10);
/* WHAT ONE HIT IS WORTH, against the plan's 30-45 s a Pokemon. Measured
   2026-10-22 over 40 Hard-vs-Hard CPU matches at Lv 50: 0.32 was 54 s a
   Pokemon and nearly every match ran out the clock; 0.75 was 27 s; 0.6 is
   33 s. Re-measured with phase 1's shapes and statuses (check.mjs). */
export const DAMAGE = 0.6;
/* THE OPENING: the count before a fight, in which nobody moves. It is
   ticks of the match - both ends of an online fight count the same ones -
   off the match clock, and 0 for every test that drives a match. */
export const INTRO = sec(3.2);
/* SURGE, the Arena's twist: a meter a side, filled by landing hits, taking
   them, a PERFECT DODGE (rolling through an attack) and a zone. Full, one
   press: a shockwave that throws the foe off you and breaks a stagger, then
   SURGE_T of blows at SURGE_DMG with cooldowns recovering twice as fast. The
   meter rides across a switch; the surge ends with the Pokemon. Both sides
   have it, so the per-arena fairness suites hold it fair. */
export const SURGE_MAX = 100;
export const SURGE_T = sec(6);
const SURGE_DMG = 1.25, SURGE_PUSH = 2.6;
/* STRUGGLE, as in the games: a Pokemon with no damaging move left (every one
   out of PP) fights with it - any move button throws it. Without it a third
   of Hard-vs-Hard matches (13 of 40, measured 2026-10-22) had their last hit
   inside two minutes and then ran out the clock: both Pokemon out of PP,
   their benches full of moves, nobody able to land anything. */
export const STRUGGLE_K = 4;
export const spent = (f) => f.kit.every((m) => m.pp <= 0 || !moveOf(m.i).p);
/* A move by its act's index: the kit's, or Struggle (`STRUGGLE_K`), which is
   kept apart on the fighter - pushed onto a kit of fewer than four moves it
   landed at the wrong index and the spent Pokemon froze. */
export const moveAt = (f, k) => (k === STRUGGLE_K ? f.struggle : f.kit[k]);
/* THE FINAL MINUTE: the clock's last FINAL_T hits harder and fills Surge
   twice as fast, announced on screen - a long fight ends on a swing, not a
   tally of HP. */
export const FINAL_T = sec(60);
const FINAL_DMG = 1.5, FINAL_GAIN = 2;
const finalMinute = (s) => s.t >= LIMIT - FINAL_T;
const GAIN_DEAL = 70, GAIN_TAKE = 45, GAIN_DODGE = 12, GAIN_ZONE = 15;

// ------------------------------------------------------------------ shapes

const PULSE = new Set(["earthquake", "magnitude", "bulldoze", "surf", "discharge", "lava-plume", "boomburst",
  "sludge-wave", "explosion", "self-destruct", "petal-blizzard", "heat-wave", "icy-wind", "snarl", "hyper-voice",
  "blizzard", "rock-slide", "muddy-water", "eruption", "water-spout", "dazzling-gleam", "parabolic-charge",
  "mind-blown", "misty-explosion", "precipice-blades", "struggle-bug", "electroweb", "breaking-swipe",
  "disarming-voice", "echoed-voice", "fiery-wrath", "glacial-lance", "astral-barrage", "springtide-storm",
  "bleakwind-storm", "wildbolt-storm", "sandsear-storm", "make-it-rain", "thousand-arrows", "thousand-waves",
  "synchronoise", "uproar", "air-cutter", "razor-wind", "twister", "powder-snow", "bug-buzz", "dragon-energy"]);
const DASH_NAMES = new Set(["tackle", "take-down", "body-slam", "headbutt", "zen-headbutt", "iron-head", "horn-attack",
  "giga-impact", "rollout", "rapid-spin", "u-turn", "flip-turn", "dragon-rush", "skull-bash", "submission",
  "high-horsepower", "spin-out", "steel-roller", "dive", "fly", "bounce", "horn-drill", "megahorn", "smart-strike",
  "aerial-ace", "wing-attack", "drill-run", "play-rough", "seismic-toss"]);
const BEAM_NAMES = new Set(["hydro-pump", "eternabeam", "dynamax-cannon", "prismatic-laser", "origin-pulse",
  "dark-pulse", "dragon-pulse", "blast-burn", "frenzy-plant", "hydro-cannon", "seed-flare", "luster-purge",
  "mist-ball", "doom-desire", "psystrike", "steel-beam", "meteor-beam", "fleur-cannon", "core-enforcer"]);
const BEAM_RE = /(beam|cannon|laser)$/;
const FIELD_NAMES = new Set(["spikes", "toxic-spikes", "stealth-rock", "sticky-web"]);
const SHIELDS = new Set(["protect", "detect", "kings-shield", "spiky-shield", "baneful-bunker", "obstruct",
  "silk-trap", "burning-bulwark", "max-guard", "endure"]);

/* A MOVE'S SHAPE, or null for a status move the Arena cannot play. */
export function shapeOf(m) {
  if (!m) return null;
  if (m.n === "struggle") return "melee";
  if (FIELD_NAMES.has(m.n)) return "field";
  if (m.c === 2) {
    if (SHIELDS.has(m.n) || m.n === "rest") return "self";
    if (m.self && (m.sg || m.h)) return "self";
    if (!m.self && m.st != null) return "shot";            // a status shot: Thunder Wave, Will-O-Wisp
    if (!m.self && m.sg) return "pulse";                  // a stat drop around you: Growl, Screech
    return null;
  }
  if (!m.p) return null;
  if (PULSE.has(m.n)) return "pulse";
  if (m.hits) return "multi";
  if (m.c === 1 && (BEAM_NAMES.has(m.n) || (BEAM_RE.test(m.n) && m.n !== "charge-beam"))) return "beam";
  if (m.c === 0 && ((m.pr ?? 0) > 0 || (m.dr ?? 0) < 0 || DASH_NAMES.has(m.n))) return "dash";
  return m.c === 1 ? "shot" : "melee";
}
export const SHAPES = ["shot", "beam", "melee", "dash", "pulse", "field", "self", "multi"];

// A move's timing, from its own data: big hits are slow and readable.
export const windOf = (m) => {
  const base = Math.max(sec(0.1), sec(0.18 + 0.004 * (m.p ?? 0)) - sec(0.12) * (m.pr ?? 0));
  const s = shapeOf(m);
  return s === "beam" ? Math.round(base * 1.35) : s === "self" || s === "field" ? sec(0.3) : base;
};
export const cooldownOf = (m) => {
  if (m.c === 2) return SHIELDS.has(m.n) ? sec(7) : m.n === "rest" ? sec(20) : m.st === 3 ? sec(15) : sec(9);
  return sec(0.8 + (m.p ?? 0) / 35);
};
export const ppOf = (m) => Math.max(3, Math.ceil((m.pp ?? 10) / 2));
const multiCount = (m) => (m.hits ? Math.round((m.hits[0] + m.hits[1]) / 2) : 1);

// ------------------------------------------------------------------ fighters

/* A FIGHTER'S KIT: its four League moves (`movesOf`/the Move Tutor) that the
   Arena can play. A kit that would not hit at all keeps Struggle beside them. */
export function kitOf(f) {
  const kit = f.moves.filter((m) => m.i !== STRUGGLE && shapeOf(moveOf(m.i))).slice(0, 4)
    .map((m) => ({ i: m.i, pp: ppOf(moveOf(m.i)), cd: 0 }));
  if (!kit.some((m) => moveOf(m.i).p > 0)) {
    if (kit.length === 4) kit.pop();
    kit.push({ i: STRUGGLE, pp: 99, cd: 0 });
  }
  return kit;
}

function rnd(s) {
  s.rs = (s.rs + 0x6D2B79F5) | 0;
  let t = s.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const norm = (x, y) => { const l = Math.sqrt(x * x + y * y); return l ? [x / l, y / l] : [0, 0]; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const STAGE = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
// A small turn, without trig: rotate by about `k` radians (exact enough for a spread).
const turn = (x, y, k) => norm(x - y * k, y + x * k);

function body(f, side, slot) {
  return {
    ...f, side, slot, kit: kitOf(f), stages: [...f.stages], stageT: [0, 0, 0, 0, 0, 0, 0, 0],
    x: side ? X1 - 2.5 : X0 + 2.5, y: H / 2, px: 0, py: 0, fx: side ? -1 : 1, fy: 0, moving: false,
    act: null, dodge: 0, dx: 0, dy: 0, dodgeCd: 0, inv: 0, shield: 0, stun: 0, kbx: 0, kby: 0, kbt: 0, flash: 0,
    status: -1, statusT: 0, statusN: 0, badly: false, sleptAt: 0,
    vx: 0, vy: 0, heat: 0, swift: 0, hidden: false, surge: 0, struggle: null,
  };
}

/* A MATCH. `teams`: two lists of League fighters (`playerFighter` for yours,
   `fighter` for the CPU's). `cpu`: per side, null for a person or a CPU's
   level (`LEVELS`, or "dummy"). `arena`: a GROUND id, its cover and zones. */
export function newMatch({ teams, cpu = [null, "normal"], seed = 1, arena = "indigo", intro = 0 }) {
  const g = GROUND[arena] ? arena : "indigo";
  const s = {
    t: 0, intro, rs: seed | 0, over: false, winner: -1, why: "", ev: [], shots: [], hazards: [], nextId: 1,
    arena: g, drops: [],
    cover: COVER_AT.map(([x, y], i) => ({ id: i, x, y, hp: COVER_HP, max: COVER_HP })),
    zone: { open: false, t: ZONE_FIRST, claimed: [false, false], hold: [[0, 0], [0, 0]] },
    sides: teams.map((team, side) => ({
      team: team.map((f, slot) => body(f, side, slot)), active: 0, swapT: 0, next: -1, swapCd: 0, koT: 0, meter: 0,
      // What the result screen tells (never read by the rules): damage dealt, hits, the best run of hits unanswered, perfect dodges, surges.
      stats: { dealt: 0, hits: 0, chain: 0, best: 0, perfect: 0, surges: 0 },
      cpu: cpu[side] ? { level: cpu[side], seen: 0, seenId: 0, strafe: 1, dodged: 0, lx: W / 2, ly: H / 2 } : null,
    })),
  };
  for (const side of s.sides) for (const f of side.team) { f.px = f.x; f.py = f.y; }
  return s;
}

export const activeOf = (s, side) => {
  const sd = s.sides[side];
  return sd.swapT > 0 || sd.koT > 0 ? null : sd.team[sd.active];
};
const alive = (sd) => sd.team.filter((f) => f.hp > 0);
export const PAR = 0, BRN = 1, PSN = 2, SLP = 3, FRZ = 4;
const held = (f) => f.stun > 0 || f.status === SLP || f.status === FRZ;

export const NO_INPUT = Object.freeze({ mx: 0, my: 0, ax: 0, ay: 0, fire: -1, dodge: false, swap: -1, surge: false });

export function tick(s, inputs) {
  if (s.over) return s;
  s.ev = [];
  if (s.intro > 0) {
    if (--s.intro === 0) s.ev.push({ k: "go" });
    return s;
  }
  for (let side = 0; side < 2; side++) {
    const sd = s.sides[side];
    for (const f of sd.team) { f.px = f.x; f.py = f.y; }
    const inp = sd.cpu ? cpuInput(s, side) : inputs?.[side] ?? NO_INPUT;
    stepSide(s, side, inp);
  }
  stepShots(s);
  stepHazards(s);
  stepGround(s);
  for (let side = 0; side < 2; side++) settleKO(s, side);
  s.t++;
  if (s.t === LIMIT - FINAL_T) s.ev.push({ k: "final" });
  if (!s.over && s.t >= LIMIT) timeUp(s);
  return s;
}

function stepSide(s, side, inp) {
  const sd = s.sides[side];
  if (sd.swapCd > 0) sd.swapCd--;
  // A switch in progress: the side has nobody out until it lands.
  if (sd.swapT > 0) {
    if (--sd.swapT === 0) {
      const from = sd.team[sd.active], to = sd.team[sd.next];
      Object.assign(to, { x: from.x, y: from.y, px: from.x, py: from.y, fx: from.fx, fy: from.fy, inv: SWAP_INV, act: null, dodge: 0, kbt: 0 });
      sd.active = sd.next; sd.next = -1;
      s.ev.push({ k: "in", side, slot: sd.active });
    }
    return;
  }
  if (sd.koT > 0) return;
  const f = sd.team[sd.active];
  for (const m of f.struggle ? [...f.kit, f.struggle] : f.kit) if (m.cd > 0) m.cd = Math.max(0, m.cd - (f.surge > 0 ? 2 : 1));
  if (f.surge > 0) f.surge--;
  if (f.dodgeCd > 0) f.dodgeCd--;
  if (f.inv > 0) f.inv--;
  if (f.shield > 0) f.shield--;
  if (f.flash > 0) f.flash--;
  for (let k = 1; k < 8; k++) if (f.stageT[k] > 0 && --f.stageT[k] === 0) f.stages[k] = 0;
  stepStatus(s, f);
  if (f.hp <= 0) return;

  const [ax, ay] = norm(inp.ax, inp.ay);
  const [mx, my] = norm(inp.mx, inp.my);
  f.moving = Boolean(mx || my);

  // A surge breaks a stagger (never sleep or freeze): the fighting game's burst.
  if (inp.surge && sd.meter >= SURGE_MAX && !f.act && !f.dodge && f.status !== SLP && f.status !== FRZ) surge(s, side, f);
  if (held(f)) { if (f.stun > 0) f.stun--; }
  else {
    if (inp.swap >= 0 && sd.swapCd === 0 && !f.act && !f.dodge) {
      const next = inp.swap < sd.team.length ? inp.swap : -1;
      if (next >= 0 && next !== sd.active && sd.team[next].hp > 0) {
        sd.next = next; sd.swapT = SWAP; sd.swapCd = SWAP_CD; f.surge = 0;
        s.ev.push({ k: "out", side, slot: sd.active });
        return;
      }
    }
    if (inp.dodge && f.dodgeCd === 0 && !f.dodge && f.act?.shape !== "dash") {
      // A dodge cancels a wind-up, and the move's cooldown is not spent.
      if (f.act?.ph === "wind") f.act = null;
      const [dx, dy] = mx || my ? [mx, my] : [-f.fx, -f.fy];
      f.dodge = DODGE; f.dx = dx; f.dy = dy; f.inv = Math.max(f.inv, DODGE_INV);
      // Evasion stages shorten the roll's cooldown.
      f.dodgeCd = Math.round(DODGE_CD * (1 - 0.15 * clamp(f.stages[7], -2, 2)));
      s.ev.push({ k: "dodge", side });
    }
    if (inp.fire >= 0 && !f.act && !f.dodge) {
      let k = inp.fire, m = f.kit[k];
      if (m && m.pp <= 0 && spent(f)) {
        f.struggle ??= { i: STRUGGLE, pp: 999, cd: 0 };
        k = STRUGGLE_K; m = f.struggle;
      }
      if (m && m.cd === 0 && m.pp > 0) {
        const data = moveOf(m.i);
        const [dx, dy] = ax || ay ? [ax, ay] : [f.fx, f.fy];
        f.fx = dx; f.fy = dy;
        const w = windOf(data);
        f.act = { k, ph: "wind", t: w, t0: w, dx, dy, id: s.nextId++, shape: shapeOf(data), aimX: inp.ax, aimY: inp.ay };
        s.ev.push({ k: "wind", side, move: m.i, shape: f.act.shape });
      }
    }
  }

  // Moving: a dodge rolls, a dash lunges, a wind-up walks at half speed, a recovery stands.
  const v = speedOf(f);
  if (f.dodge > 0) {
    const d = DODGE_DIST / DODGE;
    f.x += f.dx * d; f.y += f.dy * d; f.dodge--;
  } else if (f.act?.shape === "dash" && f.act.ph === "act") {
    const d = DASH_DIST / DASH;
    f.x += f.act.dx * d; f.y += f.act.dy * d;
  } else if (!held(f) && f.act?.ph !== "rec") {
    const k = f.act ? 0.5 : 1;
    const wx = mx * v * k, wy = my * v * k;
    /* ICE (the Rink): a non-Ice type's speed changes slowly, so it keeps
       sliding after it lets go and turns wide. */
    if (GROUND[s.arena].ice && !f.types.includes(T("ice"))) {
      f.vx += (wx - f.vx) * 0.08; f.vy += (wy - f.vy) * 0.08;
    } else { f.vx = wx; f.vy = wy; }
    f.x += f.vx; f.y += f.vy;
    if (!f.act && (ax || ay)) { f.fx = ax; f.fy = ay; } else if (!f.act && f.moving) { f.fx = mx; f.fy = my; }
  } else if (GROUND[s.arena].ice && !f.types.includes(T("ice"))) {
    f.vx *= 0.94; f.vy *= 0.94; f.x += f.vx; f.y += f.vy;
  }
  if (f.kbt > 0) { f.x += f.kbx; f.y += f.kby; f.kbt--; }
  f.x = clamp(f.x, X0, X1); f.y = clamp(f.y, Y0, Y1);
  pushOut(s, f);

  if (f.act) stepAct(s, side, f);
}

// Speed from the Speed stat and its stage; paralysis halves it, a swift zone lifts it.
const speedOf = (f) => Math.min(6, Math.max(3, 3 + 2.5 * (f.st[5] * STAGE(f.stages[5]) / 200)))
  / TPS * (f.status === PAR ? 0.5 : 1) * (f.swift > 0 ? 1.15 : 1) * (f.wading ? 0.5 : 1);

function stepAct(s, side, f) {
  const a = f.act;
  const m = moveAt(f, a.k), data = moveOf(m.i);
  if (--a.t > 0) {
    if (a.ph === "act" && (a.shape === "melee" || a.shape === "dash") && !a.hit) contact(s, side, f);
    if (a.ph === "act" && a.shape === "multi" && a.t % 4 === 0 && a.left > 0) burst(s, side, f, a, data);
    return;
  }
  if (a.ph === "wind") {
    m.cd = cooldownOf(data); m.pp--;
    s.ev.push({ k: "fire", side, move: m.i, shape: a.shape, x: f.x, y: f.y, dx: a.dx, dy: a.dy });
    // A move that changes its user's own stages does so as it fires (Close Combat, Overheat).
    if (data.p && data.sgu && data.sg && rnd(s) * 100 < (data.sgc ?? 100)) stages(s, f, data.sg);
    const rec = Math.max(1, Math.round(windOf(data) / 2));
    switch (a.shape) {
      case "shot":
        shoot(s, side, f, a.dx, a.dy, m.i);
        a.ph = "rec"; a.t = rec; break;
      case "multi":
        a.left = multiCount(data);
        burst(s, side, f, a, data);
        a.ph = "act"; a.t = 4 * a.left + 1; break;
      case "beam":
        beam(s, side, f, a, m.i);
        a.ph = "rec"; a.t = Math.round(rec * 1.4); break;
      case "melee":
        a.ph = "act"; a.t = ACTIVE;
        contact(s, side, f); break;
      case "dash":
        a.ph = "act"; a.t = DASH; break;
      case "pulse":
        pulse(s, side, f, m.i);
        a.ph = "rec"; a.t = rec; break;
      case "field":
        place(s, side, f, a, m.i);
        a.ph = "rec"; a.t = rec; break;
      case "self":
        self(s, f, data);
        a.ph = "rec"; a.t = rec; break;
    }
  } else if (a.ph === "act") {
    a.ph = "rec"; a.t = Math.max(1, Math.round(windOf(data) / 2));
  } else {
    f.act = null;
  }
}

function shoot(s, side, f, dx, dy, move) {
  s.shots.push({ id: s.nextId++, side, move, x: f.x + dx * (R + SHOT_R), y: f.y + dy * (R + SHOT_R), dx, dy, left: SHOT_RANGE, from: f.slot });
}
// A burst: one shot of a multi-hit move, the spread fanning a little each time.
function burst(s, side, f, a, data) {
  const n = multiCount(data), k = n - a.left;
  const spread = ((k % 3) - 1) * 0.08;
  const [dx, dy] = turn(a.dx, a.dy, spread);
  shoot(s, side, f, dx, dy, moveAt(f, a.k).i);
  a.left--;
}

// A blow or a lunge: the first time the foe is in reach, it lands. A blow chips cover in its arc.
function contact(s, side, f) {
  if (f.act.shape === "melee" && !f.act.chipped) {
    f.act.chipped = true;
    for (const c of s.cover) {
      if (c.hp <= 0) continue;
      const ex = c.x - f.x, ey = c.y - f.y, dist = Math.sqrt(ex * ex + ey * ey);
      if (dist < MELEE_RANGE + COVER_HALF + R && (ex * f.act.dx + ey * f.act.dy) / (dist || 1) > MELEE_COS) chip(s, c, moveAt(f, f.act.k).i, c.x, c.y);
    }
  }
  const d = activeOf(s, 1 - side);
  if (!d || d.hp <= 0) return;
  const ex = d.x - f.x, ey = d.y - f.y, dist = Math.sqrt(ex * ex + ey * ey);
  if (f.act.shape === "dash") {
    if (dist > 2 * R + 0.15) return;
  } else {
    if (dist > MELEE_RANGE + R) return;
    if (dist > 0 && (ex * f.act.dx + ey * f.act.dy) / dist < MELEE_COS) return;
  }
  f.act.hit = true;
  hit(s, f, d, moveAt(f, f.act.k).i, f.act.dx, f.act.dy, true);
  if (f.act.shape === "dash") { f.act.ph = "rec"; f.act.t = sec(0.25); }
}

// A beam: a line drawn during the wind-up, hitting all along it at once - up to the first cover.
function beam(s, side, f, a, move) {
  let len = BEAM_LEN, block = null;
  for (const c of s.cover) {
    if (c.hp <= 0) continue;
    const t = rayBox(f.x, f.y, a.dx, a.dy, c, BEAM_W);
    if (t != null && t < len) { len = t; block = c; }
  }
  s.ev.push({ k: "beam", side, move, x: f.x, y: f.y, dx: a.dx, dy: a.dy, len });
  if (block) chip(s, block, move, f.x + a.dx * len, f.y + a.dy * len);
  const d = activeOf(s, 1 - side);
  if (!d || d.hp <= 0) return;
  const ex = d.x - f.x, ey = d.y - f.y;
  const along = ex * a.dx + ey * a.dy;
  const off = Math.abs(ex * a.dy - ey * a.dx);
  if (along > 0 && along < len + R && off < R + BEAM_W) hit(s, f, d, move, a.dx, a.dy, false);
}

/* Where a ray from (x, y) along (dx, dy) first enters a block (its half
   size grown by `pad`), or null: the slab test - divisions only, no trig. */
function rayBox(x, y, dx, dy, c, pad = 0) {
  const h = COVER_HALF + pad;
  let lo = 0, hi = Infinity;
  for (const [o, d, mid] of [[x, dx, c.x], [y, dy, c.y]]) {
    if (d === 0) { if (o < mid - h || o > mid + h) return null; continue; }
    let t1 = (mid - h - o) / d, t2 = (mid + h - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    lo = Math.max(lo, t1); hi = Math.min(hi, t2);
    if (lo > hi) return null;
  }
  return lo > 0 ? lo : null;
}
// Does a straight line from a to b cross live cover? (The CPU will not fire into it.)
export function blocked(s, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = Math.sqrt(dx * dx + dy * dy) || 1;
  return s.cover.some((c) => { if (c.hp <= 0) return false; const t = rayBox(ax, ay, dx / l, dy / l, c, SHOT_R * 0.5); return t != null && t < l; });
}

/* A blow on cover: its power, twice for a type its material is weak to,
   half for one it resists. At nothing it breaks, and stays broken. */
function chip(s, c, move, x, y) {
  const m = moveOf(move), g = GROUND[s.arena];
  if (!m.p) { s.ev.push({ k: "fizzle", x, y, move }); return; }
  const k = g.weak?.includes(m.t) ? 2 : g.resist?.includes(m.t) ? 0.5 : 1;
  c.hp = Math.max(0, c.hp - Math.round(m.p * k * 0.5));
  s.ev.push({ k: c.hp ? "chip" : "break", id: c.id, x, y, move, weak: k > 1 });
}

// Bodies cannot stand in cover: pushed out along the shortest way.
function pushOut(s, f) {
  for (const c of s.cover) {
    if (c.hp <= 0) continue;
    const nx = clamp(f.x, c.x - COVER_HALF, c.x + COVER_HALF), ny = clamp(f.y, c.y - COVER_HALF, c.y + COVER_HALF);
    let ex = f.x - nx, ey = f.y - ny, d = Math.sqrt(ex * ex + ey * ey);
    if (d >= R) continue;
    if (d === 0) { ex = f.x < c.x ? -1 : 1; ey = 0; d = 1; }
    f.x = nx + (ex / d) * R; f.y = ny + (ey / d) * R;
    if (f.act?.shape === "dash" && f.act.ph === "act" && !f.act.hit) {
      f.act.hit = true; chip(s, c, moveAt(f, f.act.k).i, nx, ny);
      f.act.ph = "rec"; f.act.t = sec(0.25);
    }
  }
}

// A pulse: a ring around the user (Earthquake, Surf, Growl). It shakes the cover in it too.
function pulse(s, side, f, move) {
  s.ev.push({ k: "pulse", side, move, x: f.x, y: f.y, r: PULSE_R });
  for (const c of s.cover) {
    if (c.hp <= 0) continue;
    const ex = c.x - f.x, ey = c.y - f.y;
    if (ex * ex + ey * ey < (PULSE_R + COVER_HALF) * (PULSE_R + COVER_HALF)) chip(s, c, move, c.x, c.y);
  }
  const d = activeOf(s, 1 - side);
  if (!d || d.hp <= 0) return;
  const ex = d.x - f.x, ey = d.y - f.y;
  if (ex * ex + ey * ey > (PULSE_R + R) * (PULSE_R + R)) return;
  const [dx, dy] = norm(ex, ey);
  hit(s, f, d, move, dx, dy, false);
}

// A hazard: laid where you aim, up to PLACE tiles away, for HAZARD_T.
function place(s, side, f, a, move) {
  const [ux, uy] = norm(a.aimX, a.aimY);
  const reach = Math.min(PLACE, Math.sqrt(a.aimX * a.aimX + a.aimY * a.aimY) || PLACE);
  const dx = ux || a.dx, dy = uy || a.dy;
  const mine = s.hazards.filter((z) => z.side === side);
  if (mine.length >= HAZARD_MAX) s.hazards = s.hazards.filter((z) => z !== mine[0]);
  const z = { id: s.nextId++, side, move, kind: moveOf(move).n, t: HAZARD_T,
    x: clamp(f.x + dx * reach, X0, X1), y: clamp(f.y + dy * reach, Y0, Y1), last: -HAZARD_CD };
  s.hazards.push(z);
  s.ev.push({ k: "field", side, move, x: z.x, y: z.y });
}

function stepHazards(s) {
  s.hazards = s.hazards.filter((z) => {
    if (--z.t <= 0) return false;
    const d = activeOf(s, 1 - z.side);
    if (!d || d.hp <= 0 || d.inv > 0 || s.t - z.last < HAZARD_CD) return true;
    const ex = d.x - z.x, ey = d.y - z.y;
    if (ex * ex + ey * ey > (HAZARD_R + R) * (HAZARD_R + R)) return true;
    // Spikes, Toxic Spikes and Sticky Web lie on the ground: a flier is above them.
    const flying = d.types.includes(9);
    if (z.kind !== "stealth-rock" && flying) return true;
    z.last = s.t;
    if (z.kind === "spikes") hurt(s, d, Math.floor(d.max / 10), z.move);
    else if (z.kind === "stealth-rock") hurt(s, d, Math.floor(d.max / 8 * effectiveness("rock", d.types)), z.move);
    else if (z.kind === "toxic-spikes") afflict(s, d, PSN, false);
    else if (z.kind === "sticky-web") stages(s, d, [[5, -1]]);
    return true;
  });
}

/* THE GROUND'S OWN TICK: the zones' clock and claims, falling rock, the
   hot edge, water, tall grass, eroding basalt, a swift zone running out. */
function stepGround(s) {
  const g = GROUND[s.arena];
  const z = s.zone;
  if (--z.t <= 0) {
    z.open = !z.open; z.t = z.open ? ZONE_OPEN : ZONE_SHUT;
    z.claimed = [false, false]; z.hold = [[0, 0], [0, 0]];
    s.ev.push({ k: z.open ? "zones" : "zonesShut" });
  }
  const bodies = [activeOf(s, 0), activeOf(s, 1)];
  if (z.open) {
    ZONE_AT.forEach(([zx, zy], k) => {
      const inside = bodies.map((f) => f && f.hp > 0 && (f.x - zx) * (f.x - zx) + (f.y - zy) * (f.y - zy) < ZONE_R * ZONE_R);
      for (let side = 0; side < 2; side++) {
        // Held alone: a contested zone pays nobody.
        if (inside[side] && !inside[1 - side] && !z.claimed[side]) {
          if (++z.hold[k][side] >= ZONE_HOLD) { z.claimed[side] = true; reward(s, bodies[side], g.zone); gain(s, side, GAIN_ZONE); s.ev.push({ k: "claim", side, zone: k, x: zx, y: zy }); }
        } else z.hold[k][side] = 0;
      }
    });
  }
  if (g.rocks) {
    if (s.t >= ROCKS_FIRST && (s.t - ROCKS_FIRST) % ROCKS_EVERY === 0) {
      for (let n = 0; n < 3; n++) {
        const x = X0 + 1 + rnd(s) * (X1 - X0 - 2), y = Y0 + 1 + rnd(s) * (Y1 - Y0 - 2);
        s.drops.push({ x, y, t: ROCK_WARN });
      }
      s.ev.push({ k: "rumble" });
    }
    s.drops = s.drops.filter((r) => {
      if (--r.t > 0) return true;
      s.ev.push({ k: "rock", x: r.x, y: r.y });
      for (const f of bodies) {
        if (!f || f.hp <= 0 || f.inv > 0) continue;
        if ((f.x - r.x) * (f.x - r.x) + (f.y - r.y) * (f.y - r.y) > (ROCK_R + R) * (ROCK_R + R)) continue;
        hurt(s, f, Math.max(1, Math.floor(f.max / 8 * effectiveness("rock", f.types))), null);
        f.stun = Math.max(f.stun, sec(0.3));
      }
      return false;
    });
  }
  for (const f of bodies) {
    if (!f || f.hp <= 0) continue;
    if (f.swift > 0) f.swift--;
    // WATER (the Boardwalk): only a Water or Flying type moves freely in it.
    f.wading = inRects(g.water, f.x, f.y) && !f.types.includes(T("water")) && !f.types.includes(T("flying"));
    // TALL GRASS (the Grove): it hides you while you are not attacking.
    f.hidden = inRects(g.grass, f.x, f.y) && !f.act && !f.dodge;
    // THE HOT EDGE (the Caldera): a second against the wall burns a non-Fire type.
    if (g.heat && (f.x < X0 + g.heat || f.x > X1 - g.heat || f.y < Y0 + g.heat || f.y > Y1 - g.heat)) {
      if (++f.heat >= HEAT_BURN) { f.heat = 0; afflict(s, f, BRN); }
    } else f.heat = 0;
  }
  // BASALT ERODES (the Caldera): the cover thins out over the match.
  if (g.erode && s.t % sec(0.5) === 0) for (const c of s.cover) if (c.hp > 0 && --c.hp === 0) s.ev.push({ k: "break", id: c.id, x: c.x, y: c.y, move: STRUGGLE });
}

// What holding a zone pays, by the arena's kind.
function reward(s, f, kind) {
  if (!f) return;
  if (kind === "pp") {
    const m = [...f.kit].sort((a, b) => a.pp / ppOf(moveOf(a.i)) - b.pp / ppOf(moveOf(b.i)))[0];
    if (m && m.pp < ppOf(moveOf(m.i))) m.pp++;
  } else if (kind === "dodge") f.dodgeCd = 0;
  else if (kind === "cure") { if (f.status === BRN || f.status === PSN) { f.status = -1; f.badly = false; s.ev.push({ k: "cured", side: f.side }); } }
  else if (kind === "cool") for (const m of f.kit) m.cd = Math.max(0, m.cd - sec(2));
  else if (kind === "heal") heal(s, f, Math.floor(f.max * 0.06));
  else if (kind === "swift") f.swift = SWIFT;
}

// A self move: a shield, a rest, a heal, a buff.
function self(s, f, m) {
  if (SHIELDS.has(m.n)) { f.shield = SHIELD; f.inv = Math.max(f.inv, SHIELD); s.ev.push({ k: "shield", side: f.side, x: f.x, y: f.y }); return; }
  if (m.n === "rest") {
    heal(s, f, f.max);
    f.status = -1; afflict(s, f, SLP, false, sec(3));
    return;
  }
  if (m.h) heal(s, f, Math.floor(f.max * m.h / 100));
  if (m.sg) stages(s, f, m.sg);
}

function heal(s, f, n) {
  const got = Math.min(f.max - f.hp, Math.max(0, n));
  if (got <= 0) return;
  f.hp += got;
  s.ev.push({ k: "heal", side: f.side, x: f.x, y: f.y, n: got });
}

// Timed stat stages: each lasts BUFF_T and the Arena caps them at +/-2.
function stages(s, f, list) {
  for (const [stat, n] of list) {
    if (stat < 1 || stat > 7) continue;
    f.stages[stat] = clamp(f.stages[stat] + n, -STAGE_CAP, STAGE_CAP);
    f.stageT[stat] = BUFF_T;
    s.ev.push({ k: "stage", side: f.side, stat, n, x: f.x, y: f.y });
  }
}

// ------------------------------------------------------------------ statuses

/* STATUSES TICK IN REAL TIME (the plan's table): burn 1/16 every 2 s for 8 s
   and halved physical damage; poison 1/12 every 2 s for 10 s (badly: n/16,
   rising); paralysis halves speed for 6 s with a 25% chance of a 0.4 s stun
   every 2 s; sleep 2-4 s, woken by a hit after its first second; freeze
   2.5 s, thawed by a Fire hit. */
const LASTS = { [PAR]: sec(6), [BRN]: sec(8), [PSN]: sec(10), [FRZ]: sec(2.5) };
function afflict(s, f, st, badly = false, sleep = 0) {
  if (f.status !== -1 || f.hp <= 0 || immuneTo(f, st)) return false;
  f.status = st; f.badly = badly; f.statusN = 0;
  f.statusT = st === SLP ? (sleep || sec(2 + rnd(s) * 2)) : LASTS[st];
  f.sleptAt = s.t;
  if (f.act?.ph === "wind" && (st === SLP || st === FRZ)) f.act = null;
  s.ev.push({ k: "status", side: f.side, st, x: f.x, y: f.y });
  return true;
}
function stepStatus(s, f) {
  if (f.status === -1) return;
  const every = sec(2);
  const k = LASTS[f.status] ? LASTS[f.status] - f.statusT : 0;
  if (k > 0 && k % every === 0) {
    f.statusN++;
    if (f.status === BRN) hurt(s, f, Math.max(1, Math.floor(f.max / 16)));
    if (f.status === PSN) hurt(s, f, Math.max(1, Math.floor(f.badly ? f.max * f.statusN / 16 : f.max / 12)));
    if (f.status === PAR && rnd(s) < 0.25) { f.stun = sec(0.4); s.ev.push({ k: "para", side: f.side, x: f.x, y: f.y }); }
  }
  if (--f.statusT <= 0) { f.status = -1; f.badly = false; s.ev.push({ k: "cured", side: f.side }); }
}
function hurt(s, f, n, move = null) {
  if (n <= 0 || f.hp <= 0) return;
  f.hp = Math.max(0, f.hp - n);
  s.ev.push({ k: "tick", side: f.side, x: f.x, y: f.y, dmg: n, st: f.status, move });
}

function stepShots(s) {
  s.shots = s.shots.filter((p) => {
    p.x += p.dx * SHOT_SPEED; p.y += p.dy * SHOT_SPEED; p.left -= SHOT_SPEED;
    if (p.left <= 0 || p.x < INSET || p.x > W - INSET || p.y < INSET || p.y > H - INSET) { s.ev.push({ k: "fizzle", x: p.x, y: p.y, move: p.move }); return false; }
    const c = s.cover.find((b) => b.hp > 0 && Math.abs(p.x - b.x) < COVER_HALF + SHOT_R && Math.abs(p.y - b.y) < COVER_HALF + SHOT_R);
    if (c) { chip(s, c, p.move, p.x, p.y); return false; }
    const d = activeOf(s, 1 - p.side);
    if (!d || d.hp <= 0) return true;
    const ex = d.x - p.x, ey = d.y - p.y;
    if (ex * ex + ey * ey > (R + SHOT_R) * (R + SHOT_R)) return true;
    const a = s.sides[p.side].team[p.from];
    hit(s, a, d, p.move, p.dx, p.dy, false, p.x, p.y);
    return false;
  });
}

function surge(s, side, f) {
  s.sides[side].meter = 0;
  s.sides[side].stats.surges++;
  f.surge = SURGE_T; f.stun = 0; f.inv = Math.max(f.inv, sec(0.3));
  const d = activeOf(s, 1 - side);
  if (d && d.hp > 0) {
    const ex = d.x - f.x, ey = d.y - f.y;
    if (ex * ex + ey * ey < SURGE_PUSH * SURGE_PUSH) {
      const [dx, dy] = norm(ex, ey);
      d.kbx = dx * 2 / KB; d.kby = dy * 2 / KB; d.kbt = KB;
      d.stun = Math.max(d.stun, FLINCH);
      if (d.act?.ph === "wind") d.act = null;
    }
  }
  s.ev.push({ k: "surge", side, x: f.x, y: f.y });
}
function gain(s, side, n) {
  const sd = s.sides[side], was = sd.meter;
  sd.meter = Math.min(SURGE_MAX, sd.meter + n * (finalMinute(s) ? FINAL_GAIN : 1));
  if (was < SURGE_MAX && sd.meter >= SURGE_MAX) s.ev.push({ k: "ready", side });
}

function hit(s, a, d, move, dx, dy, contact, hx = d.x, hy = d.y) {
  if (d.inv > 0) {
    // Rolled THROUGH it: a perfect dodge, paid in Surge.
    const perfect = !d.shield && d.dodge > 0;
    if (perfect) { gain(s, d.side, GAIN_DODGE); s.sides[d.side].stats.perfect++; }
    s.ev.push({ k: d.shield ? "blocked" : "evade", side: d.side, x: d.x, y: d.y, perfect });
    return;
  }
  const m = moveOf(move);
  const eff = effectiveness(m.t, d.types);
  if (eff === 0) { s.ev.push({ k: "immune", side: d.side, x: d.x, y: d.y }); return; }
  let dmg = 0;
  if (m.p) {
    const crit = rnd(s) < CRIT[Math.min(3, (m.cr ?? 0) + (a.perk?.crit ?? 0))];
    const roll = 0.85 + rnd(s) * (a.perk?.roll ?? 0.15);
    // A multi-shot's every shot is one of its hits; a pulse or a blow carries the average.
    const hits = shapeOf(m) === "multi" || !m.hits ? 1 : (m.hits[0] + m.hits[1]) / 2;
    dmg = Math.max(1, Math.floor(rawDamage(a, d, m, crit) * (crit ? 1.5 : 1) * roll * hits * DAMAGE * (a.surge > 0 ? SURGE_DMG : 1)
      * (finalMinute(s) ? FINAL_DMG : 1)));
    d.hp = Math.max(0, d.hp - dmg);
    const st = s.sides[a.side].stats;
    st.dealt += dmg; st.hits++; st.chain++; st.best = Math.max(st.best, st.chain);
    s.sides[d.side].stats.chain = 0;
    gain(s, a.side, GAIN_DEAL * dmg / d.max); gain(s, d.side, GAIN_TAKE * dmg / d.max);
    d.flash = sec(0.08); d.stun = Math.max(d.stun, STUN);
    const push = contact ? (m.p ?? 40) / 40 : 0.25;
    d.kbx = dx * push / KB; d.kby = dy * push / KB; d.kbt = KB;
    if (d.act?.ph === "wind") d.act = null;     // a hit interrupts a wind-up
    // Sleep breaks on a hit after its first second; a Fire hit thaws.
    if (d.status === SLP && s.t - d.sleptAt > sec(1)) { d.status = -1; s.ev.push({ k: "cured", side: d.side }); }
    if (d.status === FRZ && m.t === "fire") { d.status = -1; s.ev.push({ k: "cured", side: d.side }); }
    if (m.fl && rnd(s) * 100 < m.fl) { d.stun = Math.max(d.stun, FLINCH); }
    if (m.dr > 0) heal(s, a, Math.floor(dmg * m.dr / 100));
    if (m.dr < 0) hurt(s, a, Math.max(1, Math.floor(dmg * -m.dr / 100)));
    // Where it came from and how hard, for the picture alone (events are not in the replay hash).
    s.ev.push({ k: "hit", side: d.side, x: hx, y: hy, dmg, crit, eff, move, heavy: (m.p ?? 0) >= 90 || crit || a.surge > 0, dx, dy, frac: dmg / d.max, ko: d.hp <= 0, surge: a.surge > 0 });
  } else {
    s.ev.push({ k: "touch", side: d.side, x: hx, y: hy, move });
  }
  if (m.st != null && rnd(s) * 100 < (m.p ? m.stc ?? 0 : 100)) afflict(s, d, m.st, m.n === "toxic");
  if (m.sg && !m.sgu && !m.self && rnd(s) * 100 < (m.sgc ?? 100)) stages(s, d, m.sg);
}

function settleKO(s, side) {
  const sd = s.sides[side];
  if (sd.koT > 0) {
    if (--sd.koT === 0) {
      const next = sd.team.findIndex((f) => f.hp > 0);
      const from = sd.team[sd.active], to = sd.team[next];
      Object.assign(to, { x: from.x, y: from.y, px: from.x, py: from.y, inv: SWAP_INV, act: null });
      sd.active = next;
      s.ev.push({ k: "in", side, slot: next });
    }
    return;
  }
  if (sd.swapT > 0) return;
  const f = sd.team[sd.active];
  if (f.hp > 0) return;
  s.ev.push({ k: "ko", side, slot: sd.active, x: f.x, y: f.y });
  f.act = null; f.status = -1; f.surge = 0;
  if (!alive(sd).length) {
    s.over = true; s.winner = 1 - side; s.why = "knockout";
    return;
  }
  sd.koT = KO_WAIT;
}

// The clock: more Pokemon left wins, then more of their HP.
function timeUp(s) {
  const score = (sd) => [alive(sd).length, sd.team.reduce((n, f) => n + f.hp / f.max, 0)];
  const [a, b] = s.sides.map(score);
  s.over = true; s.why = "time";
  s.winner = a[0] !== b[0] ? (a[0] > b[0] ? 0 : 1) : a[1] !== b[1] ? (a[1] > b[1] ? 0 : 1) : -1;
}

// ------------------------------------------------------------------ the CPU

/* THE CPU PLAYS THROUGH THE SAME INPUT a person does, so it obeys the same
   cooldowns and dodges. A level only changes how human it is: how late it
   sees a wind-up, how far off its aim is, how often it rolls. */
export const LEVELS = {
  dummy: { react: 0, err: 0, dodge: 0 },
  /* `surge`: how close the foe must be before it spends a full meter. Easy
     never does, and misses more: with Surge (a comeback for whoever is being
     hit) Normal beat the old Easy 64% of 40 matches; this Easy, 78%. */
  easy: { react: sec(0.5), err: 0.45, dodge: 0.08 },
  normal: { react: sec(0.3), err: 0.18, dodge: 0.4, swap: 0.25, surge: 3 },
  hard: { react: sec(0.18), err: 0.07, dodge: 0.7, swap: 0.35, lead: true, shield: true, zones: true, surge: 3.5 },
  // The Arena Ladder's top masters (ladder.js): faster, surer, and it takes the zones.
  champion: { react: sec(0.14), err: 0.03, dodge: 0.8, swap: 0.35, lead: true, shield: true, zones: true, surge: 3.5 },
};

// How far each shape reaches, for choosing where to stand and when to throw.
const reachOf = (shape) => ({ shot: SHOT_RANGE * 0.75, multi: SHOT_RANGE * 0.6, beam: BEAM_LEN * 0.9,
  melee: MELEE_RANGE + R * 0.5, dash: DASH_DIST + 0.4, pulse: PULSE_R + R * 0.5, field: PLACE + 1, self: 99 })[shape] ?? 2;

/* What a move is worth now, to the CPU: damage by the League's own estimate;
   a status shot when the foe has none; a buff when it has none running; a
   heal when it is low; a hazard early; a shield never (it is reactive). */
function worth(me, foe, m) {
  const data = moveOf(m.i);
  const shape = shapeOf(data);
  if (data.p) return expected(me, foe, m.i);
  const base = Math.max(1, ...me.kit.filter((k) => moveOf(k.i).p).map((k) => expected(me, foe, k.i))) * 0.7;
  if (SHIELDS.has(data.n)) return 0;
  if (data.n === "rest") return me.hp / me.max < 0.3 ? base * 1.5 : 0;
  if (shape === "self") {
    if (data.h) return me.hp / me.max < 0.45 ? base * 1.3 : 0;
    return data.sg?.every(([st]) => me.stageT[st] > 0) ? 0 : base * 0.9;
  }
  if (shape === "field") return base * 0.6;
  if (data.st != null) return foe.status === -1 && !immuneTo(foe, data.st) ? base : 0;
  if (data.sg) return data.sg.every(([st]) => foe.stageT[st] > 0) ? 0 : base * 0.5;
  return 0;
}

function cpuInput(s, side) {
  const c = s.sides[side].cpu, L = LEVELS[c.level] ?? LEVELS.normal;
  const me = activeOf(s, side), foe = activeOf(s, 1 - side);
  if (!me) return NO_INPUT;
  if (c.level === "dummy") {
    // Wanders a slow square and never attacks: something to hit.
    const k = (s.t % (TPS * 8)) / (TPS * 8);
    return { ...NO_INPUT, mx: k < 0.25 ? 1 : k < 0.5 ? 0 : k < 0.75 ? -1 : 0, my: k < 0.25 ? 0 : k < 0.5 ? 1 : k < 0.75 ? 0 : -1 };
  }
  if (!foe) return { ...NO_INPUT, mx: (W / 2 - me.x) > 0 ? 1 : -1 };
  /* A foe in tall grass is where it was last seen: the CPU goes there and
     holds its fire. */
  if (!foe.hidden || Math.abs(foe.x - me.x) + Math.abs(foe.y - me.y) < 2) { c.lx = foe.x; c.ly = foe.y; }
  if (foe.hidden && Math.abs(foe.x - me.x) + Math.abs(foe.y - me.y) >= 2) {
    const gx = c.lx - me.x, gy = c.ly - me.y;
    return { ...NO_INPUT, mx: gx, my: gy, ax: gx, ay: gy };
  }
  const ex = foe.x - me.x, ey = foe.y - me.y, dist = Math.sqrt(ex * ex + ey * ey) || 1;
  const ux = ex / dist, uy = ey / dist;
  if (L.surge && s.sides[side].meter >= SURGE_MAX && !me.act && dist < L.surge) return { ...NO_INPUT, surge: true, ax: ex, ay: ey };

  // A wind-up aimed at me: seen after its reaction time, rolled from (or shielded) at its odds.
  const fa = foe.act;
  if (fa?.ph === "wind" && c.dodged !== fa.id && ((fa.dx * -ux + fa.dy * -uy) > 0.85 || fa.shape === "pulse")) {
    if (c.seenId !== fa.id) { c.seen = s.t; c.seenId = fa.id; }
    if (s.t - c.seen >= L.react) {
      c.dodged = fa.id;
      if (me.dodgeCd === 0 && rnd(s) < L.dodge) {
        const way = rnd(s) < 0.5 ? 1 : -1;
        const away = fa.shape === "pulse" ? 1 : 0;
        return { ...NO_INPUT, mx: -uy * way - ux * away, my: ux * way - uy * away, dodge: true };
      }
      if (L.shield && !me.act) {
        const k = me.kit.findIndex((m) => SHIELDS.has(moveOf(m.i).n) && !m.cd && m.pp > 0);
        if (k >= 0) return { ...NO_INPUT, fire: k };
      }
    }
  }
  // Switch out when low, if a teammate is healthier.
  const sd = s.sides[side];
  if (L.swap && me.hp / me.max < L.swap && sd.swapCd === 0 && !me.act && s.t % 30 === 0) {
    const best = sd.team.map((f, i) => [f.hp / f.max, i]).filter(([h, i]) => i !== sd.active && h > 0.5)
      .sort((a, b) => b[0] - a[0])[0];
    if (best && rnd(s) < 0.5) return { ...NO_INPUT, swap: best[1] };
  }
  /* The move worth most now, among those ready - and the CPU goes to ITS
     range: in for a blow, out to a shot's distance. Choosing only among
     moves already in reach left a mixed kit standing at range with its
     blows never usable, firing once in ten seconds. */
  let pick = -1, bestV = 0;
  me.kit.forEach((m, k) => {
    if (m.cd || m.pp <= 0) return;
    const v = worth(me, foe, m);
    if (v > bestV) { bestV = v; pick = k; }
  });
  /* Spent: a level that switches (`swap`) brings in a teammate that can still
     fight; Easy, which never switches, struggles where it stands. */
  if (pick < 0 && spent(me) && !me.act) {
    const next = L.swap ? sd.team.findIndex((f, i) => i !== sd.active && f.hp > 0 && !spent(f)) : -1;

    if (next >= 0 && sd.swapCd === 0) return { ...NO_INPUT, swap: next };
    if (next < 0 && !(me.struggle?.cd > 0)) pick = 0;
  }
  const shapeAt = (k) => shapeOf(moveOf(me.kit[k].pp <= 0 && spent(me) ? STRUGGLE : me.kit[k].i));
  const reach = pick >= 0 ? reachOf(shapeAt(pick)) : 4;
  const want = pick < 0 ? 4 : Math.min(reach - 0.4, ["shot", "beam", "multi"].includes(shapeAt(pick)) ? 4.5 : reach - 0.4);
  if (s.t % (TPS * 2) === 0) c.strafe = rnd(s) < 0.5 ? 1 : -1;
  const toward = dist > want + 0.4 ? 1 : dist < want - 0.8 ? -1 : 0;
  let mx = ux * toward - uy * c.strafe * 0.6, my = uy * toward + ux * c.strafe * 0.6;
  // An open zone it has not claimed this cycle: the CPU goes and takes it.
  const z = s.zone;
  if (L.zones && z.open && !z.claimed[side]) {
    const d2 = ([x, y]) => (x - me.x) * (x - me.x) + (y - me.y) * (y - me.y);
    const [zx, zy] = d2(ZONE_AT[0]) <= d2(ZONE_AT[1]) ? ZONE_AT[0] : ZONE_AT[1];
    mx = zx - me.x; my = zy - me.y;
  }
  // Off the walls: a corner is where a strafing CPU used to end up and stay.
  const edge = INSET + 1.3;
  if (me.x < edge) mx += 1; else if (me.x > W - edge) mx -= 1;
  if (me.y < edge) my += 1; else if (me.y > H - edge) my -= 1;
  // On the way, anything ready that reaches now is thrown.
  if (pick >= 0 && dist > reach) {
    let now = -1, nowV = 0;
    me.kit.forEach((m, k) => {
      if (m.cd || m.pp <= 0 || dist > reachOf(shapeAt(k))) return;
      const v = worth(me, foe, m);
      if (v > nowV) { nowV = v; now = k; }
    });
    pick = now;
  }
  if (pick < 0 || me.act) return { ...NO_INPUT, mx, my, ax: ex, ay: ey };
  // A shot or a beam into cover is a shot at the cover: step round it instead.
  if (["shot", "beam", "multi"].includes(shapeAt(pick)) && blocked(s, me.x, me.y, foe.x, foe.y)) {
    return { ...NO_INPUT, mx: -uy * c.strafe + ux * 0.3, my: ux * c.strafe + uy * 0.3, ax: ex, ay: ey };
  }
  // Aim, with the level's error, and on Hard a lead on a moving target.
  let tx = ex, ty = ey;
  if (L.lead && ["shot", "multi"].includes(shapeAt(pick))) {
    const tt = dist / SHOT_SPEED;
    tx += (foe.x - foe.px) * tt; ty += (foe.y - foe.py) * tt;
  }
  const off = (rnd(s) * 2 - 1) * L.err;
  const [nx, ny] = norm(tx, ty);
  const far = Math.sqrt(tx * tx + ty * ty);
  return { ...NO_INPUT, mx, my, ax: (nx - ny * off) * far, ay: (ny + nx * off) * far, fire: pick };
}

// ------------------------------------------------------------------ teams

/* A CPU TEAM for Quick Battle and Training: unevolved species that hit, each
   at the stage its level reaches (`stageAt`, as the League's opponents are),
   chosen by the seed so a match's foes replay with it. */
const POOL = SPECIES.filter((sp) => !isForm(sp.id) && !isEvent(sp.id) && !sp.legendary && !sp.mythical
  && !neverHits(sp.id)).map((sp) => sp.id);
export function cpuTeam(seed, level, n = 3) {
  const s = { rs: seed | 0 };
  const lv = clamp(Math.round(level), 5, 100);
  const picks = new Set();
  while (picks.size < n) picks.add(stageAt(POOL[Math.floor(rnd(s) * POOL.length)], lv));
  return [...picks].filter((id) => speciesById(id)).map((id, slot) => fighter(id, lv, hash(`arena:${seed}:${slot}`), movesAt(id, lv)));
}

/* AN ARENA MASTER'S TEAM (ladder.js): its species at the stage the
   master's level reaches, with their own level-up moves. */
export const masterTeam = (m) => m.team.map(([id], slot) => {
  const at = stageAt(id, m.level);
  return fighter(at, m.level, hash(`ladder:${m.id}:${slot}`), movesAt(at, m.level));
});

/* THE FAIR FORMAT (an online match between friends): your species, each at
   FAIR_LEVEL with every IV at 31 and its level-up moves there - what you
   bring is which Pokemon, never how far you raised them. */
export const FAIR_LEVEL = 50;
export const fairTeam = (ids) => ids.map((id) => fighter(id, FAIR_LEVEL, hash(`fair:${id}`), movesAt(id, FAIR_LEVEL), 0, 31));

// ------------------------------------------------------------------ playing online

/* LOCKSTEP (an online match, phase 3). Two ends play the same match from the
   same seed, and a tick is stepped only with BOTH players' inputs for it.
   Yours for tick n is sampled at n - DELAY and sent at once, so the round
   trip hides inside the delay; ticks under DELAY are nobody's. Every
   HASH_EVERY ticks each end sends its state hash and a difference is a
   desync. `link` is anything with send(message) and an `onmessage` hook (a
   WebRTC data channel in the page, a queue in check.mjs); `round` tells a
   rematch's messages from the last match's. An input is cleaned the same
   way at both ends (`cleanInput`), so a float rounded on the wire is the
   float both sims see. */
export const DELAY = 4, HASH_EVERY = 60;
const q64 = (v, lim) => (Number.isFinite(v) ? Math.round(clamp(v, -lim, lim) * 64) / 64 : 0);
const pick = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : -1);
export const cleanInput = (i) => ({
  mx: q64(i?.mx, 1), my: q64(i?.my, 1), ax: q64(i?.ax, 40), ay: q64(i?.ay, 40),
  fire: pick(i?.fire, 0, 3), dodge: Boolean(i?.dodge), swap: pick(i?.swap, 0, 5), surge: Boolean(i?.surge),
});
export function lockstep(link, me, round = 0) {
  const mine = new Map(), theirs = new Map(), myHash = new Map(), theirHash = new Map();
  let made = 0, sent = DELAY, desync = -1;
  const check = (n) => {
    if (myHash.has(n) && theirHash.has(n)) {
      if (myHash.get(n) !== theirHash.get(n) && desync < 0) desync = n;
      myHash.delete(n); theirHash.delete(n);
    }
  };
  const hear = (m) => {
    if (m?.r !== round) return;
    if (m.t === "in" && Number.isInteger(m.n) && m.n >= made) theirs.set(m.n, cleanInput(m.i));
    else if (m.t === "hash" && Number.isInteger(m.n)) { theirHash.set(m.n, m.h); check(m.n); }
  };
  return {
    hear,
    // Send your inputs up to DELAY ticks ahead; `sample` builds one.
    feed(sample) {
      while (sent <= made + DELAY) {
        const i = cleanInput(sample());
        mine.set(sent, i);
        link.send({ t: "in", r: round, n: sent, i });
        sent++;
      }
    },
    ready: () => made < DELAY || theirs.has(made),
    // The other end is ahead of you: step an extra tick to catch up.
    behind: () => theirs.has(made + DELAY + 2),
    step(s) {
      const a = made < DELAY ? NO_INPUT : mine.get(made), b = made < DELAY ? NO_INPUT : theirs.get(made);
      mine.delete(made); theirs.delete(made);
      tick(s, me === 0 ? [a, b] : [b, a]);
      made++;
      if (made % HASH_EVERY === 0) { const h = stateHash(s); myHash.set(made, h); link.send({ t: "hash", r: round, n: made, h }); check(made); }
    },
    get made() { return made; },
    get desync() { return desync; },
  };
}

/* WHICH RULES THIS BUILD PLAYS (an online match's handshake): a fixed match,
   Fair teams against a CPU team on a floor with falling rocks, run thirty
   seconds and hashed. Two builds whose rules, species or moves differ
   anywhere a fight reaches print differently, and never start a match that
   would drift apart. */
let printed = null;
export function rulesPrint() {
  if (printed) return printed;
  const s = newMatch({ teams: [fairTeam([6, 25, 94]), cpuTeam(11, 50)], cpu: ["hard", "hard"], seed: 3, arena: "moon" });
  for (let t = 0; t < 30 * TPS && !s.over; t++) tick(s, [null, null]);
  printed = hash(`${stateHash(s)}:${DELAY}:${HASH_EVERY}:${INTRO}`);
  return printed;
}

// What a replay compares: where everyone is and how they are, each tick's end.
export const stateHash = (s) => hash(JSON.stringify([s.t, s.intro, s.rs, s.winner,
  s.sides.map((sd) => [sd.active, sd.swapT, sd.koT, sd.meter, sd.team.map((f) => [f.x, f.y, f.hp, f.status, f.stages, f.surge, f.kit.map((m) => m.pp)])]),
  s.shots.map((p) => [p.x, p.y]), s.hazards.map((z) => [z.x, z.y, z.t]),
  s.cover.map((c) => c.hp), [s.zone.open, s.zone.t, s.zone.claimed], s.drops.map((r) => [r.x, r.y, r.t])]));
