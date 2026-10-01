/* THE LEAGUE'S RULES THAT THE ENGINE ENFORCES (docs/battles.md, phase 4):
   who may be fought, who may fight, and what a win pays.

   Browser-free, and deliberately free of the League's heavy data: it reads
   only `gymtune.js` - each opponent's region, role, order, cap, level and
   prize - so the ENGINE can import it and be the judge (refusing a battle
   that is not open or a Pokemon over the cap, and paying the prize) without
   the rosters, moves and learnsets leaving the League's lazy chunk. The page
   reads the same functions, so what it shows is what the engine does.

   `beaten` is the save's `{ [opponent id]: { wins, at } }`, `at` the step
   count at the last win (the rematch clock). */
import { GYMTUNE, TRAINERTUNE, REMATCH_STEPS, HARDTUNE, HARD_PRIZE, HARD_FEE } from "../data/gymtune.js";
import { speciesById, isLegendary, TIERS, tiersFor } from "./biomes.js";

// ------------------------------------------------------------------ refusal

export const TEAM_MAX = 6;

/* A LEGENDARY ENTERS AT A LEVEL SCALED BY ITS STRENGTH: at or under
   cap x LEGEND_BST / its base stat total. It has no evolution floor, so
   refusal alone does not hold it. A flat 80% of the cap was the first rule,
   and measured on the League's own ladder it let a wild Complete Zygarde (708)
   win 7 of Kanto's 8 leaders alone and Mewtwo 5. Against the solved leaders,
   420 over BST still let Zygarde and Crowned Zacian take 4; at 360 none takes
   more than 3 (check.mjs's bound), while a Moltres (580) may still bring 62%
   of the cap and a weak legendary the whole of it (docs/battles.md). */
export const LEGEND_BST = 360;
export const legendLevel = (speciesId, cap) => {
  const bst = speciesById(speciesId).stats.reduce((a, b) => a + b, 0);
  return Math.floor(cap * Math.min(1, LEGEND_BST / bst));
};

/* A LEGENDARY IS WHAT ITS DATA SAYS, FORMS INCLUDED. `isLegendary()` is the
   spawn tables' answer and is false for the 17 forms of legendaries (Mega
   Mewtwo X and Y, the Primals, Mega Rayquaza, Eternamax...), all Lv 100
   evolutions - so at a cap of 100 a Lv 100 Eternamax (BST 1,125) walked in
   at the full cap, where this rule holds it to Lv 32. */
export const legendary = (id) => isLegendary(id) || speciesById(id)?.legendary === true;

/* WHO MAY ENTER. Over the cap is REFUSED, never scaled down: scaled, a Lv 100
   Metagross is still a Metagross and won 5 of 11 gyms alone; refused, it only
   exists from Lv 45. `null` is yes; otherwise the reason, for the picker. */
export function refusal(mon, cap) {
  if (mon.lock) return "locked";
  if (legendary(mon.species) && mon.level > legendLevel(mon.species, cap)) return "legend";
  if (mon.level > cap) return "level";
  return null;
}

// ------------------------------------------------------------------ the order

export const REMATCH_SHARE = 0.25;     // a rematch at a full clock, of the first prize
export const TRAINER_SHARE = 0.2;      // a gym trainer's one win, of its leader's prize
export const REMATCH_CAP_STEP = 6;     // each rematch win raises that opponent's cap, to 100

const won = (beaten, id) => Boolean(beaten?.[id]);
const IDS = Object.keys(GYMTUNE);
export const REGIONS = [...new Set(IDS.map((id) => GYMTUNE[id].region))];
const inRegion = (rid, kinds) => IDS.filter((id) => GYMTUNE[id].region === rid && kinds.includes(GYMTUNE[id].kind))
  .sort((a, b) => GYMTUNE[a].k - GYMTUNE[b].k);
export const leadersOf = (rid) => inRegion(rid, ["leader"]);
export const leagueOf = (rid) => inRegion(rid, ["league", "champion"]);
const TRAINERS = Object.keys(TRAINERTUNE);
export const trainersOf = (gymId) => TRAINERS.filter((t) => TRAINERTUNE[t].gym === gymId);
/* How many Pokemon you may bring: six, against anyone (your call, 2026-10-02 -
   it was no more than a leader fields). The solved levels are what keep a
   full team against a smaller party a fight; see docs/battles.md. */
export const teamSize = () => TEAM_MAX;

/* CLEARED is every gym trainer, leader, League member and Champion beaten -
   what opens the next region. */
export const regionCleared = (rid, beaten) =>
  leadersOf(rid).every((g) => won(beaten, g) && trainersOf(g).every((t) => won(beaten, t)))
  && leagueOf(rid).every((p) => won(beaten, p));

export function regionOpen(rid, beaten) {
  const i = REGIONS.indexOf(rid);
  return i === 0 || (i > 0 && regionCleared(REGIONS[i - 1], beaten));
}

/* A GYM IS REACHED when its region is open and the leader before it is
   beaten (docs/battles.md, *Order in a region*, rev 5). */
export function gymReached(gymId, beaten) {
  const g = GYMTUNE[gymId];
  if (!g || g.kind !== "leader" || !regionOpen(g.region, beaten)) return false;
  const list = leadersOf(g.region);
  const k = list.indexOf(gymId);
  return k === 0 || won(beaten, list[k - 1]);
}

/* MAY THIS OPPONENT BE FOUGHT? Inside a reached gym, its trainers in the
   roster's order, each after the one before, and the leader once every one
   of them is beaten - you walk through a gym to its leader, as in the games
   (rev 3 let the trainers be skipped). The League with every badge of the
   region and each member after the one before. A WIN IS NEVER TAKEN BACK:
   anyone already beaten stays open for a rematch, so a save that beat a
   leader under rev 3, past its trainers, keeps it. An id this build does not
   know is never open. */
export function isOpen(id, beaten) {
  const h = HARDTUNE[id];
  if (h) {
    if (!regionCleared(h.region, beaten)) return false;
    const run = hardRunOf(h.region);
    const k = run.indexOf(id);
    return won(beaten, id) || k === 0 || won(beaten, run[k - 1]);
  }
  const t = TRAINERTUNE[id];
  if (t) {
    if (!gymReached(t.gym, beaten)) return false;
    const list = trainersOf(t.gym);
    const k = list.indexOf(id);
    return won(beaten, id) || k === 0 || won(beaten, list[k - 1]);
  }
  const g = GYMTUNE[id];
  if (!g || !regionOpen(g.region, beaten)) return false;
  if (g.kind === "leader") {
    return gymReached(id, beaten) && (won(beaten, id) || trainersOf(id).every((x) => won(beaten, x)));
  }
  if (!leadersOf(g.region).every((l) => won(beaten, l))) return false;
  const list = leagueOf(g.region);
  const k = list.indexOf(id);
  return k === 0 || won(beaten, list[k - 1]);
}

// ------------------------------------------------------------------ the level and the pay

/* A REMATCH GROWS WITH YOU: each win raises that opponent's cap by
   REMATCH_CAP_STEP, to 100, and its solved level in the same ratio - so a
   leader beaten at a cap of 11 comes back at 17 as hard, not as a formality.
   A gym trainer has no cap and never changes. */
export function capOf(id, beaten) {
  if (TRAINERTUNE[id] || HARDTUNE[id]) return 100;
  const wins = beaten?.[id]?.wins ?? 0;
  return Math.min(100, GYMTUNE[id].cap + REMATCH_CAP_STEP * wins);
}
export function topOf(id, beaten) {
  if (TRAINERTUNE[id]) return TRAINERTUNE[id].top;
  if (HARDTUNE[id]) return HARDTUNE[id].top;
  const g = GYMTUNE[id];
  return Math.round(g.top * capOf(id, beaten) / g.cap);
}

/* WHAT A WIN PAYS, the one answer the engine pays and the page prints: a first
   win its prize (a gym trainer a fifth of its leader's), a rematch its share
   of the prize on a clock that refills over REMATCH_STEPS of walking - so a
   rematch at once pays nothing and waiting renews it (docs/battles.md,
   *Economy*). A gym trainer again pays nothing. */
export function payFor(id, beaten, steps) {
  if (HARDTUNE[id]) return beaten?.[id] ? 0 : HARD_PRIZE;
  const t = TRAINERTUNE[id];
  const prize = t ? Math.round(GYMTUNE[t.gym].prize * TRAINER_SHARE) : GYMTUNE[id]?.prize ?? 0;
  const last = beaten?.[id];
  if (!last) return prize;
  if (t) return 0;
  return Math.round(prize * REMATCH_SHARE * Math.min(1, Math.max(0, steps - last.at) / REMATCH_STEPS));
}

/* How full an opponent's rematch clock is, 0 to 1 - for the page's meter and
   the world's count of rematches ready. */
export const clockOf = (id, beaten, steps) => {
  const last = beaten?.[id];
  return last ? Math.min(1, Math.max(0, steps - last.at) / REMATCH_STEPS) : 0;
};
export const rematchesReady = (beaten, steps) =>
  IDS.filter((id) => won(beaten, id) && clockOf(id, beaten, steps) >= 1).length;

// ------------------------------------------------------------------ hard mode

/* HARD MODE (docs/battles.md, phase 8): every leader, League member and
   Champion of a CLEARED region again, at Lv 100 on its strongest team - the
   leaders in order, then the League in order, the Champion last. Ids are
   `<id>:hard`, so `beaten` holds both runs apart. A hard rematch pays
   nothing; every attempt costs HARD_FEE, given back with the win. */
export const hardRunOf = (rid) => {
  const ids = Object.keys(HARDTUNE).filter((id) => HARDTUNE[id].region === rid);
  const role = (id) => (HARDTUNE[id].kind === "leader" ? 0 : 1);
  return ids.sort((a, b) => role(a) - role(b) || HARDTUNE[a].k - HARDTUNE[b].k);
};
export const hardOpen = (rid, beaten) => regionCleared(rid, beaten);
export const hardCleared = (rid, beaten) => {
  const run = hardRunOf(rid);
  return run.length > 0 && run.every((id) => won(beaten, id));
};
export const feeFor = (id) => (HARDTUNE[id] ? HARD_FEE : 0);

/* THE REGION CHARM: every tier roll x (1 + CHARM_MAX x the share of regions
   whose hard run is beaten) - 1.5 with all nine, a research star's lift and
   well under an outbreak's. Derived from `beaten`, never stored. */
export const CHARM_MAX = 0.5;
export const charmOf = (beaten) =>
  1 + CHARM_MAX * REGIONS.filter((rid) => hardCleared(rid, beaten)).length / REGIONS.length;

/* THE SIGNATURE POKEMON a first hard win gives: the ace of its hard team, at
   the level its trainer fields it (`gift`, solved into gymtune.js), in a rare
   form - Shiny where the species has that art, else the next tier down it
   can wear. */
export function giftOf(id) {
  const g = HARDTUNE[id]?.gift;
  if (!g) return null;
  const [species, level] = g;
  const can = tiersFor(species);
  const tier = TIERS.slice(TIERS.indexOf("shiny")).find((t) => can.includes(t)) ?? null;
  return { species, level, tier };
}

// ------------------------------------------------------------------ the Move Tutor

/* A BOX ENTRY'S TAUGHT MOVES (phase 8): up to four move NAMES, so a
   re-fetched moves.js cannot shift them. A malformed field is dropped alone -
   the Pokemon keeps its level-up moves - never the entry. */
const MOVE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const taughtOk = (moves) => Array.isArray(moves) && moves.length >= 1 && moves.length <= 4
  && new Set(moves).size === moves.length && moves.every((n) => typeof n === "string" && MOVE_NAME.test(n));
export function cleanTaught(m) {
  if (m.moves === undefined || taughtOk(m.moves)) return m;
  const { moves, ...rest } = m;
  return rest;
}

export const badgesOf = (beaten) => IDS.filter((id) => GYMTUNE[id].kind === "leader" && won(beaten, id)).length;

/* A SAVED `beaten`, cleaned entry by entry: a win count of one or more and a
   step count; anything else is dropped, never the whole record. An id this
   build does not know is KEPT - a newer build may know it - but opens nothing. */
export function cleanBeaten(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([id, x]) => typeof id === "string"
    && x && Number.isInteger(x.wins) && x.wins >= 1 && Number.isInteger(x.at) && x.at >= 0)
    .map(([id, x]) => [id, { wins: x.wins, at: x.at }]));
}
