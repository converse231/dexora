/* WHO YOU MAY FIGHT, from what you have beaten (docs/battles.md, *Order in a
   region* and *Region unlock*). The rules are `game/league.js`'s - the ones
   the engine enforces - so the page can never show a door the engine keeps
   shut; this file only adds the sentence that says what opens each one. */
import { LEAGUES } from "../../data/leagues.js";
import { isOpen, gymReached, regionOpen, regionCleared, capOf, topOf, payFor, clockOf } from "../../game/league.js";

const won = (beaten, id) => Boolean(beaten?.[id]);
// "Lass Kay"; a trainer the roster names only by class is just that.
export const trainerName = (t) => (t.name === t.cls ? t.cls : `${t.cls} ${t.name}`);

/* One region's standing: what is open, what is won, and - for anything shut -
   the sentence that says what opens it. */
export function standing(beaten = {}) {
  return LEAGUES.map((r, ri) => {
    const prev = LEAGUES[ri - 1];
    const open = regionOpen(r.id, beaten);
    const badges = r.gyms.filter((g) => won(beaten, g.id)).length;
    const gyms = r.gyms.map((g, k) => {
      const reached = gymReached(g.id, beaten);
      const shut = !open ? `Opens once ${prev.name} is cleared.` : `Beat ${r.gyms[k - 1]?.name} first.`;
      const left = g.trainers.filter((t) => !won(beaten, t.id)).length;
      return {
        open: isOpen(g.id, beaten), won: won(beaten, g.id), reached,
        why: !reached ? shut : `Beat ${left === 1 ? "the last gym trainer" : `the ${left} gym trainers`} first.`,
        // Each gym trainer after the one before it (the gym's path).
        trainers: g.trainers.map((t, i) => ({
          open: isOpen(t.id, beaten), won: won(beaten, t.id),
          why: !reached ? shut : i > 0 ? `Beat ${trainerName(g.trainers[i - 1])} first.` : null,
        })),
      };
    });
    const allBadges = badges === r.gyms.length;
    const league = r.league.map((p, k) => ({
      open: isOpen(p.id, beaten), won: won(beaten, p.id),
      why: !open ? `Opens once ${prev.name} is cleared.`
        : !allBadges ? `Win all ${r.gyms.length} of ${r.name}'s ${r.id === "alola" ? "Z-Crystals" : "badges"} first.`
          : `Beat ${r.league[k - 1]?.name} first.`,
    }));
    return {
      open, cleared: regionCleared(r.id, beaten), badges,
      why: open ? null : `Clear ${prev.name} first: every gym, its trainers, and its League.`,
      gyms, league,
    };
  });
}

/* What an opponent is NOW: its cap (a trainer has none), its ace `top` (both
   climb with each rematch win), what a win pays at this step, how full its
   rematch clock is, and how often it has been beaten. */
export const tuneOf = (o, beaten = {}, steps = 0) => (o.road ? {
  // A road trainer (road.js): its own level and prize, no cap, no rematch clock.
  cap: 100, top: o.top, pay: o.pay, clock: 0, wins: 0,
} : {
  cap: capOf(o.id, beaten), top: topOf(o.id, beaten), pay: payFor(o.id, beaten, steps),
  clock: clockOf(o.id, beaten, steps), wins: beaten[o.id]?.wins ?? 0,
});
