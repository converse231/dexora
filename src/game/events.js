/* WORLD EVENTS - things that change the world for a while, as opposed to field
   items, which the player buys to change it. Pure, like daily.js, and for the
   same reason: check.mjs walks a month of days without waiting for one.

   MASS OUTBREAK. Once a day one map the player has opened is overrun by one
   species that already lives there: `OUTBREAK_SHARE` of the walking encounters
   on that map ARE that species, for `OUTBREAK_SIZE` of them, and each rolls its
   tier at `OUTBREAK_LIFT` times the odds. It is what a rosette wants - four
   variants of ONE species - and it is the thing the generation fit makes
   hardest, because spreading a table over nine generations makes every
   individual species rarer.

   A COUNT, NOT A CLOCK. Fifteen encounters is a session wherever the day
   falls, and it cannot be burned by leaving the game open. Once they are met
   it is over until tomorrow. */
import { SPECIES } from "../data/dex.js";
import { BIOMES, areaOpen, encounterTable, isLegendary } from "./biomes.js";
import { hash } from "./daily.js";
import { STONES } from "./items.js";

export const OUTBREAK_SHARE = 0.3;
export const OUTBREAK_SIZE = 15;
export const OUTBREAK_LIFT = 4;

const costume = new Set(SPECIES.filter((sp) => sp.form === "costume").map((sp) => sp.id));

/* The species a map can be overrun by: its residents and homes at this level -
   never the evolved overlay (a flock of Charizard is a free evolution line, and
   the overlay is meant to be a late find), never a legendary (a legendary is one
   of a kind), never a costume (an event does not host an event). */
export function outbreakPool(biome, level) {
  return encounterTable(biome, level)
    .filter((r) => !r[2] && r[1] > 0 && !isLegendary(r[0]) && !costume.has(r[0]))
    .map((r) => r[0]);
}

/* Today's outbreak for a trainer at `level`, or null. UNIFORM over open maps
   and over the pool, not weighted: an outbreak of the commonest thing on the
   map is a normal afternoon, and the rare ones are what make it an event.
   Frozen onto the save at first sight by the engine, so levelling mid-day
   (which opens a map) cannot move it under the player. */
export function outbreakFor(key, level) {
  const open = BIOMES.filter((b) => areaOpen(b.id, level));
  if (!open.length) return null;
  const biome = open[hash(key + ":outbreak") % open.length];
  const pool = outbreakPool(biome, level);
  if (!pool.length) return null;
  return { areaId: biome.id, speciesId: pool[hash(key + ":" + biome.id) % pool.length] };
}

/* SPACE-TIME RIFT. Stay on one map long enough and the world tears: for
   `RIFT_STEPS` steps the rarer end of that map's table comes forward, and the
   ground turns things up. Legends: Arceus opens its distortions on a clock
   ("10% at five minutes, certain at forty"); this game's clock is steps, so it
   opens on `sinceTravel` - steps since you last changed map - which is also
   what makes it a reward for staying rather than for hopping.

   A PER-STEP HAZARD, NOT A PER-STEP COIN. A flat chance would open most rifts
   in the first few hundred steps past the gate; a hazard rising from zero at
   `RIFT_FROM` puts the median at `RIFT_MEDIAN` and is forced to certain at
   `RIFT_SURE`, so a long session always sees one and a short one rarely does.
   Solved for, not picked: with hazard k(s - FROM), the chance of still being
   shut is exp(-k(s - FROM)^2 / 2), and that is one half at the median. */
export const RIFT_FROM = 600;
export const RIFT_MEDIAN = 1500;
export const RIFT_SURE = 3000;
export const RIFT_STEPS = 150;
const RIFT_K = (2 * Math.LN2) / (RIFT_MEDIAN - RIFT_FROM) ** 2;
export const riftChance = (since) =>
  (since < RIFT_FROM ? 0 : since >= RIFT_SURE ? 1 : RIFT_K * (since - RIFT_FROM));

/* WHAT A RIFT DOES TO THE TABLE IS A `tilt`, the same number a White Flute
   adds to Fortune's exponent - `rarityPower` is the ONE rarity transform in
   this game, and a second pass would compound with it. Stacked with a flute
   and maxed Fortune it lands on `RARITY_FLOOR`, which is what the floor is
   for. It moves which SPECIES, never which tier, so a honey still stacks. */
export const RIFT_TILT = 0.2;

/* WHAT THE GROUND TURNS UP: a find on one step in `1 / RIFT_FIND`, half a
   stone the shop would already sell you at this level, half Rare Candy. Sized
   against what the steps to earn a rift make (check.mjs holds it there): at
   1 in 60 it measured up to 18% of that, which is the rift paying for itself
   twice over; at 1 in 80 about two finds a rift. */
export const RIFT_FIND = 1 / 80;
export const RIFT_CANDY = 3;
export function riftFind(random, level) {
  if (random() >= RIFT_FIND) return null;
  const shelf = STONES.filter((st) => st.level <= level);
  if (shelf.length && random() < 0.5) {
    return { items: { [shelf[Math.floor(random() * shelf.length)].id]: 1 } };
  }
  return { candy: RIFT_CANDY };
}

// What the "it is over" card calls each event.
export const EVENT_NAME = { outbreak: "Outbreak", rift: "Rift" };
