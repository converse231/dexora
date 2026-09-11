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
export function levelReward(level) {
  const items = { "poke-ball": 5 };
  if (level >= 12) items["ultra-ball"] = 2;
  else if (level >= 6) items["great-ball"] = 3;
  /* The only source of Master Balls there is. Three in a whole game - and that
     is a count, not a cadence, which is why this divisor moved from 10 to 15
     when the level cap went from 30 to 50. Left alone it would have quietly
     handed out five. */
  if (level % 15 === 0) items["master-ball"] = 1;
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
export const STEP_TREASURE = 10;        // every tenth HAUL carries a Master Ball
export const TREASURE_LEVEL = 20;

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

export function startingState() {
  return {
    money: 300,
    bag: { "poke-ball": 10, "great-ball": 0, "ultra-ball": 0, "master-ball": 0 },
    box: [],
  };
}

export const boxValue = (box, species) =>
  box.reduce((sum, m) => sum + sellValue(species[m.species - 1]), 0);

// ---------------------------------------------------------------- evolution

/* Nothing gains levels here - there are no battles - so evolution spends the
   resource the game actually floods you with, and the real evolution level sets
   the price: a Charmander line costs more than a Caterpie line because that is
   how the games rank them.

   It sets the price rather than being the price. Charging the level outright put
   Dragonair at 55 and Charmeleon at 36, and those are not goals, they are walls -
   at roughly 280 steps per catch of a given species, 36 of anything is an
   evening of walking for one dex entry. Halved and capped it stays ordered the
   same way and stays walkable.

   Two things then keep a chain from compounding. A feed is paid out of the whole
   line below the target - a Charizard eats Charmeleon *or* Charmander - so the
   costs add rather than multiply. And the cap stops the last step of a long
   chain from dwarfing everything before it. */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const LEVEL_DIVISOR = 2;
const MIN_FEED = 3;   // Caterpie evolves at 7; 3 still has to be earned
const MAX_FEED = 20;  // Dragonair evolves at 55; 20 is a trophy, 28 is a chore

const STONE_FEED = 8; // plus the stone itself, which is the real cost
// Nobody to trade with in a single-player game, and no link-cable sprite in the
// PokeAPI set either, so the four trade evolutions cost duplicates instead.
const TRADE_FEED = 10;

export const evolutionsOf = (id) => EVO_ROWS.filter((r) => r.from === id);

export function feedCost(row) {
  if (row.kind === "trade") return TRADE_FEED;
  if (row.kind === "stone") return STONE_FEED;
  return clamp(Math.round(row.level / LEVEL_DIVISOR), MIN_FEED, MAX_FEED);
}

// The shop prints this, so it comes from the constant rather than a typed-in 15.
export const stoneFeed = () => STONE_FEED;

export const stoneFor = (row) => (row.kind === "stone" ? row.item : null);

/* Which species a given stone is for. The shop asks this - "what is a Leaf Stone
   even for" is the question you have while looking at the price, not later. */
export const speciesNeedingStone = (id) => [
  ...new Set(EVO_ROWS.filter((r) => r.item === id).map((r) => r.from)),
];

export const evolutionRow = (from, to) =>
  EVO_ROWS.find((r) => r.from === from && r.to === to) ?? null;

const PARENT = new Map(EVO_ROWS.map((r) => [r.to, r.from]));

/* The species itself first, then everything it evolved from. Order matters:
   it is also the order a feed eats them in, so the earliest stage goes first. */
export function feedPool(id) {
  const pool = [id];
  for (let p = PARENT.get(id); p; p = PARENT.get(p)) pool.push(p);
  return pool;
}

// Every evolution a given species can be spent on - its own, and any later step
// whose feed pool it belongs to. Charmander is fuel for Charizard too.
const SPENT_ON = (() => {
  const out = new Map();
  for (const row of EVO_ROWS)
    for (const id of feedPool(row.from)) {
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(row);
    }
  return out;
})();

/* How many of a species a bulk sell holds back. Only evolutions you have not
   registered yet count: once a Raticate is in the Pokédex your spare Rattata
   are money again, so the reserve gets out of the way instead of freezing the
   income loop forever. */
export function reserveFor(sp, dex) {
  if (!sp) return 1; // a save with an id we do not know: keep one, sell the rest
  const pending = (SPENT_ON.get(sp.id) ?? []).filter(
    (r) => !dex || dex[r.to - 1] !== 2,
  );
  return pending.length ? Math.max(...pending.map(feedCost)) + 1 : 1;
}

/* A Pokemon no bulk action may ever take: any rare tier at all.

   One predicate, used by the sell sweep, the row sale and the feed, because
   "which ones are precious" is a single question - and two answers to it is
   exactly how a THIRD tier ships protected from one bulk action and not the
   others. It now reads `TIERS` rather than naming them: the fourth tier was
   added by writing one row in `biomes.js`, and this line did not have to be
   remembered, which is the whole reason the list exists. */
export const keeper = (mon) => !!mon && TIERS.some((t) => mon[t]);

/* Who can be fed to an evolution, and who evolves. One function, because
   `evolveState` counting the pool one way while `feedSelection` picked from it
   another is exactly how a panel comes to say READY over a feed that cannot be
   assembled.

   **No rare tier is ever feed.** That is not a nicety: the sweep picks the cheapest
   N to consume, and it would happily eat a rare-tier Pidgey to make an ordinary
   Pidgeotto with nothing to undo it. A shiny CAN be the hero - the hero is the
   one that comes out the other side, still shiny, which is what the real games
   do - and it is preferred as hero for the same reason. */
export function feedable(box, row) {
  const pool = feedPool(row.from);
  const rank = new Map(pool.map((id, i) => [id, i])); // 0 is the species itself
  const mine = box.filter((m) => rank.has(m.species));

  const hero = mine
    .filter((m) => m.species === row.from)
    .sort((a, b) =>
      (keeper(b) ? 1 : 0) - (keeper(a) ? 1 : 0) || b.level - a.level || a.uid - b.uid)[0] ?? null;

  const rest = mine
    .filter((m) => m.uid !== hero?.uid && !keeper(m))
    .sort(
      (a, b) =>
        rank.get(b.species) - rank.get(a.species) || // ancestors first
        a.level - b.level ||
        a.uid - b.uid,
    );
  return { hero, rest };
}

/* Everything the UI needs to describe one evolution without doing sums itself. */
export function evolveState(box, bag, row) {
  const cost = feedCost(row);
  const { hero, rest } = feedable(box, row);
  // The hero is spent too, so it counts towards the bill.
  const have = hero ? 1 + rest.length : 0;
  const stone = stoneFor(row);
  const hasStone = !stone || (bag?.[stone] ?? 0) > 0;
  return { cost, have, stone, hasStone, ready: !!hero && have >= cost && hasStone };
}

/* What a feed actually eats. The best of the species does the evolving and
   carries its level forward; the rest of the bill is paid from the line below
   it, earliest stage and weakest first, so your good ones are the last to go. */
export function feedSelection(box, row) {
  const cost = feedCost(row);
  const { hero, rest } = feedable(box, row);
  if (!hero || 1 + rest.length < cost) return null;
  return { hero, fed: [hero, ...rest.slice(0, cost - 1)] };
}

/* What a deliberate row sale may take, when there are no spares left: the
   surplus an unregistered evolution is holding back.

   This lived inside the Box panel, which is why it shipped with a hole in it -
   `duplicateUids` refuses to offer a keeper, and then this list sorted by level
   and took all but the highest, so a shiny at Lv 2 behind an ordinary one at
   Lv 30 was the one thing the row offered to sell, labelled "1 × Rattata". One
   click, no undo. It is here now so check.mjs can hold it to the same rule as
   the sweep, because a rule enforced in one of two places is not a rule. */
export function heldUids(mons, spareUids = []) {
  const spare = new Set(spareUids);
  const sellable = mons.filter((m) => !keeper(m));
  // Keep one of the species whatever happens - the row is not for emptying.
  return sellable
    .slice()
    .sort((a, b) => a.level - b.level || a.uid - b.uid)
    .slice(0, Math.max(0, sellable.length - 1))
    .map((m) => m.uid)
    .filter((uid) => !spare.has(uid));
}

/* Which box entries a bulk sell may take. Each species keeps its reserve - the
   highest-level ones, so selling never costs you your best - and for anything
   an unregistered evolution still needs, the reserve is the whole feed. You can
   still sell those individually; this only stops the one-button sweep from
   eating material you were saving. */
export function duplicateUids(box, dex) {
  const bySpecies = new Map();
  for (const mon of box) {
    if (!bySpecies.has(mon.species)) bySpecies.set(mon.species, []);
    bySpecies.get(mon.species).push(mon);
  }
  const spare = [];
  for (const [id, mons] of bySpecies) {
    const keep = reserveFor(SPECIES[id - 1], dex);
    /* A shiny is never spare, whatever its level and however many you hold.
       The reserve keeps the highest levels, so a shiny Rattata at level 3
       behind four ordinary ones was in the sweep - one button, and a
       rare-tier catch is money. Held out of the list entirely rather than
       sorted to the front, because sorting only protects the first `keep`
       of them. Selling one on purpose, from its own row, still works. */
    const keepers = mons.filter(keeper);
    const rest = mons.filter((m) => !keeper(m))
      .sort((a, b) => b.level - a.level || a.uid - b.uid);
    spare.push(...rest.slice(Math.max(0, keep - keepers.length)).map((m) => m.uid));
  }
  return spare;
}
