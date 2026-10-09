/* FIELD ABILITIES AND FRIENDSHIP (docs/cosmetics.md, 2026-10-07): the one
   walking with you lends its ability's overworld effect - as the main games
   give one outside battle - and walking together builds friendship.

   A Box entry's ability is one of its species' regular abilities, picked by
   its uid (no save field: the same Pokemon always has the same one), and an
   alpha has its hidden ability where the species has one. A form without its
   own data reads its species'. Only abilities with something to act on here
   are in FIELD: no eggs, natures, genders or held items in this game.

   Each effect moves one of the levers a field item does - encounter RATE or
   a FIND - and never the tier roll. Browser-free.

   EVERY ONE HAS A PERK (2026-10-10). An ability with nothing to act on here
   used to mean nothing, and 1,150 of 1,415 species walked for friendship
   alone. Those FORAGE by their first type (`forageOf`). And the TYPE PULLS
   are gone (Static, Magnet Pull, Flash Fire...: that type weighed 2x in the
   species roll): every map is already built from its own types, so a pull
   did nothing where the type does not live and pulled what was there anyway
   where it does (reported 2026-10-10). Those abilities forage like anybody. */
import { ABILITIES, ABILITY_NAMES } from "../data/abilities.js";
import { SPECIES } from "../data/dex.js";
import { speciesById } from "./biomes.js";

export const FIELD = {
  // More encounters (the games: Illuminate, Arena Trap, No Guard, Swarm).
  illuminate: { rate: 1.25 }, "arena-trap": { rate: 1.25 }, "no-guard": { rate: 1.25 }, swarm: { rate: 1.25 },
  // Fewer (Stench, White Smoke, Quick Feet, Infiltrator).
  stench: { rate: 0.5 }, "white-smoke": { rate: 0.5 }, "quick-feet": { rate: 0.5 }, infiltrator: { rate: 0.5 },
  // The games turn away weaker wild Pokemon; with no levels to sort by here, a few fewer.
  intimidate: { rate: 0.75 }, "keen-eye": { rate: 0.75 },
  // It finds things as you walk.
  pickup: { find: "pickup" }, "honey-gather": { find: "honey" },
  // The games: more wild Pokemon holding items. Here, a slower trickle of the same finds.
  "compound-eyes": { find: "luck" }, "super-luck": { find: "luck" },
};

/* FINDS: a chance a step and a weighted pool. Pickup is a trickle of balls
   and a berry; Honey Gather a rare Honey; a good friend (FRIEND_FINDS hearts)
   turns things up whatever its ability. Small beside the walking wage. */
export const FINDS = {
  pickup: { every: 150, pool: [["poke-ball", 50], ["great-ball", 30], ["razz-berry", 20]] },
  honey: { every: 1500, pool: [["honey", 1]] },
  luck: { every: 300, pool: [["poke-ball", 50], ["great-ball", 30], ["razz-berry", 20]] },
  // Foraging, for an ability with nothing to do here: as often as Compound Eyes.
  berries: { every: 300, pool: [["razz-berry", 45], ["pinap-berry", 35], ["nanab-berry", 20]] },
  balls: { every: 300, pool: [["poke-ball", 55], ["great-ball", 35], ["ultra-ball", 10]] },
  friend: { every: 400, pool: [["poke-ball", 40], ["great-ball", 35], ["pinap-berry", 25]] },
};

// Steps walked together for each heart; the fifth is a best friend.
export const HEARTS = [200, 800, 2000, 4000, 8000];
export const FRIEND_FINDS = 3;
export const heartsOf = (walked) => HEARTS.filter((n) => (walked ?? 0) >= n).length;

/* A species' row, or its base's for a form with none (`from` is a NAME). */
const ID_OF = new Map(SPECIES.map((s) => [s.name, s.id]));
const rowOf = (id) => ABILITIES[id] ?? ABILITIES[ID_OF.get(speciesById(id)?.from)] ?? null;

/* The ability slug a Box entry has. */
export function abilityOf(mon) {
  if (!mon) return null;
  const row = rowOf(mon.species);
  if (!row) return null;
  const [regular, hidden] = row;
  const i = mon.alpha && hidden >= 0 ? hidden : regular[Math.abs(mon.uid ?? 0) % regular.length];
  return ABILITY_NAMES[i] ?? null;
}

/* What a forager turns up, by its first type: the living things find
   berries, everything else what trainers drop. */
const BERRY_TYPES = new Set(["grass", "bug", "fairy", "poison", "normal", "water", "flying"]);
export const forageOf = (sp) => (BERRY_TYPES.has(sp?.types?.[0]) ? "berries" : "balls");

export function fieldOf(mon) {
  const f = FIELD[abilityOf(mon)];
  if (f) return f;
  const sp = mon && speciesById(mon.species);
  return sp ? { find: forageOf(sp), forage: true } : null;
}

// The perk's name: its ability where the ability does it, else "Forager".
export const perkName = (mon) => (fieldOf(mon)?.forage ? "Forager" : abilityName(abilityOf(mon)));

// "lightning-rod" -> "Lightning Rod".
export const abilityName = (slug) => (slug ?? "").split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");

/* What its ability does out here, in a phrase, or null for one that does nothing here. */
export function fieldText(mon) {
  const f = fieldOf(mon);
  if (!f) return null;
  if (f.rate) return f.rate > 1 ? "More wild Pokémon" : f.rate <= 0.5 ? "Far fewer wild Pokémon" : "Fewer wild Pokémon";
  if (f.find === "honey") return "Finds Honey";
  if (f.find === "berries") return "Forages berries";
  if (f.find === "balls") return "Turns up Poké Balls";
  return "Picks up items";
}

/* One step's find, or null: `rng` is the engine's Math.random. */
export function rollFind(kind, rng) {
  const f = FINDS[kind];
  if (!f || rng() >= 1 / f.every) return null;
  const total = f.pool.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [id, w] of f.pool) if ((r -= w) < 0) return id;
  return f.pool[0][0];
}
