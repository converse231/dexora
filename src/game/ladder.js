/* THE ARENA LADDER (the Arena plan, phase 2): ten masters, beaten in order,
   each on one of the Arena's floors with a team of one type, ending on the
   Arena Champion. The engine judges and pays a master from this file alone
   (`arenaMaster`) - it never imports the Arena's rules, which carry the
   League's data - and the Arena page reads the same list.

   IDS NEVER CHANGE (the save's `ladder` keys on them) and the list is
   append-only. A team is typed by dex id WITH the name it was checked by
   (check.mjs holds each id to its `label`, as suggest.js's lineups are); the
   Arena puts each at the stage its level reaches. A master is a title, never
   a person: no real trainer is impersonated.

   WHAT A FIRST WIN PAYS: once, LADDER_YEN x its level - the ten together are
   held under a quarter of one day's road trainers by check.mjs - and the
   Champion adds a card pack. */
import { GYMTUNE } from "../data/gymtune.js";

export const LADDER_YEN = 80;
// How many fight a side in the Arena: the save's `arenaTeam` holds at most this many.
export const ARENA_TEAM = 3;

/* RENTALS AND THE LOCKED SHOWCASE (2026-10-24, asked for: "a small pool new
   players can freely use, and some locked ones to entice them - catch it to
   unlock"). A rental is a first stage at RENTAL_LEVEL anybody may field -
   three melee, three ranged, each evolving mid-match as its line does - and
   is no box entry: its uid is the negative of its dex id (`rentalOf`), which
   `setArenaTeam` and the page resolve. The showcase is famous fighters a
   player does not hold yet, drawn locked in the picker with where to find
   them; catching one is what unlocks it. Ids typed WITH the names they were
   checked by (check.mjs reads every one, and holds each to an Arena body). */
export const RENTAL_LEVEL = 30;
// Three ranged and three melee (2026-10-24: with roles by species, Squirtle and Pikachu came out ranged,
// so Totodile and Riolu took Squirtle's and Gastly's places).
export const RENTALS = [
  [1, "Bulbasaur"], [4, "Charmander"], [25, "Pikachu"], [66, "Machop"], [158, "Totodile"], [447, "Riolu"],
];
export const SHOWCASE = [
  [6, "Charizard"], [150, "Mewtwo"], [448, "Lucario"], [445, "Garchomp"], [94, "Gengar"], [658, "Greninja"],
  [149, "Dragonite"], [248, "Tyranitar"], [384, "Rayquaza"], [282, "Gardevoir"], [257, "Blaziken"], [197, "Umbreon"],
];
export const isRental = (uid) => uid < 0 && RENTALS.some(([id]) => id === -uid);
export const rentalOf = (uid) => (isRental(uid) ? { uid, species: -uid, level: RENTAL_LEVEL, size: 50, rental: 1 } : null);

export const LADDER = [
  { id: "court", name: "Court Master", arena: "indigo", level: 20, cpu: "normal", type: "normal",
    team: [[16, "pidgey"], [52, "meowth"], [133, "eevee"]] },
  { id: "cavern", name: "Cavern Master", arena: "moon", level: 28, cpu: "normal", type: "rock",
    team: [[74, "geodude"], [95, "onix"], [111, "rhyhorn"]] },
  { id: "tide", name: "Tide Master", arena: "seaside", level: 36, cpu: "normal", type: "water",
    team: [[54, "psyduck"], [72, "tentacool"], [98, "krabby"]] },
  { id: "caldera", name: "Caldera Master", arena: "caldera", level: 44, cpu: "hard", type: "fire",
    team: [[58, "growlithe"], [77, "ponyta"], [126, "magmar"]] },
  { id: "grove", name: "Grove Master", arena: "grove", level: 52, cpu: "hard", type: "grass",
    team: [[43, "oddish"], [123, "scyther"], [102, "exeggcute"]] },
  { id: "rink", name: "Rink Master", arena: "rink", level: 60, cpu: "hard", type: "ice",
    team: [[86, "seel"], [215, "sneasel"], [220, "swinub"]] },
  { id: "storm", name: "Storm Master", arena: "indigo", level: 68, cpu: "hard", type: "electric",
    team: [[81, "magnemite"], [125, "electabuzz"], [179, "mareep"]] },
  { id: "shadow", name: "Shadow Master", arena: "moon", level: 76, cpu: "champion", type: "ghost",
    team: [[92, "gastly"], [228, "houndour"], [200, "misdreavus"]] },
  { id: "dragon", name: "Dragon Master", arena: "caldera", level: 86, cpu: "champion", type: "dragon",
    team: [[147, "dratini"], [371, "bagon"], [443, "gible"]] },
  { id: "champion", name: "Arena Champion", arena: "indigo", level: 100, cpu: "champion", type: "dragon",
    team: [[149, "dragonite"], [248, "tyranitar"], [445, "garchomp"]] },
];

export const masterOf = (id) => LADDER.find((m) => m.id === id) ?? null;

/* THE GYM CIRCUIT (2026-10-27, asked for: "the Arena Ladder is done in a
   snap with Lv 100s - attach the gym ladders, with their top 3"): every
   region's leaders, Elite Four and Champion, in the League's own order, each
   with the three strongest of their strongest roster (arena.js `gymTeam`) at
   your team's level or their own, whichever is higher - a team of 100s still
   meets a fight - against a CPU that sharpens through a region and across
   them (`gymCpu`). A region opens once the one before it is cleared; Kanto is
   open from the start, beside the ten masters. Read off gymtune.js (the main
   bundle carries it for the League's own rules), never the League's rosters:
   the engine judges and pays from here. The save's `ladder` keys a gym as
   "gym:<League id>" beside the masters' ids - the League's ids never change.
   A first win pays GYM_SHARE of the League's own first-win prize; a
   Champion adds a card pack. */
export const GYM_SHARE = 0.3;
export const CIRCUIT_REGIONS = [...new Set(Object.values(GYMTUNE).map((r) => r.region))];
const KIND_ORDER = { leader: 0, league: 1 };
export const circuitOf = (region) => Object.entries(GYMTUNE).filter(([, r]) => r.region === region)
  .sort(([, a], [, b]) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.k - b.k).map(([id]) => id);
export const gymKey = (id) => `gym:${id}`;
export const isChampion = (id) => circuitOf(GYMTUNE[id]?.region).at(-1) === id;
export const regionDone = (region, ladder = []) => circuitOf(region).every((id) => ladder.includes(gymKey(id)));
export function gymOpen(id, ladder = []) {
  const region = GYMTUNE[id]?.region;
  if (!region) return false;
  const r = CIRCUIT_REGIONS.indexOf(region);
  if (r > 0 && !regionDone(CIRCUIT_REGIONS[r - 1], ladder)) return false;
  const c = circuitOf(region);
  return c.slice(0, c.indexOf(id)).every((x) => ladder.includes(gymKey(x)));
}
export const gymPay = (id) => Math.round((GYMTUNE[id]?.prize ?? 0) * GYM_SHARE);
// The CPU a gym fights with: Normal for a first region's first four gyms, then Hard, the Elite Four Champion-grade from Hoenn on.
export function gymCpu(id) {
  const g = GYMTUNE[id];
  if (!g) return "normal";
  const r = CIRCUIT_REGIONS.indexOf(g.region);
  if (isChampion(id)) return "champion";
  if (g.kind === "league") return r < 2 ? "hard" : "champion";
  return g.k < 4 && r < 2 ? "normal" : r < 5 || g.k < 4 ? "hard" : "champion";
}
export const ladderPay = (m) => (m ? m.level * LADDER_YEN : 0);
/* MAY THIS ONE BE FOUGHT? In order: the first not yet beaten, and any
   already beaten again (for the practice; it never pays twice). */
export function ladderOpen(id, beaten = []) {
  const k = LADDER.findIndex((m) => m.id === id);
  if (k < 0) return false;
  return LADDER.slice(0, k).every((m) => beaten.includes(m.id));
}
// The save's `ladder`: known ids, each once, in the list's order.
export const cleanLadder = (v) => (Array.isArray(v)
  ? [...LADDER.map((m) => m.id), ...Object.keys(GYMTUNE).map(gymKey)].filter((id) => v.includes(id)) : []);
