/* RESEARCH - a level from 0 to 10 per species, earned by catching it in
   different ways. It is what makes the tenth Pidgey worth throwing at: the
   dex entry fills on the first catch, and research is everything after that.

   Pure, like daily.js and events.js, so check.mjs can drive it with no engine.

   A ROW IS A LIST OF COUNTERS, keyed by DEX ID in `state.research`, never by
   position: an id never moves, so no generation shipped later can re-label a
   save's research the way an insert re-labels the position-keyed tier rows.
   Only species you have touched get a row.

   `TASKS` IS APPEND-ONLY, like `LEVEL_XP`. A task's index IS its slot in every
   saved row, so reordering or deleting one moves every counter in every save
   onto the wrong task. Add at the end. */
import { EVOLUTIONS } from "../data/evolutions.js";
import { canBeAlpha, isLegendary } from "./biomes.js";

/* Only an evolution a trainer can afford counts: a Mega, Primal or G-Max row
   costs Lv 100, and a species whose only evolution is one would need a
   hundred candy to finish its research. */
const evolves = new Set(EVOLUTIONS.filter((e) => e.level < 100).map((e) => e.from));

/* Each task counts up to its last step, and every step reached is worth
   `points`. Tasks that only make sense for some species say so in `when` -
   derived from the data, never listed per species. */
/* EVERY TASK IS REQUIRED EXCEPT A `bonus` one. The alpha is the bonus: it is
   a 1-in-250 roll, and required it left 0 to 2 species finishable in a whole
   playthrough (measured) against 16 without it.

   SLOT 0 COUNTS ORDINARY CATCHES ONLY - no tier, no alpha. It counted every
   catch up to 20 before; old counters are kept, clamped to 10, since nearly
   all of them were ordinary anyway. This is where the game asks you to catch
   the same species more than once, and since 2026-10-09 it is the ONLY place
   it does - see RESEARCH_LIFT below. */
/* A LEGENDARY'S RESEARCH IS ONE CATCH AND WHAT YOU DO WITH IT: catch one
   (`legend`), feed it a berry in that encounter, win a League battle with one
   on your team (`league`), and raise one to Lv 100 (`hundred`). It asked for
   the first ball too until 2026-09-29: with one meeting a playthrough, a
   first-ball catch of a legendary was luck on top of luck (reported from
   play), where a League win is something you can set out to do. Hunting on its home map, one specific
   legendary is met about once a playthrough (1 in 3,333 encounters), so a
   count of catches is out of reach - one catch was too easy, three was three
   playthroughs. Its star cost one spare until 2026-10-09, which asked for a
   second catch of a thing met once a playthrough; nothing is spent now.

   XS AND XL ARE ONE TASK, either size: needing both was the tightest of the
   luck tasks, and folding them doubled what a playthrough finishes (12 to 26
   species). `xl` keeps its slot, asked of nobody; `cleanRow` folds an old xl
   into xs. */
const plain = (id) => !isLegendary(id);
/* AN EVOLVED FORM IS RAISED, NOT MET - about 0.4 wild encounters each a
   playthrough, measured - so the tasks only a wild encounter can do (night,
   the first ball, a berry) are not asked of it. Owning one by evolving counts
   (see `owned` in the engine). A baby's evolution (Pikachu from Pichu) is
   asked less than it could be; that is the price of reading it off the data. */
const grown = new Set(EVOLUTIONS.map((e) => e.to));
const met = (id) => plain(id) && !grown.has(id);
const metOrLegend = (id) => isLegendary(id) || met(id);
export const TASKS = [
  /* 1, 3, 5 - it was 1, 4, 10, reported from play as too many. These five
     ARE the duplicate incentive now that the star spends nothing. */
  { id: "catch", label: "Catch ordinary ones", steps: [1, 3, 5], points: 10, when: plain },
  { id: "night", label: "Catch one at night", steps: [1], points: 10, when: met },
  { id: "xs", label: "Catch an XS or XL one", steps: [1], points: 10, when: plain },
  { id: "xl", label: "Catch an XL one", steps: [1], points: 10, when: () => false },
  { id: "first", label: "Catch one with the first ball", steps: [1], points: 20, when: met },
  { id: "variant", label: "Catch a rare form", steps: [1], points: 20, when: plain },
  { id: "fed", label: "Feed one a berry", steps: [1], points: 10, when: metOrLegend },
  { id: "evolve", label: "Evolve one", steps: [1], points: 10, when: (id) => plain(id) && evolves.has(id) },
  { id: "alpha", label: "Catch an alpha", steps: [1], points: 20, when: canBeAlpha, bonus: true },
  { id: "legend", label: "Catch one", steps: [1], points: 10, when: isLegendary },
  { id: "hundred", label: "Raise one to Lv 100", steps: [1], points: 10, when: isLegendary },
  // A bonus: trading is never required to finish anything (docs/trading.md).
  { id: "trade", label: "Get one in a trade", steps: [1], points: 10, bonus: true },
  // A legendary's in place of the first ball (above); credited by `battleEnd` to every Pokemon that fought.
  { id: "league", label: "Win a League battle with it", steps: [1], points: 20, when: isLegendary },
];
export const HUNDRED = 100;
const SLOT = Object.fromEntries(TASKS.map((t, i) => [t.id, i]));

export const RESEARCH_MAX = 10;
/* A STARRED ENTRY MAKES ITS RARE FORMS 1.5x AS LIKELY, through the same
   `boost` pity and the outbreak use, so `LIFT_CEILING` still caps the stack.
   Deliberately weaker than an outbreak: a permanent bonus that out-did a
   daily event would make the event pointless on every species you finished.

   A STAR IS FREE, AND USED TO COST FIVE ORDINARY ONES (your call,
   2026-10-09). The price was the same five the catch task already counted, so
   it was never what made anybody catch duplicates - the TASK does that. What
   it did instead was make the Box's sweep a trap: convert your spares, finish
   the research, and the five you needed were gone, so you had to catch four
   more. Reported from play as the reason to stop converting at all, which
   cost the player the candy stream as well as the star.

   THE LIFT STAYS AT 1.5x, and that is deliberate now that every finished
   species gets one. A free star is no longer a per-species choice: a
   completionist ends with the whole dex lifted, so this is closer to a global
   multiplier than a bonus - any variant goes 1 in 19 to 1 in 13 across the
   board, and variant bounty is a renewable stream the League's prize unit is
   denominated in. At 2x it would also outrank the Pokedex Charm (2x, a whole
   generation) and the Region Charm (1.5x, nine hard runs beaten), which say
   in their own comments that they outrank one species. */
export const RESEARCH_LIFT = 1.5;

/* Cached: `when` reads only static data, and the Dex asks for every tile on
   every collection change - 1,300 filters of eleven closures, each time. */
const taskCache = new Map();
export const tasksFor = (id) => {
  let list = taskCache.get(id);
  if (!list) taskCache.set(id, list = TASKS.filter((t) => !t.when || t.when(id)));
  return list;
};

/* How far one task is: counter, the steps it has cleared, and the points. */
export function progress(task, row) {
  const n = row?.[SLOT[task.id]] ?? 0;
  const cleared = task.steps.filter((s) => n >= s).length;
  return { n, cleared, points: cleared * task.points };
}

const requiredCache = new Map();
const required = (id) => {
  let list = requiredCache.get(id);
  if (!list) requiredCache.set(id, list = tasksFor(id).filter((t) => !t.bonus));
  return list;
};
export const researchPoints = (id, row) =>
  required(id).reduce((sum, t) => sum + progress(t, row).points, 0);
/* A SHARE OF THIS SPECIES' OWN TOTAL, so the top level is every required task
   and nothing less - a species with an evolve task has more to do, not an
   easier ten. */
export const researchLevel = (id, row) => Math.floor(RESEARCH_MAX * researchPoints(id, row)
  / required(id).reduce((sum, t) => sum + t.steps.length * t.points, 0));
export const researchLift = (id, stars) => (stars?.includes(id) ? RESEARCH_LIFT : 1);

/* A new row with each named task counted once. Counters stop at their task's
   last step, so a row cannot grow for ever in a save; slots past `TASKS` (a
   newer build's) are carried through untouched. */
export function bump(row, ids) {
  const out = [...(row ?? [])];
  while (out.length < TASKS.length) out.push(0);
  for (const id of ids) {
    const i = SLOT[id];
    out[i] = Math.min(TASKS[i].steps.at(-1), out[i] + 1);
  }
  return out;
}

/* What a level pays: A QUARTER OF ONE SALE of that species. It follows the
   species' own worth, so a common's research is small change and a rare's is
   a real prize. A whole sale per level was measured first and came to up to
   49% of what the catches themselves earned - an S-band first catch crosses
   three levels at once - which is the research becoming the income.

   HALVED to an eighth (your call, 2026-10-04): audited, research to Lv 10 on
   every species was ~¥2.0M with Haggle - more than everything catching and
   selling earns in a Lv 75 game (~¥1.4M) - and it is what flooded the late
   game with money. */
export const RESEARCH_PAY = 0.125;
export const researchPay = (sellEach, levels) =>
  Math.round(Math.max(0, levels) * sellEach * RESEARCH_PAY);

/* A saved row, or null if it is not one. Counters are clamped to their task's
   last step; a slot this build does not know keeps its value, bounded, since
   it belongs to a newer build and dropping it would lose that build's work. */
export function cleanRow(v) {
  if (!Array.isArray(v) || v.length > 64) return null;
  if (!v.every((n) => Number.isInteger(n) && n >= 0)) return null;
  const out = v.map((n, i) => Math.min(n, TASKS[i]?.steps.at(-1) ?? 1000));
  if (out[SLOT.xl]) out[SLOT.xs] = Math.max(out[SLOT.xs] ?? 0, out[SLOT.xl]);
  return out;
}
