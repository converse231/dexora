/* ROAD TRAINERS (docs/battles.md, *Road trainers*): battles off the League,
   fought for money. They are filed BY REGION, as DelugeRPG files its trainers
   (2026-10-16, asked for: by map, nobody could tell a generation's trainers
   were all there): every region your level has opened (`GEN_UNLOCK`) has
   ROAD_PER_REGION of them, new every day - a hash of the day, the region and
   the slot, so every copy of the game agrees and a reload cannot reroll one.

   Browser-free and light: it reads the species list, never the League's data,
   so the engine can judge a road battle. The page builds the fighters from
   `party` with battle.js's `opponent()`, the same builder a gym uses, which
   puts each Pokemon at the stage its level reaches. */
import { SPECIES, isForm } from "../data/dex.js";
import { GEN_UNLOCK, REGION_NAME, genOf } from "./biomes.js";
import { dayKey, hash } from "./daily.js";

// What a win pays: the ace level x ROAD_YEN x (1 + team / 3), once a trainer a
// day. 7 until 2026-10-16, raised with the League's prizes (asked for).
export const ROAD_YEN = 15;

/* The rungs, one per slot: team size, level over the region's own (its
   arrival level), the AI, and the classes that fight at it - the games' own,
   each with the portrait the League ships (public/trainers/). */
const ROOKIE = { rung: "Rookie", size: 2, over: 3, ai: 1, classes: [["Youngster", "youngster"], ["Lass", "lass"], ["Bug Catcher", "bugcatcher"], ["School Kid", "schoolkid"], ["Tuber", "tuber"]] };
const REGULAR = { rung: "Regular", size: 3, over: 10, ai: 1, classes: [["Hiker", "hiker"], ["Camper", "camper"], ["Picnicker", "picnicker"], ["Fisherman", "fisherman"], ["Sailor", "sailor"], ["Swimmer", "swimmer"]] };
const ACE = { rung: "Ace", size: 4, over: 25, ai: 2, classes: [["Ace Trainer", "acetrainer"], ["Ace Trainer", "acetrainerf"], ["Black Belt", "blackbelt"], ["Psychic", "psychic"], ["Beauty", "beauty"], ["Gentleman", "gentleman"]] };
const VETERAN = { rung: "Veteran", size: 6, band: [60, 100], ai: 2, classes: [["Veteran", "veteran"], ["Veteran", "veteranf"]] };
const SLOTS = [ROOKIE, REGULAR, REGULAR, ACE, ACE, VETERAN];
export const ROAD_PER_REGION = SLOTS.length;

const NAMES = ["Joey", "Ben", "Kay", "Ana", "Rick", "Mia", "Tom", "Lou", "Ren", "Ivy", "Max", "Sue", "Dan", "Eve", "Kai", "Zoe",
  "Owen", "Lila", "Hugo", "Nina", "Theo", "Rosa", "Finn", "Ada"];

// Each region's own Pokemon: its species, no forms, no legendaries or mythicals.
const POOL = new Map();
for (const sp of SPECIES) {
  if (isForm(sp.id) || sp.legendary) continue;
  const g = genOf(sp.id);
  if (!POOL.has(g)) POOL.set(g, []);
  POOL.get(g).push(sp.id);
}

// A small seeded stream per trainer (battle.js's mulberry32, which the engine may not import).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const roadId = (day, gen, slot) => `road:${day}:${gen}:${slot}`;
export const isRoad = (id) => typeof id === "string" && id.startsWith("road:");

/* ONE TRAINER, rebuilt from its id: `{ id, gen, region, rung, cls, name,
   pic, ai, party: [[species, level]...], top, pay }`, or null for an id that
   names no region or slot - an old save's map ids (`road:<day>:meadow:0`)
   included, which simply stop meaning a trainer. */
export function roadTrainer(id) {
  if (!isRoad(id)) return null;
  const [, day, g, s] = id.split(":");
  const gen = Number(g), slot = Number(s);
  const R = SLOTS[slot];
  const pool = POOL.get(gen);
  if (!R || !pool?.length || !REGION_NAME[gen] || !/^\d{8}$/.test(day) || String(gen) !== g) return null;
  const r = rng(hash(id));
  const top = R.band ? R.band[0] + Math.floor(r() * (R.band[1] - R.band[0] + 1)) : Math.min(100, GEN_UNLOCK[gen] + R.over);
  const party = Array.from({ length: R.size }, (_, k) => {
    // The ace leads at `top`; the rest a few levels under it.
    const lv = Math.max(2, top - (k === R.size - 1 ? 0 : 1 + Math.floor(r() * 4)));
    return [pool[Math.floor(r() * pool.length)], lv];
  });
  const [cls, pic] = R.classes[Math.floor(r() * R.classes.length)];
  return {
    // `road` marks it for the page's helpers (tuneOf): a road trainer has no League row.
    road: true, id, gen, region: REGION_NAME[gen], rung: R.rung, slot, cls, pic, ai: R.ai,
    name: NAMES[Math.floor(r() * NAMES.length)], party, top,
    pay: Math.round(top * ROAD_YEN * (1 + R.size / 3)),
  };
}

// Today's trainers in a region.
export const roadOf = (gen, day = dayKey()) =>
  SLOTS.map((_, k) => roadTrainer(roadId(day, gen, k))).filter(Boolean);

// The regions whose trainers you may meet, in the order they open.
export const roadRegions = (level) =>
  Object.keys(REGION_NAME).map(Number).filter((g) => POOL.has(g) && GEN_UNLOCK[g] <= level);

/* MAY THIS ONE BE FOUGHT? Today's, in a region your level has opened, not
   yet beaten today (`road`: the save's `{ day, won }`). */
export function roadOpen(id, level, road, day = dayKey()) {
  const t = roadTrainer(id);
  if (!t || id.split(":")[1] !== day || !roadRegions(level).includes(t.gen)) return false;
  return !(road?.day === day && road.won?.includes(id));
}
