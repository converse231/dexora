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

import { SPECIES } from "../data/species.js";
import { EVOLUTIONS } from "../data/evolutions.js";
import { BIOMES } from "./biomes.js";
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
  name: `${label(SPECIES[need[0] - 1]).toUpperCase()} LINE`,
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

/* What a newly registered species just finished off. `earned` is the ids
   already banked, so a medal can never pay twice — which matters, because
   evolving into a species you have caught before still fills a dex slot. */
export function medalsFor(speciesId, dex, earned = []) {
  const out = [];
  for (const m of BY_SPECIES.get(speciesId) ?? []) {
    if (earned.includes(m.id)) continue;
    if (m.need.every((id) => dex[id - 1] === 2)) out.push(m);
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
  { at: 151, money: 15000, items: { "ultra-ball": 25, "master-ball": 1 } },
];

export const milestoneAt = (n) => MILESTONES.find((m) => m.at === n) ?? null;
