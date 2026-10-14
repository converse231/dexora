/* CATCH COMBO (2026-10-14, the late-game shortlist's first phase): catching
   the same species again and again builds a chain, and a long chain makes
   that species' rare forms likelier - the Let's Go chain, minus the flee
   penalty. It is a TIER LIFT on the chained species alone, never the table,
   and so it is the hunt you choose rather than a second global multiplier.

   - A catch of the chained species adds one; a catch of any other starts a
     new chain of one. Meeting or running from another species costs nothing
     (you walk past what you are not hunting).
   - The chained species FLEEING, or you running from it, breaks the chain:
     the one thing the chain asks is that you finish what you start.
   - A family of looks (Unown's letters) is one species here: `looksOf`'s
     base is the key, so a letter never breaks an Unown chain.

   Browser-free, so check.mjs can bound it. */
import { looksOf } from "./biomes.js";

/* [chain length, lift]: rungs, longest last. The top rung stays at most the
   Pokedex Charm's (check.mjs), so a chain never outranks a finished region. */
export const COMBO_STEPS = [[10, 1.25], [20, 1.5], [30, 2]];

export const comboKey = (id) => looksOf(id)[0];

/* What the chain is worth on a meeting with `id`: its rung if `id` is the
   chained species, else nothing. */
export function comboLift(combo, id) {
  if (!combo || comboKey(id) !== combo.species) return 1;
  let lift = 1;
  for (const [n, x] of COMBO_STEPS) if (combo.n >= n) lift = x;
  return lift;
}

// The next rung above a chain, or null at the top: what the HUD counts to.
export const nextRung = (n) => COMBO_STEPS.find(([at]) => n < at) ?? null;

/* The chain after an encounter ends. `outcome` is "caught", "fled" or "ran";
   anything else (a break-free mid-encounter) is not an end. */
export function nextCombo(combo, id, outcome) {
  const key = comboKey(id);
  if (outcome === "caught") return { species: key, n: combo?.species === key ? combo.n + 1 : 1 };
  if ((outcome === "fled" || outcome === "ran") && combo?.species === key) return null;
  return combo ?? null;
}

// A saved chain: a real species and a whole count, or none.
export function cleanCombo(c, speciesById) {
  return c && typeof c === "object" && Number.isInteger(c.species) && speciesById(c.species)
    && comboKey(c.species) === c.species && Number.isInteger(c.n) && c.n >= 1
    ? { species: c.species, n: c.n } : null;
}
