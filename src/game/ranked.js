/* RANKED'S RULES (docs/ranked.md): the format a ranked or practice battle is
   played in, and what makes a defense team legal. One rulebook, as league.js
   is: the League page reads it, and the server's battle function will bundle
   it (6b). Browser-free and free of the battle data - `rankedFighter` in
   battle.js is what turns a species into a fighter.

   THE FORMAT IS SPECIES, NOTHING ELSE. A save is client-written, so a
   hand-edited box can hold any level with any uid (and a uid picks IVs).
   Ranked reads the level, the IVs and the moves off the format, so a save
   can claim a species - never a stronger one. */
import { speciesById } from "./biomes.js";
import { TEAM_MAX } from "./league.js";

// The server refuses a client on another version of these rules (6b).
export const RULES_VERSION = 1;
export const RANKED_LEVEL = 100;   // everyone, whatever the box says (your call, rev 2)
export const RANKED_IV = 31;       // every stat, everyone
export const DEFENSE_SLOTS = 3;
export const DEFENSE_MIN = 2;      // teams it takes to be matched (6c): always something to guess

/* A trainer as a ranked or practice opponent is drawn: each playable char
   (engine.js CHARS) as Showdown's FireRed/LeafGreen art, fetched by
   build_battle_art.py's PLAYER_PICS (check.mjs holds the three together). */
export const CHAR_PIC = { red: "red-gen3", leaf: "leaf-gen3" };

/* THE SPECIES CLAUSE counts a form as its species: Charizard and Mega
   Charizard X, Raichu and Alolan Raichu are one each. `of` is the species a
   form belongs to (dex.js). */
export const baseOf = (id) => speciesById(id)?.of ?? id;

/* What is wrong with a team of species ids, or null: `empty`, `size` (over
   six), `unknown` (not a species), `clause` (two of one species). */
export function teamProblem(species) {
  if (!species.length) return "empty";
  if (species.length > TEAM_MAX) return "size";
  if (species.some((id) => !speciesById(id))) return "unknown";
  if (new Set(species.map(baseOf)).size !== species.length) return "clause";
  return null;
}
