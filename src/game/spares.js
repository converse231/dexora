/* Kept out of items.js, which the ranked referee bundles whole: a rule the
   battle server never reads would otherwise change its deployed file. */
import { variantOf } from "./items.js";

/* A RARE FORM'S SPARES (asked for, 2026-10-13): in each species-and-tier row,
   everything but its best - the row's hero, highest level then lowest uid,
   the one the Box shows and evolves. Never an alpha (its own row, and a
   keeper by itself), never one held by a trade, never one walking in the
   party or on the League team (`keep`): those are where a uid is remembered,
   and the party is only cleaned at load. Converted from the row's own button
   only - the Box's sweep still takes no variant - through `convertVariants`,
   which asks this again rather than trusting its caller. */
export function variantSpareUids(box, keep = []) {
  const held = new Set(keep);
  const rows = new Map();
  for (const mon of box) {
    const v = variantOf(mon);
    if (!v || mon.alpha) continue;
    const k = `${mon.species}:${v}`;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(mon);
  }
  const out = [];
  for (const mons of rows.values()) {
    const best = mons.reduce((a, b) => (b.level > a.level || (b.level === a.level && b.uid < a.uid) ? b : a));
    for (const mon of mons) if (mon !== best && !mon.lock && !held.has(mon.uid)) out.push(mon.uid);
  }
  return out;
}
