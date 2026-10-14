/* WEEKLY BINGO (2026-10-14, the late-game shortlist's third phase): a 5x5
   card a week, the centre free, every other square a goal made of things
   the game already does - catching, walking, evolving, the quiz, battles,
   packs. A line of five pays `BINGO_LINE`, the whole card `BINGO_FULL`.

   THE CARD IS FROZEN AT FIRST SIGHT (as the outbreak is): it is drawn from
   the week's hash AND what you can do today - no fishing square without a
   rod, no region you have not opened - so it is stored, and a level gained
   mid-week cannot reshuffle it. Its prizes are CLAIMED on the Events page,
   never paid on the moment (achievements' rule). No money and no Master
   Ball: check.mjs holds a whole week under the daily quest's candy.

   Browser-free, so check.mjs can bound it. */
import { QUEST_TYPES, hash, dayKey } from "./daily.js";
import { genOf, GEN_UNLOCK, REGION_NAME } from "./biomes.js";

export const BINGO_SIZE = 5;
export const FREE = 12;                  // the centre square
export const BINGO_LINE = { candy: 2, items: { "great-ball": 5 } };
export const BINGO_FULL = { candy: 10, packs: 1 };

// Rows, columns and the two diagonals, as square indexes.
const N = BINGO_SIZE;
export const LINES = [
  ...Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => r * N + c)),
  ...Array.from({ length: N }, (_, c) => Array.from({ length: N }, (_, r) => r * N + c)),
  Array.from({ length: N }, (_, i) => i * N + i),
  Array.from({ length: N }, (_, i) => i * N + (N - 1 - i)),
];

// A week is named by its Monday's day key, so it turns over at local midnight
// into Monday, the same clock the daily quest keeps.
export function weekKey(at = new Date()) {
  const d = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
}

const cap = (t) => t[0].toUpperCase() + t.slice(1);
const on = (key) => (g, e) => (e.caught?.[key] ? 1 : 0);
const plain = (key) => (g, e) => e[key] ?? 0;

/* WHAT EACH SQUARE ASKS. `count(cell, event)` is what one event is worth to
   it (`max`: the best seen, not a sum - a combo is reached, not added up).
   `short` is the square's own two-line label, `say` the sentence under the
   card. A catch event carries `caught` - the facts frozen on the encounter. */
export const GOALS = {
  catch: { need: 25, short: (g) => `Catch ${g.need}`, say: (g) => `Catch ${g.need} Pokémon`, count: (g, e) => (e.caught ? 1 : 0) },
  type: {
    need: 6, short: (g) => `${g.need} ${cap(g.param)}`, say: (g) => `Catch ${g.need} ${cap(g.param)}-type Pokémon`,
    count: (g, e) => (e.caught?.types?.includes(g.param) ? 1 : 0),
  },
  gen: {
    need: 6, short: (g) => `${g.need} ${REGION_NAME[g.param]}`, say: (g) => `Catch ${g.need} Pokémon from ${REGION_NAME[g.param]}`,
    count: (g, e) => (e.caught && genOf(e.caught.id) === g.param ? 1 : 0),
  },
  night: { need: 5, short: () => "5 at night", say: () => "Catch 5 Pokémon at night", count: on("night") },
  first: { need: 5, short: () => "5 first ball", say: () => "Catch 5 Pokémon with the first ball you throw", count: on("first") },
  size: { need: 2, short: () => "2 XS or XL", say: () => "Catch 2 XS or XL Pokémon", count: on("sized") },
  rare: { need: 1, short: () => "A rare form", say: () => "Catch a rare form", count: on("rare") },
  dupe: { need: 5, short: () => "5 repeats", say: () => "Catch 5 Pokémon you already have", count: on("dupe") },
  new: { need: 1, short: () => "A new entry", say: () => "Catch a Pokémon new to your Pokédex", count: on("isNew") },
  outbreak: { need: 3, short: () => "3 outbreak", say: () => "Catch 3 from today's mass outbreak", count: on("outbreak") },
  fish: { need: 3, short: () => "Hook 3", say: () => "Catch 3 Pokémon on a fishing rod", count: on("fished") },
  walk: { need: 3000, short: () => "3,000 steps", say: () => "Walk 3,000 steps", count: plain("steps") },
  evolve: { need: 2, short: () => "Evolve 2", say: () => "Evolve 2 Pokémon", count: plain("evolve") },
  berry: { need: 3, short: () => "Feed 3 berries", say: () => "Feed 3 berries to wild Pokémon", count: plain("berry") },
  quiz: { need: 2, short: () => "Quiz right ×2", say: () => "Answer Who's that Pokémon? right on 2 days", count: plain("quiz") },
  checkin: { need: 4, short: () => "Check in ×4", say: () => "Check in on 4 days", count: plain("checkin") },
  quest: { need: 3, short: () => "3 daily quests", say: () => "Finish and claim 3 daily quests", count: plain("quest") },
  combo: { need: 10, max: true, short: () => "Combo ×10", say: () => "Reach a catch combo of 10", count: plain("combo") },
  win: { need: 3, short: () => "Win 3 battles", say: () => "Win 3 battles - the League or road trainers", count: plain("win") },
  pack: { need: 3, short: () => "Open 3 packs", say: () => "Open 3 card packs", count: plain("pack") },
  spare: { need: 10, short: () => "10 spares", say: () => "Sell or convert 10 spare Pokémon", count: plain("spare") },
  rift: { need: 1, short: () => "A rift find", say: () => "Find something in a space-time rift", count: plain("rift") },
};

const cellOf = ([kind, need, param]) => ({ kind, need, param });
export const shortOf = (cell) => GOALS[cell[0]].short(cellOf(cell));
export const sayOf = (cell) => GOALS[cell[0]].say(cellOf(cell));

/* THE WEEK'S CARD for what you can do now (`ctx`: `level`, `fish` - a rod
   held, `packs` - a card set open, `missing` - species not yet caught): 24
   squares DRAWN from every goal open to you - the fixed ones, the starting
   map's types, your open regions - so weeks differ in what they ask, not
   only where. Short of 24 (a new player), bigger catch counts fill in. */
// The day hash is FNV, weak on keys a character apart: mixed before ordering.
const mix = (h) => {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
export function cardFor(week, ctx) {
  const shut = { fish: !ctx.fish, pack: !ctx.packs, new: !(ctx.missing > 0) };
  const open = [
    ...Object.keys(GOALS).filter((k) => !["type", "gen"].includes(k) && !shut[k]).map((k) => [k, GOALS[k].need, null]),
    ...QUEST_TYPES.map((t) => ["type", GOALS.type.need, t]),
    ...Object.keys(GEN_UNLOCK).map(Number).filter((g) => GEN_UNLOCK[g] <= ctx.level).map((g) => ["gen", GOALS.gen.need, g]),
  ];
  const order = (xs) => [...xs].sort((a, b) => mix(hash(`${week}:${a}`)) - mix(hash(`${week}:${b}`)));
  const drawn = order(open).slice(0, N * N - 1);
  for (const n of [50, 75, 100]) if (drawn.length < N * N - 1) drawn.push(["catch", n, null]);
  const placed = order(drawn.map((c) => `at:${c}`)).map((k) => drawn.find((c) => `at:${c}` === k));
  placed.splice(FREE, 0, null);
  return placed;
}

export const fresh = (week, ctx) => ({ week, cells: cardFor(week, ctx), n: Array(N * N).fill(0), lines: [], full: false });

export const doneAt = (b, i) => i === FREE || b.n[i] >= b.cells[i][1];
// Lines finished and not yet paid; whether the whole card is finished and unpaid.
export const dueLines = (b) => LINES.map((l, i) => i).filter((i) => !b.lines.includes(i) && LINES[i].every((s) => doneAt(b, s)));
export const fullDue = (b) => !b.full && b.cells.every((c, i) => doneAt(b, i));

/* An event's worth to the card: the squares it moved and the lines it
   finished, the card updated in place. */
export function advanceBingo(b, event) {
  const before = new Set(dueLines(b).concat(b.lines));
  const filled = [];
  b.cells.forEach((cell, i) => {
    if (!cell || doneAt(b, i)) return;
    const g = GOALS[cell[0]];
    const add = g.count(cellOf(cell), event);
    if (!add) return;
    b.n[i] = Math.min(cell[1], g.max ? Math.max(b.n[i], add) : b.n[i] + add);
    if (doneAt(b, i)) filled.push(i);
  });
  const lines = filled.length ? dueLines(b).filter((l) => !before.has(l)) : [];
  return { filled, lines };
}

// A saved card: this shape exactly, or none (a bad card is next week's fresh one).
export function cleanBingo(b) {
  if (!b || typeof b !== "object" || !/^\d{8}$/.test(b.week ?? "")) return null;
  const { cells, n } = b;
  if (!Array.isArray(cells) || cells.length !== N * N || !Array.isArray(n) || n.length !== N * N) return null;
  const ok = cells.every((c, i) => (i === FREE ? c === null
    : Array.isArray(c) && GOALS[c[0]] && Number.isInteger(c[1]) && c[1] > 0));
  if (!ok) return null;
  return {
    week: b.week,
    cells: cells.map((c) => (c ? [c[0], c[1], c[2] ?? null] : null)),
    n: n.map((v, i) => (i === FREE ? 0 : Math.max(0, Math.min(cells[i][1], Number.isInteger(v) ? v : 0)))),
    lines: [...new Set(Array.isArray(b.lines) ? b.lines : [])].filter((l) => Number.isInteger(l) && LINES[l]),
    full: b.full === true,
  };
}
