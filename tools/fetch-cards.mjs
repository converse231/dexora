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
const SETS = ["me01", "me02", "me02.5", "sv03.5", "sv08.5", "me03", "me04", "me05", "30th", "sv08",
  "sv09", "sv10", "sv10.5b", "sv10.5w", "base1"];
/* A set shipped under the name its packs carried: TCGdex's Base Set is the
   1999 print, and the packs here are its 1st Edition (asked for, 2026-10-07). */
const NAME = { base1: "Base Set 1st Edition" };

const RARITY = {
  "Common": "common", "Uncommon": "uncommon", "Rare": "rare", "Double rare": "double",
  "Illustration rare": "illustration", "Ultra Rare": "ultra",
  "Special illustration rare": "special", "Mega Hyper Rare": "mega",
  "Hyper rare": "hyper", "ACE SPEC Rare": "ace",
  "Pikachu Rare": "pikachu", "Futuristic Rare": "futuristic",
  "Black White Rare": "blackwhite",
};
/* BASE SET PRINTS ITS HOLOS AS "Rare" with only a holo variant; they are the
   set's hit, one pack in three, so they are their own rung (`holo`). */
const rarityOf = (c, set) => (set === "base1" && c.rarity === "Rare" && c.variants?.holo ? "holo" : RARITY[c.rarity]);
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
const byLabel = new Map(SPECIES.filter((s) => s.id <= 1025).map((s) => [label(s), s.id]));
const megaForm = new Map(SPECIES.filter((s) => s.id >= 10000).map((s) => [label(s), s.id]));

/* A MEGA NEWER THAN OUR POKEDEX links its species until the form is added
   (`npm run forms`): Mega Zygarde (Perfect Order, 2026) is in PokeAPI but not
   yet a form here. Refused once the form exists, so this list cannot rot. */
const MEGA_PENDING = { "Mega Zygarde": 718 };

function speciesOf(card) {
  if (card.category !== "Pokemon") return [];
  if (card.name.startsWith("Mega ")) {
    const name = card.name.replace(/ ex$/, "");
    if (MEGA_PENDING[name]) {
      if (megaForm.has(name)) throw new Error(`${name} is a form now - drop it from MEGA_PENDING`);
      return [MEGA_PENDING[name]];
    }
    const id = megaForm.get(name);
    if (!id) throw new Error(`${card.id} ${card.name}: no Mega form of that name in SPECIES`);
    return [id];
  }
  /* No dexId: TCGdex has not filled them in for every set yet (30th
     Celebration, 2026). The card's name is the species' then - exactly, after
     an "ex" - or the fetch stops. */
  const plain = card.name.replace(/ ex$/, "").replace(/ (V|VMAX|VSTAR|GX|EX)$/, "")
    .replace(/^(Alolan|Galarian|Hisuian|Paldean) /, "").replace(/^[A-Z][\w.]*( [A-Z][\w.]*)*'s /, "");
  const named = !card.dexId?.length && byLabel.get(plain);
  const ids = card.dexId?.length ? card.dexId : named ? [named] : [];
  if (!ids.length) throw new Error(`${card.id} ${card.name}: a Pokémon card with no dexId, and no species of that name`);
  for (const id of ids) if (!dexIds.has(id)) throw new Error(`${card.id}: #${id} is not in SPECIES`);
  return ids;
}

function variantsOf(card, rarity, set) {
  const v = card.variants ?? {};
  if (rarity === "common" || rarity === "uncommon") return "n" + (v.reverse ? "r" : "");
  // A rare printed without a holo (Base Set's) is a plain card.
  // Not 30th Celebration's, which TCGdex prints the same way: saves hold those as "h".
  if (rarity === "rare") return (set === "base1" && v.holo === false && v.normal ? "n" : "h") + (v.reverse ? "r" : "");
  return "h";
}

const index = [];
for (const id of SETS) {
  const set = await cached(`set-${id}`, `${API}/sets/${id}`);
  const cards = await pool(set.cards, 4, (c) => cached(`card-${c.id}`, `${API}/cards/${c.id}`));
  const rows = cards.map((c) => {
    const rarity = rarityOf(c, id);
    if (!rarity) throw new Error(`${c.id}: unknown rarity "${c.rarity}" - add it to CARD_RARITIES first`);
    const cat = CATEGORY[c.category];
    if (!cat) throw new Error(`${c.id}: unknown category "${c.category}"`);
    return [c.localId, c.name, cat, rarity, variantsOf(c, rarity, id), speciesOf(c), c.illustrator ?? ""];
  });

  const dir = new URL(`public/cards/${id}/`, ROOT);
  mkdirSync(dir, { recursive: true });
  let fetched = 0;
  await pool(cards, 4, async (c) => {
    const file = new URL(`${c.localId}.webp`, dir);
    if (existsSync(file)) return;
    /* A webp TCGdex never made (Destined Rivals' Arcanine, 2026-10-07): its
       png lands beside it and fetch_card_art.py converts it. */
    const webp = await get(`${c.image}/low.webp`, true).catch(() => null);
    if (webp) writeFileSync(file, webp);
    else writeFileSync(new URL(`${c.localId}.png`, dir), await get(`${c.image}/low.png`, true));
    fetched++;
  });
  const logo = new URL("logo.webp", dir);
  // No logo on TCGdex (30th Celebration): fetch_card_art.py supplies one from Bulbagarden.
  if (set.logo && !existsSync(logo)) writeFileSync(logo, await get(`${set.logo}.webp`, true));

  const asset = cards[0].image.replace(/[^/]+$/, "");
  const head = `/* GENERATED by tools/fetch-cards.mjs (npm run cards) from TCGdex - never hand-edit.\r\n`
    + `   Rows: [localId, name, category, rarity, variants, speciesIds, illustrator]. */\r\n`;
  mkdirSync(new URL("src/data/cards/sets/", ROOT), { recursive: true });
  writeFileSync(new URL(`src/data/cards/sets/${id}.js`, ROOT),
    head + `export const SET = ${JSON.stringify({
      id, name: NAME[id] ?? set.name, released: set.releaseDate, asset,
      official: set.cardCount.official, total: set.cardCount.total,
    })};\r\nexport const CARDS = [\r\n${rows.map((r) => JSON.stringify(r)).join(",\r\n")},\r\n];\r\n`);
  index.push({ id, name: NAME[id] ?? set.name, released: set.releaseDate, total: rows.length });
  console.log(`${id} ${set.name}: ${rows.length} cards, ${fetched} images fetched`);
}

writeFileSync(new URL("src/data/cards/index.js", ROOT),
  `/* GENERATED by tools/fetch-cards.mjs (npm run cards) - the shipped card sets.\r\n`
  + `   The only card data the main bundle carries (docs/cards.md). */\r\n`
  + `export const CARD_SETS = ${JSON.stringify(index)};\r\n`);
