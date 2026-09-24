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
import { canBeAlpha } from "./biomes.js";

const evolves = new Set(EVOLUTIONS.map((e) => e.from));

/* Each task counts up to its last step, and every step reached is worth
   `points`. Tasks that only make sense for some species say so in `when` -
   derived from the data, never listed per species. */
export const TASKS = [
  { id: "catch", label: "Catch", steps: [1, 4, 10, 20], points: 10 },
  { id: "night", label: "Catch one at night", steps: [1], points: 10 },
  { id: "xs", label: "Catch an XS one", steps: [1], points: 10 },
  { id: "xl", label: "Catch an XL one", steps: [1], points: 10 },
  { id: "first", label: "Catch one with the first ball", steps: [1], points: 20 },
  { id: "variant", label: "Catch a rare form", steps: [1], points: 20 },
  { id: "fed", label: "Feed one a berry", steps: [1], points: 10 },
  { id: "evolve", label: "Evolve one", steps: [1], points: 10, when: (id) => evolves.has(id) },
  { id: "alpha", label: "Catch an alpha", steps: [1], points: 20, when: canBeAlpha },
];
const SLOT = Object.fromEntries(TASKS.map((t, i) => [t.id, i]));

export const RESEARCH_MAX = 10;
export const POINTS_PER_LEVEL = 10;
/* A FINISHED ENTRY MAKES ITS RARE FORMS 1.5x AS LIKELY, through the same
   `boost` pity and the outbreak use, so `LIFT_CEILING` still caps the stack.
   Deliberately weaker than an outbreak: a permanent bonus that out-did a
   daily event would make the event pointless on every species you finished. */
export const RESEARCH_LIFT = 1.5;

export const tasksFor = (id) => TASKS.filter((t) => !t.when || t.when(id));

/* How far one task is: counter, the steps it has cleared, and the points. */
export function progress(task, row) {
  const n = row?.[SLOT[task.id]] ?? 0;
  const cleared = task.steps.filter((s) => n >= s).length;
  return { n, cleared, points: cleared * task.points };
}

export const researchPoints = (id, row) =>
  tasksFor(id).reduce((sum, t) => sum + progress(t, row).points, 0);

export const researchLevel = (id, row) =>
  Math.min(RESEARCH_MAX, Math.floor(researchPoints(id, row) / POINTS_PER_LEVEL));

export const researchLift = (id, row) =>
  (researchLevel(id, row) >= RESEARCH_MAX ? RESEARCH_LIFT : 1);

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
  return v.map((n, i) => Math.min(n, TASKS[i]?.steps.at(-1) ?? 1000));
}
