/* THE FIRST DAYS (onboarding, asked for 2026-10-22: new players signed up
   and never found the core features). Three pieces, kept small so the first
   minute is one choice and one catch, never a wall of chips:

   - A PARTNER, picked with your trainer: one of Kanto's three at Lv 5, in
     your Box and walking beside you (`grantStarter` in the engine).
   - THE FIRST CATCH CANNOT FAIL (the engine's `throwBall` while `caught` is
     0): a new player's first throw is the hook, and a 40% miss there read as
     the game being hard before it had shown what it is.
   - THE STARTER PATH: six first goals, one shown at a time on the map, each
     a feature the game has and a small reward for finding it - claimed in
     order (`path` is how many). DERIVED from the save, like achievements.js,
     so a goal met early is simply claimable when it comes up.

   A save from before this existed and has caught anything is a player who
   already found their way: it loads with the path finished (`cleanPath`).
   Pure and browser-free, so tools/play reads it in Node. */

import { TASKS } from "./research.js";
import { badgesOf } from "./league.js";

// Kanto's three, the order the games offer them.
export const STARTERS = [1, 4, 7];
export const STARTER_LEVEL = 5;

const evolved = (s) => {
  const i = TASKS.findIndex((t) => t.id === "evolve");
  return Object.values(s.research ?? {}).filter((r) => (r?.[i] ?? 0) > 0).length;
};

/* Small on purpose: a one-off pool, under one achievement step's worth each
   (achievements.js `STEP_PAY`), and balls first. `where` is the page a goal
   is done on, for its button. */
export const PATH = [
  { id: "catch", name: "Catch 3 Pokémon", tip: "Walk in the tall grass to meet them", need: 3, of: (s) => s.caught ?? 0,
    pay: { items: { "great-ball": 5 } }, where: "catch" },
  { id: "checkin", name: "Check in for the day", tip: "One press a day keeps your streak - streaks pay card packs", need: 1, of: (s) => (s.checkin?.best ?? 0) > 0 ? 1 : 0,
    // Enough to take a Lv 5 partner to its first evolution (16) - the next goal.
    pay: { candy: 12 }, where: "checkin" },
  { id: "evolve", name: "Evolve a Pokémon", tip: "Rotom › Box › pick one, then Evolve with Rare Candy", need: 1, of: evolved,
    pay: { money: 1000, items: { "great-ball": 5 } }, where: "box" },
  { id: "badge", name: "Win your first badge", tip: "Battles › pick a gym and a team", need: 1, of: (s) => Math.min(1, badgesOf(s.beaten)),
    pay: { items: { "ultra-ball": 5 } }, where: "battles" },
  { id: "pack", name: "Open a card pack", tip: "Your first badge paid one - open it in Cards", need: 1, of: (s) => Object.keys(s.cards ?? {}).length > 0 ? 1 : 0,
    pay: { money: 2000 }, where: "cards" },
  { id: "arena", name: "Win a live Arena battle", tip: "The Arena tab - move, aim and dodge in real time", need: 1,
    of: (s) => ((s.ladder ?? []).length || (s.arena?.won ?? []).length) ? 1 : 0,
    pay: { money: 3000, items: { "ultra-ball": 10 } }, where: "arena" },
];

/* Where the path stands: the goal showing, its progress, and whether it can
   be claimed - or null once every goal is claimed. */
export function pathNow(s) {
  const at = s.path ?? PATH.length;
  if (at >= PATH.length) return null;
  const goal = PATH[at];
  const value = Math.min(goal.need, goal.of(s));
  return { at, goal, value, ready: value >= goal.need };
}

/* A saved `path`, a whole number of goals claimed. Missing, it is a new
   player's 0 - or, for a save that has caught anything, finished. */
export function cleanPath(v, s) {
  if (v === undefined) return (s?.caught ?? 0) > 0 ? PATH.length : 0;
  return Number.isInteger(v) && v >= 0 ? Math.min(v, PATH.length) : 0;
}
