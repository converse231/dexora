/* ROAD TRAINERS (docs/battles.md, *Road trainers*): battles off the League,
   fought for money. They are filed BY REGION, as DelugeRPG files its trainers
   (2026-10-16, asked for: by map, nobody could tell a generation's trainers
   were all there): every region your level has opened (`GEN_UNLOCK`) fields
   its whole ROSTER - every class its games have - with new teams every day: a
   hash of the day, the region and the slot, so every copy of the game agrees
   and a reload cannot reroll one.

   Browser-free and light: it reads the species list, never the League's data,
   so the engine can judge a road battle. The page builds the fighters from
   `party` with battle.js's `opponent()`, the same builder a gym uses, which
   puts each Pokemon at the stage its level reaches. */
import { SPECIES, isForm } from "../data/dex.js";
import { GEN_UNLOCK, REGION_NAME, genOf } from "./biomes.js";
import { dayKey, hash } from "./daily.js";

// What a win pays: the ace level x ROAD_YEN x (1 + team / 3), once a trainer a
// day. 7, then 15 (2026-10-16, with the League's prizes), then 20 the same
// day (asked for: "bump up the price a bit too"), then 16 (2026-10-17, your
// call, with the Master Ball doubled: 175 trainers a day paid ~¥300,000).
export const ROAD_YEN = 16;

/* The rungs: team size, level over the region's own (its arrival level), and
   the AI. */
const RUNG = {
  R: { rung: "Rookie", size: 2, over: 3, ai: 1 },
  G: { rung: "Regular", size: 3, over: 10, ai: 1 },
  A: { rung: "Ace", size: 4, over: 25, ai: 2 },
  V: { rung: "Veteran", size: 6, band: [60, 100], ai: 2 },
};
/* EVERY CLASS A REGION'S GAMES FIELD (2026-10-16, asked for: "put all
   trainers available per gen there"), one trainer each, a day at a time -
   each region's gym trainer classes from leagues.js plus its route classes,
   wherever the League ships the portrait (public/trainers/). `Class/pic/rung`,
   comma-separated;
   a slot is an index here, so a roster only ever grows at its END. */
const ROSTER = {
  1: "Youngster/youngster/R, Lass/lass/R, Bug Catcher/bugcatcher/R, Camper/camper/R, Picnicker/picnicker/R, Swimmer/swimmer/G, Sailor/sailor/G, Fisherman/fisherman/G, Hiker/hiker/G, Engineer/engineer-gen3/G, Juggler/juggler/G, Super Nerd/supernerd/G, Burglar/burglar/G, Gentleman/gentleman/G, Beauty/beauty/G, Channeler/channeler-gen3/A, Psychic/psychic/A, Tamer/tamer-gen3/A, Black Belt/blackbelt/A, Cooltrainer/acetrainer/A, Cooltrainer/acetrainerf/A, Veteran/veteran/V",
  2: "Youngster/youngster/R, Lass/lass/R, Bug Catcher/bugcatcher/R, Twins/twins/R, Schoolboy/schoolkid/R, Bird Keeper/birdkeeper/G, Hiker/hiker/G, Fisherman/fisherman/G, Sailor/sailor/G, Skier/skier/G, Boarder/boarder/G, Medium/medium/G, Beauty/beauty/G, Gentleman/gentleman/G, Psychic/psychic/A, Black Belt/blackbelt/A, Ace Trainer/acetrainer/A, Ace Trainer/acetrainerf/A, Veteran/veteran/V",
  3: "Youngster/youngster/R, Lass/lass/R, Tuber/tuber/R, Tuber/tuberf/R, Bug Maniac/bugmaniac-gen3/R, Camper/camper/R, Picnicker/picnicker/R, Hiker/hiker/G, Sailor/sailor/G, Fisherman/fisherman/G, Guitarist/guitarist/G, Kindler/kindler-gen3/G, Bird Keeper/birdkeeper/G, Battle Girl/battlegirl/G, Lady/lady/G, Pokéfan/pokefanf/G, Beauty/beauty/G, Gentleman/gentleman/G, Hex Maniac/hexmaniac-gen3/A, Psychic/psychic/A, Psychic/psychicf/A, Black Belt/blackbelt/A, Cooltrainer/acetrainer/A, Cooltrainer/acetrainerf/A, Veteran/veteran/V",
  4: "Youngster/youngster/R, Lass/lass/R, Tuber/tuber/R, Tuber/tuberf/R, School Kid/schoolkid/R, School Kid/schoolkidf/R, Poké Kid/pokekid/R, Camper/camper/G, Picnicker/picnicker/G, Hiker/hiker/G, Fisherman/fisherman/G, Sailor/sailor/G, Worker/worker/G, Guitarist/guitarist/G, Aroma Lady/aromalady/G, Black Belt/blackbelt/A, Psychic/psychic/A, Psychic/psychicf/A, Ace Trainer/acetrainer/A, Ace Trainer/acetrainerf/A, Veteran/veteran/V, Veteran/veteranf/V",
  5: "Youngster/youngster/R, Lass/lass/R, School Kid/schoolkid/R, School Kid/schoolkidf/R, Roughneck/roughneck/G, Guitarist/guitarist/G, Harlequin/harlequin/G, Rich Boy/richboy/G, Lady/lady/G, Beauty/beauty/G, Worker/worker/G, Pilot/pilot/G, Hiker/hiker/G, Fisherman/fisherman/G, Psychic/psychic/A, Black Belt/blackbelt/A, Battle Girl/battlegirl/A, Ace Trainer/acetrainer/A, Ace Trainer/acetrainerf/A, Veteran/veteran/V, Veteran/veteranf/V",
  6: "Youngster/youngster/R, Lass/lass/R, Schoolboy/schoolkid/R, Roller Skater/rollerskater/R, Roller Skater/rollerskaterf/R, Hiker/hiker/G, Poké Fan/pokefanf/G, Furisode Girl/furisodegirl-pink/G, Fisherman/fisherman/G, Swimmer/swimmer/G, Rising Star/risingstar/A, Rising Star/risingstarf/A, Pokémon Ranger/pokemonranger/A, Pokémon Ranger/pokemonrangerf/A, Hex Maniac/hexmaniac-gen6/A, Psychic/psychic/A, Ace Trainer/acetrainer/A, Ace Trainer/acetrainerf/A, Veteran/veteran/V",
  7: "Youngster/youngster/R, Lass/lass/R, Tuber/tuber/R, Tuber/tuberf/R, Swimmer/swimmer/G, Hiker/hiker/G, Fisherman/fisherman/G, Sailor/sailor/G, Worker/worker/G, Rich Boy/richboy/G, Lady/lady/G, Gentleman/gentleman/G, Black Belt/blackbelt/A, Psychic/psychicf/A, Pokémon Ranger/pokemonranger/A, Ace Trainer/acetrainer/A, Ace Trainer/acetrainerf/A, Veteran/veteran/V, Veteran/veteranf/V",
  8: "Youngster/youngster/R, School Kid/schoolkid/R, School Kid/schoolkidf/R, Hiker/hiker/G, Worker/worker/G, Fisherman/fisherman/G, Swimmer/swimmer/G, Gentleman/gentleman/G, Lady/lady/G, Black Belt/blackbelt/A, Psychic/psychic/A, Gym Trainer/acetrainer/A, Gym Trainer/acetrainerf/A, Veteran/veteran/V",
  9: "Youngster/youngster/R, Lass/lass/R, School Kid/schoolkid/R, School Kid/schoolkidf/R, Hiker/hiker/G, Worker/worker/G, Fisherman/fisherman/G, Pokémon Ranger/pokemonranger/G, Black Belt/blackbelt/A, Psychic/psychicf/A, Ace Trainer/acetrainer/A, Ace Trainer/acetrainerf/A, Veteran/veteran/V, Veteran/veteranf/V",
};
const SLOTS = Object.fromEntries(Object.entries(ROSTER).map(([g, s]) =>
  [g, s.split(", ").map((x) => { const [cls, pic, r] = x.split("/"); return { ...RUNG[r], cls, pic }; })]));
// How many a region fields: its whole roster.
export const rosterSize = (gen) => SLOTS[gen]?.length ?? 0;

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
  const R = SLOTS[gen]?.[slot];
  const pool = POOL.get(gen);
  if (!R || !pool?.length || !REGION_NAME[gen] || !/^\d{8}$/.test(day) || String(gen) !== g) return null;
  const r = rng(hash(id));
  const top = R.band ? R.band[0] + Math.floor(r() * (R.band[1] - R.band[0] + 1)) : Math.min(100, GEN_UNLOCK[gen] + R.over);
  const party = Array.from({ length: R.size }, (_, k) => {
    // The ace leads at `top`; the rest a few levels under it.
    const lv = Math.max(2, top - (k === R.size - 1 ? 0 : 1 + Math.floor(r() * 4)));
    return [pool[Math.floor(r() * pool.length)], lv];
  });
  const { cls, pic } = R;
  return {
    // `road` marks it for the page's helpers (tuneOf): a road trainer has no League row.
    road: true, id, gen, region: REGION_NAME[gen], rung: R.rung, slot, cls, pic, ai: R.ai,
    name: NAMES[Math.floor(r() * NAMES.length)], party, top,
    pay: Math.round(top * ROAD_YEN * (1 + R.size / 3)),
  };
}

// Today's trainers in a region.
export const roadOf = (gen, day = dayKey()) =>
  (SLOTS[gen] ?? []).map((_, k) => roadTrainer(roadId(day, gen, k))).filter(Boolean);

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
