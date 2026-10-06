/* THE DAILY CHECK-IN (docs/checkin.md, asked for 2026-10-07): the first
   visit of a day asks you to check in; days in a row are a streak, and
   every seventh day of it is a spin of the roulette. Browser-free.

   Separate from the daily QUEST (daily.js), which asks for play: this asks
   only that you came back. Its day is `dayKey`, the device's calendar date,
   like the quest's - nothing here is ranked. */
import { dayKey, isYesterday } from "./daily.js";

/* What each day of a week of the streak gives, day 1 first. Modest, and
   rising to the seventh; the eighth day starts the ladder again. */
export const CHECKIN_REWARDS = [
  { money: 1000 },
  { items: { "great-ball": 5 } },
  { candy: 3 },
  { money: 2500 },
  { items: { "ultra-ball": 3 } },
  { items: { honey: 1 } },
  { money: 5000, spin: 1 },
];
export const WEEK = CHECKIN_REWARDS.length;

// Streak days that get the celebration, not just the stamp.
export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 180, 365];

/* THE ROULETTE: fifteen equal slots - thirteen card packs (a set, every
   one as likely, ROULETTE_PACKS of it) and two Gold Pokemon (any species
   that is not legendary, a form or a costume): 2 in 15 spins land a Gold
   one (your call, 2026-10-07; it was 5 of 15). */
export const ROULETTE = { pack: 13, gold: 2 };
export const ROULETTE_PACKS = 3;
export const ROULETTE_LEVEL = 25;

// Day of the week's ladder for a streak (1..7).
export const checkinDay = (streak) => ((Math.max(1, streak) - 1) % WEEK) + 1;

/* Where a check-in today would leave the streak: kept from yesterday, or
   started again. `due` is false once today is stamped. */
export function checkinStatus(c, today = dayKey()) {
  const due = c?.last !== today;
  const kept = isYesterday(c?.last, today);
  const streak = due ? (kept ? (c?.streak ?? 0) + 1 : 1) : (c?.streak ?? 0);
  return { due, streak, day: checkinDay(streak), broken: due && !kept && (c?.streak ?? 0) > 1 };
}

// One spin. `sets` are card set ids, `golds` species ids; `rng` the engine's Math.random.
export function rollRoulette(sets, golds, rng) {
  const slot = Math.floor(rng() * (ROULETTE.pack + ROULETTE.gold));
  if (slot < ROULETTE.pack || !golds.length) {
    return { kind: "pack", set: sets[Math.floor(rng() * sets.length)], n: ROULETTE_PACKS };
  }
  return { kind: "gold", species: golds[Math.floor(rng() * golds.length)] };
}
