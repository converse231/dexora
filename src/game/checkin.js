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

/* THE STREAK'S CARD PACKS (asked for, 2026-10-22): days of the streak that
   pay packs - 10 on day 10, 20 on 20, 30 on 30, 50 on 50, 70 on 70, 100 on
   100, then STREAK_MONTHLY every STREAK_MONTH days after the last. They come
   in LOTs of ten, each lot ONE set, landed by the reel (`lotSets`). */
export const STREAK_PACKS = [[10, 10], [20, 20], [30, 30], [50, 50], [70, 70], [100, 100]];
export const STREAK_MONTH = 30;
export const STREAK_MONTHLY = 100;
export const LOT = 10;
export function streakPacks(day) {
  const hit = STREAK_PACKS.find(([d]) => d === day);
  if (hit) return hit[1];
  const last = STREAK_PACKS.at(-1)[0];
  return day > last && (day - last) % STREAK_MONTH === 0 ? STREAK_MONTHLY : 0;
}
// The next streak day that pays packs, after `streak`.
export function nextPackDay(streak) {
  const last = STREAK_PACKS.at(-1)[0];
  const ahead = STREAK_PACKS.find(([d]) => d > streak);
  return ahead ? ahead[0] : last + (Math.floor((streak - last) / STREAK_MONTH) + 1) * STREAK_MONTH;
}
// Streak days that take the whole screen: the first week, and every day that pays packs.
export const isMilestone = (day) => day === 7 || streakPacks(day) > 0;
/* WHICH SET EACH LOT IS: drawn from the sets open to you, weighted toward
   the ones you are furthest from finishing (`missing`: set id -> the share
   of its cards you lack, 0-1; a quarter on top so a finished set can still
   land) - a long streak fills the collection instead of stacking spares.
   `rng` is the engine's Math.random. */
export function lotSets(open, missing, lots, rng) {
  if (!open.length) return [];
  const w = open.map((id) => 0.25 + Math.min(1, Math.max(0, missing[id] ?? 1)));
  const total = w.reduce((n, x) => n + x, 0);
  return Array.from({ length: lots }, () => {
    let r = rng() * total;
    for (let i = 0; i < open.length; i++) { r -= w[i]; if (r < 0) return open[i]; }
    return open.at(-1);
  });
}
/* THE STREAK AS IT STANDS RIGHT NOW, for the top bar: today's stamp, or
   yesterday's still alive until today ends, or nothing once a day was
   missed. `due` says today is not stamped yet. */
export function streakNow(c, today = dayKey()) {
  const st = checkinStatus(c, today);
  return { streak: st.due ? (isYesterday(c?.last, today) ? c?.streak ?? 0 : 0) : st.streak, due: st.due };
}

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
