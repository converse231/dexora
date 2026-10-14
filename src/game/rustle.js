/* RUSTLING SPOTS (2026-10-14, the late-game shortlist's second phase): now
   and then a patch of tall grass near you starts to shake - the Poke Radar's
   tell. Walk into it and something is there for sure, with its rare forms
   likelier. It is a THING TO WALK TO, not a lever: one spot at a time, on
   grass only (never a cave, the water or a room), gone after a while or when
   you leave the map, and the step it appears on meets nothing else.

   Browser-free, so check.mjs can bound it. */

// Steps between spots on average: a 1-in-this chance on each step with none.
export const RUSTLE_EVERY = 200;
// How long one shakes, in your steps - standing still does not run it down.
export const RUSTLE_STEPS = 30;
// The tier lift on the meeting in it. Never past the Pokedex Charm (check.mjs).
export const RUSTLE_LIFT = 2;
// How far from you it appears, in tiles each way: in view, never underfoot.
export const RUSTLE_NEAR = 3;
export const RUSTLE_FAR = 6;
/* And never more rows away than this: the view is 11 tiles tall, so six
   rows up rose off a phone's screen (found in QA). check.mjs holds it
   inside the view. */
export const RUSTLE_ROWS = 4;

/* Where the grass shakes: a grass cell (`isGrass(x, y)`) between NEAR and FAR
   steps from (px, py), chosen evenly, or null when there is none. `ok(x, y)`
   says whether a cell may hold one (the room you stand in). */
export function pickSpot(px, py, isGrass, ok, random = Math.random) {
  const cells = [];
  for (let y = py - RUSTLE_FAR; y <= py + RUSTLE_FAR; y++) {
    for (let x = px - RUSTLE_FAR; x <= px + RUSTLE_FAR; x++) {
      const d = Math.abs(x - px) + Math.abs(y - py);
      if (Math.abs(y - py) > RUSTLE_ROWS) continue;
      if (d >= RUSTLE_NEAR && d <= RUSTLE_FAR && isGrass(x, y) && ok(x, y)) cells.push([x, y]);
    }
  }
  return cells.length ? cells[Math.floor(random() * cells.length)] : null;
}
