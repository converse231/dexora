/* node tools/fetch-cards.mjs (npm run cards) - Pokémon TCG cards, from TCGdex.

   docs/cards.md is the design. Writes, for every set in SETS:

     src/data/cards/sets/<id>.js   the set's cards, one compact row each - read
                                   only by the lazy Cards page
     src/data/cards/index.js       the shipped sets and their counts - the only
                                   card data the main bundle carries
     public/cards/<id>/<localId>.webp, logo.webp   the small images, shipped

   The large images are not shipped: the inspect view loads TCGdex's own
   `high.webp` (the set file records its asset base).

   A ROW is [localId, name, category, rarity, variants, speciesIds, illustrator]:
   - category  "P" Pokémon, "T" Trainer, "E" Energy
   - rarity    an id on `CARD_RARITIES` (game/cards.js); an unknown printed
               rarity STOPS the fetch - a new rung is a decision, not a default
   - variants  the variants a pack can give it, as letters: n normal, h holo,
               r reverse. Commons and uncommons open normal or reverse, rares
               holo or reverse, hits holo - the handful of odd printings
               TCGdex also lists (a holo common) are left out, so a master set
               is reachable by opening packs
   - speciesIds  the GAME's ids: the card's National Dex numbers, and for a
               Mega card the Mega form whose `label()` is its name (your call,
               2026-10-02). A Mega card with no such form STOPS the fetch.

   Responses are cached in .assets-src/tcgdex/, images once each, so a re-run
   fetches nothing it has. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { SPECIES } from "../src/data/dex.js";
import { label } from "../src/game/map.js";

const ROOT = new URL("../", import.meta.url);
const CACHE = new URL(".assets-src/tcgdex/", ROOT);
const API = "https://api.tcgdex.net/v2/en";
// Shipped sets, in the order they open (docs/cards.md, Phases).
const SETS = ["me01", "me02", "me02.5", "sv03.5", "sv08.5"];

const RARITY = {
  "Common": "common", "Uncommon": "uncommon", "Rare": "rare", "Double rare": "double",
  "Illustration rare": "illustration", "Ultra Rare": "ultra",
  "Special illustration rare": "special", "Mega Hyper Rare": "mega",
  "Hyper rare": "hyper", "ACE SPEC Rare": "ace",
};
const CATEGORY = { Pokemon: "P", Trainer: "T", Energy: "E" };

mkdirSync(CACHE, { recursive: true });

async function get(url, binary = false) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.json();
    } catch (e) {
      if (i >= 4) throw new Error(`${url}: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 500 * (i + 1)));
    }
  }
}

async function cached(name, url) {
  const file = new URL(name.replace(/[^\w.-]/g, "_") + ".json", CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const v = await get(url);
  writeFileSync(file, JSON.stringify(v));
  return v;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const dexIds = new Set(SPECIES.filter((s) => s.id <= 1025).map((s) => s.id));
const megaForm = new Map(SPECIES.filter((s) => s.id >= 10000).map((s) => [label(s), s.id]));

function speciesOf(card) {
  if (card.category !== "Pokemon") return [];
  if (card.name.startsWith("Mega ")) {
    const id = megaForm.get(card.name.replace(/ ex$/, ""));
    if (!id) throw new Error(`${card.id} ${card.name}: no Mega form of that name in SPECIES`);
    return [id];
  }
  const ids = card.dexId ?? [];
  if (!ids.length) throw new Error(`${card.id} ${card.name}: a Pokémon card with no dexId`);
  for (const id of ids) if (!dexIds.has(id)) throw new Error(`${card.id}: #${id} is not in SPECIES`);
  return ids;
}

function variantsOf(card, rarity) {
  const v = card.variants ?? {};
  if (rarity === "common" || rarity === "uncommon") return "n" + (v.reverse ? "r" : "");
  if (rarity === "rare") return "h" + (v.reverse ? "r" : "");
  return "h";
}

const index = [];
for (const id of SETS) {
  const set = await cached(`set-${id}`, `${API}/sets/${id}`);
  const cards = await pool(set.cards, 4, (c) => cached(`card-${c.id}`, `${API}/cards/${c.id}`));
  const rows = cards.map((c) => {
    const rarity = RARITY[c.rarity];
    if (!rarity) throw new Error(`${c.id}: unknown rarity "${c.rarity}" - add it to CARD_RARITIES first`);
    const cat = CATEGORY[c.category];
    if (!cat) throw new Error(`${c.id}: unknown category "${c.category}"`);
    return [c.localId, c.name, cat, rarity, variantsOf(c, rarity), speciesOf(c), c.illustrator ?? ""];
  });

  const dir = new URL(`public/cards/${id}/`, ROOT);
  mkdirSync(dir, { recursive: true });
  let fetched = 0;
  await pool(cards, 4, async (c) => {
    const file = new URL(`${c.localId}.webp`, dir);
    if (existsSync(file)) return;
    writeFileSync(file, await get(`${c.image}/low.webp`, true));
    fetched++;
  });
  const logo = new URL("logo.webp", dir);
  if (!existsSync(logo)) writeFileSync(logo, await get(`${set.logo}.webp`, true));

  const asset = cards[0].image.replace(/[^/]+$/, "");
  const head = `/* GENERATED by tools/fetch-cards.mjs (npm run cards) from TCGdex - never hand-edit.\r\n`
    + `   Rows: [localId, name, category, rarity, variants, speciesIds, illustrator]. */\r\n`;
  mkdirSync(new URL("src/data/cards/sets/", ROOT), { recursive: true });
  writeFileSync(new URL(`src/data/cards/sets/${id}.js`, ROOT),
    head + `export const SET = ${JSON.stringify({
      id, name: set.name, released: set.releaseDate, asset,
      official: set.cardCount.official, total: set.cardCount.total,
    })};\r\nexport const CARDS = [\r\n${rows.map((r) => JSON.stringify(r)).join(",\r\n")},\r\n];\r\n`);
  index.push({ id, name: set.name, released: set.releaseDate, total: rows.length });
  console.log(`${id} ${set.name}: ${rows.length} cards, ${fetched} images fetched`);
}

writeFileSync(new URL("src/data/cards/index.js", ROOT),
  `/* GENERATED by tools/fetch-cards.mjs (npm run cards) - the shipped card sets.\r\n`
  + `   The only card data the main bundle carries (docs/cards.md). */\r\n`
  + `export const CARD_SETS = ${JSON.stringify(index)};\r\n`);
