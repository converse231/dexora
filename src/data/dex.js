/* THE DEX IS THE NATIONAL DEX PLUS THE FORMS YOU CAN EVOLVE INTO.

   Two generated files, merged here rather than into either of them, because a
   generated file with two writers is a trap: `fetch-species` owns species.js
   and `fetch-forms` owns forms.js, and re-running one must never silently drop
   the other's work. The merge is a line of code instead, where it can be read.

   ORDER IS LOAD-BEARING. Every save is keyed on POSITION in this array (see
   `dexIndex`), so the forms go on the END - appending moves nothing, and a save
   written before they existed pads onto the new length with every position
   still meaning what it meant. Putting them anywhere else would be the Hoenn
   migration again, for 120 entries and no reason. */
import { SPECIES as NATIONAL } from "./species.js";
import { FORMS } from "./forms.js";
import { EVENTS, EVENT_WAVE } from "./eventforms.js";

/* EVENT LOOKS (eventforms.js) are built from their own species here - the
   types, stats, size and catch rate are the species', so a costume is never
   a strength - and go on the end with the forms by wave. */
const base = new Map(NATIONAL.map((sp) => [sp.id, sp]));
/* An event's hunted one (its `hunt`, Darkrai) is a look too, marked `hunt` -
   a legendary's strength and catch rate, met only by its hunt (events.js). */
const EVENT_LOOKS = EVENTS.flatMap((ev) => [...ev.looks, ...(ev.hunt ? [{ ...ev.hunt, hunt: true }] : [])].map((l) => {
  const sp = base.get(l.of);
  return {
    ...sp, id: l.id, name: `${sp.name}-${ev.id}`, from: sp.name, of: sp.id,
    form: "event", event: ev.id, title: l.title, flavor: l.flavor,
    legendary: false, wave: EVENT_WAVE, ...(l.hunt ? { hunt: true } : {}),
  };
}));

const wave = (f) => f.wave ?? (f.wild ? 1 : 0);
export const SPECIES = [
  ...NATIONAL,
  // A stable sort: the shipped forms keep their order, the looks follow theirs.
  ...[...FORMS, ...EVENT_LOOKS].sort((a, b) => wave(a) - wave(b)),
];

/* AN EVENT LOOK IS OUTSIDE EVERY COUNT OF THE DEX: a medal, a rank, the
   bonus, the "left to find". It is a collection of its own, and one a player
   could only ever have caught in a fortnight - counted, nobody who missed one
   could finish the Pokedex again. `DEX_TOTAL` and `dexCaught` are the count;
   the trading server's `dex_count` skips the same positions (`event_slots()`
   in trading.sql, held equal by check.mjs). */
const EVENT_IDS = new Set(EVENT_LOOKS.map((sp) => sp.id));
export const isEvent = (id) => EVENT_IDS.has(id);
export const EVENT_SLOTS = SPECIES.flatMap((sp, i) => (EVENT_IDS.has(sp.id) ? [i] : []));
const COUNTED = SPECIES.map((sp) => !EVENT_IDS.has(sp.id));
export const DEX_TOTAL = COUNTED.filter(Boolean).length;
export const dexCaught = (dex) => (dex ?? []).reduce((n, v, i) => n + (v === 2 && COUNTED[i] !== false ? 1 : 0), 0);

/* A FORM IS NOT A GENERATION AND NOT A WILD ENCOUNTER, and both of those are
   decided by this one predicate. PokeAPI numbers them in the 10000s, clear of
   the National Dex, so it is a fact about the id rather than a list to keep. */
export const FORM_FIRST = 10000;
export const isForm = (id) => id >= FORM_FIRST;
