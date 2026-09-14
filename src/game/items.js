import { SPECIES } from "../data/species.js";
import { EVOLUTIONS as EVO_ROWS } from "../data/evolutions.js";
import { GUARANTEED } from "../catch.js";
import { TIERS, ENCLOSED } from "./biomes.js";

/* The economy and evolution, free of DOM so tools/check.mjs can test them.

   The whole design rests on one sentence: commons print money, rares burn it.
   Grinding Pidgeys nets a little every catch; hunting a Dratini is a deliberate
   losing bet you fund with that. Every number below exists to keep that true,
   so if you retune one, re-run `npm run check` - it asserts the relationship
   still holds rather than just checking the arithmetic. */

/* Trainer level unlocks stock rather than places. It is the same pacing the old
   area locks were doing, but stated as "you can buy this now" instead of "you
   may not go there" - a reward rather than a wall. */
/* SITUATIONAL BALLS.

   Four of these do nothing at all most of the time and beat an Ultra Ball when
   their one condition holds. That shape is the whole point: a ball that is
   simply better is a tax you pay for not having enough money, while a ball
   that is better HERE is a decision you make in the shop and cash in on the
   route. Each is priced BELOW the Ultra Ball, so choosing right is cheaper than
   brute force and choosing wrong is dearer than a Poke Ball.

   Every condition keys off something the game already tracks, and each one off
   a DIFFERENT system, so no two overlap:

     Net     the species' types      Repeat  the Pokedex
     Dusk    which area you are in   Timer   throws at this encounter

   The multipliers come from the real games (Gen III-IV), but the game's own
   ladder is already tuned above canon - a Great Ball is 1.8 here against 1.5
   there - so these sit at 3.5 rather than 3, which keeps a situational ball
   worth more than the 3.0 Ultra it is competing with.

   TWO CANON BALLS WERE MEASURED AND REJECTED:

   * Nest Ball is (40 - level) / 10 - but every wild Pokemon here is level 2 to
     7, so that formula is a flat ~3.5 on literally every encounter in the
     game. That is not a condition, it is an Ultra Ball for 40% less money.
   * Dive Ball boosts while fishing, and everything on a rod here is Water-
     typed, so it would be the Net Ball wearing a second name and a second
     price. One of them had to go and the Net Ball covers more ground.

   A fifth, the Quick Ball, is 4x on the first turn - which in a game where the
   first throw is the one everybody makes is just the best ball, always. */
export const BALLS = [
  { id: "poke-ball", name: "Poké Ball", short: "POKÉ", mult: 1.0, price: 25, level: 1 },
  { id: "great-ball", name: "Great Ball", short: "GREAT", mult: 1.8, price: 90, level: 6 },
  {
    id: "net-ball", hideWhenEmpty: true, boost: 3.5, name: "Net Ball", short: "NET", mult: 1.0, price: 150, level: 8,
    hint: "on Bug and Water",
    bonus: (enc) => (enc.types.some((t) => t === "bug" || t === "water") ? 3.5 : 1.0),
  },
  {
    id: "repeat-ball", hideWhenEmpty: true, boost: 3.5, name: "Repeat Ball", short: "REPEAT", mult: 1.0, price: 170, level: 10,
    /* The best-fitting ball in the game and it was not designed for it: this
       whole game is re-catching species you already own to find their Origin,
       Holo, Shiny and Astral. `known` is the dex snapshot taken when the
       encounter began, not live state - settling a catch registers the
       species, and reading it live would make the ball change value halfway
       through its own throw. */
    hint: "on ones you know",
    bonus: (enc) => (enc.known ? 3.5 : 1.0),
  },
  { id: "ultra-ball", name: "Ultra Ball", short: "ULTRA", mult: 3.0, price: 250, level: 12 },
  {
    id: "dusk-ball", hideWhenEmpty: true, boost: 3.5, name: "Dusk Ball", short: "DUSK", mult: 1.0, price: 190, level: 14,
    hint: "out of daylight",
    bonus: (enc) => (ENCLOSED.has(enc.areaId) ? 3.5 : 1.0),
  },
  {
    id: "timer-ball", hideWhenEmpty: true, boost: 4, name: "Timer Ball", short: "TIMER", mult: 1.0, price: 70, level: 16,
    /* Canon is (turns + 10) / 10, capping at 4x after THIRTY turns. There are
       no turns here and a throw costs a ball, so nobody was ever going to
       reach thirty: rescaled to reach the same 4x cap after five misses, which
       is a long fight in this game and about what thirty turns is in that one.
       The curve, not the constant, is what was copied.

       AND IT IS THE CHEAP ONE - cheaper than a Great Ball, which looks wrong
       next to a 4x cap until you price the ramp. Every throw on the way up is
       paid for at full price and most of them are worth ~1x, so at 140 it
       measured as the most expensive way to catch a rare in the game: 606 a
       head against the Ultra Ball's 472. The cap is not what you buy, it is
       what you might reach - a rare flees about half the time it breaks free,
       so a fifth throw at the same one happens maybe 2% of the time. Being
       cheap enough to keep throwing IS the ball. check.mjs prices it by
       simulating the ramp, not by its cap. */
    hint: "grows each throw",
    /* Counts every throw at this Pokemon, not every Timer Ball - so softening
       one up with cheap Poke Balls and then switching is a real tactic rather
       than an exploit to close. */
    bonus: (enc) => Math.min(4, 1 + 0.6 * (enc.throws ?? 0)),
  },
  /* Never fails, and never for sale. A price is only ever a delay - grind long
     enough and you could hold twenty - so the only thing that can keep this
     scarce is that money cannot buy it. It arrives every tenth trainer level,
     three times in a whole game. Hidden from the encounter until you own one,
     so it reads as something you earned rather than a greyed-out button. */
  {
    id: "master-ball", name: "Master Ball", short: "MASTER", mult: GUARANTEED,
    price: 0, level: null, hideWhenEmpty: true,
  },
];

export const ballById = (id) => BALLS.find((b) => b.id === id);

/* What a ball is worth RIGHT NOW. One function, called by the engine when it
   rolls and by the rail when it draws, so the number on screen is the number
   that will be used - the alternative is a rail that advertises 3.5 and a roll
   that quietly used 1.0, which is unfalsifiable from the outside.

   `enc` is the whole encounter object rather than a hand-built context: every
   field a condition needs is already on it, and a second shape to keep in step
   is a second thing to forget. No encounter (standing on the map, or a shop
   shelf) means no condition can hold, so the base multiplier is the answer. */
export const liveMult = (ball, enc) =>
  (enc && ball.bonus ? ball.bonus(enc) : ball.mult);

/* `boost` is the HEADLINE: the most a ball can ever be worth, which is what the
   shop shelf prints because "×1.0 odds" is a true and useless thing to say
   about a Net Ball. It is a second copy of a number that `bonus()` already
   knows, so check.mjs holds the two together - it asserts no `bonus()` ever
   exceeds its `boost` and that each one actually reaches it. A headline the
   ball cannot deliver would be the worst bug in this file, because nothing
   about it looks wrong. */

// The balls with no condition: the plain ladder, which must stay a ladder.
export const PLAIN_BALLS = BALLS.filter((b) => !b.bonus);

/* The five Gen 1 evolution stones. One price for all of them: which stone you
   need is decided by what you caught, not by how good the evolution is, so
   charging different amounts would only tax you for your luck. */
export const STONES = [
  { id: "fire-stone", name: "Fire Stone", price: 1200, level: 8 },
  { id: "water-stone", name: "Water Stone", price: 1200, level: 8 },
  { id: "thunder-stone", name: "Thunder Stone", price: 1200, level: 8 },
  { id: "leaf-stone", name: "Leaf Stone", price: 1200, level: 8 },
  { id: "moon-stone", name: "Moon Stone", price: 1200, level: 8 },
];

/* Key items: earned at a trainer level, never bought, never used up. They are
   held in the same bag as everything else - a count of 1 means you have it -
   because a second bag for four things is a second thing to keep in sync. */
export const KEY_ITEMS = [
  { id: "old-rod", name: "Old Rod", price: 0, level: 4,
    blurb: "Fish any shoreline. Mostly Magikarp, but it is a start." },
  { id: "bicycle", name: "Bicycle", price: 0, level: 8,
    blurb: "Twice the walking speed. Press B to get on and off." },
  { id: "good-rod", name: "Good Rod", price: 0, level: 14,
    blurb: "A wider catch off the same shore." },
  { id: "running-shoes", name: "Running Shoes", price: 0, level: 15,
    blurb: "Hold Shift to run. Everything after this is faster." },
  { id: "super-rod", name: "Super Rod", price: 0, level: 22,
    blurb: "Reaches the deep water, where the rare things are." },
];

export const keyItemsAt = (level) => KEY_ITEMS.filter((k) => k.level === level);

/* Running Shoes, granted rather than carried. Gen 3 hands them over as an
   invisible key item - there is no bag sprite for them anywhere in the PokeAPI
   set, which is the honest reason they are a level and not an entry in
   KEY_ITEMS: inventing an icon for them would be the only fake art here.
   Early, because everything after it is faster and that should not be a
   late-game reward. */
export const RUN_LEVEL = 15;
/* Running is an ITEM now, not a birthday. It was a bare level check, which
   made the one ability that changes how the game feels arrive with no object
   and no announcement - you were simply faster one day. The Running Shoes sit
   in KEY_ITEMS beside the Bicycle and the rods, so the same panel that shows
   what you have earned shows this too, and the same level-up banner hands it
   over.

   `level` stays in the signature and is still checked. The bag is the real
   gate, but a hand-edited save that grants the shoes at level 2 should not
   also skip the pacing, and a save written before the shoes existed has a
   level and no item - see `loadState`, which grants them on sight. */
export const canRun = (level, bag) =>
  level >= RUN_LEVEL && holding(bag, "running-shoes");
export const holding = (bag, id) => (bag?.[id] ?? 0) > 0;
// Best rod held, or null. Later rods are strictly better, so last wins.
export const bestRod = (bag) =>
  [...KEY_ITEMS].reverse().find((k) => k.id.endsWith("-rod") && holding(bag, k.id)) ?? null;

/* What the shop will actually sell. A price of zero means it is not for sale at
   any level - the Master Ball's whole design, and the key items' too. */
export const forSale = (item) => item.price > 0 && item.level !== null;
export const SHOP_BALLS = BALLS.filter(forSale);

// Everything the game can name, whether or not it is for sale.
export const ALL_ITEMS = [...BALLS, ...STONES, ...KEY_ITEMS];
export const SHOP_ITEMS = [...SHOP_BALLS, ...STONES];
export const itemById = (id) => ALL_ITEMS.find((i) => i.id === id);

/* Levelling pays out in balls. It is the same pacing the old area locks were
   doing, but it hands you something instead of taking somewhere away. */
/* Every this many levels pays a Master Ball: 50 / 8 is six over the cap.
   A divisor rather than a list, so the cap is the only number that decides. */
export const MASTER_EVERY = 8;

export function levelReward(level) {
  const items = { "poke-ball": 5 };
  if (level >= 12) items["ultra-ball"] = 2;
  else if (level >= 6) items["great-ball"] = 3;
  /* A COUNT, NOT A CADENCE - still the rule, and the count moved.

     It was three from levelling and two from walking, five in a whole
     playthrough, which made the Master Ball a thing you read about rather than
     a thing you used: with five legendaries in the dex, spending one always
     felt like a mistake you would regret at the sixth. Ten across the two
     sources is enough to cover every legendary and leave a few over, which is
     the point at which the item becomes a decision instead of a museum piece.

     Derived from the cap, as before: `MASTER_EVERY` levels into `MAX_LEVEL` is
     the count, so moving the cap moves this and nothing has to be remembered.
     check.mjs asserts the total rather than the divisor. */
  if (level % MASTER_EVERY === 0) items["master-ball"] = 1;
  for (const key of keyItemsAt(level)) items[key.id] = 1;
  return items;
}

/* Walking pays. Steps are the one number that only ever goes up when someone is
   actually playing, and until now they bought nothing at all.

   A parcel every 250 steps - about half a minute of walking - and a haul every
   tenth of those. Both scale with trainer level the same way `levelReward` does,
   because a parcel of Poke Balls at level 40 is not a reward, it is a rounding
   error.

   It pays in Poke and Great Balls, and only the haul reaches Ultras. That is
   deliberate: Ultras are what rares cost, and the loop this game is built on is
   that commons fund rares. Walking should let you keep catching commons faster,
   not let you skip the funding.

   And every tenth HAUL - 25,000 steps, which is most of a playthrough's walking
   - is a Master Ball. That is the one reward here that is not "keep doing what
   you were doing faster", and it is placed where it is for a reason: 25,000
   steps cannot be ground out in an evening and it cannot be bought, so it is
   the only Master Ball in the game you earn by playing rather than by
   levelling. Gated at level 20 as well as on distance, because a guaranteed
   catch handed to a level 4 trainer skips the part of the game it is a reward
   for. Two of them over 50,000 steps, against three from levelling - so the
   whole game's supply goes from three to five, and `check.mjs` pins both
   numbers. */
export const STEP_PARCEL = 250;
export const STEP_HAUL = 10;            // every tenth parcel is a bigger one
/* Every fifth HAUL carries a Master Ball - 12,500 steps, so four over a
   50,000-step playthrough where it used to be two. Walking is the slower of the
   two sources and it is the one a player who is not levelling still has. */
export const STEP_TREASURE = 5;
export const TREASURE_LEVEL = 15;

export function stepReward(steps, level) {
  if (!steps || steps % STEP_PARCEL !== 0) return null;
  const parcels = steps / STEP_PARCEL;
  const haul = parcels % STEP_HAUL === 0;
  /* A treasure is always a haul as well, so the banner and the bigger stack
     come with it rather than a Master Ball arriving on its own in silence. */
  const treasure = haul
    && parcels % (STEP_HAUL * STEP_TREASURE) === 0
    && level >= TREASURE_LEVEL;
  const items = { "poke-ball": haul ? 10 : 3 };
  if (level >= 12) items["great-ball"] = haul ? 5 : 2;
  else if (level >= 6) items["great-ball"] = haul ? 3 : 1;
  if (haul && level >= 12) items["ultra-ball"] = 2;
  if (treasure) items["master-ball"] = 1;
  return { items, haul, treasure };
}

// What a duplicate fetches, by the rarity tier already stored on each species.
export const SELL = { C: 40, B: 90, A: 220, S: 600 };

// Paid once per species, the first time you catch it. 151 x 100 over the game.
export const DEX_BONUS = 100;

export const sellValue = (sp) => SELL[sp.tier] ?? SELL.C;

/* THE OTHER THING A DUPLICATE IS WORTH.

   A spare is sold for cash OR converted to Rare Candy - the player picks at the
   point of sale, which is the whole reason candy can never become a dead
   resource: you only ever mint what you are about to spend.

   **The yield is rarity-weighted, and that is the load-bearing decision.** A
   flat rate makes the optimal play "farm the highest encounters-per-minute
   species and ignore the other seven maps" - which here is a weight-22 Pidgey
   in Tall Grass, no travel, biggest table. Weighting by tier means an hour
   anywhere pays about the same:

     C at weight 22 is 15.7% of a table -> 15.7 candy per 100 encounters
     S at weight  1 is  0.7% of a table ->  5.7 candy per 100 encounters

   2.7 : 1 rather than the 22 : 1 a flat rate would give. Commons stay the
   reliable grind; rares stay prizes. Deliberately FLATTER than `SELL`'s
   1 : 2.25 : 5.5 : 15, because cash is optional and candy is progression - if
   candy tracked cash exactly, a common catch would be worthless in both. */
export const CANDY = { C: 1, B: 2, A: 4, S: 8 };

/* A POKEMON IS WORTH WHAT ITS BASE FORM IS WORTH, and that is the rule that
   closes the exploit rather than out-tuning it.

   Found by assertion, not by thought: Caterpie evolves at Lv 7 and a wild one
   can be caught AT 7, so it evolves for nothing - and Metapod is a tier above
   it. "Evolve, then convert" was strictly better than "convert", a free
   multiplier on every catch of every line whose tier rises. Not infinite, but
   degenerate: the optimal play would have been to evolve everything you meant
   to throw away.

   Capping the yield, or raising the cheap evolution levels, both fix the
   Caterpie and leave the class open for the next generation to reopen. Reading
   through to the base form closes it structurally: evolving cannot raise the
   yield, because the yield never depended on the form.

   It is also the honest measure. Candy is a wage for CATCHING, and evolving is
   not catching - you did the work when you caught the Caterpie. Cash still
   tracks the species in your hand (`sellValue`), so a wild Venusaur is still
   worth what a Venusaur is worth; the two currencies measure different things
   on purpose. */
const BASE_OF = new Map();
for (const r of EVO_ROWS) BASE_OF.set(r.to, r.from);
const baseForm = (id) => {
  let at = id;
  for (let up = BASE_OF.get(at); up; up = BASE_OF.get(at)) at = up;
  return at;
};

export const candyValue = (sp) =>
  CANDY[SPECIES[baseForm(sp?.id ?? 0) - 1]?.tier ?? sp?.tier] ?? CANDY.C;

/* Candy is also buyable, at 3x what selling the same duplicate pays. That
   ordering is the rule, not the number: buying must always be worse than
   catching, so this is the impatient option rather than the efficient one.

   No purchase cap, and that falls out rather than being decided - cash comes
   from selling duplicates, so cash-bought candy is gated by catching anyway.
   The sink is self-limiting because its input is the same input. It also puts
   candy in competition with balls for one wallet, which is a real choice. */
export const CANDY_PRICE = 120;

export function startingState() {
  return {
    money: 300,
    bag: { "poke-ball": 10, "great-ball": 0, "ultra-ball": 0, "master-ball": 0 },
    box: [],
    candy: 0,
  };
}

export const boxValue = (box, species) =>
  box.reduce((sum, m) => sum + sellValue(species[m.species - 1]), 0);

// ---------------------------------------------------------------- evolution

/* LEVELS ARE REAL, AND CANDY BUYS THEM.

   This replaced a feed: you used to spend N duplicates OF THE LINE, priced at
   `clamp(evolutionLevel / 2, 3, 20)`. That worked, and it walled - a Dragonite
   was 20 Dratini specifically, which at 1.2% of the Pond table is about 1,600
   encounters for one dex entry, and no amount of Pidgey helped.

   The change is exactly one thing: **duplicates became fungible.** A spare
   Zubat used to be worthless unless you wanted a Golbat; it is now one candy
   toward anything. That is what makes every ball thrown pay, which is the real
   argument for candy - the familiar "evolves at Lv 16" rule is a bonus.

   1 candy = 1 level, flat, forever. A rising curve was considered and rejected:
   it is a second table to keep in step, and the curve already EXISTS in the
   evolution levels themselves - Metapod at 7, Dragonair at 55. A flat rate over
   real levels is that curve. It is also why this scales to 1,025 species with
   nothing typed in per species: PokeAPI hands us the level. */

/* The level a row evolves at, INCLUDING the rows that have no level.

   A stone, trade or friendship evolution carries no level in PokeAPI - there is
   none to carry - and about twenty Gen 1 species evolve that way. The obvious
   fix is a table of synthetic levels per method, and the obvious fix is wrong:
   that table grows every generation and every new method needs a row in it.

   Derived from the chain instead. Kadabra evolves at 16, so Alakazam is 26. A
   Gen 5 trade-with-held-item evolution gets a sane number on the day it lands
   with nothing edited. The floor stops a stone evolution hanging off a base
   form from being free - an Eevee has no level below it at all.

   Memoised because the Box asks per row per render, and a chain walk that
   returns the same answer forever should be walked once. */
export const SYNTH_STEP = 10;
export const SYNTH_MIN = 16;

const PARENT_ROW = new Map(EVO_ROWS.map((r) => [r.to, r]));
const EVO_LEVEL = new Map();

export function evoLevel(row) {
  if (!row) return 0;
  const hit = EVO_LEVEL.get(row.to);
  if (hit !== undefined) return hit;
  let at = row.level;
  if (!at) {
    const up = PARENT_ROW.get(row.from);
    at = Math.max(SYNTH_MIN, (up ? evoLevel(up) : 0) + SYNTH_STEP);
  }
  EVO_LEVEL.set(row.to, at);
  return at;
}

export const evolutionsOf = (id) => EVO_ROWS.filter((r) => r.from === id);

export const stoneFor = (row) => (row.kind === "stone" ? row.item : null);

/* Which species a given stone is for. The shop asks this - "what is a Leaf Stone
   even for" is the question you have while looking at the price, not later. */
export const speciesNeedingStone = (id) => [
  ...new Set(EVO_ROWS.filter((r) => r.item === id).map((r) => r.from)),
];

export const evolutionRow = (from, to) =>
  EVO_ROWS.find((r) => r.from === from && r.to === to) ?? null;

/* A Pokemon no bulk action may ever take: any rare tier at all.

   One predicate, used by the sell sweep, the row sale and the feed, because
   "which ones are precious" is a single question - and two answers to it is
   exactly how a THIRD tier ships protected from one bulk action and not the
   others. It now reads `TIERS` rather than naming them: the fourth tier was
   added by writing one row in `biomes.js`, and this line did not have to be
   remembered, which is the whole reason the list exists. */
export const keeper = (mon) => !!mon && TIERS.some((t) => mon[t]);

/* Which tier a box entry is, or null for an ordinary one. Rarest first, so a
   hand-edited save carrying two is described by its best - the same order
   every other panel reads. */
export const variantOf = (mon) => TIERS.find((t) => mon?.[t]) ?? null;

/* Everything the UI needs about ONE Pokemon and ONE of its evolutions.

   Per INSTANCE, not per species, and that deletes a whole class of bug with it.
   The feed had to answer "which of these six Pidgey is the one that evolves"
   (`ANY_HERO`, the hero sort, the variant-row threading) because it consumed a
   pile. Candy is spent on a `uid`, so the question cannot be asked wrong: a
   Holo levels up and a Holo comes out, with nothing to choose between.

   `need` is candy, because 1 candy = 1 level. */
export function evolveState(mon, bag, row) {
  const at = evoLevel(row);
  const stone = stoneFor(row);
  const hasStone = !stone || (bag?.[stone] ?? 0) > 0;
  const need = Math.max(0, at - (mon?.level ?? 0));
  return { at, need, stone, hasStone, ready: !!mon && need === 0 && hasStone };
}

/* The cheapest way forward for one Pokemon, for a panel that only has room to
   say one thing. Ready beats near, and near is measured in candy. */
export function evoNext(mon, bag) {
  const rows = evolutionsOf(mon?.species ?? 0);
  if (!rows.length) return null;
  const all = rows.map((row) => ({ row, ...evolveState(mon, bag, row) }));
  return all.find((st) => st.ready) ?? all.reduce((a, b) => (b.need < a.need ? b : a));
}

/* Which box entries a bulk sell may take: everything but the best of each
   species, and never a variant.

   **The reserve collapsed to one when the feed was deleted.** It used to hold
   back a whole evolution's worth of material - up to 20 - because a sweep could
   otherwise eat the Dratini you were saving. Nothing is saved for anything now:
   a spare's only jobs are cash and candy, so holding any back is holding back
   progress. `reserveFor`, `heldUids` and the Box's "dig into what an evolution
   is saving" branch all went with it.

   The best is the HIGHEST LEVEL one, which now means the one you have spent
   candy on - so a sweep can never sell your investment. */
export function duplicateUids(box) {
  const bySpecies = new Map();
  for (const mon of box) {
    if (!bySpecies.has(mon.species)) bySpecies.set(mon.species, []);
    bySpecies.get(mon.species).push(mon);
  }
  const spare = [];
  for (const mons of bySpecies.values()) {
    /* A variant is never spare, whatever its level and however many you hold.
       Held out of the list ENTIRELY rather than sorted to the front, because
       sorting only ever protects the first of them. Selling one deliberately,
       from its own row, still works.

       The one kept back is the best ORDINARY one, not the best of the species.
       Counting keepers against the reserve meant that owning a Holo Pidgey made
       your only ordinary Pidgey spare - the sweep grouped by species while the
       Box groups by species AND variant, so it offered to empty a row that the
       row itself considered full. Same rule on both sides now: every row you
       can see keeps one. */
    const rest = mons.filter((m) => !keeper(m))
      .sort((a, b) => b.level - a.level || a.uid - b.uid);
    spare.push(...rest.slice(1).map((m) => m.uid));
  }
  return spare;
}
