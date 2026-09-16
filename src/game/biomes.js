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

   THE WORLD OPENS AS YOU LEVEL, and that reverses a decision this file used to
   argue for. It said nothing was locked and the ball economy paced you instead:
   walk into Frost Hollow at level one and simply fail to afford the throws. The
   argument was that a gate which says "not yet, and here is why" beats one that
   says no.

   It is still a good argument and it lost to a better one. A new player handed
   eight maps at once has no idea which of them is for them, and the honest
   answer - "all of them, but seven will waste your balls" - is something you
   can only act on after you have wasted them. A ladder says the same thing in
   advance. `level` is the last thing a map asks of you and the first thing it
   tells you.

   Tall Grass is open at 1 and the Haunted Tower at 20, with the six between
   spaced across that; `MAP_LAST` is asserted against the real table so the
   number in a design document cannot drift from the number in the game. The
   ball economy still paces you INSIDE a map - this only decides which maps are
   on the menu.

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

/* WHEN A GENERATION SHOWS UP - DERIVED FROM `GEN_LAST`, NOT TABLED.

   A generation ARRIVES rather than being poured in: Gen 1 from the first
   minute, one more every `GEN_STEP` levels after `GEN_FIRST`. It reuses
   `encounterTable`'s existing level argument, so it is a filter rather than a
   mechanism - and it turns "we added 200 Pokemon" from a dilution into an
   event.

   THE LEVELS CAME DOWN, AND THE OLD ARGUMENT FOR THEM WAS HALF WRONG. They
   were 22/28/35, justified by "every weight in `RESIDENTS` would be quietly
   halved" - which was measured before `balance()` existed and is no longer what
   happens. Measured now, in Tall Grass, from Lv 1 to Lv 50: the C band moves
   78.2% -> 71.8% and the S band 3.2% -> 3.3%. `BAND_SHAPE` and `balance()`
   hold the rarity mix almost exactly, which is their whole job, so the dilution
   the old levels were defending against is already defended.

   WHAT ACTUALLY DILUTES IS ONE SPECIES' FINDABILITY, and that is the number to
   watch when this moves: Pidgey, the weight-22 anchor of the starting table,
   goes 12.4% of encounters at Lv 1 to 5.4% at Lv 50. That is the real cost of a
   generation and it is the thing a daily quest and a specific hunt both feel.
   It is also why the ladder is spread rather than front-loaded.

   DERIVED SO THE REST OF THE NATIONAL DEX IS ALREADY PACED. `GEN_LAST` carries
   all nine generations, so this builds all nine gates: Johto at 10 through
   Paldea at 45, with `MAX_LEVEL` 50 leaving room past the last one. Shipping
   Unova is then a fetch range and nothing here - the alternative is a table
   that has to be remembered on the day, and a generation with no entry in it
   opens from the FIRST minute, which is the one failure mode that dumps 156
   species into a new trainer's first hour. check.mjs asserts the last gate
   still lands below the cap. */
export const GEN_FIRST = 10;   // Johto
export const GEN_STEP = 5;     // and one more every this many levels

export const GEN_UNLOCK = Object.fromEntries(GEN_LAST.map(
  (_, i) => [i + 1, i === 0 ? 1 : GEN_FIRST + (i - 1) * GEN_STEP]));

/* EVERY SHAPE `SPECIES` HAS EVER HAD, newest last.

   A save's `dex` and every per-tier row are keyed on POSITION in `SPECIES`, not
   on the dex id - which is correct, compact, and survives exactly as long as
   nothing is ever inserted in the middle. Hoenn is inserted in the middle.
   Before it, position 251 was Turtwig (387); after it, position 251 is a Hoenn
   species, so a save loaded by position would show every Sinnoh Pokemon you
   have ever caught as a different one.

   The fix cannot be "pad and hope": padding is right when a generation is
   APPENDED and wrong when one is inserted. So every layout the game has
   shipped is recorded here by the ranges it held, and a save whose length
   matches an old one is rebuilt BY ID. Add a generation anywhere but the end
   and add its old layout here, or the next hole is silent. */
export const LAYOUTS = [
  { len: 151, ranges: [[1, 151]] },
  { len: 251, ranges: [[1, 251]] },
  { len: 358, ranges: [[1, 251], [387, 493]] },
];

/* The ids a save of this length was keyed on, in order - or null if we have
   never shipped one that shape, in which case `padDex` is the right answer. */
export function layoutIds(len) {
  if (len === SPECIES.length) return null;          // the current one
  const was = LAYOUTS.find((l) => l.len === len);
  if (!was) return null;
  const out = [];
  for (const [lo, hi] of was.ranges) {
    for (let id = lo; id <= hi; id++) out.push(id);
  }
  return out;
}

/* The regions that actually ship, in dex order, with the count in each - built
   from `SPECIES` rather than listed, so a generation appears in the Dex filter
   on the day it is fetched and a generation that is NOT fetched (Hoenn) never
   shows up as an empty tab. */
export const REGION_NAME = {
  1: "Kanto", 2: "Johto", 3: "Hoenn", 4: "Sinnoh", 5: "Unova",
  6: "Kalos", 7: "Alola", 8: "Galar", 9: "Paldea",
};


export const genOf = (id) => {
  const i = GEN_LAST.findIndex((last) => id <= last);
  return i < 0 ? GEN_LAST.length : i + 1;
};

/* AFTER `genOf`, and that is not tidiness. This is an IIFE - it runs at module
   init - and `genOf` is a `const` declared below it, so placed above it the
   whole module threw "Cannot access 'genOf' before initialization" on import.
   Same temporal dead zone that once blanked the BOX tab. */
export const GENERATIONS = (() => {
  const n = new Map();
  for (const sp of SPECIES) n.set(genOf(sp.id), (n.get(genOf(sp.id)) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gen, count]) => ({
      gen,
      count,
      region: REGION_NAME[gen] ?? `Gen ${gen}`,
      /* "Gen 1 (Kanto)" rather than "Kanto 99". The count was a progress
         reading hiding inside a label - it changed as you played, so the menu
         item you were looking for moved its own name, and the one number a
         player wants (how much of THIS region is done) belongs on the progress
         bar rather than in a dropdown. */
      name: `Gen ${gen} (${REGION_NAME[gen] ?? gen})`,
    }));
})();


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
export const LEGENDARY = [
  144, 145, 146, 150, 151,                               // Kanto
  243, 244, 245, 249, 250, 251,                          // Johto
  377, 378, 379, 380, 381, 382, 383, 384, 385, 386,      // Hoenn
  480, 481, 482, 483, 484, 485, 486, 487, 488, 490, 491, 492, 493,  // Sinnoh
];

/* The areas with a roof over them: four caves and a building, against three
   maps of open country. It is a fact about places, so it lives beside them
   rather than in the bag - `items.js` reads it for the Dusk Ball, and if a
   ninth area is added the only question to answer is which of these two lists
   it belongs in.

   Deep Woods is NOT on it. A forest canopy is dim, but the real games boost a
   Dusk Ball in caves and at night, not under trees, and "anywhere shady" would
   make the ball good in six areas out of eight - which is not a condition, it
   is a discount. */
/* One Set, built once, because the encounter asks per Pokemon and the Dex grid
   asks per cell per render. `LEGENDARY` stays the list - this is the lookup. */
const LEGEND_SET = new Set(LEGENDARY);
export const isLegendary = (id) => LEGEND_SET.has(id);

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
      /* ONE NUMBER FOR "NOT BEFORE THIS LEVEL", whatever is holding it back.

         Two different things can gate a line in this panel: an evolved form
         does not start spawning until `evoUnlock(depth)`, and a MAP does not
         open until `b.level`. They were not the same field, so the sheet
         happily told a Lv 3 trainer that Lapras is common in Frost Hollow and
         said nothing about the door - 117 of the 151 entries named a gated map
         with no level on it.

         They are the same KIND of number from the player's side ("come back at
         Lv N"), so the later of the two is the honest one to print and a second
         line would only be two numbers to reconcile. */
      areas.push({
        id: b.id,
        name: b.name,
        share: row[1] / total,
        /* THREE things can hold a line back now, and they are still one
           number: an evolved form's own unlock, the map's, and the GENERATION's
           - Johto does not appear until 22 and Sinnoh until 35. A Gen 4 entry
           saying "Tall Grass, common" to a Lv 10 trainer is the same hidden
           door the map ladder opened, one layer further out. */
        from: Math.max(
          row[2] ? evoUnlock(row[2]) : 0,
          b.level > MAP_FIRST ? b.level : 0,
          GEN_UNLOCK[genOf(speciesId)] ?? 0,
        ),
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
/* BAD LUCK IS INVISIBLE, and at 1/480 it is also long.

   Nothing about a dry run tells you it is a dry run - the odds are the odds,
   and a player three hundred encounters past their last Astral has no way to
   tell that from a player who met one an hour ago. Pity is the standard answer
   and it is the honest one here: the tiers stay in their order, the ladder
   keeps its shape, and the only thing that changes is that a long enough
   drought ends.

   It is a MULTIPLIER on the whole ladder rather than a bonus to one tier,
   because `TIER_ODDS` is walked rarest-first and boosting one alone would
   re-sort it - the same reason the ratio moves as a unit when the tiers are
   retuned.

   Capped, because a boost that keeps climbing turns a drought into a
   guarantee and then into a farm: park at 3,000 dry encounters and every
   throw is a variant. `PITY_CAP` is the ceiling and 10x is already generous -
   at that point an Astral is 1 in 48. */
export const PITY_AFTER = 300;
export const PITY_RAMP = 100;
export const PITY_CAP = 10;

export const pityBoost = (dry = 0) =>
  Math.min(PITY_CAP, 1 + Math.max(0, dry - PITY_AFTER) / PITY_RAMP);

/* `boost` defaults to 1 so every existing caller - and the 400k-roll test that
   pins each tier's rate - is measuring the unaided odds. */
/* NOTHING BECOMES A CERTAINTY. `boost` and `favour` both multiply, and they
   are meant to: pity for the drought you are in, a honey for the one you are
   hunting. Multiplied together and left alone they would eventually hand you a
   tier on every encounter, and a tier you are guaranteed is not a rare - it is
   the ordinary sprite with extra steps. One clamp covers every combination
   that exists and every one that gets added. It does not bind today: pity
   alone caps at 10x, which is 1/48 on Astral. */
export const LIFT_CEILING = 0.2;

/* `favour` is `{ tier, mult }` and lifts ONE tier - a Shiny Honey - where
   `boost` lifts them all. Two arguments rather than one table of multipliers
   because the two have different lifetimes and different owners: `boost` is
   the game apologising for a drought, `favour` is something you bought.
   Multiplied, so a Shiny Honey during a drought is worth both. */
export function rollVariant(
  random = Math.random, locked = null, boost = 1, favour = null,
) {
  for (const [tier, odds] of TIER_ODDS) {
    if (locked?.has(tier)) continue;
    const lift = boost * (favour?.tier === tier ? favour.mult : 1);
    if (random() < Math.min(LIFT_CEILING, odds * lift)) return tier;
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
/* OVER THE SPECIES THAT SHIP, not over a numeric range.

   This walked `GEN_LAST[gen-2]+1 .. GEN_LAST[gen-1]` and indexed `dex[id-1]`,
   and both halves broke the day the dex stopped being 1..151 contiguous. Gen 4
   spans 387-493 while the array has 358 entries and no Gen 3 in it at all, so
   the range walk read past the end and every Sinnoh Origin would have been
   locked forever behind species that do not exist.

   `SPECIES` is the list of what ships and `dex` is indexed by POSITION in it -
   that is the only relationship that survives a hole. */
export function genComplete(dex, gen) {
  for (let i = 0; i < SPECIES.length; i++) {
    if (genOf(SPECIES[i].id) === gen && dex?.[i] !== 2) return false;
  }
  return true;
}

export const originReady = (dex, speciesId) => genComplete(dex, genOf(speciesId));

/* ORIGIN NEEDS AN OLDER DRAWING TO EXIST, and for a third of the dex there
   isn't one.

   The tier's tell is the ARTWORK: the drawing from before anyone had drawn the
   creature a second time. That works because our ordinary sprite is a later
   drawing than its debut one - Kanto and Johto ship FireRed/LeafGreen art
   (Gen III) over a Gen I or Gen II debut, and the gap between them is the
   whole point. Measured across every sprite in the build: a Kanto or Johto
   Origin drops from a median of 13 colours to 4, which IS the Game Boy and
   Game Boy Color palette and is exactly what reads as ancient.

   Sinnoh does not have that gap. Its ordinary sprite is HeartGold/SoulSilver
   and its debut is Diamond/Pearl - both Gen IV, both the same era - and the
   same measurement gives 13 colours against 14. Not older. Not even fewer. It
   was reported from play as "the Gen 4 Origins look the same as the normal
   ones", which was exactly right.

   So the rule is derived rather than listed: a species can wear Origin only if
   it DEBUTED in an older generation than the one its ordinary art comes from.
   `ART_GEN` is the one place that says where that art comes from, and it has
   to agree with `artFor()` in tools/fetch-species.mjs - check.mjs asserts the
   two against each other, because a base-art change that forgot this would
   silently hand out Origins that are the same picture.

   It settles Hoenn in advance, too: Ruby/Sapphire and FireRed/LeafGreen are
   both Gen III, so a Hoenn species gets no Origin either. That is the right
   answer for the same reason, and nothing has to be edited on the day. */
export const ART_GEN = [[386, 3], [Infinity, 4]];
export const baseArtGen = (id) => ART_GEN.find(([hi]) => id <= hi)[1];
export const hasOrigin = (id) => genOf(id) < baseArtGen(id);

/* The tiers a species can ever wear. The Dex's completion rosette and the
   sheet's FORMS strip both read it, so a species that cannot have an Origin is
   not asked for one twice in two different ways - and the rosette stays
   reachable for every species rather than becoming impossible for 107 of them
   the moment Sinnoh lost the tier. */
export const tiersFor = (id) =>
  (hasOrigin(id) ? TIERS : TIERS.filter((t) => t !== "origin"));

/* What `rollVariant` must skip right now. One Set, reused, because this is
   asked once per encounter and allocating a Set per wild Pidgey to say
   "nothing new here" is the sort of thing that adds up. */
const ORIGIN_ONLY = new Set(["origin"]);
export const lockedTiers = (dex, speciesId) =>
  (hasOrigin(speciesId) && originReady(dex, speciesId) ? null : ORIGIN_ONLY);

/* A FIXED SHARE OF THE TABLE, not a fixed weight - and that is the whole
   anti-dilution answer, arrived at the hard way.

   These were absolute weights, 0.5 matched and 0.03 stray, which works
   perfectly for a fixed number of legendaries in a fixed-size table and for
   nothing else. Going from 5 legendaries to 24, in tables that roughly tripled,
   would have multiplied the legendary rate per map by about five - so the
   rarest thing in the game would have become commonplace by the arithmetic of
   adding content, which is exactly the failure a growing dex is supposed to
   avoid.

   `LEGEND_SHARE` is the answer: legendaries are 1% of whatever the table turns
   out to be, split among themselves by whether the biome matches their types.
   Add a generation, a legendary or a map and the rate a player experiences does
   not move, by construction rather than by re-tuning. check.mjs asserts it
   holds across every map and every level.

   The RATIO between a matched and a stray legendary is what is tuned here now;
   the overall rate is a property of the design, not of the table.

   BUT A FIXED TOTAL SHARE IS THE WRONG CONSTANT, and it fails the other way.
   One percent split among all of them means each one's odds fall linearly as
   the roster grows: measured in Tall Grass at Lv 50, a named legendary is 1 in
   3,400 encounters at 34 of them and would be 1 in 9,000 at the ~90 a full
   National Dex carries. At `ENCOUNTER_RATE` 0.07 that is 128,000 steps to find
   one particular legendary, against a 50,000-step playthrough - so "hunt where
   it lives", which is the whole point of `legendTier`, stops being possible.

   That is the same dilution this comment is about, one level down: the fix for
   the TOTAL was to make it a share, and the fix for EACH ONE is to make the
   share follow the roster. `LEGEND_EACH` is what a single legendary is worth,
   so meeting a named one does not get rarer because an unrelated generation
   shipped. `LEGEND_CEIL` is what stops the other failure - at 90 legendaries an
   uncapped per-head share is 2.7% of every table, and a world where one
   encounter in 37 is legendary has no legendaries in it. Under the ceiling,
   hunting is preserved exactly; over it, everything scales down together and
   the RATIO still holds. */
export const LEGEND_EACH = 0.0003;   // ~1% across today's 34, and it stays put
export const LEGEND_CEIL = 0.025;    // the world must not fill with them
export const LEGEND_SHARE = 0.01;    // what it comes to today; read, never set
export const LEGEND_MATCHED = 0.5;
/* A STRAY IS MEANT TO BE A STORY, and at 0.08 it was merely uncommon.

   Reported from play as a bug: "why is Articuno showing up in Ember Caldera?"
   It is not a bug - it is this rule, and the rule earns its keep, because it
   is the same one that means no map is the map you HAVE to grind. But an ice
   bird in a volcano is the worst pairing the game can produce, and four stray
   legendaries at 0.08 apiece came to one in every 290 encounters in Ember:
   often enough to read as a mistake rather than as a miracle.

   At 0.03 a given stray is about one in 3,000 and the whole stray pool about
   one in 800, while a MATCHED legendary is untouched. That widens the gap
   between hunting where it lives and hunting anywhere from 6x to 17x, which is
   the signal the rule was always supposed to send. */
export const LEGEND_STRAY = 0.03;

/* A HOME IS THE PRIMARY TYPE, and matching on any type was not enough.

   Articuno is Ice/Flying, and the starting map is Normal/Flying - so it was
   exactly as likely in Tall Grass as in Frost Hollow, which is the opposite of
   the thing "hunt where it lives" is supposed to mean. Same for Zapdos and
   Moltres: all three birds shared a type with the map you start on, so none of
   them had a home at all.

   A Pokemon's FIRST type is its primary one, which is a fact already in the
   data and needs no per-species table. Three tiers now: the map that shares the
   primary type is the home, a map that shares only a later one is a haunt, and
   everywhere else is a stray. Articuno is 0.5 in Frost Hollow, 0.15 in Tall
   Grass and 0.03 elsewhere - so the ice bird lives in the ice cave and can
   still turn up anywhere, which is what this rule was always for. */
export const LEGEND_HOME = 0.5;
export const LEGEND_HAUNT = 0.15;

/* What one legendary is worth in one place. Exported because it is the RULE,
   and the rule is the only thing worth asserting: a legendary's share of a
   finished table is confounded twice over - by how big that map's table is,
   and by how many other legendaries call the same map home. Celebi looked
   commoner in Deep Woods than in its own Haunted Tower on both of those
   measures, and was correctly weighted the whole time. */
export const legendTier = (speciesId, types) => {
  const mine = speciesById(speciesId)?.types ?? [];
  if (mine.length && types.includes(mine[0])) return LEGEND_HOME;
  return mine.some((t) => types.includes(t)) ? LEGEND_HAUNT : LEGEND_STRAY;
};

/* A DEX ID IS NOT AN ARRAY INDEX, and the whole codebase assumed it was.

   `speciesById(id)` and `dex[id - 1]` are correct for exactly one shape of
   dex: 1..N with nothing missing. Gen 3 does not ship, so ids run 1-251 and
   then 387-493 while the array holds 358 entries - `SPECIES[486]` is undefined
   and `dex[486]` is off the end of a 358-byte row. Every catch, every dex mark
   and every variant byte for a Sinnoh species was writing into nowhere.

   Two lookups, built once:
     `speciesById(id)`  - the species, by its national number
     `dexIndex(id)`     - its POSITION, which is what every per-species byte
                          array is keyed on: dex, and one row per rare tier

   Both are Maps rather than `findIndex`, because `medalsFor` and the Dex grid
   ask per species per render. This is the single thing that makes a dex with a
   hole in it work, and it is why the hole exists: nothing else would have
   proved these were needed. */
const byId = new Map(SPECIES.map((sp) => [sp.id, sp]));
const byIndex = new Map(SPECIES.map((sp, i) => [sp.id, i]));
export const speciesById = (id) => byId.get(id) ?? null;
export const dexIndex = (id) => byIndex.get(id) ?? -1;

/* Scaled so the legendaries together come to `LEGEND_SHARE` of the FINAL table
   - hence `total / (1 - share)`, which is the weight that makes a share of the
   whole rather than a share of the rest. */
const legendsFor = (types, total, open = () => true) => {
  const live = LEGENDARY.filter(open);
  if (!live.length || total <= 0) return [];
  const raw = live.map((id) => legendTier(id, types));
  const sum = raw.reduce((n, w) => n + w, 0);
  /* PER HEAD, then capped - see LEGEND_EACH. Only the legendaries OPEN at this
     level count, so a generation that has not arrived cannot dilute the ones
     that have. */
  const share = Math.min(LEGEND_CEIL, LEGEND_EACH * live.length);
  const budget = (total * share) / (1 - share);
  return live.map((id, i) => [id, (budget * raw[i]) / sum]);
};

/* Types are ids, not a display string. They were "Normal / Flying / Bug" - fine
   to print, impossible to colour - and a type is exactly the kind of thing that
   should always arrive as a badge in its own colour rather than as prose.

   The hand-written half: who lives in each place. Legendaries are absent by
   design - legendsFor() appends them to every table below. */
const RESIDENTS = [
  {
    id: "meadow",
    level: 1,  // where you start, so it cannot be anything else
    name: "Tall Grass",
    types: ["normal", "flying", "bug", "fairy"],
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
    level: 3,  // the second map, and early enough that the ladder is visible
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
    level: 6,  // arrives with the Old Rod's reach and the Great Ball
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
    level: 9,
    name: "Rock Ridge",
    types: ["rock", "ground", "fighting", "steel", "dragon"],
    table: [
      [74, 20], [41, 16], [50, 10], [66, 10], [27, 9], [95, 7], [104, 6],
      [111, 6], [75, 4], [67, 4], [35, 4], [106, 2], [107, 2],
      [115, 1], [138, 1], [140, 1], [142, 1],
    ],
  },
  {
    id: "power",
    level: 12,  // the Ultra Ball's level: the first map worth one
    name: "Power Plant",
    types: ["electric", "steel"],
    table: [
      [81, 20], [100, 18], [25, 16], [82, 9], [101, 9], [88, 7], [125, 5],
      [26, 3], [135, 2],
    ],
  },
  {
    id: "ember",
    level: 15,
    name: "Ember Caldera",
    types: ["fire"],
    table: [
      [37, 18], [58, 18], [77, 14], [4, 10], [126, 8], [109, 8], [78, 6],
      [5, 4], [136, 3], [38, 2], [59, 2],
    ],
  },
  {
    id: "frost",
    level: 18,  // Lapras and Articuno - the map the old design let you waste a whole bag on
    name: "Frost Hollow",
    types: ["ice", "water"],
    table: [
      [86, 22], [90, 18], [87, 12], [124, 10], [91, 8], [131, 5],
      [134, 3],
    ],
  },
  {
    id: "tower",
    level: 20,  // MAP_LAST. The tower is the end of the ladder
    name: "Haunted Tower",
    types: ["ghost", "psychic", "dark"],
    table: [
      [92, 22], [63, 16], [96, 14], [93, 10], [64, 8], [97, 6],
      [105, 5], [94, 3], [122, 2],
    ],
  },
];

/* The last map's level, and the shape of the ladder. Asserted against the table
   rather than trusted: a level typed into one row and a number quoted in a
   design document are two places for the same fact. */
export const MAP_FIRST = 1;
export const MAP_LAST = 20;

/* WHERE EVERYTHING ELSE LIVES, decided by a rule rather than by hand.

   The eight Gen 1 tables above are measured and stay exactly as they are. The
   207 species that arrived with Johto and Sinnoh get homes from their TYPES:
   each one goes to the single biome it overlaps most, ties broken by the order
   the maps are listed in, and anything that matches nothing lands in Tall Grass
   - which is what a meadow is for.

   ONE home each, unlike the Gen 1 species that appear in two or three. A table
   you can read is worth more than a perfectly distributed one, and 207 species
   sprayed across eight maps would put roughly everything roughly everywhere.

   Only species with no shipped PRE-EVOLUTION need a home; the rest are reached
   by evolving, which is what `candyValue` and the feed were always for. That
   rule also quietly handles the hole in the middle of the dex: Roserade evolves
   from a Gen 3 Roselia that does not ship, so nothing evolves into it, so it
   needs a table entry - and it gets one without anybody noticing the gap.

   Weights come from the tier already on every species, and they sit BELOW the
   Gen 1 commons on purpose: a Pidgey at 22 still leads its map after Johto
   arrives. */
const DERIVED_WEIGHT = { C: 8, B: 5, A: 3, S: 1 };

const derivedHomes = () => {
  const placed = new Set(RESIDENTS.flatMap((b) => b.table.map(([id]) => id)));
  const evolvesInto = new Set(EVOLUTIONS.map((e) => e.to));
  const homes = new Map(RESIDENTS.map((b) => [b.id, []]));

  for (const sp of SPECIES) {
    if (placed.has(sp.id) || evolvesInto.has(sp.id) || LEGENDARY.includes(sp.id)) continue;
    let best = RESIDENTS[0], score = -1;
    for (const b of RESIDENTS) {
      const n = sp.types.filter((t) => b.types.includes(t)).length;
      if (n > score) { score = n; best = b; }
    }
    homes.get(best.id).push([sp.id, DERIVED_WEIGHT[sp.tier] ?? 4]);
  }
  return homes;
};

const HOMES = derivedHomes();

/* `table` is RESIDENTS ONLY now - the hand-written Gen 1 rows plus the derived
   ones. The legendaries are no longer baked in, because their weight depends on
   how big the table turns out to be AFTER the level filter, and a level is not
   known here. `encounterTable` adds them.

   Anything reading `BIOMES[i].table` therefore sees who LIVES here, which is
   what `medals.js` wanted from it all along. */
export const BIOMES = RESIDENTS.map((b) => ({
  ...b,
  table: [...b.table, ...(HOMES.get(b.id) ?? [])],
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

/* RE-PRICED once a wild evolved form stopped being a free sprite and started
   being a free EVOLUTION. `bornLevel` below hands one out at the level it would
   have had to be raised to, so a wild Venusaur is a Lv 32 Venusaur - roughly
   forty duplicates of work, met in one encounter. That is a treasure, and a
   treasure that turns up a fifth as often as its own base form is not one.

   Cut from 0.2/0.3, and the second step pushed from Lv 16 to Lv 20: finding one
   should be the story of a session, not the way the dex gets filled. The
   evolution feed stays the reliable path, which is the point - a lottery you can
   opt out of beats a lottery you depend on. */
const EVO_SHARE = 0.12;  // an eighth as common as what it evolves from
export const EVO_FLOOR = 0.2;   // ...but never rarer than this
export const EVO_STEP = 10;     // one more step of a line per this many levels
const EVO_RAMP = 24;     // and this many levels from first sighting to full
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

/* The level a species cannot be below.

   Wild levels were `2 + rand(6)` for everything, which was harmless while a
   level was decoration and absurd the moment evolved forms started spawning:
   a **Lv 3 Venusaur**, a creature that by its own dex entry cannot exist below
   32. It reads as a bug because it is one, and it gets worse rather than better
   the day levels do anything - a wild Venusaur below its own evolution level
   would be a Venusaur you could not have made and could not explain.

   Read off the evolution row that PRODUCES this species, so it is the real
   number from PokeAPI and not a second table to keep in step. 0 for anything
   that evolves from nothing, which is every base form. */
const BORN_AT = new Map();
/* Two passes, because a stone or trade row carries NO level - PokeAPI has none
   to give - and skipping them left a wild Alakazam at Lv 3 beside a wild
   Venusaur at 32, which is the same absurdity wearing a different hat. About
   twenty species evolve that way.

   So an evolution with no level of its own inherits its PARENT'S, plus a step.
   Kadabra evolves at 16, so an Alakazam is at least 17. Derived from the chain
   rather than from a hand-written table of synthetic levels - which is the
   thing to build only if a stone evolution ever needs to COST something
   level-shaped, and is not needed merely to stop one reading as a bug.

   Ordered: the chain has to be walked parent-first, so the loop repeats until
   nothing changes. Four passes at most for Gen 1; it is 151 rows once. */
for (let again = true; again; ) {
  again = false;
  for (const e of EVOLUTIONS) {
    const at = e.level || (BORN_AT.get(e.from) ?? 0) + 1;
    if (at > (BORN_AT.get(e.to) ?? 0)) { BORN_AT.set(e.to, at); again = true; }
  }
}
export const bornLevel = (speciesId) => BORN_AT.get(speciesId) ?? 0;

/* A MAP'S OWN LEVEL BAND, derived from where it sits on the ladder.

   Every wild Pokemon in the game was Lv 2-7, everywhere, so Frost Hollow
   CONTAINED later species without ever FEELING like a later map - the thing
   you actually meet there arrived at the same level as the first Pidgey of the
   game. The map ladder already says how far along a map is (`BIOMES[i].level`,
   1 to 20), so the band is read off that rather than hand-typed per biome:
   add a map and it gets a band the day it gets a gate.

   `WILD_SPAN` stays constant across the ladder on purpose. Widening the band
   in later maps would make a late map a lottery on TOP of being late, and the
   thing that is supposed to vary there is which species turns up - that is
   `encounterTable`'s job and it is already doing it.

   THE FLOOR IS STILL `bornLevel`, and it still wins. A wild Venusaur is a Lv 32
   Venusaur wherever you meet it, because that is the level it would have had to
   be raised to; the band can only ever lift a Pokemon above its own floor, not
   push one below it. The `+ 2` on that floor is why an evolved form is not
   pinned to exactly its own threshold. */
export const WILD_SPAN = 6;

/* HALF A LEVEL OF BAND PER LEVEL OF GATE, and the half is measured rather than
   chosen. A wild level is not only flavour: evolving costs `evoLevel - level`
   in candy, so raising the band lowers the price of every evolution bought
   with what you catch there.

   At a FULL step the ladder ran 2-7 to 21-26 and the late maps handed out free
   evolutions 45-50% of the time - which guts the candy sink in exactly the
   maps a player spends the most time in, and is the same failure as a flat
   candy yield seen from the other side: one map becomes strictly best and the
   rest are scenery. Measured across every biome table:

     step  Tall Grass        Haunted Tower     free evolutions
     1.0   2-7               21-26             3% ... 45%
     0.6   2-7               13-18             3% ... 15%
     0.5   2-7               12-17             3% ... 10%
     0.4   2-7               10-15             3% ... 0%

   0.5 is where a late map still plainly FEELS late - the last map's wild
   Pokemon are twice the level of the first's - while the free-evolution rate
   stays at or under the 7% Deep Woods already had and nobody objected to.
   check.mjs pins that ceiling, because the failure is invisible: every number
   stays monotone and the economy simply stops mattering. */
export const WILD_STEP = 0.5;

export function wildBand(biome) {
  const lo = 2 + Math.round(
    Math.max(0, (biome?.level ?? MAP_FIRST) - MAP_FIRST) * WILD_STEP);
  return [lo, lo + WILD_SPAN - 1];
}

/* What this individual is, rolled once and then remembered.

   `species.js` has carried `height` and `weight` since the first fetch and
   nothing has ever read them. This is what reads them: a scale on the species'
   own numbers, so two Rattata are 0.28m and 0.39m rather than both being "a
   Rattata", and the dex's own figures finally mean something.

   STORED AS A SMALL INTEGER (percent), because it goes in every box entry and
   a float per Pokemon is bytes in a save for no gain at this precision.

   A save written before sizes existed has none, so `sizeOf` falls back to a
   hash of the uid: stable forever, costs nothing, and means an old collection
   is not a collection of identical creatures. The uid is the only thing about
   an old entry that is both unique and permanent. */
export const SIZE_MIN = 75;
export const SIZE_MAX = 125;

export const rollSize = (random = Math.random) => {
  /* Triangular, not flat: the average Rattata should be an average Rattata,
     and a flat roll makes "unusually large" as common as "ordinary", which is
     what turns a tell into wallpaper. Two rolls averaged is the cheapest
     triangular distribution there is. */
  const t = (random() + random()) / 2;
  return Math.round(SIZE_MIN + t * (SIZE_MAX - SIZE_MIN));
};

export function sizeOf(mon) {
  if (mon?.size) return mon.size;
  // Fowler/Noll/Vo over the uid: any stable spread will do, and this one is
  // three lines and has no state.
  let h = 2166136261;
  for (const ch of String(mon?.uid ?? 0)) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return SIZE_MIN + ((h >>> 0) % (SIZE_MAX - SIZE_MIN + 1));
}

/* The bands worth naming, and only the ends of the range get a word. A tag on
   every Pokemon is a tag nobody reads; a tag on one in eight is a thing you
   notice. `null` is the ordinary case and most of them are. */
export const sizeTag = (size) =>
  (size >= 118 ? "XL" : size <= 82 ? "XS" : null);

/* This individual's real numbers, in the units a person reads. PokeAPI stores
   height in decimetres and weight in hectograms, which is why nothing has ever
   printed them raw.

   WEIGHT SCALES WITH THE CUBE of the linear size, because that is what volume
   does - a Pokemon 25% longer is nearly twice the animal, and halving that to
   make the number look tamer would be printing a measurement that is wrong. */
export function measured(sp, size) {
  const k = size / 100;
  return { m: (sp.height / 10) * k, kg: (sp.weight / 10) * k ** 3 };
}

/* The table an encounter actually rolls on: the biome's own rows, plus every
   evolution of them that the trainer's level has opened.

   A derived row carries its DEPTH as a third element. The roll destructures two
   and ignores it; `foundIn` reads it, so the Dex can say which level a species
   starts appearing at instead of promising one that will not come.

   A species already written into the table keeps its hand-written weight and
   gets no derived row - the `weight.has(to)` guard - but it still seeds the
   next step, so Ember's hand-placed Charmeleon is what Charizard is measured
   against. One weight per species per map, which is the whole invariant. */
/* BAND BUDGETS: a map's rarity mix is a property of the map.

   Measured before this existed, and the drift was the opposite of the one that
   was expected. Adding Johto and Sinnoh did not thin the rares out - it
   TRIPLED them. Tall Grass went from 5.1% A-tier at Lv 1 to 15.4% at Lv 50,
   because the newcomers arrive on a flat tier-derived weight while the Gen 1
   commons that hold a route together are hand-tuned up at 22. So the gentlest
   map in the game quietly became a third rare, by arithmetic nobody chose -
   the same class of failure as the legendary share, one band up.

   The fix is the same shape and the reason it is per-map matters: a single
   global band mix would flatten Tall Grass (78/13/5) and the Haunted Tower
   (18/51/30) into the same map, and that difference IS the design. So each
   biome's mix is frozen from its OWN hand-written table - the one that was
   measured and argued over - and everything added afterwards redistributes
   inside a band rather than resizing it. A newcomer competes with its own
   rarity class for a share that was already spoken for.

   `BAND_FLOOR` is what keeps that from being a trap: Rock Ridge has no S-tier
   resident at all, so its frozen S share is zero, and a Sinnoh S-tier landing
   there would inherit a zero weight and be unreachable. A band with members in
   it is never worth less than this. */
export const BAND_FLOOR = 0.015;

/* A row's band. A DERIVED evolution carries its parent's band in slot 3 and
   that is load-bearing, not bookkeeping: the overlay's entire model is "an
   evolution is a fifth as common as what it comes from", and banding by its own
   tier breaks that the moment the two differ. Tangela is B and Tangrowth is A,
   so rescaling them separately made the evolution commoner than the thing it
   evolves from - you would meet more Tangrowth than Tangela in Deep Woods.
   Inside one band the scale is uniform, so `parent x EVO_SHARE` survives it
   exactly. */
const bandOf = (row) => {
  const id = Array.isArray(row) ? row[0] : row;
  if (LEGENDARY.includes(id)) return "L";
  if (Array.isArray(row) && row[3]) return row[3];
  return speciesById(id)?.tier ?? "C";
};

/* The shape of a biome's ORIGINAL table, as a share per band. Computed from
   `RESIDENTS` - the hand-written rows only - because the derived homes are
   exactly what must not be allowed to move it. */
const BAND_SHAPE = new Map(RESIDENTS.map((b) => {
  const total = b.table.reduce((n, [, w]) => n + w, 0);
  const shape = {};
  for (const [id, w] of b.table) {
    shape[bandOf(id)] = (shape[bandOf(id)] ?? 0) + w / total;
  }
  return [b.id, shape];
}));

/* Rescale so each band holds the share the map was tuned to give it.

   Uniform within a band, so nothing about the designer's ordering inside a
   rarity class is touched - a weight-22 Pidgey still leads the commons. Only
   the boundaries between classes are held still. */
function balance(rows, shape) {
  if (!rows.length) return rows;
  const bands = new Map();
  for (const r of rows) {
    const k = bandOf(r);
    if (!bands.has(k)) bands.set(k, []);
    bands.get(k).push(r);
  }
  let budget = 0;
  const want = new Map();
  for (const k of bands.keys()) {
    const share = Math.max(shape[k] ?? 0, BAND_FLOOR);
    want.set(k, share);
    budget += share;
  }
  const total = rows.reduce((n, r) => n + r[1], 0);
  const out = [];
  for (const [k, members] of bands) {
    const have = members.reduce((n, r) => n + r[1], 0);
    const scale = ((want.get(k) / budget) * total) / have;
    for (const r of members) out.push([r[0], r[1] * scale, r[2], r[3]]);
  }
  return out;
}

/* Has this species' generation arrived yet? */
export const genOpen = (id, level) => level >= (GEN_UNLOCK[genOf(id)] ?? 1);

export function encounterTable(biome, level = 1) {
  const open = biome.table.filter(([id]) => genOpen(id, level));
  const weight = new Map(open);
  const extra = [];
  /* `[id, band]`, not just the id: the band has to travel the WHOLE chain.
     Carrying it one step only fixed Tangela -> Tangrowth and left
     Mareep -> Flaaffy -> Ampharos broken, because the third link read
     Flaaffy's own tier instead of the band Flaaffy had inherited. */
  let front = open.map((r) => [r[0], bandOf(r)]);

  for (let depth = 1; depth <= EVO_DEPTH && front.length; depth++) {
    const scale = evoScale(level, depth);
    const next = [];
    for (const [id, band] of front) {
      for (const to of NEXT.get(id) ?? []) {
        const known = weight.has(to);
        // An evolution cannot outrun its own generation either.
        if (!known && genOpen(to, level)) {
          const w = Math.max(weight.get(id) * EVO_SHARE, EVO_FLOOR);
          weight.set(to, w);
          // Slot 3 is the band it competes in: its PARENT's, so `balance`
          // cannot separate an evolution from what it evolves from.
          if (scale > 0) extra.push([to, w * scale, depth, band]);
        }
        // A hand-written row keeps its own band, and passes THAT on.
        next.push([to, known ? bandOf(to) : band]);
      }
    }
    front = next;
  }
  /* Residents, then the evolved overlay, and the legendaries LAST - scaled to
     whatever the first two came to, so their share of the roll is the same on
     every map at every level whatever else has been added. */
  const rolled = balance(extra.length ? [...open, ...extra] : open,
                         BAND_SHAPE.get(biome.id) ?? {});
  const total = rolled.reduce((n, e) => n + e[1], 0);
  return [...rolled, ...legendsFor(biome.types, total, (id) => genOpen(id, level))];
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

/* Can you walk here yet? One function, so the engine's refusal and the Travel
   panel's padlock cannot disagree - a menu that offers a map the engine will
   not travel to is worse than no menu. */
const areaLevel = (areaId) => biomeFor(areaId)?.level ?? MAP_FIRST;
export const areaOpen = (areaId, level) => level >= areaLevel(areaId);

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
