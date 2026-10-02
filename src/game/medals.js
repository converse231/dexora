/* Dex medals: what finishing something is worth.

   The dex paid ¥100 for a first catch and nothing at all for an ending. You
   could register 150 species and the game would never once notice you were one
   away — the only thing that ever congratulated you was a bare count. A medal
   is the game noticing.

   Four kinds, every one of them **derived rather than listed**, so a new species
   or a new map grows the set without anyone editing a table here:

     line    an evolution family, end to end           54
     type    every species carrying one type           17
     biome   every species on one map's table           8
     dex     all 151                                    1

   A species that never evolves is not a line: catching one Farfetch'd completes
   nothing, and a medal for it would be a participation trophy. That is why the
   families are filtered to those with more than one member.

   Rewards lean on **balls over money**, because balls are the actual bottleneck
   — a rare costs about four Ultras to land and money can already be ground out
   of duplicates, so a pocket of Ultras is the thing that changes what you can
   go and do next. Every payout is listed here and nowhere else, and check.mjs
   totals them so the number is a decision rather than a drift.

   Pure and DOM-free: check.mjs asserts the whole set without a canvas. */

import { SPECIES } from "../data/dex.js";
import { EVOLUTIONS } from "../data/evolutions.js";
import { BIOMES, speciesById, dexIndex, genOf, REGION_NAME, looksOf } from "./biomes.js";
import { isForm } from "../data/dex.js";
import { label } from "./map.js";

/* Evolution families, by union-find over the evolution edges. A family is the
   whole connected component, so Eevee's three branches are one medal and not
   three overlapping ones. */
function families() {
  const parent = SPECIES.map((sp) => sp.id);
  const find = (a) => (parent[a - 1] === a ? a : (parent[a - 1] = find(parent[a - 1])));
  for (const row of EVOLUTIONS) parent[find(row.from) - 1] = find(row.to);

  const groups = new Map();
  for (const sp of SPECIES) {
    const root = find(sp.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(sp.id);
  }
  // Sorted so the medal is named after the base form, not whichever id won.
  return [...groups.values()].filter((f) => f.length > 1).map((f) => f.sort((a, b) => a - b));
}

const line = (need) => ({
  id: `line-${need[0]}`,
  kind: "line",
  name: `${label(speciesById(need[0])).toUpperCase()} LINE`,
  sub: `${need.length} entries, end to end.`,
  need,
  // A four-stage family is rarer and dearer than a two, so it pays by length.
  money: 250 * need.length,
  items: need.length >= 3 ? { "ultra-ball": 2 } : { "great-ball": 3 },
});

const typeMedal = (t, need) => ({
  id: `type-${t}`,
  kind: "type",
  name: `ALL ${t.toUpperCase()}`,
  sub: `Every ${t}-type in the dex.`,
  need,
  money: 1000,
  items: { "ultra-ball": 3 },
});

const biomeMedal = (b) => ({
  id: `biome-${b.id}`,
  kind: "biome",
  name: b.name.toUpperCase(),
  sub: "Everything that lives there.",
  // A biome's roster is its table, legendaries included - they are the last
  // one you will fill and that is exactly the point of the medal.
  need: b.table.map(([id]) => id).sort((a, b2) => a - b2),
  money: 2000,
  items: { "ultra-ball": 5 },
});

function build() {
  const byType = new Map();
  for (const sp of SPECIES)
    for (const t of sp.types) {
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(sp.id);
    }

  return [
    ...families().map(line),
    ...[...byType].map(([t, ids]) => typeMedal(t, ids)),
    ...BIOMES.map(biomeMedal),
    /* A REGION'S POKÉDEX (asked for, 2026-10-02): every species of one
       generation, caught by you - its national numbers, never its forms. It
       is CLAIMED, never paid on the catch (engine `claimDex`, asked for
       2026-10-03): ¥20,000, a Master Ball, a booster box of a RANDOM set
       (rolled in DexClaim.jsx's reel), the title "<Region> Dex Master"
       (titles.js) and the Pokédex Charm: that generation's rare forms 1.5x
       as likely (`dexCharm`). Both of the last arrive with the claim. */
    ...Object.keys(REGION_NAME).map(Number).map((g) => ({
      id: `gen:${g}`,
      kind: "gen",
      gen: g,
      name: `${REGION_NAME[g].toUpperCase()} COMPLETE`,
      sub: `Every ${REGION_NAME[g]} Pokémon. Claim a box of cards, a title, and its rare forms 1.5x as likely.`,
      need: SPECIES.filter((sp) => !isForm(sp.id) && genOf(sp.id) === g).map((sp) => sp.id),
      money: 20000,
      items: { "master-ball": 1 },
    })).filter((m) => m.need.length),
    {
      id: "dex",
      kind: "dex",
      name: "POKÉDEX COMPLETE",
      sub: `All ${SPECIES.length}. There is nothing left to find.`,
      need: SPECIES.map((sp) => sp.id),
      money: 25000,
      items: { "master-ball": 1 },
    },
  ];
}

export const MEDALS = build();

/* Which medals mention a species. Built once, and it is the whole reason
   awarding is cheap: registering a Rattata looks at the four medals that
   contain a Rattata, never at all eighty. */
const BY_SPECIES = new Map();
for (const m of MEDALS)
  for (const id of m.need) {
    if (!BY_SPECIES.has(id)) BY_SPECIES.set(id, []);
    BY_SPECIES.get(id).push(m);
  }

export const medalById = (id) => MEDALS.find((m) => m.id === id) ?? null;

/* THE POKÉDEX CHARM: a generation you have completed has its rare forms 2x
   as likely - read by the tier roll, a Mega through to its base (`genOf`).
   It was 1.5x, a research star's lift; raised past it (your call,
   2026-10-03) - a whole generation outranks one species' research. */
export const DEX_CHARM = 2;
export const dexCharm = (id, medals = []) => (medals.includes(`gen:${genOf(id)}`) ? DEX_CHARM : 1);
/* HELD, FOR A MEDAL: the species caught - or, for the base of a family of
   LOOKS, any one of its drawings. Catching Unown registers the letter you
   met (Unown B is its own entry), so Johto's medal waited on Unown A, one
   meeting in 28, and a finished Johto paid nothing (reported 2026-10-03). A
   look itself still needs itself, so the whole-dex medal still asks for
   every letter. */
const owns = (dex, id) => dex[dexIndex(id)] === 2
  || (speciesById(id)?.form !== "look" && looksOf(id).some((x) => dex[dexIndex(x)] === 2));

// Generation medals a dex has finished and the save has not claimed yet.
export const genMedalsDue = (dex, earned = []) => MEDALS.filter((m) => m.kind === "gen" && !earned.includes(m.id)
  && m.need.every((id) => owns(dex, id)));

/* What a newly registered species just finished off. `earned` is the ids
   already banked, so a medal can never pay twice — which matters, because
   evolving into a species you have caught before still fills a dex slot. A
   look counts for its family's medals too (`owns`). */
export function medalsFor(speciesId, dex, earned = []) {
  const out = [];
  const sp = speciesById(speciesId);
  const ids = sp?.form === "look" ? [speciesId, sp.of] : [speciesId];
  for (const m of new Set(ids.flatMap((id) => BY_SPECIES.get(id) ?? []))) {
    if (earned.includes(m.id)) continue;
    if (m.need.every((id) => owns(dex, id))) out.push(m);
  }
  return out;
}

/* Counting milestones, which are not a set and so are not medals. They thin out
   as the numbers get real — every tenth entry would stop being an event by the
   twentieth — and they pay in Ultra Balls because that is what turns a dex you
   are halfway through into one you can finish. */
export const MILESTONES = [
  { at: 10, money: 500, items: { "great-ball": 5 } },
  { at: 25, money: 1000, items: { "great-ball": 8 } },
  { at: 50, money: 2500, items: { "ultra-ball": 5 } },
  { at: 75, money: 4000, items: { "ultra-ball": 8 } },
  { at: 100, money: 6000, items: { "ultra-ball": 12 } },
  { at: 125, money: 9000, items: { "ultra-ball": 16, "master-ball": 1 } },
  /* 151 is KANTO FINISHED and keeps its reward for that reason - it stopped
     being the end of the dex when Johto shipped, and it is still the moment a
     player who grew up on this one feels something. */
  { at: 151, money: 15000, items: { "ultra-ball": 25, "master-ball": 1 } },
  { at: 200, money: 20000, items: { "ultra-ball": 30 } },
  { at: 251, money: 30000, items: { "ultra-ball": 40, "master-ball": 1 } },
  { at: 300, money: 40000, items: { "ultra-ball": 50 } },
  /* The last one is the dex itself, whatever size that turns out to be. Typed
     in as 151 it silently stopped being reachable the day a generation was
     added, and a milestone nobody can reach is the one kind of reward that
     costs nothing to leave broken. */
  {
    at: SPECIES.length,
    money: 60000,
    items: { "ultra-ball": 60, "master-ball": 2 },
  },
];

export const milestoneAt = (n) => MILESTONES.find((m) => m.at === n) ?? null;

/* THE POKÉDEX RANK (README *Pokédex*, 2026-09-29): a title for how much of the
   dex is caught, read off the count the trainer card shows, so yours and the
   one on your profile are one number. SHARES of the dex, never counts - a
   new generation moves every step with it, as the last milestone learned -
   and the last is the whole dex. Measured then: one playthrough catches ~578
   of 1,303 walking (~973 evolving everything), four ~1,182. A title, never
   a reward: nothing here pays. */
// `color` is the emblem's own (public/ranks/dex), for its stand-in disc and the rank-up glow.
export const DEX_RANKS = [
  ["field-intern", "Field Intern", 0, "#b07a4a"],
  ["researcher", "Researcher", 0.03, "#c9773f"],
  ["senior-researcher", "Senior Researcher", 0.1, "#a9b3bd"],
  ["specialist", "Specialist", 0.2, "#3f9a55"],
  ["professor", "Professor", 0.35, "#4a9ad4"],
  ["expedition-leader", "Expedition Leader", 0.5, "#7a4bc4"],
  ["grand-scholar", "Grand Scholar", 0.75, "#e4b53c"],
  ["pokedex-master", "Pokédex Master", 1, "#f3d56b"],
].map(([id, name, share, color], step) => ({ id, name, step, color, at: Math.ceil(share * SPECIES.length) }));

// Your rank for a caught count, the next one and how many species away it is.
export function dexRank(caught) {
  const r = DEX_RANKS.findLast((x) => (caught ?? 0) >= x.at);
  const next = DEX_RANKS[r.step + 1] ?? null;
  return { ...r, next, left: next ? next.at - caught : 0 };
}
// The line under a rank, on the ceremony: where you are and what is next.
export const rankLine = (caught) => {
  const r = dexRank(caught);
  return r.next ? `${caught} species · ${r.left} more to ${r.next.name}` : "Every entry in the Pokédex";
};
