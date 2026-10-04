/* THE CARD RULES (docs/cards.md) - pure and browser-free, every roll from
   `rng`, so check.mjs and tools/play replay them with seeded packs.

   CARDS ARE A COLLECTION, NEVER A STRENGTH: nothing here is read by a catch,
   a spawn table, a tier roll, a price outside this file, a battle or the
   League (asserted). This module holds no card DATA: a set arrives from the
   lazy Cards page as `{ SET, CARDS }` (src/data/cards/sets/<id>.js), so the
   main bundle carries only `CARD_SETS`. */

import { CARD_SETS } from "../data/cards/index.js";

/* THE LADDER, rarest last: the one order for sorting, the reveal's tell, the
   rarity icon and a card's finish. A printed rarity not on it stops the
   fetcher (tools/fetch-cards.mjs). `icon` is a mark the Symbols face draws.

   A ROLL LANDS ON THE FIRST RUNG AT OR BELOW IT THAT THE SET PRINTS
   (`landsOn`), which is how one set of rates serves every era (2026-10-03,
   151 and Prismatic Evolutions): the top roll is a Mega Hyper Rare where a
   set has them and a Hyper rare where it does not, and Prismatic, which
   prints no Illustration rare, answers that roll with an ACE SPEC - so
   `ace` sits just under `illustration` and `hyper` just under `mega`. */
export const CARD_RARITIES = ["common", "uncommon", "rare", "double", "ace", "illustration", "ultra", "special", "hyper", "mega"];
export const RARITY = {
  common:       { name: "Common", icon: "●" },
  uncommon:     { name: "Uncommon", icon: "◆" },
  rare:         { name: "Rare", icon: "★" },
  double:       { name: "Double rare", icon: "★★" },
  ace:          { name: "ACE SPEC Rare", icon: "◆" },
  illustration: { name: "Illustration rare", icon: "★" },
  ultra:        { name: "Ultra Rare", icon: "★★" },
  special:      { name: "Special illustration rare", icon: "★★" },
  hyper:        { name: "Hyper rare", icon: "✦" },
  mega:         { name: "Mega Hyper Rare", icon: "✦" },
};
export const rungOf = (rarity) => CARD_RARITIES.indexOf(rarity);
// A HIT is a Double rare or better - what the `hit` pity counts.
export const isHit = (rarity) => rungOf(rarity) >= rungOf("double");
// The chase: a Special illustration rare and the top rung (a Hyper or Mega Hyper Rare).
export const isTop = (rarity) => rungOf(rarity) >= rungOf("hyper");
/* WHAT A ROLL GIVES IN THIS SET: the first rung at or below `rarity` that
   its cards print - what the Packs tab names each rate and meter. */
export function landsOn(cards, rarity) {
  for (let k = rungOf(rarity); k >= 0; k--) if (cards.some((c) => c[3] === CARD_RARITIES[k])) return CARD_RARITIES[k];
  return null;
}

/* OUR PULL RATES, not the print run's (your call, 2026-10-02): a hit about
   every second pack at first; each made rarer (your call, 2026-10-03: a set
   was too easy to finish) - Double 1 in 4 -> 5, Illustration 6 -> 8, Ultra
   10 -> 12, Special 25 -> 32, the top 120 -> 180. Per pack; the Packs tab
   prints these, never a typed copy. `double` and `ultra` upgrade the rare
   slot; `illustration`, `special` and `mega` (the top roll) the second
   reverse slot. */
export const RATES = { double: 1 / 5, ultra: 1 / 12, illustration: 1 / 8, special: 1 / 32, mega: 1 / 180 };
// A pack holding a hit, before pity: what the Packs tab and Help say in words.
export const HIT_RATE = 1 - (1 - RATES.mega - RATES.special - RATES.illustration) * (1 - RATES.double - RATES.ultra);

/* PITY, three counters a set, each shown as a meter. `hard` is the pack that
   is guaranteed one (the 6th after five dry, the 45th, the 220th - each
   lengthened with the rates, 2026-10-03); from `soft` packs on, each pack
   adds `step` to the chance. A better hit resets the counters below it. */
export const PITY = {
  hit: { hard: 6 },
  special: { soft: 25, step: 0.02, hard: 45 },
  mega: { soft: 150, step: 0.01, hard: 220 },
};
export const freshPity = () => ({ hit: 0, special: 0, mega: 0 });

// A GOD PACK: seven reverse holos and three Illustration rares or better (1 in 300 until 2026-10-03).
export const GOD_PACK = 1 / 500;

/* WHAT A SPARE COPY IS WORTH IN DUST (docs/cards.md): a foil copy of a common,
   uncommon or rare counts as `foil`. Crafting costs eight times this. */
export const DUST = { common: 5, uncommon: 10, rare: 25, foil: 50, double: 80, ace: 90, illustration: 100, ultra: 150, special: 300, hyper: 400, mega: 400 };
export const dustOf = (rarity, variant) =>
  (rungOf(rarity) <= rungOf("rare") && variant !== "n" ? DUST.foil : DUST[rarity]);
/* A CRAFT COSTS SIXTEEN SPARES' WORTH. Measured over 40 seeded collectors
   opening packs until their dust covers what is missing: at 8x a full set
   cost 26% of a game's money, at the floor of the 25-60% band; 16x is 35%
   (about 230 packs), the middle - this is the game's main cash sink. Scaling
   DUST moves nothing; only this ratio does. */
export const CRAFT_X = 16;
export const craftCost = (rarity, variant) => CRAFT_X * dustOf(rarity, variant);
/* THE CHASE IS PACKS ONLY (your call, 2026-10-02): a Special illustration rare
   and a Mega Hyper Rare can never be crafted. Measured: completing a set then
   costs a median 76% of a game's money (505 packs, 250-1,060 by luck) - the
   collection outlives the playthrough, which is the sink's point. */
export const PACK_ONLY = new Set(["special", "hyper", "mega"]);
export const canCraft = (rarity) => !PACK_ONLY.has(rarity);
/* SPARES: every copy beyond the first of a card and variant, and never so many
   that the card would hold fewer copies than its earned stamps. */
export function sparesOf(row, variant) {
  if (!row?.[variant]) return 0;
  const room = copiesOf(row) - (row.earned?.length ?? 0);
  return Math.max(0, Math.min(row[variant] - 1, room));
}

/* SET MILESTONES (docs/cards.md): a share of a set's cards owned pays dust
   once; the whole set is a title too. */
export const MILESTONES = [[0.25, 200], [0.5, 500], [0.75, 1000], [1, 2000]];
/* THE MASTER SET: every printing of every card in a set (a reverse holo and a
   normal of each common count twice). Its own dust, the master title and the
   gold binder cover - paid once, as the step past MILESTONES. */
export const MASTER_DUST = 5000;
export const printingsOf = (cards) => cards.reduce((n, c) => n + c[4].length, 0);
// How many cards of a showcase a trainer card shows (trade_limit('CARD_SHOW')).
export const CARD_SHOW = 6;
export const showKey = (id, variant) => `${id}:${variant}`;
export const titleOf = (setName) => `${setName} Collector`;

// The Pulls wall keeps your best pulls, newest first.
export const LOG_MAX = 50;

/* ¥4,000 (2,400, then 3,200 - raised again, your call, 2026-10-04: money came
   too easily late and went straight into packs). Boxes and bundles moved
   with it, keeping their discount. About 420 steps of income; check.mjs
   holds 150-500. */
export const PACK_PRICE = 4000;
/* THE DISCOUNTED MULTI-PACK, one per set (your call, 2026-10-02): a booster
   box for the two main sets, a bundle for Ascended Heroes, which was never
   sold in boxes. check.mjs: no discount past 20%, and a bundle never cheaper
   a pack than a box. */
export const BOXES = {
  me01: { name: "Booster box", packs: 36, price: 120000 },
  me02: { name: "Booster box", packs: 36, price: 120000 },
  "me02.5": { name: "Booster bundle", packs: 6, price: 21600 },
  // 151 and Prismatic Evolutions were never sold in booster boxes either.
  "sv03.5": { name: "Booster bundle", packs: 6, price: 21600 },
  "sv08.5": { name: "Booster bundle", packs: 6, price: 21600 },
};
// Every 7th day of a daily-quest streak pays a pack.
export const STREAK_PACK = 7;
export const PACK_SIZE = 10;
export const CARD_MAX = 99;
// The level each set opens at (docs/cards.md, Economy).
export const SET_LEVEL = { me01: 10, me02: 25, "me02.5": 40, "sv03.5": 50, "sv08.5": 60 };

export const setById = (id) => CARD_SETS.find((s) => s.id === id) ?? null;
export const setOpen = (id, level) => !!setById(id) && level >= (SET_LEVEL[id] ?? Infinity);
// The newest set you have open - what a reward pack is.
export const newestOpen = (level) => [...CARD_SETS].reverse().find((s) => setOpen(s.id, level))?.id ?? null;

export const cardId = (setId, localId) => `${setId}-${localId}`;

/* The chance of a `special` or a `mega` on this pack, with soft pity: `n` is
   packs already opened dry of it, so this pack is the (n + 1)th. */
export function chanceOf(kind, n) {
  const p = PITY[kind];
  if (n + 1 >= p.hard) return 1;
  return Math.min(1, RATES[kind] + Math.max(0, n + 1 - p.soft) * p.step);
}

/* OPEN ONE PACK. `cards` are the set's rows; returns `{ pulls, pity, god }`,
   `pulls` in REVEAL ORDER - the eight base cards, then the two upgradeable
   slots with the better last, because the order is the drama. Each pull is
   `{ localId, rarity, variant }`; no card twice in a pack. */
export function openPack(cards, rng, pity = freshPity()) {
  const pools = {};
  for (const row of cards) (pools[row[3]] ??= []).push(row);
  const reversible = cards.filter((r) => r[4].includes("r"));
  const used = new Set();
  const pick = (pool) => {
    const left = pool.filter((r) => !used.has(r[0]));
    if (!left.length) return null;
    const row = left[Math.floor(rng() * left.length)];
    used.add(row[0]);
    return row;
  };
  // A rarity whose pool the pack has used up gives the next rarity down.
  const of = (rarity, variant) => {
    for (let k = rungOf(rarity); k >= 0; k--) {
      const row = pick(pools[CARD_RARITIES[k]] ?? []);
      if (row) return { localId: row[0], rarity: row[3], variant: row[4].includes(variant) ? variant : row[4][0] };
    }
    return null;
  };
  const reverse = () => {
    const row = pick(reversible);
    return row ? { localId: row[0], rarity: row[3], variant: "r" } : of("common", "n");
  };

  if (rng() < GOD_PACK) {
    const pulls = Array.from({ length: 7 }, reverse);
    const tail = [of("illustration", "h"), of("illustration", "h"), of(rng() < 1 / 3 ? "special" : "illustration", "h")];
    return { pulls: [...pulls, ...sortTail(tail)].filter(Boolean), pity: { ...pity }, god: true };
  }

  const base = [
    ...Array.from({ length: 4 }, () => of("common", "n")),
    ...Array.from({ length: 3 }, () => of("uncommon", "n")),
    reverse(),
  ];
  // The second reverse slot: a mega, a special, an illustration, or a reverse.
  let slot2;
  if (rng() < chanceOf("mega", pity.mega)) slot2 = of("mega", "h");
  else if (rng() < chanceOf("special", pity.special)) slot2 = of("special", "h");
  else if (rng() < RATES.illustration) slot2 = of("illustration", "h");
  else slot2 = reverse();
  // The rare slot: an ultra, a double, or a holo rare - forced to a hit
  // on the `hit` pity's hard pack when nothing else in the pack is one.
  const r = rng();
  const forced = pity.hit + 1 >= PITY.hit.hard && !isHit(slot2.rarity);
  const rareSlot = r < RATES.ultra || (forced && r < RATES.ultra / (RATES.ultra + RATES.double))
    ? of("ultra", "h")
    : r < RATES.ultra + RATES.double || forced ? of("double", "h") : of("rare", "h");

  const pulls = [...base, ...sortTail([slot2, rareSlot])];
  const best = Math.max(...pulls.map((p) => rungOf(p.rarity)));
  const next = {
    hit: best >= rungOf("double") ? 0 : pity.hit + 1,
    special: best >= rungOf("special") ? 0 : pity.special + 1,
    mega: isTop(CARD_RARITIES[best]) ? 0 : pity.mega + 1,
  };
  return { pulls, pity: next, god: false };
}

// The better card last: rarity first, a foil copy over a plain one.
const weight = (p) => rungOf(p.rarity) * 2 + (p.variant === "n" ? 0 : 1);
const sortTail = (tail) => tail.filter(Boolean).sort((a, b) => weight(a) - weight(b));

/* A SAVED COLLECTION ROW, cleaned: `{ n, h, r }` whole counts in 0..CARD_MAX
   and `earned` stamps. Anything else is dropped, the row too if it is empty -
   never the whole collection. */
export function cleanCard(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out = {};
  for (const k of ["n", "h", "r"]) {
    const c = Math.floor(Number(v[k]));
    if (Number.isFinite(c) && c > 0) out[k] = Math.min(CARD_MAX, c);
  }
  if (Array.isArray(v.earned)) {
    const e = v.earned.filter((s) => typeof s === "string" && s.length <= 64).slice(0, CARD_MAX);
    if (e.length) out.earned = e;
  }
  return out.n || out.h || out.r ? out : null;
}

// How many copies of a card, every variant.
export const copiesOf = (row) => (row?.n ?? 0) + (row?.h ?? 0) + (row?.r ?? 0);
