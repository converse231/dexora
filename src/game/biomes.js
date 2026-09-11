import { SPECIES } from "../data/species.js";
import { EVOLUTIONS } from "../data/evolutions.js";

/* The eight areas: what each one is, and what spawns there.

   One biome per map, so there is no position lookup - the map you are standing
   on decides what appears. Geometry comes from mapdata.js (generated);
   everything here is design data.

   Each zone is built from a different FireRed tileset so it reads at a glance —
   ash and red rock means fire, pale blue means ice, concrete and machinery means
   electric. That is the whole point of splitting them up: you should know what
   you are hunting from the ground you are standing on, without a menu.

   There is no map for rares. Fortune is how you hunt them - it reshapes every
   table toward its tail, so hunting rares is a thing you build a trainer to do
   rather than a place you walk to.

   Nothing is locked. The ball economy paces you instead: a Lapras needs roughly
   four Ultra Balls to land, so at 300 yen and a pocket of Poke Balls you can
   walk into Frost Hollow freely and simply not be able to farm it yet. That is
   a gate that never says no - it says not yet, and shows you why. Trainer level
   spends itself on the shop instead, unlocking better balls.

   Every walkable tile in an area spawns, the way DelugeRPG does it - there is
   no safe ground to stand on and no special grass to hunt for. That is also why
   the pond works: its water is solid, so its Pokémon are found by walking the
   bank. You fish the shore, because there is no Surf. */

/* Which generation a dex id belongs to - the last national dex number of each.
   Derived from the id rather than stored per species, because it already IS a
   fact about the id and 151 copies of "1" is not data.

   This looks like generality nobody asked for while Gen 1 is all that ships.
   It is the opposite: the badge has to go on now, because a GEN 1 chip on every
   wild Pokemon is the only thing that will make a GEN 2 chip mean anything the
   day one appears. Added late it would just be a label. */
export const GEN_LAST = [151, 251, 386, 493, 649, 721, 809, 905, 1025];

export const genOf = (id) => {
  const i = GEN_LAST.findIndex((last) => id <= last);
  return i < 0 ? GEN_LAST.length : i + 1;
};

/* Legendaries live in no table below. They are added to every one of them.

   They used to sit in the map that matched them - Zapdos in the Power Plant,
   Moltres in Ember Caldera - and the two that matched nothing got a ninth map,
   the Flower Clearing, built to hold them: no commons at all, every encounter
   worth a ball. That map is gone, and this is why. A map whose stated purpose is
   "the rares are here" tells you the other eight are not worth walking, which
   is the opposite of what eight hand-made maps are for.

   So every legendary can turn up anywhere, and its own types decide how often:
   the full share where the biome shares one of them, a fraction of it
   everywhere else. The Power Plant is still the best place to hunt Zapdos and
   is no longer the only one. And this is a rule, not a table - a Gen 2 Suicune
   needs one dex number added here and nothing else. */
export const LEGENDARY = [144, 145, 146, 150, 151];

/* The areas with a roof over them: four caves and a building, against three
   maps of open country. It is a fact about places, so it lives beside them
   rather than in the bag - `items.js` reads it for the Dusk Ball, and if a
   ninth area is added the only question to answer is which of these two lists
   it belongs in.

   Deep Woods is NOT on it. A forest canopy is dim, but the real games boost a
   Dusk Ball in caves and at night, not under trees, and "anywhere shady" would
   make the ball good in six areas out of eight - which is not a condition, it
   is a discount. */
export const ENCLOSED = new Set(["ridge", "power", "ember", "frost", "tower"]);

/* Shiny odds, per encounter. The real games use 1 in 8192, and 1 in 4096 since
   Gen 6; this is deliberately kinder than either. At a 7% encounter rate a full
   run to the level cap is a few thousand encounters, so 1/240 works out at a
   handful of shinies in a whole playthrough - rare enough that each one is a
   story, common enough that they are not a rumour. Do not tune this one alone:
   it is one rung of the ladder below, and they move together. */
export const SHINY_ODDS = 1 / 240;

/* Four rarities above ordinary, and they are not variations on one idea -
   each is a different KIND of rare, which is what lets all four stand together
   instead of being four strengths of the same thing:

     ORIGIN  the ARTWORK   - its Generation I sprite, the 1996 drawing
     SHINY   the PALETTE   - the alternate colours, as everywhere else
     HOLO    the FINISH    - the ordinary art, pressed in foil
     ASTRAL  the SUBSTANCE - not made of paint at all

   ORIGIN is kind on purpose: "this is how it looked originally" is a lovely
   thing to meet often enough to recognise, and it needs no filter to read - a
   Gen 1 sprite beside a Gen 3 one is unmistakable at a glance, where
   `saturate()` is invisible and `hue-rotate()` only makes a green Charizard.

   HOLO is deliberately the same odds as Origin, because it is the same kind of
   pleasure: a familiar picture arriving in a form you recognise from somewhere
   else. It is the only tier whose tell is neither the drawing nor the colours -
   the artwork is untouched and the SURFACE has changed - so it is also the only
   one that can be described to someone who never played a Pokemon game.

   ASTRAL stays rarest because its tell is only a treatment, and a treatment is
   the easiest thing to stop noticing.

   All four are MUTUALLY EXCLUSIVE and rolled rarest-first, so precedence is
   written once. They have to be: there is no shiny Gen 1 sprite (Gen 1 had no
   shinies), so a Pokemon that was two of these would have no picture to draw. */
/* THE SPREAD WAS THE PROBLEM, not the rate.

   These were 1 : 2 : 8 - Astral eight times rarer than Origin - and the whole
   ladder had already been divided by 4/3 once to be kinder. It did not help
   the thing it was meant to, because **the completion rosette needs all four
   variants OF ONE SPECIES**, and a product is governed by its smallest term.
   Measured: at 1/3072 Astral, the chance that any of the 151 species ended a
   10,000-encounter playthrough complete was 0.7%. The rosette, the gold tile
   border and the Dex's "Complete" filter were all decoration for an event
   that would not happen.

   Scaling the whole ladder does not fix that either - to make completion
   reachable at 1:2:8 the base has to come to about 1/64, which is a rare
   every 25 encounters and no longer rare at all. So the RATIO was compressed
   to 1 : 1.5 : 3 and then the base loosened. Astral is still the rarest and
   still visibly so; it is three times rarer than Origin rather than eight.

   Where that lands: any rare at all about 1 in 54 encounters (was 1 in 146),
   and roughly 15 complete species over a 30,000-encounter run. A completionist
   finishes a tenth of the dex; the other 141 are the long game. That is the
   trade this is deliberately making - a FULLY complete 151-species dex is not
   reachable at any odds that leave a rare feeling rare, and no number here
   pretends otherwise. */
export const ASTRAL_ODDS = 1 / 480;
export const ORIGIN_ODDS = 1 / 160;
export const HOLO_ODDS = 1 / 160;

/* THE LADDER, rarest first - and the single source for it.

   This list is the roll's precedence, the Box's choice of which sprite a stack
   wears, the Dex's mark order, the Encounter's badge and the sweep-and-feed
   protection, all reading the same array. It used to be five hand-written
   copies of ["astral", "shiny", "origin"] in five files, which is exactly how a
   fourth tier ends up protected from the sell sweep and not from the feed.
   Adding a fifth means adding a row here and drawing an icon. */
export const TIER_ODDS = [
  ["astral", ASTRAL_ODDS],
  ["shiny", SHINY_ODDS],
  ["holo", HOLO_ODDS],
  ["origin", ORIGIN_ODDS],
];

/* Just the names, rarest first. Kindest-first is `[...TIERS].reverse()`, which
   is what a row of marks reads in - progress towards the rarest. */
export const TIERS = TIER_ODDS.map(([tier]) => tier);

/* WHERE TO GO AND LOOK. The single most useful thing the Dex can say about a
   species you have never met, and it was the one thing it did not say.

   Everything here is read out of the tables that actually roll, so it cannot
   drift from them - a species moved between biomes updates its own entry.

   Legendaries are the exception and have to be, because `legendsFor()` appends
   them to EVERY table by rule: listing their eight areas would be true and
   useless. They get one honest sentence instead.

   A `weight` is the biome table's own, and the share is against that table's
   total - so "Rock Ridge (common)" means common THERE, which is the question
   being asked. Areas are ordered by how likely you are to actually find one. */
export function foundIn(speciesId) {
  if (LEGENDARY.includes(speciesId)) return { legendary: true, areas: [], rods: [] };

  /* At the LEVEL CAP, because the question is "where does this live", not
     "where can I find one this minute". A row that only opens later carries the
     level it opens at, so the sheet can say so rather than quietly promise a
     Venusaur to a Lv 3 trainer. */
  const areas = [];
  for (const b of BIOMES) {
    const full = encounterTable(b, MAX_LEVEL);
    const total = full.reduce((n, [, w]) => n + w, 0);
    const row = full.find(([id]) => id === speciesId);
    if (row) {
      areas.push({
        id: b.id, name: b.name, share: row[1] / total,
        from: row[2] ? evoUnlock(row[2]) : 0,
      });
    }
  }
  areas.sort((a, b) => b.share - a.share);

  const rods = RODS
    .filter((r) => r.table.some(([id]) => id === speciesId))
    .map((r) => r.name);

  return { legendary: false, areas, rods };
}

/* How a share reads out loud. Thresholds rather than a percentage: the exact
   number is noise at this scale, and "one in forty" is a thing nobody can act
   on where "uncommon" is. */
export const howOften = (share) =>
  (share >= 0.12 ? "common" : share >= 0.05 ? "uncommon" : "rare");

/* One roll, one answer. Rolled here rather than at four call sites so the
   precedence - rarest first - cannot be written down four different ways.

   Rarest first is not a style choice. Commonest-first would mean the rarest
   tier is only ever reached by a Pokemon that already failed three other rolls,
   and Astral would effectively never happen.

   Origin and Holo share odds, so between those two this order is only a
   tie-break for the roll - but it is NOT arbitrary, because reversing the list
   is what a tile's row of marks and the Forms strip are both ordered by. With
   Holo last, `[...TIERS].reverse()` puts Origin first, which is the order the
   Forms strip lists them in: the drawing before the finish over it. Ordered the
   other way, the marks under a Dex tile and the strip inside it disagreed, and
   a screenshot is the only thing that would ever have said so. */
export function rollVariant(random = Math.random, locked = null) {
  for (const [tier, odds] of TIER_ODDS) {
    if (locked?.has(tier)) continue;
    if (random() < odds) return tier;
  }
  return null;
}

/* ORIGIN IS EARNED, NOT FOUND.

   The 1996 artwork does not appear in the wild until you have caught every
   ordinary Pokemon of that generation - all 151, for now. It is the one tier
   whose tell is a second set of REAL art rather than a treatment, so it makes
   the better reward: finishing the dex stops being the end of the game and
   becomes the moment a second one opens, on maps you already know, with
   nothing else about them changed.

   Gated per GENERATION rather than globally, because the alternative ages
   badly: add Gen 2 and a player who finished Gen 1 would lose their Origins
   until they had finished Gen 2 as well. `genOf` already derives the
   generation from the dex id, so this needs no data of its own.

   `dex` is the caught/seen byte array; 2 is caught. A generation whose last
   number is past the end of the array is simply not complete, which is the
   right answer for a save from before that generation shipped. */
export function genComplete(dex, gen) {
  const from = gen <= 1 ? 1 : GEN_LAST[gen - 2] + 1;
  for (let id = from; id <= GEN_LAST[gen - 1]; id++) {
    if (dex?.[id - 1] !== 2) return false;
  }
  return true;
}

export const originReady = (dex, speciesId) => genComplete(dex, genOf(speciesId));

/* What `rollVariant` must skip right now. One Set, reused, because this is
   asked once per encounter and allocating a Set per wild Pidgey to say
   "nothing new here" is the sort of thing that adds up. */
const ORIGIN_ONLY = new Set(["origin"]);
export const lockedTiers = (dex, speciesId) =>
  (originReady(dex, speciesId) ? null : ORIGIN_ONLY);

/* Both weights are small on purpose. Five legendaries in every table would
   otherwise make the legendary rate per map five times what one used to be;
   at these numbers each map finds one about once in a hundred encounters,
   which is where Zapdos-in-his-own-plant already sat. */
export const LEGEND_MATCHED = 0.5;
export const LEGEND_STRAY = 0.08;

const legendsFor = (types) =>
  LEGENDARY.map((id) => [
    id,
    SPECIES[id - 1].types.some((t) => types.includes(t))
      ? LEGEND_MATCHED
      : LEGEND_STRAY,
  ]);

/* Types are ids, not a display string. They were "Normal / Flying / Bug" - fine
   to print, impossible to colour - and a type is exactly the kind of thing that
   should always arrive as a badge in its own colour rather than as prose.

   The hand-written half: who lives in each place. Legendaries are absent by
   design - legendsFor() appends them to every table below. */
const RESIDENTS = [
  {
    id: "meadow",
    name: "Tall Grass",
    types: ["normal", "flying", "bug"],
    // [dexId, weight] — Eevee and Chansey near 0.5%, so a find means something.
    // The Flower Clearing's Normal-types came here when it was removed. They
    // arrive at 2, not at the 10-12 they had there: that map had no commons to
    // dilute them and this one is nothing but.
    table: [
      [16, 22], [19, 22], [10, 14], [13, 14], [21, 10], [43, 10], [69, 10],
      [29, 8], [32, 8], [39, 7], [52, 6], [23, 6], [27, 6], [48, 5], [56, 5],
      [84, 4], [58, 3], [63, 3], [128, 2], [132, 2], [83, 2], [108, 2],
      [137, 2], [133, 1], [113, 1], [143, 1],
    ],
  },
  {
    id: "woods",
    name: "Deep Woods",
    types: ["bug", "grass", "poison"],
    table: [
      [10, 16], [13, 16], [11, 9], [14, 9], [46, 10], [48, 10], [23, 8],
      [43, 8], [69, 8], [1, 8], [92, 6], [63, 6], [102, 5], [114, 2],
      [123, 1], [127, 1],
    ],
  },
  {
    id: "pond",
    name: "Pond & Shore",
    /* GRASS, not just water. Half this map is bank: sand, grass and a stand of
       trees, and a lake with nothing living on its shore is a swimming pool.
       It was the only biome whose table was a single type, and it read as one -
       thirteen rows and twelve of them Water.

       The type list is not decoration: `legendsFor()` matches legendaries
       against it, so adding "grass" is a real change. It is a no-op today
       because no Gen 1 legendary is Grass, and it is the right answer the day
       a Celebi exists. */
    types: ["water", "grass"],
    table: [
      [129, 20], [72, 14], [60, 12], [54, 10], [118, 10], [98, 8], [120, 7],
      [116, 6], [90, 5], [79, 5], [7, 8],
      // The bank: what grows where the water stops.
      [43, 8], [69, 7], [46, 6], [102, 4], [114, 2],
      [147, 2], [131, 1],
    ],
  },
  {
    id: "ridge",
    name: "Rock Ridge",
    types: ["rock", "ground", "fighting"],
    table: [
      [74, 20], [41, 16], [50, 10], [66, 10], [27, 9], [95, 7], [104, 6],
      [111, 6], [75, 4], [67, 4], [35, 4], [106, 2], [107, 2],
      [115, 1], [138, 1], [140, 1], [142, 1],
    ],
  },
  {
    id: "power",
    name: "Power Plant",
    types: ["electric"],
    table: [
      [81, 20], [100, 18], [25, 16], [82, 9], [101, 9], [88, 7], [125, 5],
      [26, 3], [135, 2],
    ],
  },
  {
    id: "ember",
    name: "Ember Caldera",
    types: ["fire"],
    table: [
      [37, 18], [58, 18], [77, 14], [4, 10], [126, 8], [109, 8], [78, 6],
      [5, 4], [136, 3], [38, 2], [59, 2],
    ],
  },
  {
    id: "frost",
    name: "Frost Hollow",
    types: ["ice", "water"],
    table: [
      [86, 22], [90, 18], [87, 12], [124, 10], [91, 8], [131, 5],
      [134, 3],
    ],
  },
  {
    id: "tower",
    name: "Haunted Tower",
    types: ["ghost", "psychic"],
    table: [
      [92, 22], [63, 16], [96, 14], [93, 10], [64, 8], [97, 6],
      [105, 5], [94, 3], [122, 2],
    ],
  },
];

export const BIOMES = RESIDENTS.map((b) => ({
  ...b,
  table: [...b.table, ...legendsFor(b.types)],
}));


/* ---------------------------------------------------------------------------
   EVOLVED FORMS IN THE WILD, and why they are derived rather than listed.

   Measured before any of this was written: **41 of the 151 appeared in no
   biome table and on no rod** - every third stage but Dragonite's line, so
   1 of 16 - and the only way to see a Venusaur was to build one out of eight
   Bulbasaurs that themselves turned up 0.86% of the time in one map. The dex
   was reachable, but its tail was reachable only through the Box.

   The fix is a RULE over the evolution graph, not 41 new rows across 8 tables.
   Hand-written rows are exactly what `legendsFor()` exists to avoid: a species
   listed in two places has two different sets of odds in the same map, and
   nothing fails when they disagree. It also means adding a species to a table
   brings its whole line with it, and that Gen 2 costs nothing here.

   **Depth is measured from what the map already spawns**, not from the bottom
   of the line. Ember Caldera lists Charmeleon by hand, so Charizard is one step
   away there while Venusaur is two steps from Deep Woods' Bulbasaur - which is
   the honest reading of "how far is this from something I can already find".

   Three numbers, and the FLOOR is the one doing the kindness. Proportional
   weight alone compounds: Bulbasaur at weight 8 gives Ivysaur 1.6 and Venusaur
   0.32, but Lapras at weight 1 would give its line 0.04, which is not a chance,
   it is a rounding error. So a derived form is a fifth of what it comes from,
   OR the floor, whichever is larger - a rare line's tail is never rarer than a
   common line's tail. That is what makes the hardest species in the game
   findable without making the easy ones trivial. */
const NEXT = new Map();
for (const e of EVOLUTIONS) {
  if (!NEXT.has(e.from)) NEXT.set(e.from, []);
  NEXT.get(e.from).push(e.to);
}

export const EVO_SHARE = 0.2;   // a fifth as common as what it evolves from
export const EVO_FLOOR = 0.3;   // ...but never rarer than this
export const EVO_STEP = 8;      // one more step of a line per this many levels
export const EVO_RAMP = 24;     // and this many levels from first sighting to full
export const EVO_DEPTH = 2;     // no Gen 1 line is longer than this from a base

/* 0 until the level that opens this depth, then a straight ramp to 1.

   A ramp rather than a switch, because a tier that arrives at full strength on
   one level-up is an event that happens once; a tier that thickens for twenty
   levels is the map changing under you. The first step opens at Lv 8 and is at
   full strength by 32; the second opens at 16 and fills by 40. Nothing evolved
   exists below Lv 8 at all - the early game is where you are still learning
   which map is which, and an Ivysaur in it is just a Bulbasaur you cannot use. */
export function evoScale(level, depth) {
  /* `+ 1` so the first sighting happens ON the level the Dex advertises. At
     a plain difference the scale is exactly 0 there and the species is still
     absent, which is the one thing a "from Lv 16" label must not do. */
  return Math.max(0, Math.min(1, (level - EVO_STEP * depth + 1) / EVO_RAMP));
}

export const evoUnlock = (depth) => EVO_STEP * depth;

/* The table an encounter actually rolls on: the biome's own rows, plus every
   evolution of them that the trainer's level has opened.

   A derived row carries its DEPTH as a third element. The roll destructures two
   and ignores it; `foundIn` reads it, so the Dex can say which level a species
   starts appearing at instead of promising one that will not come.

   A species already written into the table keeps its hand-written weight and
   gets no derived row - the `weight.has(to)` guard - but it still seeds the
   next step, so Ember's hand-placed Charmeleon is what Charizard is measured
   against. One weight per species per map, which is the whole invariant. */
export function encounterTable(biome, level = 1) {
  const weight = new Map(biome.table);
  const extra = [];
  let front = biome.table.map(([id]) => id);

  for (let depth = 1; depth <= EVO_DEPTH && front.length; depth++) {
    const scale = evoScale(level, depth);
    const next = [];
    for (const id of front) {
      for (const to of NEXT.get(id) ?? []) {
        if (!weight.has(to)) {
          const w = Math.max(weight.get(id) * EVO_SHARE, EVO_FLOOR);
          weight.set(to, w);
          if (scale > 0) extra.push([to, w * scale, depth]);
        }
        next.push(to);
      }
    }
    front = next;
  }
  return extra.length ? [...biome.table, ...extra] : biome.table;
}

/* Asked on every step that starts an encounter, and the answer only changes on
   a level-up, so the last one is kept. One entry is enough: you are on one map
   at a time. */
let lastKey = null;
let lastTable = null;
export function tableFor(biome, level) {
  const key = `${biome.id}:${level}`;
  if (key !== lastKey) {
    lastKey = key;
    lastTable = encounterTable(biome, level);
  }
  return lastTable;
}

// A biome id is an area id: one map, one biome.
export const biomeFor = (areaId) => BIOMES.find((b) => b.id === areaId) ?? null;

// ---------------------------------------------------------------- trainer level

/* Cumulative XP for each level. Levels no longer gate places - they gate the
   shop and they pay for stat ranks, so this curve decides how soon you can
   afford to hunt rares rather than where you are allowed to walk.

   It used to stop at 30, which is 29 points against what was then 50 ranks of
   capacity - and 29 points fills a stat every eleven levels, so the interesting
   half of the screen was over long before the dex was. Ranks are 20 deep now
   (see trainer.js) and the road is 20 levels longer to pay for them: 49 points
   against 100 ranks, and 25,830 XP to the cap where it was 5,480.

   The first thirty rows are byte-identical to the old table on purpose. A save
   holds raw XP, so changing any of them would silently re-level every trainer
   who already exists. The tail just keeps doing what the tail already did -
   each increment about 7.5% larger than the last, rounded to ten. */
export const LEVEL_XP = [
  0, 30, 70, 120, 180, 250, 330, 420, 520, 630,
  750, 880, 1020, 1170, 1330, 1500, 1680, 1870, 2070, 2280,
  2500, 2740, 3000, 3280, 3580, 3900, 4250, 4630, 5040, 5480,
  5950, 6460, 7010, 7600, 8230, 8910, 9640, 10420, 11260, 12160,
  13130, 14170, 15290, 16490, 17780, 19170, 20660, 22260, 23980, 25830,
];

export const MAX_LEVEL = LEVEL_XP.length;

export function levelFromXp(xp) {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) level = i + 1;
  return level;
}

/* XP to the next level, as a fraction and a pair of numbers, for the HUD bar. */
export function levelProgress(xp) {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0, frac: 1 };
  const base = LEVEL_XP[level - 1];
  const next = LEVEL_XP[level];
  return {
    level,
    into: xp - base,
    need: next - base,
    frac: (xp - base) / (next - base),
  };
}

const TIER_XP = { C: 0, B: 4, A: 12, S: 30 };

// Rarer catches teach you more, and a species you have never caught teaches most.
export const xpForCatch = (species, isNew) =>
  6 + (TIER_XP[species.tier] ?? 0) + (isNew ? 20 : 0);

// ---------------------------------------------------------------- fishing

/* Rods are the only way to reach open water: it is solid, so a Lapras was never
   going to walk up the bank to meet you. Each rod is a table of its own rather
   than a modifier on the shore's, which is what makes upgrading one feel like
   somewhere new rather than the same place with better odds - the Super Rod's
   list is almost entirely second-stage water Pokémon you cannot find any other
   way. Order matters only for readability; the weights do the work. */
export const RODS = [
  {
    id: "old-rod",
    name: "Old Rod",
    // Not every cast finds something, which is most of what makes a rod feel
    // like a rod. A better rod finds more, on top of a better table.
    bite: 0.5,
    // The real Old Rod catches nothing but Magikarp. This is a little kinder.
    table: [[129, 70], [118, 18], [60, 12]],
  },
  {
    id: "good-rod",
    name: "Good Rod",
    bite: 0.65,
    table: [
      [129, 20], [118, 16], [60, 14], [72, 12], [116, 10],
      [98, 9], [90, 7], [54, 6], [86, 4], [79, 2],
    ],
  },
  {
    id: "super-rod",
    name: "Super Rod",
    bite: 0.8,
    table: [
      [119, 14], [61, 12], [73, 11], [99, 10], [117, 9], [121, 8],
      [91, 7], [55, 7], [87, 6], [80, 5], [130, 4], [131, 3], [147, 3], [148, 1],
    ],
  },
];

export const rodTable = (id) => RODS.find((r) => r.id === id)?.table ?? null;
export const rodBite = (id) => RODS.find((r) => r.id === id)?.bite ?? 0;
