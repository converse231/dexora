import { SAME, NONE } from "../data/follow.js";

/* COSMETICS (docs/cosmetics.md): a look, never a strength. No rule module
   reads this file.

   THE FOLLOWER. Which sheet a species walks with behind you:
   public/follow/<id>.png (`npm run follow`), a form without its own drawing
   walking as its species, null for the two with none. */
const NO_FOLLOW = new Set(NONE);
export const followSheet = (id) => (NO_FOLLOW.has(id) ? null : SAME[id] ?? id);

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
