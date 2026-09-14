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

   The one number the whole design rests on: 49 points against 100 ranks of
   capacity. Being unable to have it all is the only thing that makes the choice
   mean anything, and check() asserts that inequality directly. Nothing here is
   respeccable for the same reason.

   Pure and DOM-free, so tools/check.mjs can assert the curves stay sane. Every
   scale below is applied at the engine's call sites rather than baked into the
   economy functions, which keeps the base numbers - and the tests that pin the
   loop to them - true. */

export const MAX_RANK = 20;

/* One point per level after the first. Level 50 is MAX_LEVEL, so 49 in total
   against 100 ranks of capacity. */
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
export const rarityPower = (stats) => 1 - 0.02 * rank(stats, "fortune");

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

/* The two sums Haggle changes. Both the engine and the panels that display
   them call these, so a shown price is always the charged price - recomputing
   the same formula in two places is exactly how those drift apart. */
export const pricedAt = (price, stats) =>
  Math.max(1, Math.round(price * priceScale(stats)));
export const valuedAt = (base, stats) => Math.round(base * sellScale(stats));

/* Applying a weight curve to an encounter table. Kept here rather than in the
   engine so the tests can roll against it without a canvas. */
export function weighted(table, stats) {
  const p = rarityPower(stats);
  return table.map(([id, w]) => [id, w ** p]);
}
