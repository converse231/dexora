/* The world's clock, and it runs on STEPS.

   A real clock was the obvious choice and it is the wrong one for this game.
   Tie the sky to `new Date()` and a player who plays at lunch never sees night,
   never meets the one condition the Dusk Ball is for, and is told about a
   feature they cannot reach — which is the complaint Gold and Silver actually
   got. Tying it to steps means everybody sees the whole cycle, in the order it
   was designed, on the counter the game already keeps and already saves.

   It is also pure. `hourAt(steps)` takes a number and returns a number, so
   check.mjs can walk a whole day without waiting for one, which is the same
   reason `daily.js` takes its date as an argument.

   THE CYCLE IS `DAY_STEPS` LONG. At 1,200 a full day is about five parcels of
   walking (a parcel is 250 steps), so a session crosses into night a few times
   rather than once an hour or once a playthrough. Over a 50,000-step run that
   is roughly 42 days, which is the right order for a thing that is meant to be
   a change of scene rather than an event. */
export const DAY_STEPS = 1200;

/* The in-game hour, 0-24, as a fraction. Not rounded: the sky interpolates
   across dawn and dusk, and rounding here would make it step. */
export const hourAt = (steps = 0) =>
  ((steps % DAY_STEPS) / DAY_STEPS) * 24;

/* FOUR PHASES, AND THE TWO SHORT ONES ARE THE POINT. Dawn and dusk are three
   hours each against nine for day and night, because a transition that lasts
   as long as the thing it transitions between is not a transition - and the
   two short ones are what make the long ones read as arrivals.

   Night is the one with a mechanic hanging off it (see the Dusk Ball), so it
   is deliberately a clean nine hours rather than "everything that is not day":
   a condition you cannot predict is not a condition you can play around. */
export const PHASES = [
  { id: "dawn", from: 5, name: "Dawn" },
  { id: "day", from: 8, name: "Day" },
  { id: "dusk", from: 17, name: "Dusk" },
  { id: "night", from: 20, name: "Night" },
];

export function phaseAt(steps = 0) {
  const h = hourAt(steps);
  // Walked backwards, so the first match is the latest phase that has started;
  // anything before the first boundary belongs to the one that wraps midnight.
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (h >= PHASES[i].from) return PHASES[i];
  }
  return PHASES[PHASES.length - 1];
}

/* What the Dusk Ball asks, and nothing else. Kept as its own function rather
   than `phaseAt(...).id === "night"` at three call sites, because the day a
   fifth phase lands that comparison is wrong in three places at once. */
export const isNight = (steps = 0) => phaseAt(steps).id === "night";

/* How far through the current phase, 0-1. The scene fades between skies with
   it, so dawn actually breaks rather than being switched on. */
export function intoPhase(steps = 0) {
  const h = hourAt(steps);
  const now = phaseAt(steps);
  const i = PHASES.indexOf(now);
  const next = PHASES[(i + 1) % PHASES.length];
  const start = now.from;
  const end = next.from > start ? next.from : next.from + 24;
  const at = h >= start ? h : h + 24;
  return Math.min(1, Math.max(0, (at - start) / (end - start)));
}

// "6:20", for the readout. The game has no minutes anywhere else, and a bare
// hour makes a clock that only ever shows five different numbers.
export function timeLabel(steps = 0) {
  const h = hourAt(steps);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
