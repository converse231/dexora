/* Trainer stats: what a level is actually worth.

   Levelling handed out balls and unlocked shop stock. That paces the game but
   never changes how you play it - every trainer at level 20 played identically.
   A point per level, spent where you choose, does change it: one player is a
   collector who never misses a throw, another a hunter who keeps turning up
   things nobody else sees, and neither can be both.

   Five stats, TWENTY ranks each. It was ten, and ten was too few: a point a
   level fills a stat every eleven levels, so the interesting half of this
   screen was finished long before the dex was. Doubling the ranks and halving
   every coefficient below leaves rank 20 worth exactly what rank 10 used to be
   - the ceiling has not moved, the road to it is twice as long and has twice as
   many decisions on it. The level curve was extended to 50 to pay for them.

   The one number the whole design rests on: 99 points against 140 ranks of
   capacity (74 against 100 at a Lv 75 cap, 49 at 50) - 71%, about what it
   was. The cap went to 100 and Lustre and Coach came with it, so the
   ratio held instead of the choice disappearing. Being unable to have it all is the only thing that makes the choice
   mean anything, and check() asserts that inequality directly. Nothing here is
   respeccable for the same reason.

   Pure and DOM-free, so tools/check.mjs can assert the curves stay sane. Every
   scale below is applied at the engine's call sites rather than baked into the
   economy functions, which keeps the base numbers - and the tests that pin the
   loop to them - true. */

export const MAX_RANK = 20;

/* One point per level after the first. Level 100 is MAX_LEVEL, so 99 in total
   against 140 ranks of capacity. Short of it on purpose. */
export const earnedPoints = (level) => Math.max(0, level - 1);

export const STATS = [
  {
    id: "precision",
    name: "Precision",
    glyph: "◎",
    blurb: "Steadier arm. Every ball you own catches better.",
    effect: (r) => `+${r * 3}% catch odds`,
  },
  {
    id: "fortune",
    name: "Fortune",
    glyph: "✦",
    blurb: "Rare things come out to meet you. Flattens the encounter table toward its tail.",
    /* Stated relative to rank 0 rather than as a share of finds. Rares are ~1.2%
       of a table to begin with, so an absolute percentage rounded for display
       read "~1%" at ranks 0, 1 and 2 alike - three different ranks that all
       looked identical, which made the stat impossible to judge. */
    effect: (r) => `+${Math.round((rareShareAt(r) / rareShareAt(0) - 1) * 100)}% rare finds`,
  },
  {
    id: "stride",
    name: "Stride",
    glyph: "»",
    blurb: "Cover ground faster, and meet more on the way.",
    effect: (r) => `${Math.round((1 - stepScale({ stride: r })) * 100)}% quicker steps`,
  },
  {
    id: "haggle",
    name: "Haggle",
    glyph: "¥",
    blurb: "Duplicates fetch more, and the shop asks for less.",
    effect: (r) => `+${r * 2}% sale, −${r}% prices`,
  },
  {
    id: "insight",
    name: "Insight",
    glyph: "✧",
    blurb: "You learn more from every catch, so the next level comes sooner.",
    effect: (r) => `+${r * 4}% XP`,
  },
  /* THE COLLECTOR'S STAT. It multiplies the tier roll beside pity, honey, an
     outbreak, a star and the Region Charm, and at rank 20 it is exactly a
     research star (check.mjs) - a permanent lift on every species, never
     stronger than the one you earn on one species. */
  {
    id: "lustre",
    name: "Lustre",
    glyph: "◇",
    blurb: "Rare forms find you. Every shiny, holo and other tier is likelier.",
    effect: (r) => `+${Math.round(r * 2.5)}% rare forms`,
  },
  /* THE LEAGUE'S STAT. A team is bought with Rare Candy, so this is how a
     trainer builds one sooner. It pays on converting a duplicate only - not an
     alpha's candy, not the shop's, which Haggle already discounts. */
  {
    id: "coach",
    name: "Coach",
    glyph: "▲",
    blurb: "Duplicates turn into more Rare Candy, so a team is ready sooner.",
    effect: (r) => `+${r * 2}% candy`,
  },
];

const statById = (id) => STATS.find((s) => s.id === id) ?? null;

export const emptyStats = () =>
  Object.fromEntries(STATS.map((s) => [s.id, 0]));

/* Reads a rank defensively: an old save has no stats object at all, and a
   hand-edited one could hold anything. */
export const rank = (stats, id) =>
  Math.max(0, Math.min(MAX_RANK, Math.floor(stats?.[id] ?? 0) || 0));

export const spentPoints = (stats) =>
  STATS.reduce((n, s) => n + rank(stats, s.id), 0);

export const freePoints = (stats, level) =>
  Math.max(0, earnedPoints(level) - spentPoints(stats));

export const canSpend = (stats, level, id) =>
  !!statById(id) && rank(stats, id) < MAX_RANK && freePoints(stats, level) > 0;

// ------------------------------------------------------------------ effects

/* Multiplies the ball's own multiplier, so it stacks with better balls rather
   than replacing them. The Master Ball is already past the guarantee threshold,
   so scaling it up changes nothing - it cannot be more certain than certain. */
export const catchMult = (stats) => 1 + 0.03 * rank(stats, "precision");

/* Fortune raises every encounter weight to a power below 1, which compresses
   the table toward its tail: a weight-1 legendary stays at 1 while a weight-22
   Pidgey drops toward 6, so the rare share climbs without any entry ever being
   removed or any new one appearing. Monotone, and it can never reach certainty.

   Halved with the rest when ranks doubled, so rank 20 is the old rank 10. It
   bites hardest on the legendaries, whose weights are now well below 1 (see
   biomes.js): raising 0.08 to the power 0.6 more than doubles it while a
   weight-22 Pidgey falls to a quarter of itself. That is the stat working. */
/* ONE EXPONENT DECIDES HOW RARE THE WORLD IS, and everything that wants a say
   contributes to it rather than adding a pass of its own. Fortune is a
   permanent investment in it; a White Flute is four hundred steps of one. The
   note this was deferred behind said three things reshaping one table need one
   rule, and this is that rule.

   `tilt` is a NUMBER rather than the name of an item, so the rule holds for
   whatever is added next: a field item contributes its `tilt` and nothing
   anywhere gets to raise a weight to a second power. The other two field
   families deliberately cannot reach this function at all - Repel moves how
   OFTEN an encounter happens and Honey moves which TIER it wears.

   Floored, because the exponent is what separates a weight-22 Pidgey from a
   weight-1 Snorlax: at 0 every row is worth the same and rarity stops
   existing. A maxed Fortune with a White Flute running lands exactly on it,
   which is the most compressed this table is ever meant to get. */
export const RARITY_FLOOR = 0.4;

export const rarityPower = (stats, tilt = 0) =>
  Math.max(RARITY_FLOOR, 1 - 0.02 * rank(stats, "fortune") - tilt);

// Fraction of a representative table that is weight <= 2, at a given rank.
function rareShareAt(r) {
  const table = [22, 22, 14, 14, 10, 10, 10, 8, 8, 7, 6, 6, 6, 5, 5, 4, 3, 3, 1, 1];
  const p = 1 - 0.02 * r;
  const w = table.map((x) => x ** p);
  const total = w.reduce((a, b) => a + b, 0);
  return w.slice(-2).reduce((a, b) => a + b, 0) / total;
}

// Step duration multiplier. Bicycles are separate and multiply on top of this.
export const stepScale = (stats) => 1 - 0.02 * rank(stats, "stride");

export const sellScale = (stats) => 1 + 0.02 * rank(stats, "haggle");
export const priceScale = (stats) => 1 - 0.01 * rank(stats, "haggle");
export const xpScale = (stats) => 1 + 0.04 * rank(stats, "insight");
export const tierLift = (stats) => 1 + 0.025 * rank(stats, "lustre");

/* What converting duplicates pays: the bonus on the BATCH's base candy,
   rounded once. Per Pokemon it was nothing - a common is 1 candy, and 1.4
   rounds back to 1. The Box quotes each batch through this same call. */
export const candyAt = (base, stats) => Math.round(base * (1 + 0.02 * rank(stats, "coach")));

/* The two sums Haggle changes. Both the engine and the panels that display
   them call these, so a shown price is always the charged price - recomputing
   the same formula in two places is exactly how those drift apart. */
export const pricedAt = (price, stats) =>
  Math.max(1, Math.round(price * priceScale(stats)));
export const valuedAt = (base, stats) => Math.round(base * sellScale(stats));

/* Applying a weight curve to an encounter table. Kept here rather than in the
   engine so the tests can roll against it without a canvas. */
export function weighted(table, stats, tilt = 0) {
  const p = rarityPower(stats, tilt);
  return table.map(([id, w]) => [id, w ** p]);
}
