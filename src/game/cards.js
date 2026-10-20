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
/* Low to high. `pikachu` and `futuristic` are 30th Celebration's (2026):
   a Pikachu in every pack (not a hit), and its Mew ex and Mewtwo ex - the
   set's top chase, where an era's Hyper or Mega Hyper Rare would be. No save
   or server row stores a rung, so a new one is inserted where it ranks. */
/* `holo` is Base Set's holo rare (2026-10-07): its hit, so the hit line
   starts there (`isHit`) - no other set prints the rung. `blackwhite` is
   Black Bolt's and White Flare's top chase, under `hyper` so their top roll
   lands on it. `shiny` and `shinyultra` are Paldean Fates' shiny vault
   (2026-10-13): a Shiny rare sits just under the Double rare, so its 120
   cards can be crafted, and a Shiny Ultra Rare beside the Ultra Rare. */
/* `gallery` and `radiant` are Sword & Shield's (2026-10-15): a Trainer or
   Galarian Gallery card - whatever it prints, one rung, drawn in place of a
   reverse holo - and a Radiant Rare, each its own roll; both just over the
   Double rare, so packs only. Its V, VMAX and VSTAR are the Double rare, its
   Secret Rare the Hyper rare. ITS HOLO RARE IS `holorare`, NOT A HIT (your
   call, 2026-10-17): one in every third Sword & Shield pack, it lit the hit
   pips for a card worth a rare. Base Set's `holo` stays a hit - it is that
   set's chase. The rung sits just under `holo`, so the rare slot's `holo`
   roll lands on it in a set that prints no 1999 holo (`of`, `landsOn`). */
export const CARD_RARITIES = ["common", "uncommon", "rare", "pikachu", "holorare", "holo", "shiny", "double", "gallery", "ace", "radiant", "illustration", "ultra", "shinyultra", "special", "futuristic", "blackwhite", "hyper", "mega"];
export const RARITY = {
  common:       { name: "Common", icon: "●" },
  uncommon:     { name: "Uncommon", icon: "◆" },
  rare:         { name: "Rare", icon: "★" },
  pikachu:      { name: "Pikachu Rare", icon: "★" },
  holorare:     { name: "Holo Rare", icon: "★" },
  holo:         { name: "Holo Rare", icon: "★" },
  shiny:        { name: "Shiny rare", icon: "★" },
  double:       { name: "Double rare", icon: "★★" },
  gallery:      { name: "Gallery rare", icon: "★" },
  ace:          { name: "ACE SPEC Rare", icon: "◆" },
  radiant:      { name: "Radiant Rare", icon: "✦" },
  illustration: { name: "Illustration rare", icon: "★" },
  ultra:        { name: "Ultra Rare", icon: "★★" },
  shinyultra:   { name: "Shiny Ultra Rare", icon: "★★" },
  special:      { name: "Special illustration rare", icon: "★★" },
  futuristic:   { name: "Futuristic Rare", icon: "✦" },
  blackwhite:   { name: "Black White Rare", icon: "✦" },
  hyper:        { name: "Hyper rare", icon: "✦" },
  mega:         { name: "Mega Hyper Rare", icon: "✦" },
};
export const rungOf = (rarity) => CARD_RARITIES.indexOf(rarity);
// A HIT is Base Set's Holo Rare or a Double rare or better - what the `hit` pity counts.
// Sword & Shield's Holo Rare (`holorare`) is under the line.
export const isHit = (rarity) => rungOf(rarity) >= rungOf("holo");
// The chase: a Special illustration rare and the top rung (a Futuristic, Hyper or Mega Hyper Rare).
export const isTop = (rarity) => rungOf(rarity) >= rungOf("futuristic");
/* WHAT A ROLL GIVES IN THIS SET: the first rung at or below `rarity` that
   its cards print - what the Packs tab names each rate and meter. */
export function landsOn(cards, rarity) {
  for (let k = rungOf(rarity); k >= 0; k--) if (cards.some((c) => c[3] === CARD_RARITIES[k])) return CARD_RARITIES[k];
  return null;
}

/* REAL-LIFE PULL RATES, ONE ROW A SET (your call, 2026-10-06): each set opens
   at the rates its English booster measures, from TCGplayer's community
   data - per pack, the chance of at least one card of that rarity. They were
   ours until then (a hit every second pack, then a little rarer). A NEW SET
   IS NOT SHIPPED WITHOUT ITS ROW: check.mjs fails a set with none, so a
   future expansion arrives with its own real numbers, never a default.

   The keys are ROLLS, not rarities: `double` and `ultra` upgrade the rare
   slot; `illustration`, `special` and `mega` (the top roll) the second
   reverse slot, and each lands on the first rung the set prints
   (`landsOn`) - Prismatic's illustration roll is its ACE SPEC rate, a
   Scarlet & Violet set's top roll its Hyper rare rate.

   - me01 Mega Evolution: DR 20.91%, IR 10.89%, UR 8.23%, SIR 0.99%, MHR 0.08%.
   - me02 Phantasmal Flames: DR 20.77%, IR 10.97%, UR 8.06%, SIR 1.25%; its
     MHR rate is not published, so Mega Evolution's (the same era) stands in.
   - me02.5 Ascended Heroes: DR 20.37%, IR 11.25%, UR 4.81% + Mega Attack
     Rare 3.47% (TCGdex prints those as Ultra Rares, so one roll), SIR 1.44%,
     MHR 0.19%.
   - sv03.5 151: DR ~1 in 8, IR 8.50%, UR 6.44%, SIR 3.11%, HR 1.94%.
   - sv08.5 Prismatic Evolutions: DR 16.51%, ACE SPEC 4.68%, UR 7.46%,
     SIR 2.22%, HR 0.56% (its Poke Ball and Master Ball reverses are not
     separate printings here).
   - me03 Perfect Order (TCGplayer, 3,500+ packs): DR 20.00%, IR 11.11%,
     UR 8.33%, SIR 1.23%, MHR 0.06% (Mega Zygarde ex).
   - me04 Chaos Rising (TCGplayer, 8,500+ packs): DR 20.30%, IR 10.66%,
     UR 8.29%, SIR 1.21%, MHR 0.10%.
   - me05 Pitch Black (TCGplayer, 4,000+ packs): DR 21.02%, IR 11.01%,
     UR 8.30%, SIR 1.25%, MHR 0.09%.
   - 30th 30th Celebration (2026-10-07): no official odds; two community logs
     (cardprice.com ~800 packs, DigitalTQ 420) agree near DR 25%, IR 19%,
     SIR 5.1%, Futuristic Rare 0.9% (the top roll), a Pikachu in every pack
     (`pikachu` slot), and no Ultra Rares (that roll is 0). Revisit when
     TCGplayer's own numbers settle.
   - sv08 Surging Sparks (community aggregate, cardcodex / tcgtalk): DR 16.9%,
     IR 7.7%, ACE SPEC 5.0%, UR 6.8%, SIR 1.15%, HR 0.53%. It prints both
     Illustration rares and ACE SPECs, so the ACE SPEC has its own roll
     (`ace`, optional: a set whose row names it).
   - sv09 Journey Together (TCGplayer): DR 1 in 5, IR 1 in 9, SIR 1 in 83, HR
     1 in 956 for a given one (three printed: 1 in ~319); its Ultra Rares are
     not in that report, so a 500-pack community log stands (full-art
     Pokemon 1 in 35 + trainers 1 in 63).
   - sv10 Destined Rivals (TCGplayer, 8,000+ packs): DR 1 in 5, IR 1 in 12,
     UR 1 in 16, SIR 1 in 94, HR 1 in 149.
   - sv10.5b/w Black Bolt and White Flare (one report, both sets): DR
     21.11%, IR 16.39%, UR 5.83%, SIR 1.25%; the Black White Rare unpulled
     in 700 packs, community estimate 1 in 360-450 (1 in 400 here). Their
     Poke Ball and Master Ball reverses are not separate printings here.
   - THE REST OF SCARLET & VIOLET (2026-10-13), each from TCGplayer's
     Authentication Center as pullrates.com reports it (8,000+ packs a set;
     1,500+ for Paldean Fates and Shrouded Fable), DR / IR / UR / SIR / HR:
     sv01 Scarlet & Violet 1 in 7 / 13 / 15 / 32 / 54; sv02 Paldea Evolved
     7 / 13 / 15 / 32 / 57; sv03 Obsidian Flames 7 / 13 / 15 / 32 / 52;
     sv04 Paradox Rift 6 / 13 / 15 / 47 / 82. From Temporal Forces on an
     ACE SPEC 1 in 20 beside them: sv05 Temporal Forces 6 / 13 / 15 / 86 /
     188; sv06 Twilight Masquerade 6 / 13 / 15 / 86 / 146; sv06.5 Shrouded
     Fable 6 / 12 / 15 / 67 / 144; sv07 Stellar Crown 6 / 13 / 15 / 90 / 137.
   - sv04.5 Paldean Fates: Shiny rare 1 in 4 and Shiny Ultra Rare 1 in 13
     (their own rolls, `shiny` and `shinyultra`, like the ACE SPEC's), DR 1
     in 6, IR 14, UR 15, SIR 58, HR 62.
   - base1 Base Set 1st Edition (1999): one rare a pack, a holo one pack in
     three - the double roll, which lands on `holo`. Nothing else is printed:
     every other roll is 0.
   - SWORD & SHIELD (2026-10-15), each from TCGplayer's Authentication Center
     as pullrates.com reports it (8,000+ packs a set; 1,500+ for Crown
     Zenith). Its rare slot has a Holo Rare roll of its own (`holo`), beside
     the Double rare (V + VMAX + VSTAR) and Ultra Rare; the top roll is its
     Secret Rares (Rainbow + Gold); a Radiant Rare and a gallery card (every
     gallery tier together) are second-slot rolls. No Illustration or Special
     illustration rares: those rolls are 0.
     swsh7 Evolving Skies: Holo 1 in 3, V 9 + VMAX 18, UR 26, Rainbow 88 +
     Gold 109. swsh9 Brilliant Stars: Holo 3, V 10 + VSTAR 30 + VMAX 200, UR
     54, Rainbow 51 + Gold 92, Trainer Gallery 8 + TG V 18 + TG Gold 309.
     swsh11 Lost Origin: Holo 3, V 9 + VSTAR 27 + VMAX 158, UR 26, Rainbow 78
     + Gold 131, Radiant 20, TG 12 + TG V 32 + TG Gold 117. swsh12 Silver
     Tempest: Holo 3, V 9 + VSTAR 31 + VMAX 189, UR 27, Rainbow 80 + Gold 106,
     Radiant 22, TG 12 + TG V 32 + TG Gold 111. swsh12.5 Crown Zenith: Holo
     13, V 8 + VMAX 19 + VSTAR 19, UR 35, Secret 133, Radiant 22, Galarian
     Gallery 4 + GG V 8 + GG Gold 125.
   - FIVE MORE SWORD & SHIELD SETS (2026-10-20), the best source each has:
     swsh8 Fusion Strike and swsh10 Astral Radiance are TCGplayer's
     Authentication Center as pullrates.com reports it (8,000+ packs):
     Fusion Strike Holo 3, V 9 + VMAX 30, UR 24, Rainbow 127 + Secret 120;
     Astral Radiance Holo 3, V 8 + VSTAR 37 + VMAX 130, UR 25, Rainbow 78 +
     Secret 130, Radiant 20, Trainer Gallery 12 + TG V 24. swsh3 Darkness
     Ablaze and swsh6 Chilling Reign are pullrates.com's figures (no sample
     stated) with the Secret rate it leaves out from Card Codex: Darkness
     Ablaze Holo 3, V 9 + VMAX 20, UR 24, Rainbow 77 + Secret 115; Chilling
     Reign Holo 3, V 9 + VMAX 18, UR 24, Rainbow 77 + Secret 100.
     swsh10.5 Pokemon GO is Card Codex's table (pullrates.com had 371
     packs): V 6 + VSTAR 40 + VMAX 53, UR 19.4, Rainbow 38.7 + Secret 63,
     Radiant 17 - and every pack holds a holo or better, so its Holo is
     what the rare slot's other rolls leave (Card Codex: 1 in 1.4). */
export const SET_RATES = {
  me01: { double: 0.2091, illustration: 0.1089, ultra: 0.0823, special: 0.0099, mega: 0.0008 },
  me02: { double: 0.2077, illustration: 0.1097, ultra: 0.0806, special: 0.0125, mega: 0.0008 },
  "me02.5": { double: 0.2037, illustration: 0.1125, ultra: 0.0481 + 0.0347, special: 0.0144, mega: 0.0019 },
  "sv03.5": { double: 1 / 8, illustration: 0.085, ultra: 0.0644, special: 0.0311, mega: 0.0194 },
  "sv08.5": { double: 0.1651, illustration: 0.0468, ultra: 0.0746, special: 0.0222, mega: 0.0056 },
  me03: { double: 0.2000, illustration: 0.1111, ultra: 0.0833, special: 0.0123, mega: 0.0006 },
  me04: { double: 0.2030, illustration: 0.1066, ultra: 0.0829, special: 0.0121, mega: 0.0010 },
  me05: { double: 0.2102, illustration: 0.1101, ultra: 0.0830, special: 0.0125, mega: 0.0009 },
  "30th": { double: 0.25, illustration: 0.19, ultra: 0, special: 0.051, mega: 0.009 },
  sv08: { double: 0.169, illustration: 0.077, ace: 0.05, ultra: 0.068, special: 0.0115, mega: 0.0053 },
  sv09: { double: 1 / 5, illustration: 1 / 9, ultra: 1 / 35 + 1 / 63, special: 1 / 83, mega: 3 / 956 },
  sv10: { double: 1 / 5, illustration: 1 / 12, ultra: 1 / 16, special: 1 / 94, mega: 1 / 149 },
  "sv10.5b": { double: 0.2111, illustration: 0.1639, ultra: 0.0583, special: 0.0125, mega: 1 / 400 },
  "sv10.5w": { double: 0.2111, illustration: 0.1639, ultra: 0.0583, special: 0.0125, mega: 1 / 400 },
  sv01: { double: 1 / 7, illustration: 1 / 13, ultra: 1 / 15, special: 1 / 32, mega: 1 / 54 },
  sv02: { double: 1 / 7, illustration: 1 / 13, ultra: 1 / 15, special: 1 / 32, mega: 1 / 57 },
  sv03: { double: 1 / 7, illustration: 1 / 13, ultra: 1 / 15, special: 1 / 32, mega: 1 / 52 },
  sv04: { double: 1 / 6, illustration: 1 / 13, ultra: 1 / 15, special: 1 / 47, mega: 1 / 82 },
  "sv04.5": { double: 1 / 6, illustration: 1 / 14, shinyultra: 1 / 13, shiny: 1 / 4, ultra: 1 / 15, special: 1 / 58, mega: 1 / 62 },
  sv05: { double: 1 / 6, illustration: 1 / 13, ace: 1 / 20, ultra: 1 / 15, special: 1 / 86, mega: 1 / 188 },
  sv06: { double: 1 / 6, illustration: 1 / 13, ace: 1 / 20, ultra: 1 / 15, special: 1 / 86, mega: 1 / 146 },
  "sv06.5": { double: 1 / 6, illustration: 1 / 12, ace: 1 / 20, ultra: 1 / 15, special: 1 / 67, mega: 1 / 144 },
  sv07: { double: 1 / 6, illustration: 1 / 13, ace: 1 / 20, ultra: 1 / 15, special: 1 / 90, mega: 1 / 137 },
  base1: { double: 1 / 3, illustration: 0, ultra: 0, special: 0, mega: 0 },
  swsh7: { holo: 1 / 3, double: 1 / 9 + 1 / 18, ultra: 1 / 26, illustration: 0, special: 0, mega: 1 / 88 + 1 / 109 },
  swsh9: { holo: 1 / 3, double: 1 / 10 + 1 / 30 + 1 / 200, ultra: 1 / 54, illustration: 0, special: 0, mega: 1 / 51 + 1 / 92,
    gallery: 1 / 8 + 1 / 18 + 1 / 309 },
  swsh11: { holo: 1 / 3, double: 1 / 9 + 1 / 27 + 1 / 158, ultra: 1 / 26, illustration: 0, special: 0, mega: 1 / 78 + 1 / 131,
    radiant: 1 / 20, gallery: 1 / 12 + 1 / 32 + 1 / 117 },
  swsh12: { holo: 1 / 3, double: 1 / 9 + 1 / 31 + 1 / 189, ultra: 1 / 27, illustration: 0, special: 0, mega: 1 / 80 + 1 / 106,
    radiant: 1 / 22, gallery: 1 / 12 + 1 / 32 + 1 / 111 },
  "swsh12.5": { holo: 1 / 13, double: 1 / 8 + 1 / 19 + 1 / 19, ultra: 1 / 35, illustration: 0, special: 0, mega: 1 / 133,
    radiant: 1 / 22, gallery: 1 / 4 + 1 / 8 + 1 / 125 },
  swsh3: { holo: 1 / 3, double: 1 / 9 + 1 / 20, ultra: 1 / 24, illustration: 0, special: 0, mega: 1 / 77 + 1 / 115 },
  swsh6: { holo: 1 / 3, double: 1 / 9 + 1 / 18, ultra: 1 / 24, illustration: 0, special: 0, mega: 1 / 77 + 1 / 100 },
  swsh8: { holo: 1 / 3, double: 1 / 9 + 1 / 30, ultra: 1 / 24, illustration: 0, special: 0, mega: 1 / 127 + 1 / 120 },
  swsh10: { holo: 1 / 3, double: 1 / 8 + 1 / 37 + 1 / 130, ultra: 1 / 25, illustration: 0, special: 0, mega: 1 / 78 + 1 / 130,
    radiant: 1 / 20, gallery: 1 / 12 + 1 / 24 },
  "swsh10.5": { holo: 1 - (1 / 6 + 1 / 40 + 1 / 53) - 1 / 19.4 - (1 / 38.7 + 1 / 63), double: 1 / 6 + 1 / 40 + 1 / 53,
    ultra: 1 / 19.4, illustration: 0, special: 0, mega: 1 / 38.7 + 1 / 63, radiant: 1 / 17 },
};
/* THE SECOND REVERSE SLOT'S OWN ROLLS, after the Illustration rare, rarest
   first: a key a set's row may name (Surging Sparks' ACE SPEC, Paldean
   Fates' shiny vault), each landing on its own rung. */
export const EXTRA_ROLLS = ["ace", "radiant", "shinyultra", "shiny", "gallery"];
/* A pack holding a hit (a Holo rare or better), at a set's rates - Sword &
   Shield's rare slot rolls its Holo Rare (`holo`) beside its Double rares. */
export const hitRateOf = (r) => 1 - (1 - r.mega - r.special - r.illustration
  - EXTRA_ROLLS.reduce((t, k) => t + (r[k] ?? 0), 0)) * (1 - r.double - r.ultra);

/* PITY IS A SAFETY NET, NOT A SCHEDULE (your call, 2026-10-06): real packs
   have none, so each set's is scaled to its own rates - the odds start to
   rise at `PITY_NET[0]` times the average wait and the pull is certain at
   `PITY_NET[1]` times it. Almost everyone pulls at the real rate; only the
   unluckiest run is rescued (Mega Evolution: an SIR by pack 303, a Mega
   Hyper Rare by 3,750). It was a fixed 45 and 220, which at real rates
   would have made pulls far easier than real life. Three counters a set,
   each a meter; a better hit resets the counters below it. */
export const PITY_NET = [1.5, 3];
const net = (p) => ({ soft: Math.round(PITY_NET[0] / p), hard: Math.round(PITY_NET[1] / p) });

/* EVERYTHING A SET'S PACKS FOLLOW: its rates, its hit rate and its pity.
   Null for a set with no row (which check.mjs refuses to ship). */
export function rulesOf(setId) {
  const rates = SET_RATES[setId];
  if (!rates) return null;
  const hit = hitRateOf(rates);
  return { rates, hit, pity: { hit: { hard: Math.round(PITY_NET[1] / hit) }, special: net(rates.special), mega: net(rates.mega) } };
}

export const freshPity = () => ({ hit: 0, special: 0, mega: 0 });

// A GOD PACK: seven reverse holos and three Illustration rares or better (1 in 300 until 2026-10-03).
export const GOD_PACK = 1 / 500;

/* WHAT A SPARE COPY IS WORTH IN DUST (docs/cards.md): a foil copy of a common,
   uncommon or rare counts as `foil`. Crafting costs eight times this. */
export const DUST = { common: 5, uncommon: 10, rare: 25, foil: 50, pikachu: 40, holorare: 60, holo: 60, shiny: 70, double: 80, gallery: 90, ace: 90, radiant: 100, illustration: 100, ultra: 150, shinyultra: 200, special: 300, futuristic: 400, blackwhite: 400, hyper: 400, mega: 400 };
export const dustOf = (rarity, variant) =>
  (rungOf(rarity) <= rungOf("rare") && variant !== "n" ? DUST.foil : DUST[rarity]);
/* A CRAFT COSTS SIXTEEN SPARES' WORTH. Measured over 40 seeded collectors
   opening packs until their dust covers what is missing: at 8x a full set
   cost 26% of a game's money, at the floor of the 25-60% band; 16x is 35%
   (about 230 packs), the middle - this is the game's main cash sink. Scaling
   DUST moves nothing; only this ratio does. */
export const CRAFT_X = 16;
export const craftCost = (rarity, variant) => CRAFT_X * dustOf(rarity, variant);
/* CRAFTING ENDS AT THE DOUBLE RARE (your call, 2026-10-07; it was every
   rung below the Special illustration rare): a Common up to a Double rare can
   be made from dust, so a set never stalls on one missing common; an
   Illustration rare and everything above it - the ACE SPEC too, which is
   Prismatic's illustration roll - comes from packs only. Dust's other use is
   a pack (DUST_PACK). */
export const PACK_ONLY = new Set(CARD_RARITIES.filter((r) => rungOf(r) > rungOf("double")));
/* AND A SET'S OWN CHASE IS PACKS ONLY (your call, 2026-10-10): Base Set's
   top card is a Holo rare - under the Double rare on the modern ladder, so
   the Charizard every Base Set pack is opened for crafted for 960 dust.
   Given the set's cards, its highest rung is refused too; a modern set's is
   a Hyper rare or above already. */
const topRung = (cards) => cards.reduce((k, c) => Math.max(k, rungOf(c[3])), -1);
export const canCraft = (rarity, cards = null) => rungOf(rarity) >= 0 && rungOf(rarity) <= rungOf("double")
  && !(cards && rungOf(rarity) >= topRung(cards));
/* A PACK FOR DUST, of any set you have open. Measured: a pack whose every
   card is a spare dusts to about 230 (177 for 30th Celebration's), so 400
   gives back at most ~57% - dust turns duplicates into more chances, never
   into a loop of free packs. check.mjs re-measures it. */
export const DUST_PACK = 400;
/* SPARES: every copy beyond the first of a card and variant, and never so many
   that the card would hold fewer copies than its earned stamps. */
export function sparesOf(row, variant) {
  if (!row?.[variant]) return 0;
  const room = copiesOf(row) - (row.earned?.length ?? 0);
  return Math.max(0, Math.min(row[variant] - 1, room));
}

/* WHAT A SWEEP TAKES from one set's cards, as [card, variant, n]: every
   spare normal common and uncommon, or with `every` every spare printing up
   to a Double rare (asked for, 2026-10-13: ten reverse holos could only be
   dusted one press at a time). The room a card has above its earned stamps
   is SHARED by its printings, so each printing is taken from what the one
   before it left - counted alone, a normal and a reverse holo could each
   spend the same room and dust an earned copy. The engine's sweep and the
   Dust tab's button both read this. */
export function sweepOf(rows, setId, cards, every = false) {
  const top = every ? rungOf("double") : rungOf("uncommon");
  return cards.flatMap((c) => {
    if (rungOf(c[3]) > top) return [];
    let row = rows[cardId(setId, c[0])];
    const out = [];
    for (const v of every ? c[4].split("") : ["n"]) {
      const n = sparesOf(row, v);
      if (!n) continue;
      out.push([c, v, n]);
      row = { ...row, [v]: row[v] - n };
    }
    return out;
  });
}

/* SET MILESTONES (docs/cards.md): a share of a set's cards owned pays dust
   once; the whole set is a title too. */
export const MILESTONES = [[0.25, 200], [0.5, 500], [0.75, 1000], [1, 2000]];
/* THE MASTER SET: every printing of every card in a set (a reverse holo and a
   normal of each common count twice). Its own dust, the master title and the
   gold binder cover - paid once, as the step past MILESTONES. */
export const MASTER_DUST = 5000;
export const printingsOf = (cards) => cards.reduce((n, c) => n + c[4].length, 0);
/* YOUR OWN BINDERS (asked for, 2026-10-13): cards from any set, in the order
   you put them. A binder is `{ id, name, pockets }`, a pocket a printing key
   ("me01-187:h") or null for an empty one. A card you later dust or trade
   STAYS in its pocket and is drawn faded - the layout is yours and is never
   lost to a sale. Nine pockets a page, like a real binder page. */
export const PAGE_POCKETS = 9;
export const BINDER_MAX = 20;
export const BINDER_POCKETS = 40 * PAGE_POCKETS;
export const BINDER_NAME = 24;
/* A POKEDEX BINDER (asked for, 2026-10-16): `dex: 1`, and pocket i is National
   Dex #i+1 - one pocket a species, every species, in order. The game's dex runs
   to 1025 before its forms (dex.js); check.mjs holds the two equal. */
export const DEX_POCKETS = 1025;
export const pocketCap = (b) => (b?.dex === 1 ? DEX_POCKETS : BINDER_POCKETS);
const POCKET_KEY = /^[\w.]+-\w+:[nhr]$/;
/* A BINDER'S COVER (2026-10-15, asked for): a leather colour and up to
   PATCH_MAX sewn-on patches, each where you put it (x, y in % of the cover).
   A look, never a strength. A patch is a set's logo bought for dust
   (`patches`, the engine's `buyPatch`) or a League badge you have won -
   derived from `beaten`, never stored. A binder saved without a cover wears
   the colour its id hashes to, so an old shelf is not one colour. */
export const COVER_CLASSIC = ["oxblood", "saddle", "tan", "forest", "teal", "navy", "plum", "charcoal"];
/* SMOOTH LEATHER (2026-10-15, asked for: the pebbled ones "a bit too dirty"):
   bright, clean colours with a fine grain and a gloss. Appended - a saved
   colour is its id. */
export const COVER_SMOOTH = ["scarlet", "cobalt", "jade", "sunflower", "blush", "violet", "pearl", "onyx"];
export const COVER_COLORS = [...COVER_CLASSIC, ...COVER_SMOOTH];
export const PATCH_MAX = 6;
export const PATCH_DUST = 500;
const PATCH_ID = /^(set|badge):[\w.-]{1,40}$/;
export const coverOf = (b) => b.cover ?? {
  // Hashed over the classic eight only, so a cover never saved keeps the colour it always had.
  color: COVER_CLASSIC[[...b.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COVER_CLASSIC.length],
  patches: [],
};
const spot = (n) => Math.round(Math.min(100, Math.max(0, Number(n))) * 10) / 10;
function cleanCover(c) {
  if (!c || typeof c !== "object" || !COVER_COLORS.includes(c.color)) return null;
  const seen = new Set();
  const patches = (Array.isArray(c.patches) ? c.patches : []).filter((p) => p && typeof p.id === "string"
    && PATCH_ID.test(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y) && !seen.has(p.id) && seen.add(p.id))
    .slice(0, PATCH_MAX).map((p) => ({ id: p.id, x: spot(p.x), y: spot(p.y) }));
  return { color: c.color, patches };
}
// The set patches bought: set ids, once each (an unknown one is kept, as a skin is).
export const cleanPatches = (raw) => (Array.isArray(raw)
  ? [...new Set(raw.filter((s) => typeof s === "string" && /^[\w.-]{1,40}$/.test(s)))].slice(0, 200) : []);
export function cleanBinders(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [], ids = new Set();
  for (const b of raw) {
    if (!b || typeof b !== "object" || typeof b.id !== "string" || !/^[a-z0-9]{1,16}$/.test(b.id) || ids.has(b.id)) continue;
    const name = typeof b.name === "string" ? b.name.trim().slice(0, BINDER_NAME) : "";
    const pockets = (Array.isArray(b.pockets) ? b.pockets : []).slice(0, pocketCap(b))
      .map((k) => (typeof k === "string" && POCKET_KEY.test(k) ? k : null));
    while (pockets.length && pockets.at(-1) === null) pockets.pop();
    ids.add(b.id);
    const cover = cleanCover(b.cover);
    out.push({ id: b.id, name: name || "My binder", pockets, ...(b.dex === 1 && { dex: 1 }), ...(cover && { cover }) });
    if (out.length >= BINDER_MAX) break;
  }
  return out;
}

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
  me03: { name: "Booster box", packs: 36, price: 120000 },
  me04: { name: "Booster box", packs: 36, price: 120000 },
  me05: { name: "Booster box", packs: 36, price: 120000 },
  // A celebration set, sold in bundles rather than boxes.
  "30th": { name: "Booster bundle", packs: 6, price: 21600 },
  sv08: { name: "Booster box", packs: 36, price: 120000 },
  sv09: { name: "Booster box", packs: 36, price: 120000 },
  sv10: { name: "Booster box", packs: 36, price: 120000 },
  // Black Bolt and White Flare were never sold in booster boxes.
  "sv10.5b": { name: "Booster bundle", packs: 6, price: 21600 },
  "sv10.5w": { name: "Booster bundle", packs: 6, price: 21600 },
  sv01: { name: "Booster box", packs: 36, price: 120000 },
  sv02: { name: "Booster box", packs: 36, price: 120000 },
  sv03: { name: "Booster box", packs: 36, price: 120000 },
  sv04: { name: "Booster box", packs: 36, price: 120000 },
  // Paldean Fates and Shrouded Fable were special sets, never sold in booster boxes.
  "sv04.5": { name: "Booster bundle", packs: 6, price: 21600 },
  sv05: { name: "Booster box", packs: 36, price: 120000 },
  sv06: { name: "Booster box", packs: 36, price: 120000 },
  "sv06.5": { name: "Booster bundle", packs: 6, price: 21600 },
  sv07: { name: "Booster box", packs: 36, price: 120000 },
  base1: { name: "Booster box", packs: 36, price: 120000 },
  swsh7: { name: "Booster box", packs: 36, price: 120000 },
  swsh9: { name: "Booster box", packs: 36, price: 120000 },
  swsh11: { name: "Booster box", packs: 36, price: 120000 },
  swsh12: { name: "Booster box", packs: 36, price: 120000 },
  // Crown Zenith was a special set, never sold in booster boxes.
  "swsh12.5": { name: "Booster bundle", packs: 6, price: 21600 },
  swsh3: { name: "Booster box", packs: 36, price: 120000 },
  swsh6: { name: "Booster box", packs: 36, price: 120000 },
  swsh8: { name: "Booster box", packs: 36, price: 120000 },
  swsh10: { name: "Booster box", packs: 36, price: 120000 },
  // Pokemon GO was a special set, never sold in booster boxes.
  "swsh10.5": { name: "Booster bundle", packs: 6, price: 21600 },
};
/* EVERY SET'S DEALS (2026-10-13): its BOXES entry, and for a set sold in
   36-pack boxes the 6-pack bundle too, as in shops - a special set's BOXES
   entry already IS its bundle, so it has the one. A 10-pack is not a real
   product, so it stays full price. The shop's variants and the engine's
   checkout both read this. */
export const BUNDLE = { name: "Booster bundle", packs: 6, price: 21600 };
export function dealsOf(setId) {
  const box = BOXES[setId];
  if (!box) return [];
  return box.packs > BUNDLE.packs ? [{ key: "bundle", ...BUNDLE }, { key: "box", ...box }] : [{ key: "box", ...box }];
}
// Every 7th day of a daily-quest streak pays a pack.
export const STREAK_PACK = 7;
export const PACK_SIZE = 10;
export const CARD_MAX = 99;
// The level each set opens at (docs/cards.md, Economy).
export const SET_LEVEL = { me01: 10, me02: 25, me03: 35, "me02.5": 40, me04: 45, "sv03.5": 50, me05: 55, "sv08.5": 60, sv08: 65, "30th": 70,
  sv09: 75, sv10: 80, "sv10.5b": 85, "sv10.5w": 85, base1: 90,
  // The rest of Scarlet & Violet (2026-10-13), in release order into the gaps and beside the others.
  sv01: 15, sv02: 20, sv03: 30, sv04: 40, "sv04.5": 50, sv05: 55, sv06: 60, "sv06.5": 65, sv07: 70,
  // Sword & Shield's favourites (2026-10-15), spread over the ladder; Evolving Skies early, its best-loved.
  swsh7: 30, swsh9: 45, swsh11: 60, swsh12: 75, "swsh12.5": 90,
  // Five more (2026-10-20), into the gaps, Darkness Ablaze's Charizard early.
  swsh3: 25, swsh6: 40, swsh8: 50, swsh10: 65, "swsh10.5": 80 };

export const setById = (id) => CARD_SETS.find((s) => s.id === id) ?? null;
export const setOpen = (id, level) => !!setById(id) && level >= (SET_LEVEL[id] ?? Infinity);
// The newest set you have open.
export const newestOpen = (level) => [...CARD_SETS].reverse().find((s) => setOpen(s.id, level))?.id ?? null;
/* WHAT A REWARD PACK IS: any set you have open, at random (2026-10-14). It
   was the newest by list order - with two dozen sets that is an arbitrary
   one, and every badge and Champion paid the same set (reported: "why are
   card rewards always Surging Sparks?"). The Pokedex's claim already rolls. */
export function randomOpen(level, random = Math.random) {
  const open = CARD_SETS.filter((s) => setOpen(s.id, level));
  return open.length ? open[Math.floor(random() * open.length)].id : null;
}

export const cardId = (setId, localId) => `${setId}-${localId}`;

/* The chance of a `special` or a `mega` on this pack, under a set's `rules`:
   `n` is packs already opened dry of it, so this pack is the (n + 1)th. Past
   the soft pack it climbs in a straight line to certain at the hard one. */
export function chanceOf(kind, n, rules) {
  const p = rules.pity[kind], r = rules.rates[kind];
  if (n + 1 >= p.hard) return 1;
  if (n + 1 <= p.soft) return r;
  return Math.min(1, r + (n + 1 - p.soft) * (1 - r) / (p.hard - p.soft));
}

/* OPEN ONE PACK. `cards` are the set's rows; returns `{ pulls, pity, god }`,
   `pulls` in REVEAL ORDER - the eight base cards, then the two upgradeable
   slots with the better last, because the order is the drama. Each pull is
   `{ localId, rarity, variant }`; no card twice in a pack. */
export function openPack(cards, rng, pity = freshPity(), rules) {
  const { rates } = rules;
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

  // No God Pack where nothing prints a reverse holo (Base Set): it would be seven commons.
  if (reversible.length && rng() < GOD_PACK) {
    const pulls = Array.from({ length: 7 }, reverse);
    const tail = [of("illustration", "h"), of("illustration", "h"), of(rng() < 1 / 3 ? "special" : "illustration", "h")];
    return { pulls: [...pulls, ...sortTail(tail)].filter(Boolean), pity: { ...pity }, god: true };
  }

  // 30th Celebration's Pikachu: one in every pack, in place of a common.
  const pikachu = pools.pikachu?.length ? [of("pikachu", "h")] : [];
  const base = [
    ...Array.from({ length: 4 - pikachu.length }, () => of("common", "n")),
    ...pikachu,
    ...Array.from({ length: 3 }, () => of("uncommon", "n")),
    reverse(),
  ];
  /* The second reverse slot: a mega, a special, an illustration, or a reverse.
     The rolls are in turn, so each is CONDITIONED on the ones before having
     missed - that is what lands each rarity at its published per-pack rate
     rather than a shade under it. */
  let slot2;
  const m = chanceOf("mega", pity.mega, rules), s = chanceOf("special", pity.special, rules);
  if (rng() < m) slot2 = of("mega", "h");
  else if (rng() < Math.min(1, s / (1 - m))) slot2 = of("special", "h");
  else if (rng() < Math.min(1, rates.illustration / Math.max(1e-9, 1 - m - s))) slot2 = of("illustration", "h");
  // An ACE SPEC or a shiny beside the Illustration rares: each its own roll, after them.
  else {
    let left = 1 - m - s - rates.illustration;
    for (const k of EXTRA_ROLLS) {
      if (!rates[k]) continue;
      if (rng() < Math.min(1, rates[k] / Math.max(1e-9, left))) { slot2 = of(k, "h"); break; }
      left -= rates[k];
    }
    slot2 ??= reverse();
  }
  // The rare slot: an ultra, a double, or a holo rare - forced to a hit
  // on the `hit` pity's hard pack when nothing else in the pack is one.
  const r = rng();
  const forced = pity.hit + 1 >= rules.pity.hit.hard && !isHit(slot2.rarity);
  const holo = rates.holo ?? 0;    // Sword & Shield's Holo Rare: the rare slot's own roll
  const rareSlot = r < rates.ultra || (forced && r < rates.ultra / (rates.ultra + rates.double))
    ? of("ultra", "h")
    : r < rates.ultra + rates.double || forced ? of("double", "h")
      : r < rates.ultra + rates.double + holo ? of("holo", "h") : of("rare", "h");

  const pulls = [...base, ...sortTail([slot2, rareSlot])];
  const best = Math.max(...pulls.map((p) => rungOf(p.rarity)));
  const next = {
    hit: isHit(CARD_RARITIES[best]) ? 0 : pity.hit + 1,
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
