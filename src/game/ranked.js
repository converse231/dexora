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

// The server refuses a client on another version of these rules (6b). 2: the Kanto
// learnsets came from Japanese Red/Green (fetch-moves) and are now Scarlet/Violet's.
export const RULES_VERSION = 2;
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
/* Eight ranks (2026-09-29, your names; the Ball tiers before - docs/ranked.md).
   Sovereign keeps the old top's edge, 1400; the middle is cut in 50s because
   everybody starts at 1000, and Champion is 75 wide where the anchors thin. */
// `color` is the emblem's own (public/ranks/battle), for its stand-in disc and the rank-up glow.
export const RANKS = [
  { id: "challenger", name: "Challenger", from: -Infinity, steps: [1017, 1034], color: "#c0803f" },
  { id: "contender", name: "Contender", from: 1050, steps: [1067, 1084], color: "#9aa5b1" },
  { id: "rival", name: "Rival", from: 1100, steps: [1117, 1134], color: "#d8413f" },
  { id: "vanguard", name: "Vanguard", from: 1150, steps: [1167, 1184], color: "#2fa9ad" },
  { id: "elite", name: "Elite", from: 1200, steps: [1217, 1234], color: "#3563cf" },
  { id: "master", name: "Master", from: 1250, steps: [1267, 1284], color: "#7b3fd0" },
  { id: "champion", name: "Champion", from: 1325, steps: [1350, 1375], color: "#e5a92b" },
  { id: "sovereign", name: "Sovereign", from: 1400, steps: [], color: "#f2dc8c" },
];
// The top rank shows the rating in place of a division.
export const TOP_RANK = RANKS.at(-1).id;
const DIVISIONS = ["III", "II", "I"];

/* A standing in words: Beginner through placement, then the rank, its step
   on the ladder (the medal's colour) and its division (III lowest) - the top
   rank shows the rating instead. */
export function rankOf(rating, games) {
  if (games < PLACEMENT) return { id: "beginner", name: "Beginner", step: null, division: null, left: PLACEMENT - games };
  const r = RANKS.findLast((x) => rating >= x.from);
  return { id: r.id, name: r.name, step: RANKS.indexOf(r), color: r.color,
    division: r.steps.length ? DIVISIONS[r.steps.filter((x) => rating >= x).length] : null };
}
/* A PROMOTION, read off what the server said a finished battle did
   (`ranked_outcome`: the rating and games after, and the delta): the step
   left and the step reached, or null when the rank did not climb. Leaving
   placement is one (`from` null). A new division is not - the ceremony is
   for a new rank. */
export function promotion({ rating, games, delta }) {
  const was = rankOf(rating - delta, games - 1);
  const now = rankOf(rating, games);
  if (now.step == null || (was.step != null && now.step <= was.step)) return null;
  return { from: was.step, to: now.step };
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
