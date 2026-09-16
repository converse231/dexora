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

export const SPECIES = [...NATIONAL, ...FORMS];

/* A FORM IS NOT A GENERATION AND NOT A WILD ENCOUNTER, and both of those are
   decided by this one predicate. PokeAPI numbers them in the 10000s, clear of
   the National Dex, so it is a fact about the id rather than a list to keep. */
export const FORM_FIRST = 10000;
export const isForm = (id) => id >= FORM_FIRST;
