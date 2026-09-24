/* ONE QUEST A DAY, and it is a quest rather than a login bonus.

   That was the open question and this is the answer: a login bonus is a number
   you collect, and it asks nothing of the game underneath it. A quest is made
   entirely of things the game already counts - catches, types, steps - so it
   costs no new systems and it points you at a part of the map you might not
   have walked today. "Catch four Water-types" is a reason to go to the pond.

   Everything here is PURE. The engine calls `dailyFor`, `advance` and `reward`;
   check.mjs calls the same three with a fake clock, which is the only way to
   test something keyed on the date without waiting a day. */
import { SPECIES } from "../data/dex.js";
import { BIOMES } from "./biomes.js";

/* The local day, as a string. Local rather than UTC on purpose: a daily that
   rolls over at 1am because the player is in the wrong timezone is a daily
   that feels broken, and nothing here needs the two to agree across devices. */
export function dayKey(at = new Date()) {
  const d = at.getFullYear() * 10000 + (at.getMonth() + 1) * 100 + at.getDate();
  return String(d);
}

/* A hash, so the day picks its own quest and a reload cannot reroll it.

   The obvious alternative - store a random choice on first sight - has a
   failure this does not: two tabs open at midnight generate two different
   quests and the second overwrites the first's progress. Derived from the date,
   every copy of the game agrees without talking. Exported for the outbreak,
   which is keyed on the same day for the same reason. */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

/* THE TYPES THAT CAN ACTUALLY BE ASKED FOR, and getting this wrong makes a
   quest a wall rather than a task.

   The first version took the union of every biome's `types` list, which sounds
   right and is not: a biome listing "dragon" means legendaries match against
   it, not that four dragons live there. Measured - **there are two Dragon-type
   species in every table in the game put together**, so "catch four
   Dragon-types" is a day nobody can finish, and Dark and Steel are barely
   better at five and six.

   Derived from the STARTING map instead, by weight. Tall Grass is the one place
   open to every player at every level, so a quest drawn from it is completable
   today by definition - no level to check, no state to store, and no way for
   the pool to promise something the player cannot reach. `QUEST_SHARE` is the
   honest threshold: 5% of the table is about one in twenty encounters, which is
   a task. Add a species to Tall Grass and the pool grows on its own. */
export const QUEST_SHARE = 0.05;

export const QUEST_TYPES = (() => {
  const start = BIOMES[0];
  const total = start.table.reduce((n, [, w]) => n + w, 0);
  const share = {};
  for (const [id, w] of start.table) {
    for (const t of SPECIES.find((sp) => sp.id === id)?.types ?? []) {
      share[t] = (share[t] ?? 0) + w / total;
    }
  }
  return Object.entries(share)
    .filter(([, v]) => v >= QUEST_SHARE)
    .map(([t]) => t)
    .sort();
})();

/* Three kinds, and all three are counters the game already keeps. A fourth
   that needed new bookkeeping would be a fourth thing to keep in step. */
export const GOALS = [
  { kind: "catch", need: 8, say: (g) => `Catch ${g.need} Pokémon` },
  {
    kind: "type",
    need: 4,
    say: (g) => `Catch ${g.need} ${g.type[0].toUpperCase()}${g.type.slice(1)}-types`,
  },
  { kind: "walk", need: 1500, say: (g) => `Walk ${g.need.toLocaleString()} steps` },
];

export function dailyFor(key) {
  const h = hash(key);
  const goal = GOALS[h % GOALS.length];
  return {
    key,
    kind: goal.kind,
    need: goal.need,
    // Only the type quest uses this, and picking it from a second hash keeps
    // the two choices independent - otherwise the same kind always draws the
    // same type and a third of days are identical.
    type: QUEST_TYPES[(h >>> 8) % QUEST_TYPES.length],
  };
}

export const describe = (g) =>
  GOALS.find((x) => x.kind === g?.kind)?.say(g) ?? "";

/* What one event is worth to the quest in hand. Pure, and it takes the SPECIES
   rather than an id so it cannot disagree with the dex about types. */
export function advance(goal, event) {
  if (!goal) return 0;
  if (goal.kind === "walk") return event.steps ?? 0;
  if (!event.species) return 0;
  if (goal.kind === "catch") return 1;
  if (goal.kind === "type") return event.species.types.includes(goal.type) ? 1 : 0;
  return 0;
}

/* THE STREAK IS THE REWARD, not a second currency.

   It multiplies what the quest already pays rather than paying separately, so
   there is one number to read and one thing to protect. Capped, because an
   uncapped streak makes day sixty worth more than the first fifty put
   together, and a player who misses one then has nothing to come back for. */
export const STREAK_CAP = 7;
export const streakMult = (streak) => 1 + Math.min(streak, STREAK_CAP) * 0.15;

export function reward(goal, streak) {
  const m = streakMult(streak);
  return {
    money: Math.round(600 * m),
    candy: Math.round(6 * m),
    items: { "great-ball": Math.round(4 * m) },
  };
}

/* Is `then` the day before `now`? A streak survives a gap of exactly one day
   and nothing else - comparing the two keys as numbers would make the 1st of a
   month look like a 70-day gap, so both go through a real Date. */
export function isYesterday(then, now) {
  if (!then || !now) return false;
  const at = (k) => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));
  return at(now) - at(then) === 86400000;
}

export const speciesTypes = (id) => SPECIES.find((s) => s.id === id)?.types ?? [];
