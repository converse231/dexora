import { SAME, NONE } from "../data/follow.js";
import { researchLevel, RESEARCH_MAX } from "./research.js";
import { isEvent } from "../data/dex.js";
import { speciesById } from "./biomes.js";

/* COSMETICS (docs/cosmetics.md): a look, never a strength. No rule module
   reads this file.

   THE FOLLOWER. Which sheet a species walks with behind you:
   public/follow/<id>.png (`npm run follow`), a form without its own drawing
   walking as its species, null for the two with none. An event look walks
   as its species too: the overworld sheets are the games', and nobody drew
   a hat on them. */
const NO_FOLLOW = new Set(NONE);
// How many can be in the walking party - switched on the map, one walking at a time.
export const PARTY_MAX = 3;
export const followSheet = (id) => (isEvent(id) ? followSheet(speciesById(id).of)
  : NO_FOLLOW.has(id) ? null : SAME[id] ?? id);

/* A PARTNER IS EARNED, NOT HANDED OUT (your call, 2026-10-13). Any of 1,413
   species could walk with you, and since 2026-10-07 the one walking lends a
   field ability - so the party was picked for Pickup and Illuminate, and said
   nothing about the species. Now its research must be STARRED - finished to
   Lv 10 and the star taken (your call, 2026-10-13; it was research Lv 5 for
   a day, and a picker full of half-researched species read as no rule at
   all). The star is free, so this asks for the research and nothing else.

   - NEVER TAKEN AWAY: a Pokemon already in the party stays, which covers
     saves from before this and a partner that evolved into a species not
     researched yet (it is the same creature).
   - THE FIRST IS FREE: while no species you hold is starred, one Pokemon
     may walk alone, so a new game does not start without a companion.
   - MASTERY IS ON TOP: a mastered species (RESEARCH_MAX) bonds MASTERED_BOND
     times as fast - hearts, and the friend finds that come with them. Not its
     rare form's palette: a follower sheet carries only the normal and shiny
     rows, and a per-frame canvas filter is what this file already refused. */
export const MASTERED_BOND = 2;
export const isMastered = (id, research) => researchLevel(id, research?.[id]) >= RESEARCH_MAX;
// One reading of the rule for the engine and every screen that offers a partner.
export function partnerRule({ box, party, research, stars }) {
  const level = (id) => researchLevel(id, research?.[id]);
  const starred = (id) => !!stars?.includes(id);
  return {
    level,
    starred,
    starter: !box.some((m) => followSheet(m.species) != null && starred(m.species)),
    can: (m) => !!m && (party.includes(m.uid) || starred(m.species)),
  };
}

/* TRAINER SKINS: what you look like walking the map.
   A look, never a strength, and a money sink for the late game: a skin
   changes the overworld sprite and nothing else - not the trainer card's
   portrait, not a single roll. `null` is your own trainer (Red or Leaf).

   Each one is a Gen 3 overworld sheet from pokeemerald-expansion, cut by
   `npm run skins` (tools/build_skins.py) into public/skins/<id>.png: the
   walk cycle alone, three frames for each of four facings. Every other pose
   (running, a ride, the rod) is drawn from that walk - see `drawPlayer` -
   so a new skin is one line here and one source in the tool. Ids are saved
   (`state.skins`): never rename one. */
export const SKIN_TIERS = [
  ["class", "Trainer classes", 30000],
  ["team", "Villainous teams", 75000],
  ["prof", "Professors and friends", 120000],
  ["rival", "Rivals", 150000],
  ["brain", "Frontier Brains", 200000],
  ["boss", "Team bosses", 300000],
  ["champ", "Leaders and Champions", 400000],
];

const row = (tier, list) => list.map(([id, name]) => ({ id, name, tier }));

export const SKINS = [
  ...row("class", [["youngster", "Youngster"], ["lass", "Lass"], ["bug_catcher", "Bug Catcher"],
    ["hiker", "Hiker"], ["picnicker", "Picnicker"], ["camper", "Camper"], ["black_belt", "Black Belt"],
    ["beauty", "Beauty"], ["sailor", "Sailor"], ["gentleman", "Gentleman"], ["hex_maniac", "Hex Maniac"],
    ["psychic", "Psychic"], ["expert_m", "Expert"], ["expert_f", "Expert"], ["fisherman", "Fisherman"],
    ["ace_m", "Ace Trainer"], ["ace_f", "Ace Trainer"], ["triathlete_m", "Triathlete"],
    ["triathlete_f", "Triathlete"], ["scientist", "Scientist"]]),
  ...row("team", [["rocket_m", "Rocket Grunt"], ["rocket_f", "Rocket Grunt"], ["aqua_m", "Aqua Grunt"],
    ["aqua_f", "Aqua Grunt"], ["magma_m", "Magma Grunt"], ["magma_f", "Magma Grunt"]]),
  ...row("prof", [["oak", "Prof. Oak"], ["birch", "Prof. Birch"], ["bill", "Bill"], ["daisy", "Daisy"]]),
  ...row("rival", [["blue", "Blue"], ["brendan", "Brendan"], ["may", "May"], ["wally", "Wally"]]),
  ...row("brain", [["anabel", "Anabel"], ["brandon", "Brandon"], ["greta", "Greta"], ["lucy", "Lucy"],
    ["noland", "Noland"], ["spenser", "Spenser"], ["tucker", "Tucker"]]),
  ...row("boss", [["giovanni", "Giovanni"], ["archie", "Archie"], ["maxie", "Maxie"]]),
  ...row("champ", [["lorelei", "Lorelei"], ["norman", "Norman"], ["juan", "Juan"], ["steven", "Steven"],
    ["wallace", "Wallace"]]),
];

const BY_ID = new Map(SKINS.map((s) => [s.id, s]));
const PRICE = new Map(SKIN_TIERS.map(([t, , price]) => [t, price]));

/* A skin id from a newer build is kept in a save (never a purchase lost),
   and draws as your own trainer here. */
export const skinById = (id) => BY_ID.get(id) ?? null;
export const skinPrice = (id) => PRICE.get(BY_ID.get(id)?.tier) ?? null;
