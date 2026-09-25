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

   SLOT 0 COUNTS ORDINARY CATCHES ONLY - no tier, no alpha - because they are
   what a star spends (`STAR_COST`). It counted every catch up to 20 before;
   old counters are kept, clamped to 10, since nearly all of them were
   ordinary anyway. */
/* A LEGENDARY'S RESEARCH IS ONE CATCH AND WHAT YOU DO WITH IT: catch one
   (`legend`), feed it a berry and land the first ball in that encounter, and
   raise one to Lv 100 (`hundred`). Hunting on its home map, one specific
   legendary is met about once a playthrough (1 in 3,333 encounters), so a
   count of catches is out of reach - one catch was too easy, three was three
   playthroughs. Its star spends ONE spare (`starCost`) and never the last you
   hold, so starring asks for a second catch: the endgame, not the research.

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
  { id: "catch", label: "Catch ordinary ones", steps: [1, 4, 10], points: 10, when: plain },
  { id: "night", label: "Catch one at night", steps: [1], points: 10, when: met },
  { id: "xs", label: "Catch an XS or XL one", steps: [1], points: 10, when: plain },
  { id: "xl", label: "Catch an XL one", steps: [1], points: 10, when: () => false },
  { id: "first", label: "Catch one with the first ball", steps: [1], points: 20, when: metOrLegend },
  { id: "variant", label: "Catch a rare form", steps: [1], points: 20, when: plain },
  { id: "fed", label: "Feed one a berry", steps: [1], points: 10, when: metOrLegend },
  { id: "evolve", label: "Evolve one", steps: [1], points: 10, when: (id) => plain(id) && evolves.has(id) },
  { id: "alpha", label: "Catch an alpha", steps: [1], points: 20, when: canBeAlpha, bonus: true },
  { id: "legend", label: "Catch one", steps: [1], points: 10, when: isLegendary },
  { id: "hundred", label: "Raise one to Lv 100", steps: [1], points: 10, when: isLegendary },
];
export const HUNDRED = 100;
const SLOT = Object.fromEntries(TASKS.map((t, i) => [t.id, i]));

export const RESEARCH_MAX = 10;
/* A STARRED ENTRY MAKES ITS RARE FORMS 1.5x AS LIKELY, through the same
   `boost` pity and the outbreak use, so `LIFT_CEILING` still caps the stack.
   Deliberately weaker than an outbreak: a permanent bonus that out-did a
   daily event would make the event pointless on every species you finished.

   A STAR IS BOUGHT, NOT GIVEN. Finishing the research only offers it; the
   price is `STAR_COST` ordinary ones out of the Box - the same ten the catch
   task counted. Ten sales against the two and a half that ten research levels
   paid, so every star is a sink for the duplicates the game is built on. */
export const RESEARCH_LIFT = 1.5;
export const STAR_COST = 10;
/* What a star spends, and how many of the species must be left after it. */
export const starCost = (id) => (isLegendary(id) ? 1 : STAR_COST);
export const starKeeps = (id) => (isLegendary(id) ? 1 : 0);

export const tasksFor = (id) => TASKS.filter((t) => !t.when || t.when(id));

/* How far one task is: counter, the steps it has cleared, and the points. */
export function progress(task, row) {
  const n = row?.[SLOT[task.id]] ?? 0;
  const cleared = task.steps.filter((s) => n >= s).length;
  return { n, cleared, points: cleared * task.points };
}

const required = (id) => tasksFor(id).filter((t) => !t.bonus);
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
   three levels at once - which is the research becoming the income. */
export const RESEARCH_PAY = 0.25;
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
