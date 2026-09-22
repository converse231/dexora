import { SPECIES, isForm } from "../data/dex.js";
import { SHOWDOWN_IDS } from "../data/showdown.js";
import { EVOLUTIONS } from "../data/evolutions.js";
/* One-way: `catch.js` imports nothing, so this cannot cycle. `items.js` is the
   file that must NOT be reached from here - it already imports
   `ENCOUNTER_RATE` from this one. */
import { catchChance, NEVER_HOPELESS, PLAIN_MULT } from "../catch.js";

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
  /* 493 was the whole National Dex to Arceus, before Unova through Paldea and
     the Mega/Gigantamax forms appended onto the end. Recorded for completeness
     rather than need: everything since has been APPENDED, so no position moved
     and `padDex` is the correct answer - `layoutIds` returns null for it and
     tools/play drives a real 493-entry save through `loadState` to prove it. It
     is here so that if a generation is ever inserted BEFORE the end again, this
     shape is already written down. */
  { len: 493, ranges: [[1, 493]] },
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


/* A FORM HAS NO GENERATION. Its id is in the 10000s, so a plain `findIndex`
   falls off the end and reports the LAST generation - which would file every
   Mega under Paldea in the region filter and gate them on Paldea's arrival
   level. They belong to the species they evolve from, which is what `of` on the
   form says, so `genOf` reads through to it.

   EXCEPT A WILD ONE, WHICH CARRIES ITS OWN, and that exception is load-bearing
   rather than pedantic. Reading through costs a Mega nothing: it is never in
   an encounter table, so no generation budget ever counts it. A wild form IS
   in one - and **all 18 Alolan forms and all 13 costume Pikachu have Gen 1
   bases**, so reading through would drop 31 new rows into the generation this
   file spends two hundred lines stopping from dominating. Their own `gen` is
   the generation they were INTRODUCED in (Alolan 7, Galarian and Hisuian 8,
   Paldean 9, the Pikachu 6-8), which puts them where they are thin, gates them
   on that generation's arrival level, and is what canon says besides. A late
   find, rather than a starting one. */
/* A MAP, BECAUSE THIS IS ASKED PER DEX CELL PER RENDER. `SPECIES.find` is a
   linear scan of 1,215 entries and `genOf` runs it for every form - measured,
   24,300 calls took 35ms against 2ms for the same count through `speciesById`,
   and the Dex grid alone is 1,215 cells. `speciesById` cannot be used here:
   it is declared six hundred lines below and this is called at module init by
   `GENERATIONS`, which is the temporal dead zone this file already records
   blanking the BOX tab. So it is its own Map over the 190 forms - the only
   ids that ever reach the scan. */
const FORM_GEN = new Map(
  SPECIES.filter((sp) => isForm(sp.id)).map((sp) => [sp.id, sp]));

export const genOf = (id) => {
  const form = isForm(id) ? FORM_GEN.get(id) : null;
  if (form?.gen) return form.gen;
  const of = form?.of ?? id;
  const i = GEN_LAST.findIndex((last) => of <= last);
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
   is no longer the only one.

   DERIVED FROM THE SPECIES DATA, NOT LISTED. This was 34 hand-written dex
   numbers under a comment promising "a Gen 2 Suicune needs one dex number added
   here and nothing else" - which is true, and is exactly why it failed: five
   generations arrived at once and none of their sixty legendaries were added,
   so every Unova and Paldea legendary spawned at an ordinary S-tier weight
   instead of the legendary share. A list that needs one edit per generation
   gets that edit skipped eventually.

   `fetch-species` now records the flag PokeAPI already knows. Mythicals count
   with them, because this game draws no distinction and a Mew that is not rare
   is not a Mew.

   A form you EVOLVE INTO is excluded: a Mega is never wild, so it can have no
   spawn weight to scale, and counting one would dilute the real legendaries'
   per-head share for nothing. **A form you MEET is not excluded**, and the
   three that qualify are the reason this sentence had to be split - Galarian
   Articuno, Zapdos and Moltres are legendary birds, and at ids in the 10000s
   they were legendary to nothing: `derivedHomes` homed all three on type and
   the Safari Zone spawned a legendary bird at an ordinary band-A weight.
   `legendTier` never saw them, so "hunt where it lives" did not apply either.

   It moves the roster 94 -> 97, which changes no odds: `LEGEND_EACH x 97` is
   2.91% against a `LEGEND_CEIL` of 2.5%, so the pool was already saturated and
   stays there. */
export const LEGENDARY = SPECIES
  .filter((sp) => sp.legendary && (!isForm(sp.id) || sp.wild))
  .map((sp) => sp.id);

/* THE COSTUME PIKACHU ARE APPENDED LIKE LEGENDARIES, AND THAT IS THE WHOLE
   FIX FOR THREE SEPARATE PROBLEMS.

   Asked for as *"make it rarer, maybe level it to legendary spawn rate"*, and
   the honest way to get there is not another weight - it is to stop them being
   residents at all. As derived homes they were unfixable by weight: thirteen
   Electric Pikachu all home to the one Electric map, and `fitShares` equalises
   GENERATIONS, so three thin generations got a slice each however small the
   number was (12% of the Power Plant at 0.15, 18% at 2 - a 13x range moving
   almost nothing).

   `legendsFor` already solves exactly this shape: a thing that is hunted
   rather than lived-with, appended AFTER the fit, scaled to a share of the
   FINAL table so it reads the same on every map at every level. Costumes go
   through the same door, and three things fall out at once:

     - THE RATE IS EXACT. `LEGEND_EACH` per head is what one legendary is
       worth, so a costume is worth one legendary - which is the ask, stated
       as a rule rather than as a number. Thirteen of them come to 0.39%.
     - THE FIT STOPS SEEING THEM. That is what killed the slot-4 attempt: the
       five Cosplay Pikachu WERE the Power Plant's Gen 6 presence, so anything
       that moved their weight left the map's Gen 6 starved. Out of the
       residents entirely, `GEN_HOME_MIN` fills Gen 6 with a real Gen 6
       species instead, which is what it is for.
     - THE RATE IS THE SAME EVERYWHERE, which is worth stating because it is
       NOT what a legendary does. `legendTier` weights by type, and all
       thirteen of these are Electric, so they all draw the same tier on any
       given map and the total lands at 0.38% whether you are in the Power
       Plant or the meadow. "Hunt where it lives" needs a roster with more than
       one type in it; this one cannot have it. Measured, not assumed - a first
       draft of this note claimed the homing applied.

   The band budgets never see them either, which is correct and worth saying
   out loud: a costume is not part of the map's rarity mix any more than
   Mewtwo is. */
const COSTUMES = SPECIES.filter((sp) => sp.form === "costume").map((sp) => sp.id);

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

export const ENCLOSED = new Set(["ridge", "power", "ember", "frost", "tower",
                                 "mansion"]);

/* Shiny odds, per encounter. The real games use 1 in 8192, and 1 in 4096 since
   Gen 6; this is deliberately kinder than either. At a 7% encounter rate a full
   run to the level cap is a few thousand encounters, so 1/240 works out at a
   handful of shinies in a whole playthrough - rare enough that each one is a
   story, common enough that they are not a rumour. Do not tune this one alone:
   it is one rung of the ladder below, and they move together. */
export const SHINY_ODDS = 1 / 195;

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
export const ASTRAL_ODDS = 1 / 180;
export const ORIGIN_ODDS = 1 / 122;
export const HOLO_ODDS = 1 / 122;

/* FOUR MORE, AND THE LADDER GOT KINDER RATHER THAN LONGER.

   Adding tiers to a fixed spread makes the collection HARDER, because the
   completion rosette waits on the rarest of them and a longer list can only
   raise that maximum. Measured, 4,000 runs on the starting map's anchor
   species: four tiers wanting all four is 8,905 encounters; eight tiers
   wanting all eight is 18,039. Twice as long, for twice as many things.

   So the spread opens at the BOTTOM. Holo and Origin come down 160 -> 140 and
   the three new cheap ones sit under them, which takes the whole variant rate
   from 1 in 53 encounters to 1 in 25 - a variant is now a thing that happens
   on an ordinary walk rather than a thing you hear about.

   AND THE ROSETTE CHANGES WITH IT - see `ROSETTE_NEED`. Kinder odds alone do
   not fix it; that was measured too. */

/* AND THEN IT FLATTENED, BECAUSE EIGHT KINDS ARE NOT EIGHT STRENGTHS.

   The spread was 3.81x - Vivid 1/105 up to Showdown 1/400 - and the thing that
   made it indefensible is written three paragraphs above this one: these are
   eight different KINDS of rare, which is the whole argument for letting them
   stand together. A ladder that long quietly re-states them as eight strengths
   of one idea, and it is paid for at the far end, where the tell is the best:
   Showdown MOVES and Shiny is a second set of real art.

   Where it bit hardest was a legendary in a tier, because those are two
   independent rolls multiplied. Measured in Tall Grass at Lv 50: a legendary
   in Showdown was 1 in 16,000 encounters - 228,000 steps, four playthroughs -
   and a NAMED one at home was 1 in 317,000. Reported as wanting this kinder.

   The spread is 2.0x now (105 -> 210) and every rung above Noir came down.
   Vivid holds at 105 because check.mjs requires the kindest tier stay rarer
   than 1 in 100, and that bound is the whole thing stopping "kinder" from
   becoming "commonplace" - so the ladder compresses UP into it rather than
   sliding under it, which is the same lever this file already names: move the
   RATIO, not the base.

   What it buys: any variant 1 in 21 -> 1 in 18, any legendary in a named tier
   roughly twice as often, and the rosette shortens with it because the rosette
   waits on the rarest tier a species can wear. The ordering survives - Shiny
   and Showdown are still the two trophies, still the two with real artwork
   behind them - it is just no longer four times the wait. */
export const VIVID_ODDS = 1 / 105;
export const NOIR_ODDS = 1 / 115;
export const GLITCH_ODDS = 1 / 150;
export const SHOWDOWN_ODDS = 1 / 210;

/* THE LADDER, rarest first - and the single source for it.

   This list is the roll's precedence, the Box's choice of which sprite a stack
   wears, the Dex's mark order, the Encounter's badge and the sweep-and-feed
   protection, all reading the same array. It used to be five hand-written
   copies of ["astral", "shiny", "origin"] in five files, which is exactly how a
   fourth tier ends up protected from the sell sweep and not from the feed.
   Adding a fifth means adding a row here and drawing an icon. */
export const TIER_ODDS = [
  ["showdown", SHOWDOWN_ODDS],
  ["shiny", SHINY_ODDS],
  ["astral", ASTRAL_ODDS],
  ["glitched", GLITCH_ODDS],
  ["holo", HOLO_ODDS],
  ["origin", ORIGIN_ODDS],
  ["noir", NOIR_ODDS],
  ["vivid", VIVID_ODDS],
];

/* HOW MANY OF THEM THE ROSETTE WANTS, and it is no longer "all of them".

   At four tiers "every variant of one species" was 8,905 encounters, or about
   two and a half playthroughs - hard, and reachable. At eight it is 18,039,
   which is not a harder mark, it is a deleted one: nobody finishes it and the
   tile stops meaning anything.

   ANY FOUR of whatever a species can wear is 2,374, measured on the same
   runs - comfortably inside one playthrough, and it keeps the shape of the
   original idea (you have to go wide, not just get lucky once). Four rather
   than five because four is what the mark has always meant. */
export const ROSETTE_NEED = 4;

/* Just the names, rarest first. Kindest-first is `[...TIERS].reverse()`, which
   is what a row of marks reads in - progress towards the rarest. */
export const TIERS = TIER_ODDS.map(([tier]) => tier);

/* WHAT EACH TIER IS, IN A PHRASE - the TELL, never the odds. Beside `TIERS`
   because it is the same list and there is no second place a tier's name and
   a tier's description should have to be kept in step.

   It was two tables. The Dex sheet had all eight and the catch banner had
   four, written when there were four, so meeting a 1-in-400 Showdown raised a
   banner headed POKEDEX - the fallback, on the rarest thing in the game.
   Neither failed, because a missing key in either is a sentence nobody
   notices is absent.

   Never the odds, either: two of these used to read "ONE IN A THOUSAND" and
   "ONE IN FOUR THOUSAND", and both were wrong the day the ladder was divided
   by 4/3 - in the one place the game reads a rare tier out loud. A phrase
   describing what the thing IS cannot go stale when a constant moves. */
export const TIER_TELL = {
  origin: "the 1996 artwork",
  holo: "pressed in foil",
  shiny: "the alternate palette",
  astral: "made of starlight",
  glitched: "corrupted data",
  vivid: "the colours turned up",
  noir: "no colour at all",
  showdown: "it moves",
};

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

/* A COLOURED JAR IS BAIT, SO IT HAS TO DAMP WHAT IT IS NOT BAITING.

   Reported from play: a Glitched Honey run turned up a Holo, a Vivid and one
   glitched. Measured over 40,000 runs, that was not bad luck - a coloured jar
   handed you 3.05 of its own tier and 1.96 of everything else, so **only 61%
   of what you met was the thing you paid for**. `favour` lifted its tier and
   left the rest at full odds, and the rest is SEVEN tiers: their combined odds
   beat any single one of them, so the jar could never be more than a
   plurality.

   Damping the others by `FAVOUR_DAMP` takes it to about 86%, which is what
   "the one you are hunting" has to mean for the price to be honest. It is the
   SAME lever pointed the other way rather than a new mechanism - a multiplier
   on odds inside this one function, which is where every other reshaping of
   the ladder already happens.

   The plain Honey is untouched and damps nothing: lifting the whole ladder at
   once IS its identity, and it is the jar for when you are not hunting
   anything in particular. */
export const FAVOUR_DAMP = 0.25;

/* HOW OFTEN THE WORLD STOPS YOU. It lived in engine.js, which is the wrong
   file for it twice over: it is a property of the world rather than of the
   frame loop, and `items.js` needs it to price a honey - and cannot import the
   engine, because the rule modules are browser-free and the engine is not. */
export const ENCOUNTER_RATE = 0.07;

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
    /* Three multipliers, and they are three different things: `boost` is the
       drought, `favour.mult` is the jar you bought, and the damp is what that
       jar is NOT baiting for. A plain honey has no `tier`, so it never damps. */
    const bait = favour?.tier
      ? (favour.tier === tier ? favour.mult : FAVOUR_DAMP)
      : 1;
    if (random() < Math.min(LIFT_CEILING, odds * boost * bait)) return tier;
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
/* A ROW PER GENERATION, because the catch-all cannot be wrong loudly. Mirrors
   `artFor` in fetch-species.mjs, which check.mjs asserts against this: FireRed
   art to the end of Hoenn, HeartGold for Sinnoh, Black/White for Unova, and
   PokeAPI's default render from Kalos on - which for those is the only art
   there has ever been, so each is drawn in its own generation and none of them
   can wear Origin. */
export const ART_GEN = [
  [386, 3], [493, 4], [649, 5], [721, 6], [809, 7], [905, 8], [Infinity, 9],
];
export const baseArtGen = (id) => ART_GEN.find(([hi]) => id <= hi)[1];

/* A FORM NEVER WEARS ORIGIN. `genOf` reads a form through to the species it
   evolves from, so a Mega Charizard would otherwise answer "Gen 1" against
   art from Gen 4 and qualify - and there is no 1996 drawing of a Mega
   Charizard, because Mega Evolution was invented in 2013. The tier's tell is
   an OLDER drawing; a form has exactly one. */
export const hasOrigin = (id) => !isForm(id) && genOf(id) < baseArtGen(id);

/* SHOWDOWN IS A SECOND FILE TOO, and PokeAPI has no animation for a Mega. The
   same shape as `hasOrigin`: a tier a species has no artwork for is a tier it
   can never wear, which is a fact about the art rather than about the player. */
/* WHICH SPECIES SHIP ONE, read off what `build_showdown.py` actually wrote.
   This was `!isForm(id)`, which is an assumption about PokeAPI's coverage
   rather than a fact - and a species with no strip would have rolled a tier
   whose picture does not exist. */
export const hasShowdown = (id) => SHOWDOWN_IDS.has(id);

/* THE ORIGIN GATE IS GONE, and what is left is only the art check.

   Origin used to be locked until every ordinary Pokemon of its generation was
   CAUGHT - `genComplete`, `originReady`, a whole mechanism. It made the
   kindest-looking tier the hardest thing in the game and it made the one tier
   nobody could plan for: you could not hunt an Origin, you could only finish a
   generation and be handed them. Deleted, with the two functions that served
   it. Origin is now what every other tier is - a roll.

   What survives is the half that was never a gate: a species with no older
   drawing cannot wear Origin, and a form with no Showdown animation cannot
   wear Showdown, because the file is not there. No `dex` argument any more,
   which is the deletion stated in the signature.

   THE FOUR ANSWERS ARE MEMOISED. This is asked once per encounter and the
   result is one of four constant Sets, so allocating one per wild Pidgey to
   say "nothing missing here" is the sort of thing that adds up. */
const NO_ORIGIN = new Set(["origin"]);
const NO_SHOWDOWN = new Set(["showdown"]);
const NEITHER = new Set(["origin", "showdown"]);

export function lockedTiers(speciesId) {
  const og = hasOrigin(speciesId);
  const sd = hasShowdown(speciesId);
  if (og && sd) return null;
  if (!og && !sd) return NEITHER;
  return og ? NO_SHOWDOWN : NO_ORIGIN;
}

/* The tiers a species can ever wear, DERIVED FROM THE SAME ANSWER the roll
   uses. Two lists would be two opinions about what a species can hold, and
   this file already records what that costs: a panel that says READY over a
   thing it cannot assemble. The rosette and the FORMS strip both read this. */
export const tiersFor = (id) => {
  const off = lockedTiers(id);
  return off ? TIERS.filter((t) => !off.has(t)) : TIERS;
};

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
/* WHAT A ROSTER IS WORTH: per head, capped. Split out because TWO families are
   appended now and the share of each has to be known before either is scaled -
   see `rareFor`. */
const rareShare = (roster, open) => {
  const live = roster.filter(open);
  return live.length ? Math.min(LEGEND_CEIL, LEGEND_EACH * live.length) : 0;
};

/* Same scaling as the legendaries always had, same per-head worth, over a
   different roster - so if `LEGEND_EACH` is ever retuned a costume moves with
   it, which is what "as rare as a legendary" has to mean to survive a retune.

   `taken` IS THE SUM OF EVERY APPENDED SHARE, NOT JUST THIS ONE, and getting
   that wrong is how this shipped broken for one commit. The budget that makes
   a share of the WHOLE is `total * share / (1 - share)` - correct while the
   legendaries were the only thing appended. Append a second family against the
   same `total` and each lands in a table the other has since made bigger, so
   BOTH come out under their own rule: the per-head assertion caught the
   legendaries at 1.620% against the 1.625% they are owed, on a bound tight
   enough to see it. One denominator for both. */
const rareFor = (roster, types, total, open, taken) => {
  const live = roster.filter(open);
  if (!live.length || total <= 0) return [];
  const raw = live.map((id) => legendTier(id, types));
  const sum = raw.reduce((n, w) => n + w, 0);
  /* PER HEAD, then capped - see LEGEND_EACH. Only the legendaries OPEN at this
     level count, so a generation that has not arrived cannot dilute the ones
     that have. */
  const share = rareShare(roster, open);
  const budget = (total * share) / (1 - taken);
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
    name: "Mt. Moon",
    /* THE TABLE NEEDED NOTHING WHEN THE MAP WAS REPLACED, which is worth a
       line: Rock Ridge was composed against the `cave` tileset and stocked
       with what lives in one, so Zubat, Geodude, Clefairy and Onix were
       already the cast of the place it was standing in for. The id is the
       slot's historical handle - see build_map.py's AREAS. */
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
    /* GROUND IS HERE FOR HEADROOM, and the narrow list was the whole cause.
       Ember passed the generation bound at exactly **25%** - the only map in
       the game with none to spare, so any unrelated change tipped it, and this
       pass changes rosters elsewhere.

       It was the one SINGLE-TYPE map, and that is not a coincidence:
       `derivedHomes` filters candidates on shared type, so a one-type list is
       the narrowest pool in the game and the fewest generations can reach it.
       The generations that do get there then concentrate. This file already
       records the symptom without the cause - "the two that moved most are the
       maps with the narrowest type lists".

       A resident was tried first and is the wrong lever: Camerupt is Gen 3 and
       band B, exactly the hole, and it took the generation spread 25% -> 2%
       and pushed the BAND budget to 2.7pp against a 2.5 bound. The two
       constraints conflict when the fix is a single row. Widening the list
       satisfies both - 25% -> 17% with the band drift unmoved at 2.15pp -
       because it feeds the map through the mechanism that was starving it
       rather than around it.

       And ground is the honest second type for a volcano rather than a lever
       picked to pass: Camerupt, Numel and Magcargo are what a caldera holds,
       Groudon is the legendary that belongs in one, and the map still measures
       **68% fire**. */
    types: ["fire", "ground"],
    table: [
      [37, 18], [58, 18], [77, 14], [4, 10], [126, 8], [109, 8], [78, 6],
      [5, 4], [136, 3], [38, 2], [59, 2],
    ],
  },
  {
    id: "cinder",
    level: 16,  // between the volcano and the ice, a rung of its own
    name: "Cinderpeak",
    /* THE ROSTER IS THE REAL MOUNTAIN'S, and it is what makes this map not a
       second Ember Caldera despite sharing a tileset: Ember is Fire all the
       way down, and Route 112 is a mountainside with ash on it - Machop and
       Geodude and Zubat live here too, and the Fire types are the ones nearer
       the summit. Four types rather than Ember's one is the difference. */
    types: ["fire", "rock", "ground", "fighting"],
    table: [
      [322, 20], [66, 16], [41, 15], [218, 14], [74, 12], [27, 10], [50, 9],
      [109, 8], [325, 8], [324, 6], [240, 5], [111, 5], [95, 4], [219, 4],
      [323, 3], [75, 3], [67, 3], [42, 3], [228, 2], [126, 2], [231, 2],
      [246, 1],
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
    id: "mansion",
    level: 19,  // a rung of its own between the ice and the tower
    name: "Pokemon Mansion",
    /* POISON IS THE POINT, and it is the one type only Deep Woods had - there
       as a bug-and-grass footnote rather than as a map's identity. Cinnabar's
       burnt-out house is where the sludge lives, and that is what makes a
       fourth late map worth walking rather than a bigger Frost Hollow.

       THREE TYPES AND NOT FOUR. Psychic was the tempting one - this is the
       building Mewtwo was made in, and the diary on B1F is the whole reason
       anybody remembers the place - but `types` is not flavour: `legendsFor`
       reads it to decide whose HOME a map is, and claiming psychic would hand
       Mewtwo a second home on the strength of a story rather than a roster.
       Nothing psychic lives here. The Tower keeps him. */
    types: ["poison", "fire", "normal"],
    /* THE FIRST TABLE IN THE GAME WITH A RESIDENT FROM OUTSIDE KANTO, and it
       had to be. The Mansion's own roster is Koffing, Grimer, Rattata,
       Raticate, Muk, Weezing, Ditto and Magmar - Kanto to a species, like
       every other hand-written row here - and written that way it measured
       **Gen 1 at 63% against a fair 25%**, six times any other map's skew.

       The cause is not the weights, and a sweep proved it: pushing them about
       took 152% off-fair down to 106% and no further. `balance` pins each
       rarity band to the share these rows freeze, so a band the hand-written
       rows DOMINATE is a band Kanto owns outright - and this map's B band was
       58% of the table, five Kanto species in it against four from everywhere
       else. Measured at Lv 24: Kanto held 99% of B. The Power Plant gets away
       with a B band of 64% because only 34% of it is Kanto.

       So the lever is a resident that is NOT Kanto, in that band - and one is
       worth more than any reweighting: Slugma alone took 152% -> 12%. With
       Gulpin and Torkoal beside it the map measures 4% off fair, level with
       the Power Plant and Tall Grass. All three are fire or poison, all three
       belong in a burnt-out house, and all three open (Lv 10 and 15) before
       the Mansion does at 19, so they are there for every level it can be
       walked. Ekans is Kanto and joined for the same shape reason - the C band
       needed weight, and a snake in a ruin costs nothing to believe.

       Ditto is the one to protect: this and Tall Grass are its only homes, and
       check.mjs's gettable sweep is the only thing that would say so. */
    /* AND THREE OF THEM ARE THE LABORATORY, which is what the real roster
       leaves out. This is the building Mewtwo was made in and its own eight
       are rats and sludge; asked for directly as wanting psychic here.

       **The lever is the ROSTER, not `types`** - measured, because `types` was
       the obvious answer and is the wrong one. Adding "psychic" to the list
       takes the map to **38% psychic**, more than the poison that IS its
       identity, and hands Mewtwo a second home besides. Three named specimens
       put psychic in the building at a share chosen rather than derived.

       Porygon is the one that earns its place twice: it is the only Pokemon
       in the dex that was MADE by scientists, and Abra and Solosis are the
       psychic either side of it - Solosis is Gen 5 and band C, so it pays the
       generation spread back at the same time. All three are hand-written
       elsewhere already, so none of them moves `derivedHomes`. */
    table: [
      [109, 19], [88, 13], [316, 13], [19, 12], [577, 10], [324, 9], [110, 8],
      [89, 7], [218, 7], [20, 7], [605, 7], [126, 6], [23, 6], [63, 6],
      [137, 5], [132, 4], [58, 2], [37, 2],
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
  {
    id: "safari",
    level: 20,  // MAP_LAST, alongside the tower - the two ends of the game
    name: "Safari Zone",
    /* THE BROADEST TABLE IN THE GAME, because the map is: 120x80 and 4,161
       walkable tiles, more than any other area by 40%, with grass, sand, cliff
       tops, ponds and a river all inside one fence. A reserve is the one place
       a roster this mixed is not a contradiction.

       **THE TYPE LIST IS SEVEN AND NOT EIGHTEEN, AND THAT IS DELIBERATE.**
       `types` is not decoration here - `legendsFor` reads it to decide whose
       HOME a map is, and "hunt where it lives" is the whole point of
       `legendTier`. A map listing every type would be every legendary's home
       and would quietly flatten that rule into nothing. Seven is what the real
       Safari Zone actually holds, it is wider than anywhere else in the game,
       and it leaves the Tower its ghosts and Ember its fire. */
    types: ["normal", "grass", "bug", "water", "ground", "flying", "psychic"],
    table: [
      [43, 18], [263, 18], [84, 14], [177, 12], [54, 12], [118, 11], [129, 11],
      [74, 10], [167, 8], [165, 8], [191, 8], [194, 8], [183, 7], [102, 7],
      [44, 6], [85, 6], [203, 6], [55, 5], [119, 5], [111, 5], [231, 5],
      [190, 4], [216, 4], [179, 4], [195, 4], [202, 3], [25, 3],
      [214, 2], [127, 2], [213, 2], [234, 2],
      [241, 1], [113, 1], [115, 1], [128, 1], [123, 1],
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

   Weights come from the tier already on every species. They USED to sit below
   the Gen 1 commons on purpose - "a Pidgey at 22 still leads its map after
   Johto arrives" - and that bought a five-fold generation skew to protect an
   ordering inside one map. `fitShares` keeps the ordering and drops the skew:
   the scale it applies is uniform within a generation, so a Pidgey still leads
   the Gen 1 commons exactly as it did, while the generations themselves come
   out level. These numbers are therefore a RELATIVE rarity within a
   generation now, not a handicap against Gen 1. */
/* WHAT BAND A SPECIES COMPETES IN, and it is one answer because three places
   were asking. `bandOf` is the row-level reader (it also knows about the "L"
   band and about a row carrying its parent's band down an evolution chain);
   this is the species-level fact underneath it, and `derivedHomes` needs it
   too - which is exactly what the first version of the Beldum fix missed. It
   changed `bandOf` alone, the derived rows went on reading `sp.tier` straight,
   and Beldum's share did not move a thousandth of a percent. Measured, which
   is the only reason it was caught. */
const KINDER = { S: "A", A: "B", B: "C", C: "C" };
export const bandFor = (id) => {
  const sp = speciesById(id);
  if (!sp) return "C";
  const own = sp.tier ?? "C";
  /* Already impossible to catch, so not also rare to meet - see the note by
     `bandOf`. Legendaries are exempt there, and they never reach this
     function anyway. */
  /* AT A PLAIN THROW, which is where the floor actually binds - `catchChance`
     clamps `(rate/255) * mult`, so at mult 1 Beldum is 1.18% and clears it,
     and at `PLAIN_MULT` it is 0.94% and does not. The first version of this
     used 1, the predicate was false for every species in the dex, and the rule
     silently did nothing at all. Measured, which is how that was caught. */
  return catchChance(sp.rate, PLAIN_MULT) <= NEVER_HOPELESS
    ? (KINDER[own] ?? own) : own;
};

const DERIVED_WEIGHT = { C: 8, B: 5, A: 3, S: 1 };


/* EVERY GENERATION LIVES IN EVERY MAP, and until this it did not.

   `derivedHomes` sends a species to its single best type match, which is right
   and is what makes a map feel like somewhere - but it starves the narrow ones.
   Measured: the Power Plant (electric/steel) had **no Gen 6 residents at all**,
   Frost Hollow none for Gen 4 or Gen 7, the Haunted Tower none for Gen 7. A
   generation with nothing living in a map cannot be given a share of it by any
   amount of rescaling, so no weight fix could have reached them.

   So a floor, in the shape `BAND_FLOOR` already uses: a map is never short of a
   generation. Filled with that generation's BEST remaining fit for this map, so
   it is still the most at-home species available rather than a random one.

   FOUR IS MEASURED. Sweeping 1 to 8, generation evenness is ~5.5% off fair at
   every value - presence is all it needs - but the BAND mix only converges from
   4 upward (0.10pp at four, 8.9pp at three). Four costs 60 extra homes; eight
   costs 223 for the same result, and every one of those is a species standing
   somewhere it does not really belong. */
export const GEN_HOME_MIN = 4;

const derivedHomes = () => {
  const placed = new Set(RESIDENTS.flatMap((b) => b.table.map(([id]) => id)));
  const evolvesInto = new Set(EVOLUTIONS.map((e) => e.to));
  const homes = new Map(RESIDENTS.map((b) => [b.id, []]));
  /* Costumes are excluded for the same reason legendaries are: both are
     APPENDED to the finished table rather than living in it. Left in here they
     would be counted twice - once as a resident the fit balances and once at
     their own share - which is the exact fault this file records as "a species
     listed once and derived once has two weights in the same map". */
  const wild = SPECIES.filter((sp) =>
    !evolvesInto.has(sp.id) && !LEGENDARY.includes(sp.id)
    && !COSTUMES.includes(sp.id));

  for (const sp of wild) {
    if (placed.has(sp.id)) continue;
    let best = RESIDENTS[0], score = -1;
    for (const b of RESIDENTS) {
      const n = sp.types.filter((t) => b.types.includes(t)).length;
      if (n > score) { score = n; best = b; }
    }
    homes.get(best.id).push([sp.id, DERIVED_WEIGHT[bandFor(sp.id)] ?? 4]);
  }

  for (const b of RESIDENTS) {
    const here = new Set([...b.table.map(([id]) => id),
                          ...homes.get(b.id).map(([id]) => id)]);
    const count = new Map();
    for (const id of here) count.set(genOf(id), (count.get(genOf(id)) ?? 0) + 1);
    for (const gen of Object.keys(GEN_UNLOCK).map(Number)) {
      const short = GEN_HOME_MIN - (count.get(gen) ?? 0);
      if (short <= 0) continue;
      /* TYPE FIRST, THEN A BAND THE MAP ALREADY HAS. Filling a generation
         must not quietly resize the map's rarity mix - `balance` gives a band
         with no hand-written share only `BAND_FLOOR`, so every NEW band that
         arrives dilutes the ones the map was tuned around. Ember's A band
         moved 2.7 points that way, against a 2.5 bound whose own note says
         "if this ever needs 4, the homing is what to look at, not this
         number". So it is the homing that looks at it. Type match still
         decides among the ones that qualify - that is what makes a map feel
         like somewhere - but a species whose band the map does not already
         have is not a candidate at all. Every map's table has commons, so the
         pool is never empty. */
      const bands = new Set(b.table.map(([id]) => bandFor(id)));
      /* IT MUST SHARE A TYPE WITH THE MAP, and leaving that out put the
         starters in the volcano.

         Reported from play: Ember was spawning Turtwig, Grotle and Piplup.
         The sort was by type overlap alone, so every species with NO overlap
         tied at zero, and a stable sort left them in the order `SPECIES` is
         in - which for un-evolved Pokemon is dex order, which begins each
         generation with its three starters. Ember took Treecko and Mudkip,
         Turtwig and Piplup, Chespin and Froakie, Grookey and Sobble,
         Sprigatito and Quaxly. Every single wrong resident was a starter, and
         that is not a coincidence, it is the tell.

         A filler is not a way to reach a number, it is a species that has to
         look like it could live here. So overlap is a FILTER now and not a
         sort key, and a generation that has only one candidate gets one -
         `fitShares` gives it its share through whatever does live there, and
         the assertion that matters is presence rather than count. */
      const fits = (sp) => sp.types.some((t) => b.types.includes(t));
      const pool = wild
        .filter((sp) => genOf(sp.id) === gen && !here.has(sp.id)
                     && bands.has(bandFor(sp.id)) && fits(sp))
        .slice(0, short);
      for (const sp of pool) {
        homes.get(b.id).push([sp.id, DERIVED_WEIGHT[bandFor(sp.id)] ?? 4]);
      }
    }
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
/* MOVED UP: see `bandFor`, declared above `derivedHomes` because that is the
   first thing that asks. This is the note.

   A SPECIES THAT IS ALREADY IMPOSSIBLE TO CATCH IS NOT ALSO RARE TO MEET.

   Reported from play as Beldum seeming uncatchable, and it very nearly was.
   Its PokeAPI capture rate is 3 - the same as Mewtwo's, which is correct data
   and not ours to edit - so `catchChance` puts it exactly ON `NEVER_HOPELESS`,
   the floor this repo's own notes claimed "no species in the dex sits on".
   Three do: beldum, metang and metagross, and they are one evolution line.
   Everything else down there is legendary.

   Measured, at Lv 50 with an Ultra Ball and a Nanab: Beldum is 0.052% of Mt
   Moon's table and takes **1,914 encounters to own**, against Mewtwo's 1,318.
   A species with no legendary mark, no `legendTier` homing and no "hunt where
   it lives" was harder to obtain than the hardest legendary in the game.

   The catch rate is right and the BAND is what was wrong: difficulty was being
   charged twice, once on the throw and again on the spawn. A pseudo-legendary
   in the real games is hard to KEEP, not hard to find. So a non-legendary on
   the floor drops one band, which roughly triples how often it turns up and
   leaves every bit of the difficulty where it belongs - on the ball.

   DERIVED FROM THE CATCH MATH, never a list of dex numbers, so a tenth
   generation's pseudo-legendary is handled on the day it ships. A legendary is
   exempt because "L" is its own band with its own placement rule, and being
   brutal is the entire point of one. */
const bandOf = (row) => {
  const id = Array.isArray(row) ? row[0] : row;
  if (LEGENDARY.includes(id)) return "L";
  if (Array.isArray(row) && row[3]) return row[3];
  return bandFor(id);
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
    for (const r of members) out.push([r[0], r[1] * scale, r[2], r[3], r[4]]);
  }
  return out;
}

/* EVERY GENERATION IS AS LIKELY AS EVERY OTHER, and it was nowhere near.

   Reported from play as Gen 1 feeling far commoner than anything else, and it
   was: measured at Lv 50 with all nine generations open, against a fair 11.1%,
   Gen 1 took 23.3% of the Tall Grass table, 41.8% of the Haunted Tower, 57.8%
   of the Power Plant and 63.6% of Frost Hollow. Gen 6 took 0.0% of the Power
   Plant. It was not an accident - `DERIVED_WEIGHT` is 8/5/3/1 against Gen 1
   commons hand-tuned at 22, under a comment saying they sit below them on
   purpose so "a Pidgey at 22 still leads its map after Johto arrives".

   That argument was about ORDERING INSIDE A MAP and it bought a five-fold
   generation skew to get it. The ordering is worth keeping and is kept: the
   scale below is uniform within a generation, so a Pidgey still leads the Gen 1
   commons exactly as it did.

   TWO MARGINALS, AND NEITHER MAY GIVE WAY. The band mix per map is the design
   (`BAND_SHAPE`) and so is an even spread of generations, and no single rescale
   satisfies both - fixing the bands moves the generations and fixing the
   generations moves the bands. Alternating the two converges on the closest
   table that honours both, which is the standard way to fit a matrix to two
   sets of margins. Measured over all eight maps: every generation lands within
   5.5% of fair and every band within 0.10pp of the share it was tuned to.

   It cannot always be exact, and where it is not the reason is structural: a
   generation with no S-tier in a map can only take its share out of the bands
   it does have members in. That is the right answer rather than an
   approximation of one.

   The evolved overlay survives untouched. A species and the thing it evolves
   into are the same line, so the same generation, so the same scale - and
   `parent x EVO_SHARE` is preserved exactly. Legendaries sit in band "L" and
   are left out of both steps: their share is its own equation, applied after. */
/* THE GENERATION TRAVELS THE CHAIN, AND SLOT 4 IS WHERE IT RIDES.

   My first version scaled every row by `genOf(its own id)`, on the reasoning
   that a species and the thing it evolves into are the same line and therefore
   the same generation. THEY ARE NOT, and check.mjs said so immediately: Gloom
   is Gen 1 and Bellossom is Gen 2, so the two got different scale factors and
   the evolution came out COMMONER than what it evolves from - 0.440 against
   0.375 in Deep Woods. Golbat to Crobat and every Eeveelution are the same
   shape of thing.

   This is the identical failure the BAND had, fixed the identical way: the
   overlay's whole model is "an evolution is a fifth as common as its parent",
   which only survives a rescale if parent and child are scaled together. Slot 3
   carries the band down the chain; slot 4 now carries the generation. Inside
   one generation the scale is uniform, so `parent x EVO_SHARE` is exact again.

   It costs a little evenness - a Gen 2 evolution of a Gen 1 species counts
   toward Gen 1 here while `genOf` still calls it Gen 2 - and that is the right
   way round: a cross-generation evolution is reached THROUGH its parent, so it
   is the parent's map presence that put it there. */
const lineGen = (r) => r[4] ?? genOf(r[0]);

const FIT_ROUNDS = 40;
const FIT_TOL = 0.0005;

function fitShares(rows, shape) {
  if (!rows.length) return rows;
  let out = rows;
  for (let round = 0; round < FIT_ROUNDS; round++) {
    out = balance(out, shape);

    const gens = new Map();
    let mass = 0;
    for (const r of out) {
      const g = lineGen(r);
      gens.set(g, (gens.get(g) ?? 0) + r[1]);
      mass += r[1];
    }
    if (gens.size < 2) return out;

    const want = mass / gens.size;
    let worst = 0;
    for (const have of gens.values()) worst = Math.max(worst, Math.abs(have - want) / mass);
    if (worst < FIT_TOL) return out;

    out = out.map((r) => {
      const have = gens.get(lineGen(r));
      return have > 0 ? [r[0], (r[1] * want) / have, r[2], r[3], r[4]] : r;
    });
  }
  /* ALWAYS LAND ON THE BAND STEP. The loop alternates, so running out of
     rounds leaves whichever ran last in force - and that was the generation
     scale, which put Ember's B band 11.9 points away from the mix it was tuned
     to and failed the band-budget suite. The band mix is an asserted invariant
     and the generation spread is a target, so when the two cannot both be
     exact it is the target that gives way. */
  return balance(out, shape);
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
  let front = open.map((r) => [r[0], bandOf(r), genOf(r[0])]);

  for (let depth = 1; depth <= EVO_DEPTH && front.length; depth++) {
    const scale = evoScale(level, depth);
    const next = [];
    for (const [id, band, gen] of front) {
      for (const to of NEXT.get(id) ?? []) {
        /* A FORM IS NEVER WILD. Mega, Primal and Gigantamax are evolution
           targets, and this overlay walks the evolution graph out from whatever
           a map already spawns - so without this they would appear in the grass
           like any other third stage, and you could CATCH a Mega Charizard
           instead of spending a hundred levels making one. That is the whole
           thing they are for, handed over for a Poke Ball. It also has to stop
           the walk rather than just skip the row, or a form's own evolutions
           (there are none today) would ride in behind it. */
        if (isForm(to)) continue;
        const known = weight.has(to);
        // An evolution cannot outrun its own generation either.
        if (!known && genOpen(to, level)) {
          const w = Math.max(weight.get(id) * EVO_SHARE, EVO_FLOOR);
          weight.set(to, w);
          // Slot 3 is the band it competes in: its PARENT's, so `balance`
          // cannot separate an evolution from what it evolves from.
          if (scale > 0) extra.push([to, w * scale, depth, band, gen]);
        }
        // A hand-written row keeps its own band AND its own generation, and
        // passes both on - it is a resident here in its own right.
        next.push([to, known ? bandOf(to) : band, known ? genOf(to) : gen]);
      }
    }
    front = next;
  }
  /* Residents, then the evolved overlay, and the legendaries LAST - scaled to
     whatever the first two came to, so their share of the roll is the same on
     every map at every level whatever else has been added. */
  const rolled = fitShares(extra.length ? [...open, ...extra] : open,
                           BAND_SHAPE.get(biome.id) ?? {});
  const total = rolled.reduce((n, e) => n + e[1], 0);
  const alive = (id) => genOpen(id, level);
  /* Both are appended to the RESIDENT total, and both are scaled against the
     share the two of them take together - so each is exactly its own share of
     the finished table and neither moves when the other's roster grows. */
  const taken = rareShare(LEGENDARY, alive) + rareShare(COSTUMES, alive);
  return [...rolled,
          ...rareFor(LEGENDARY, biome.types, total, alive, taken),
          ...rareFor(COSTUMES, biome.types, total, alive, taken)];
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
