/* CARDS AS ARENA PERKS (2026-10-24, asked for: "use cards as Arena items like
   passive perks users equip before battle, up to 3 cards"; "Gold and set chase
   cards should have unique perks"). docs/cards.md held cards a collection and
   never a strength; this is the one exception, and it is the Arena's alone:
   a match against the CPU or the Ladder, never online (the Fair format) or
   ranked, never a catch, the League or a price.

   NEVER GAME-BREAKING (same day, asked for: "not OP - just make the top chase
   cards a bit better; no rare, holo rare or double rare"). A card's perk is
   DERIVED, 6,880 cards being no hand-written table:
   - only a Pokemon card ABOVE the Double rare counts - the gallery, ACE SPEC,
     Radiant, Illustration and Ultra rares 2%, the Special illustrations 4%;
   - its KIND is its Pokemon's first type, six families of three (`FAMILY`);
   - a card of a Pokemon on your team (its evolution line) counts double for
     that one Pokemon; every family is capped low (`CAP`);
   - GOLD (a Hyper or Mega Hyper rare) adds its family's GOLDEN rule - a small
     rule of its own, not a bigger number (`GOLDEN`);
   - each set's CHASE card (`CHASE`, frozen from the price snapshot - prices
     stay display only) is the top: 6%, and a SIGNATURE that belongs to its
     own Pokemon (`SIGNATURE`) and works only while that Pokemon's line is on
     your team.
   The match never sees a card: `teamPerks` hands arena.js plain numbers and
   the signatures' names. */
import { rungOf } from "./cards.js";
import { speciesById } from "./biomes.js";
import { EVOLUTIONS } from "../data/evolutions.js";
import { label as nameOf } from "./map.js";

export const ARENA_CARDS = 3;
// Rarity tiers, highest first: a card at or above the rung takes the strength. Nothing at or below the Double rare.
const TIER_K = [["special", 0.04], ["gallery", 0.02]];
export const GOLD = new Set(["hyper", "mega"]);
export const GOLD_K = 0.04, CHASE_K = 0.06;
// Six families: the type of a card's Pokemon picks the one lever it moves.
export const FAMILY = {
  dmg: ["fire", "fighting", "dragon"],
  regen: ["water", "grass", "fairy"],
  cd: ["electric", "flying", "normal"],
  guard: ["steel", "rock", "ground"],
  ult: ["psychic", "ghost", "dark"],
  status: ["ice", "bug", "poison"],
};
// What a strength k means for each lever, and its cap a Pokemon.
const SCALE = { dmg: 1, regen: 0.1, cd: 1, guard: 1, ult: 2, status: 3 };
export const CAP = { dmg: 0.12, regen: 0.006, cd: 0.12, guard: 0.12, ult: 0.3, status: 0.5 };
export const SAYS = {
  dmg: (k) => `+${pc(k)} damage`, regen: (k) => `heals ${pc(k, 1)} of its HP a second`, cd: (k) => `cooldowns ${pc(k)} shorter`,
  guard: (k) => `takes ${pc(k)} less damage`, ult: (k) => `ULTI charges ${pc(k)} faster`, status: (k) => `+${pc(k)} status chance`,
};
// The golden rules, one a family, small on purpose: arena.js reads each flag (its numbers live there).
export const GOLDEN = {
  dmg: ["flame", "Golden Flame", "a hit leaves fire on the floor one time in four"],
  regen: ["spring", "Golden Spring", "a knockout heals 15% of its HP"],
  cd: ["spark", "Golden Spark", "dashes come back a quarter sooner"],
  guard: ["aegis", "Golden Aegis", "a second untouchable each time it comes out"],
  ult: ["shade", "Golden Shade", "the match starts with the ULTI 25% charged"],
  status: ["venom", "Golden Venom", "a basic attack poisons one time in twelve"],
};
/* EACH SET'S CHASE CARD: its most valuable Pokemon card in the price snapshot
   of 2026-10-14, or, where the snapshot has none, the card the set is known
   for. [localId, the name it was checked by] - check.mjs reads every one. */
export const CHASE = {
  "30th": ["158", "Mew ex"], base1: ["4", "Charizard"], me01: ["188", "Mega Lucario ex"],
  "me02.5": ["284", "Mega Gengar ex"], me02: ["125", "Mega Charizard X ex"], me03: ["124", "Mega Zygarde ex"],
  me04: ["116", "Mega Greninja ex"], me05: ["116", "Mega Darkrai ex"], sv01: ["245", "Gardevoir ex"],
  sv02: ["203", "Magikarp"], "sv03.5": ["199", "Charizard ex"], sv03: ["223", "Charizard ex"],
  "sv04.5": ["232", "Mew ex"], sv04: ["199", "Groudon"], sv05: ["177", "Gastly"], "sv06.5": ["078", "Persian"],
  sv06: ["214", "Greninja ex"], sv07: ["148", "Squirtle"], "sv08.5": ["161", "Umbreon ex"], sv08: ["238", "Pikachu ex"],
  sv09: ["184", "Lillie's Clefairy ex"], "sv10.5b": ["171", "Victini"], "sv10.5w": ["172", "Victini"],
  sv10: ["231", "Team Rocket's Mewtwo ex"], "swsh10.5": ["086", "Mewtwo VSTAR"], swsh10: ["210", "Origin Forme Dialga VSTAR"],
  swsh11: ["186", "Giratina V"], "swsh12.5": ["GG69", "Giratina VSTAR"], swsh12: ["186", "Lugia V"],
  swsh3: ["20", "Charizard VMAX"], swsh6: ["201", "Blaziken VMAX"], swsh7: ["215", "Umbreon VMAX"],
  swsh8: ["271", "Gengar VMAX"], swsh9: ["154", "Charizard V"],
};
/* EVERY CHASE CARD'S SIGNATURE, its own and its Pokemon's (asked for: "UNIQUE,
   specific to the Pokemon"): [kind arena.js plays, its name, what it does].
   Each works only while the card's Pokemon's line is on your team; `TEAM`
   kinds then help the whole team, the rest that Pokemon alone. Every kind
   once (check.mjs). */
export const SIGNATURE = {
  "30th": ["ancient", "Ancient Gene", "its moves cool down 20% faster"],
  base1: ["classicburn", "Fire Spin", "its Fire moves burn one time in three"],
  me01: ["aura", "Aura Rush", "Mega Evolves with no warm-up, and hits 10% harder as a Mega"],
  "me02.5": ["phase", "Shadow Phase", "one hit in five passes straight through it"],
  me02: ["blueflame", "Blue Inferno", "its Fire and Dragon moves hit 15% harder"],
  me03: ["core", "Zygarde Core", "once a match, under 30% HP it regains a third of its HP"],
  me04: ["shuriken", "Shuriken Flurry", "its shots hit 15% harder"],
  me05: ["void", "Dark Void", "its hits put the foe to sleep one time in ten"],
  sv01: ["embrace", "Psychic Embrace", "its ULTI charges 50% faster"],
  sv02: ["splash", "Gyarados Rage", "evolves twice as fast in a match"],
  "sv03.5": ["rage", "Burning Darkness", "+3% damage for every 10% of HP it has lost"],
  sv03: ["reign", "Infernal Reign", "its Fire moves cool down 30% faster"],
  "sv04.5": ["mythic", "Mythic Speed", "moves 15% faster"],
  sv04: ["drought", "Drought", "the match starts in harsh sunlight"],
  sv05: ["lick", "Lick", "its basic attacks paralyse one time in seven"],
  "sv06.5": ["fakeout", "Fake Out", "its first hit each time it comes out stuns the foe"],
  sv06: ["protean", "Protean", "every move it uses gets its same-type bonus"],
  sv07: ["shell", "Shell Guard", "takes 20% less from shots and beams"],
  "sv08.5": ["moonlight", "Moonlight", "heals 1% of its HP a second"],
  sv08: ["static", "Static Charge", "its Electric hits paralyse one time in four"],
  sv09: ["friend", "Friend Guard", "your benched Pokémon rest twice as fast"],
  "sv10.5b": ["victory", "Victory Star", "your whole team lands critical hits more often"],
  "sv10.5w": ["vflare", "V-Flare", "its ULTI hits 50% harder"],
  sv10: ["psydrive", "Psycho Drive", "its streams hit 15% harder"],
  "swsh10.5": ["starraid", "Star Raid", "your ULTI starts the match fully charged"],
  swsh10: ["chrono", "Star Chronos", "using its ULTI readies all its moves"],
  swsh11: ["lost", "Lost Impact", "hits 25% harder, and takes a tenth of it back"],
  "swsh12.5": ["requiem", "Star Requiem", "its ULTI knocks out a foe under 25% HP outright"],
  swsh12: ["tailwind", "Aeroblast Tailwind", "your whole team moves 10% faster"],
  swsh3: ["wildfire", "G-Max Wildfire", "every hit leaves fire on the floor"],
  swsh6: ["speedboost", "Speed Boost", "its Speed rises every 10 seconds, up to +2"],
  swsh7: ["focus", "Inner Focus", "hits never stagger or flinch it"],
  swsh8: ["terror", "G-Max Terror", "a foe it hits cannot switch out for 3 seconds"],
  swsh9: ["fury", "Burning Fury", "+8% damage for each of your Pokémon knocked out"],
};
// Signatures that, with their Pokemon on the team, help everybody on it.
export const TEAM = new Set(["drought", "friend", "victory", "starraid", "tailwind"]);

const pc = (k, dp = 0) => `${(k * 100).toFixed(dp)}%`;
const familyOf = (type) => Object.keys(FAMILY).find((f) => FAMILY[f].includes(type)) ?? "dmg";
// An evolution line's root: a form reads its base, then each parent in turn.
const PARENT = new Map();
for (const r of EVOLUTIONS) if (!PARENT.has(r.to) && r.to < 10000) PARENT.set(r.to, r.from);
export function rootOf(id) {
  let at = speciesById(id)?.of ?? id;
  for (let n = 0; PARENT.has(at) && n < 4; n++) at = PARENT.get(at);
  return at;
}
// A line by its first stage's name.
const lineName = (id) => nameOf(speciesById(rootOf(id)));

/* A CARD'S PERK, or null: `card` a set file's row [localId, name, category,
   rarity, variants, speciesIds]. */
export function cardPerk(setId, card) {
  const [localId, name, cat, rarity, , ids] = card;
  if (cat !== "P" || !ids?.length || !speciesById(ids[0])) return null;
  const chase = CHASE[setId]?.[0] === localId;
  const gold = GOLD.has(rarity);
  const tier = TIER_K.find(([r]) => rungOf(rarity) >= rungOf(r));
  if (!tier && !chase) return null;
  const sp = speciesById(ids[0]);
  const family = familyOf(sp.types[0]);
  const k = chase ? CHASE_K : gold ? GOLD_K : tier[1];
  const golden = gold && !chase ? GOLDEN[family] : null;
  const sig = chase ? SIGNATURE[setId] : null;
  const line = lineName(ids[0]);
  return {
    id: `${setId}-${localId}`, name, family, k, line: rootOf(ids[0]), gold, chase,
    flag: golden?.[0] ?? null, sig: sig?.[0] ?? null,
    title: sig ? sig[1] : golden ? golden[1] : `${sp.types[0][0].toUpperCase()}${sp.types[0].slice(1)} card`,
    says: [
      `Your team: ${SAYS[family](k * SCALE[family])}`,
      `${line} line: double that`,
      ...(golden ? [golden[2]] : []),
      ...(sig ? [`With a ${line} on your team: ${sig[2]}`] : []),
    ],
  };
}

/* THE MODIFIERS A TEAM FIGHTS WITH, one object a Pokemon, from up to
   ARENA_CARDS perks: each family's number summed (doubled for a card of its
   own line) and capped, the golden flags shared by the team, a signature on
   its own line - and on everybody, for a TEAM one, while its line is there. */
export const NO_PERKS = Object.freeze({ dmg: 0, regen: 0, cd: 0, guard: 0, ult: 0, status: 0 });
export function teamPerks(perks, species) {
  const list = (perks ?? []).filter(Boolean).slice(0, ARENA_CARDS);
  const roots = species.map(rootOf);
  const teamSigs = list.filter((p) => p.sig && TEAM.has(p.sig) && roots.includes(p.line)).map((p) => p.sig);
  return species.map((id, k) => {
    const root = roots[k], out = { ...NO_PERKS, sig: [...teamSigs] };
    for (const p of list) {
      out[p.family] += p.k * SCALE[p.family] * (p.line === root ? 2 : 1);
      if (p.flag) out[p.flag] = true;
      if (p.sig && !TEAM.has(p.sig) && p.line === root) out.sig.push(p.sig);
    }
    for (const f of Object.keys(CAP)) out[f] = Math.min(CAP[f], out[f]);
    return out;
  });
}
