/* ROAD TRAINERS (docs/battles.md, *Road trainers*): battles off the League,
   met on the maps and fought for money. Each map you have opened has
   ROAD_PER_MAP of them, new every day - a hash of the day, the map and the
   slot, so every copy of the game agrees and a reload cannot reroll one.

   Browser-free and light: it reads the map tables, never the League's data,
   so the engine can judge a road battle. The page builds the fighters from
   `party` with battle.js's `opponent()`, the same builder a gym uses. */
import { BIOMES, tableFor, speciesById, areaOpen, isLegendary } from "./biomes.js";
import { dayKey, hash } from "./daily.js";

export const ROAD_PER_MAP = 4;
// What a win pays: the ace level x ROAD_YEN x (1 + team / 3), once a trainer a day.
export const ROAD_YEN = 7;

/* The four rungs a map: team size, level over the map's own (or a fixed
   band, the Veteran's), the AI, and the classes that fight at it - the games'
   own, each with the portrait the League ships (public/trainers/). */
const RUNGS = [
  { rung: "Rookie", size: 2, over: 3, ai: 1, classes: [["Youngster", "youngster"], ["Lass", "lass"], ["Bug Catcher", "bugcatcher"], ["School Kid", "schoolkid"], ["Tuber", "tuber"]] },
  { rung: "Regular", size: 3, over: 10, ai: 1, classes: [["Hiker", "hiker"], ["Camper", "camper"], ["Picnicker", "picnicker"], ["Fisherman", "fisherman"], ["Sailor", "sailor"], ["Swimmer", "swimmer"]] },
  { rung: "Ace", size: 4, over: 25, ai: 2, classes: [["Ace Trainer", "acetrainer"], ["Ace Trainer", "acetrainerf"], ["Black Belt", "blackbelt"], ["Psychic", "psychic"], ["Beauty", "beauty"], ["Gentleman", "gentleman"]] },
  { rung: "Veteran", size: 6, band: [60, 100], ai: 2, classes: [["Veteran", "veteran"], ["Veteran", "veteranf"]] },
];
const NAMES = ["Joey", "Ben", "Kay", "Ana", "Rick", "Mia", "Tom", "Lou", "Ren", "Ivy", "Max", "Sue", "Dan", "Eve", "Kai", "Zoe",
  "Owen", "Lila", "Hugo", "Nina", "Theo", "Rosa", "Finn", "Ada"];

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

export const roadId = (day, areaId, slot) => `road:${day}:${areaId}:${slot}`;
export const isRoad = (id) => typeof id === "string" && id.startsWith("road:");

/* ONE TRAINER, rebuilt from its id: `{ id, areaId, rung, cls, name, pic, ai,
   party: [[species, level]...], top, pay }`, or null for an id that names no
   map or slot. The party is the map's own table (no legendaries, no costumes
   - `isLegendary` and forms are skipped), weighted as the wild ones are. */
export function roadTrainer(id) {
  if (!isRoad(id)) return null;
  const [, day, areaId, s] = id.split(":");
  const slot = Number(s);
  // Not on a one-species map (Tanoby, Unown's): six Unown is not a trainer, it is a typo.
  const biome = BIOMES.find((b) => b.id === areaId && !b.only);
  const R = RUNGS[slot];
  if (!biome || !R || !/^\d{8}$/.test(day)) return null;
  const r = rng(hash(id));
  const top = R.band ? R.band[0] + Math.floor(r() * (R.band[1] - R.band[0] + 1)) : Math.min(100, biome.level + R.over);
  const pool = tableFor(biome, Math.min(100, top))
    .filter(([sp]) => sp < 10000 && !isLegendary(sp) && speciesById(sp));
  const total = pool.reduce((n, [, w]) => n + w, 0);
  const pick = () => {
    let x = r() * total;
    for (const [sp, w] of pool) if ((x -= w) < 0) return sp;
    return pool[0][0];
  };
  const party = Array.from({ length: R.size }, (_, k) => {
    // The ace leads at `top`; the rest a few levels under it.
    const lv = Math.max(2, top - (k === R.size - 1 ? 0 : 1 + Math.floor(r() * 4)));
    return [pick(), lv];
  });
  const [cls, pic] = R.classes[Math.floor(r() * R.classes.length)];
  return {
    // `road` marks it for the page's helpers (tuneOf): a road trainer has no League row.
    road: true, id, areaId, map: biome.name, rung: R.rung, slot, cls, pic, ai: R.ai,
    name: NAMES[Math.floor(r() * NAMES.length)], party, top,
    pay: Math.round(top * ROAD_YEN * (1 + R.size / 3)),
  };
}

// Today's trainers on a map.
export const roadOf = (areaId, day = dayKey()) =>
  Array.from({ length: ROAD_PER_MAP }, (_, k) => roadTrainer(roadId(day, areaId, k))).filter(Boolean);

/* MAY THIS ONE BE FOUGHT? Today's, on a map your level has opened, not yet
   beaten today (`road`: the save's `{ day, won }`). */
export function roadOpen(id, level, road, day = dayKey()) {
  const t = roadTrainer(id);
  if (!t || id.split(":")[1] !== day || !areaOpen(t.areaId, level)) return false;
  return !(road?.day === day && road.won?.includes(id));
}

// The maps whose trainers you may meet, in the order they open.
export const roadMaps = (level) => BIOMES.filter((b) => !b.only && areaOpen(b.id, level)).map((b) => b.id);
