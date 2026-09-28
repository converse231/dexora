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

/* THE LADDER (docs/ranked.md, *Ratings*, 6c). The ratings themselves are the
   database's (db/ranked.sql `ranked_rate`); these are the words for them.
   `from` is each Ball tier's lower edge, which is also its FLOOR in the SQL
   (`ranked_floor`, asserted equal); `steps` split a tier into III, II, I. */
export const PLACEMENT = 5;        // battles a season before a rank shows (K 40 meanwhile)
export const DAILY_BATTLES = 20;   // a challenger's battles a UTC day, anchors included
/* The Dex careers (2026-09-29; the Ball tiers before - docs/ranked.md). Five
   where there were four: Legend sits at Master Ball's old edge, and the
   bottom two split at 1050 and 1150 because everybody starts at 1000. */
export const RANKS = [
  { id: "scout", name: "Scout", from: -Infinity, steps: [1017, 1034] },
  { id: "ranger", name: "Ranger", from: 1050, steps: [1083, 1116] },
  { id: "researcher", name: "Researcher", from: 1150, steps: [1183, 1216] },
  { id: "professor", name: "Professor", from: 1250, steps: [1300, 1350] },
  { id: "legend", name: "Legend", from: 1400, steps: [] },
];
// The top rank shows the rating in place of a division.
export const TOP_RANK = RANKS.at(-1).id;
const DIVISIONS = ["III", "II", "I"];

/* A standing in words: Beginner through placement, then the rank and its
   division (III lowest) - Legend shows the rating instead. */
export function rankOf(rating, games) {
  if (games < PLACEMENT) return { id: "beginner", name: "Beginner", division: null, left: PLACEMENT - games };
  const r = RANKS.findLast((x) => rating >= x.from);
  return { id: r.id, name: r.name, division: r.steps.length ? DIVISIONS[r.steps.filter((x) => rating >= x).length] : null };
}
// The rank a season's peak reached - a season badge.
export const peakRank = (peak) => rankOf(peak, PLACEMENT);

/* SEASONS are calendar months, UTC (`2026-10`), as the SQL's `ranked_season`. */
export const seasonOf = (date = new Date()) => date.toISOString().slice(0, 7);
export const seasonEnd = (season) => {
  const [y, m] = season.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1));
};
export const seasonName = (season) => new Date(`${season}-01T00:00:00Z`)
  .toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/* THE SPECIES CLAUSE counts a form as its species: Charizard and Mega
   Charizard X, Raichu and Alolan Raichu are one each. `of` is the species a
   form belongs to (dex.js). */
export const baseOf = (id) => speciesById(id)?.of ?? id;

/* WHO DEFENDS (deferred from 6c, built 2026-09-29): `my_defense`'s teams as
   box uid -> "Team A" / "Teams A and B", the words a warning says. The game
   reads it at sign-in and after every edit, so selling, trading or evolving a
   defender says so first - a team is uids on the server, and nothing else in
   the game knew a Pokemon was in one. A member already gone from the saved
   box (`missing`) defends nothing. */
export const TEAM_NAME = ["A", "B", "C"];
export function defenders(teams) {
  const at = {};
  for (const t of teams ?? []) {
    for (const m of t.team ?? []) if (!m.missing) (at[m.uid] ??= []).push(TEAM_NAME[t.slot - 1]);
  }
  return Object.fromEntries(Object.entries(at)
    .map(([uid, s]) => [uid, `Team${s.length > 1 ? "s" : ""} ${s.join(" and ")}`]));
}
// The one sentence for Pokemon about to leave: null when none of them defends.
export function defendNote(mons, defense, name) {
  const hit = mons.filter((m) => defense?.[m.uid]);
  if (!hit.length) return null;
  const who = hit.map((m) => `${name(m)} (${defense[m.uid]})`).join(", ");
  return `${who} ${hit.length > 1 ? "defend" : "defends"} in ranked - once gone, `
    + `${hit.length > 1 ? "those teams play" : "that team plays"} a member short until you fix it.`;
}

/* What is wrong with a team of species ids, or null: `empty`, `size` (over
   six), `unknown` (not a species), `clause` (two of one species). */
export function teamProblem(species) {
  if (!species.length) return "empty";
  if (species.length > TEAM_MAX) return "size";
  if (species.some((id) => !speciesById(id))) return "unknown";
  if (new Set(species.map(baseOf)).size !== species.length) return "clause";
  return null;
}
