/* THE LEAGUE'S MODEL: the ladder, the reference player, and the prices.
   Imported by tools/tune-gyms.mjs (which solves each leader's level) and by
   check.mjs (which re-derives everything and re-plays the battles), so the
   two can never measure against different players. docs/battles.md,
   *Difficulty* and *Economy*, is what this implements. Tools only: nothing
   under src/ imports it. */

import { SPECIES } from "../src/data/dex.js";
import { LEAGUES } from "../src/data/leagues.js";
import {
  BIOMES, encounterTable, wildBand, areaOpen, LEVEL_XP, speciesById, isLegendary,
  bornLevel, TIER_ODDS, lockedTiers, ENCOUNTER_RATE, MAX_LEVEL,
} from "../src/game/biomes.js";
import {
  candyValue, sellValue, catchBounty, ballById, stepReward, evolutionsOf, evoLevel,
  PLAIN_MULT, STEP_PARCEL,
} from "../src/game/items.js";
import { catchChance, fleeChance } from "../src/catch.js";
import { hash, QUEST_SHARE } from "../src/game/daily.js";
import { TYPES } from "../src/data/types.js";
import {
  fighter, simulate, effectiveness, opponent, TEAM_MAX, AI_FOR, MAX_EFFORT, mulberry32, hardParty,
  newBattle, step, canUse, expected, AIS,
} from "../src/game/battle.js";
import { HEALS } from "../src/game/items.js";
import { REMATCH_SHARE, TRAINER_SHARE } from "../src/game/league.js";

// ------------------------------------------------------------------ the clock

/* A PLAYTHROUGH is the unit the whole economy is measured in: 50,000 steps at
   ENCOUNTER_RATE (check.mjs's findability and the Master Ball use it too). */
export const PLAYTHROUGH = 50000 * ENCOUNTER_RATE;
/* Encounters to reach a trainer level: the README's 11.5 XP a catch, at four
   catches in five encounters. A model, and the one assumption here. */
export const XP_PER_ENC = 11.5 * 0.8;
export const encountersBy = (T) => LEVEL_XP[Math.min(T, MAX_LEVEL) - 1] / XP_PER_ENC;
export function levelAt(enc) {
  let T = 1;
  while (T < MAX_LEVEL && encountersBy(T + 1) <= enc) T++;
  return T;
}

const openAt = (T) => BIOMES.filter((b) => areaOpen(b.id, T));
export const wildTop = (T) => Math.max(...openAt(T).map((b) => wildBand(b)[1]));

const tables = new Map();
function tableOf(b, T) {
  const k = `${b.id}:${T}`;
  if (!tables.has(k)) {
    const t = encounterTable(b, T);
    tables.set(k, { t, tot: t.reduce((s, [, w]) => s + w, 0) });
  }
  return tables.get(k);
}

// What catching pays on one map, per encounter, with Poké Balls - check.mjs's model.
const poke = ballById("poke-ball");
const yields = new Map();
export function mapYield(b, T) {
  const k = `${b.id}:${T}`;
  if (yields.has(k)) return yields.get(k);
  let w = 0, candy = 0, cash = 0;
  for (const [id, wt] of tableOf(b, T).t) {
    const sp = speciesById(id);
    if (!sp) continue;
    const hit = catchChance(sp.rate, PLAIN_MULT), flee = fleeChance(sp.rate);
    const res = hit + (1 - hit) * flee;
    const locked = lockedTiers(id) ?? new Set();
    let tier = 0;
    for (const [t, o] of TIER_ODDS) if (!locked.has(t)) tier += o * catchBounty(sp, t);
    candy += wt * (hit / res) * candyValue(sp);
    cash += wt * ((hit / res) * (sellValue(sp) + tier) - poke.price / res);
    w += wt;
  }
  const y = { candy: candy / w, cash: cash / w };
  yields.set(k, y);
  return y;
}
const best = (T, key) => Math.max(...openAt(T).map((b) => mapYield(b, T)[key]));

/* CANDY EARNED BY A TRAINER LEVEL, if every catch is converted: a ceiling,
   on the best map open at each level on the way. */
const candyMemo = [0, 0];
export function candyBy(T) {
  for (let t = candyMemo.length; t <= T; t++) {
    candyMemo[t] = candyMemo[t - 1] + (encountersBy(t) - encountersBy(t - 1)) * best(t, "candy");
  }
  return candyMemo[T];
}

// ------------------------------------------------------------------ the ladder

/* EVERY CAPPED OPPONENT IN ORDER: each region's leaders, then its League. */
export const CAPPED = LEAGUES.flatMap((r) => [
  ...r.gyms.map((g, k) => ({ region: r, o: g, role: "leader", k, of: r.gyms.length })),
  ...r.league.map((p, k) => ({ region: r, o: p, role: p.champion ? "champion" : "league", k, of: r.league.length })),
]);

/* THE LADDER IS SPREAD OVER ONE PLAYTHROUGH, AND CANDY SETS EVERY CAP.

   Opponent k of N is intended at (k+1)/N of a playthrough's encounters, so
   each region is about a ninth of the game. Its cap is what a full team can
   be raised to by then with `share` of the candy earned, over the best wild
   level on offer - and `share` is SOLVED so the last Champion asks for a
   Lv 100 team exactly as the playthrough ends. The first cap falls out of the
   same sum (Tall Grass's wild top plus a level), so nothing is typed.

   A fixed step per leader was the first draft, and nine regions broke it:
   thirteen capped opponents a region at +5 each put every region after
   Johto on the Lv 100 ceiling, where a level stops being a difficulty. */
/* THE LEAGUE OPENS WHEN A COUNTER CAN BE CAUGHT: the first trainer level at
   which, for every one of the first region's leaders' types, some open map is
   at least QUEST_SHARE (one encounter in twenty - the daily quest's measure of
   "a task, not a hope") things super effective against it. Before it, the
   ladder asked a player 30 encounters in - two Lv 7 catches, nothing that hits
   Rock - to beat Brock, and the solver answered with a Lv 2 Brock. A stray at
   0.1% of Tall Grass is not a counter anyone can plan on. */
export function leagueOpens() {
  const types = LEAGUES[0].gyms.map((g) => g.type);
  const counters = (b, T, d) => {
    const { t, tot } = tableOf(b, T);
    let w = 0;
    for (const [id, wt] of t) {
      if ((speciesById(id)?.types ?? []).some((a) => effectiveness(a, [typeIdx(d)]) > 1)) w += wt;
    }
    return w / tot;
  };
  for (let T = 1; T <= MAX_LEVEL; T++) {
    if (types.every((d) => openAt(T).some((b) => counters(b, T, d) >= QUEST_SHARE))) return T;
  }
  return MAX_LEVEL;
}

export function ladder() {
  const N = CAPPED.length;
  const E0 = encountersBy(leagueOpens());
  const Ts = CAPPED.map((_, k) => levelAt(E0 + (PLAYTHROUGH - E0) * k / (N - 1)));
  const Tend = Ts.at(-1);
  const share = (100 - wildTop(Tend)) * TEAM_MAX / candyBy(Tend);
  let last = 1;
  const rungs = CAPPED.map((c, k) => {
    const T = Ts[k];
    const cap = Math.min(100, Math.max(last, Math.floor(wildTop(T) + share * candyBy(T) / TEAM_MAX)));
    last = cap;
    return { ...c, T, cap, target: target(c) };
  });
  return { share, rungs };
}

/* WHAT A REFERENCE PLAYER SHOULD WIN: 85% at a region's first leader falling
   to 60% at its last; a League member 50%, its Champion 40%. */
export function target(c) {
  if (c.role === "champion") return 0.4;
  if (c.role === "league") return 0.5;
  return 0.85 - 0.25 * (c.of > 1 ? c.k / (c.of - 1) : 0);
}

// ------------------------------------------------------------------ teams

/* AN OPPONENT AT A SOLVED `top` - battle.js's `opponent`, the one definition
   the League page will use too. */
export const opponentTeam = (o, top) => opponent(o.party, top, (slot) => hash(`${o.id}:${slot}`));

/* A GYM'S OWN TRAINERS keep their game's levels in proportion to their
   leader's (its solved ace over its game ace), are never trained - and are
   the easy part: where the proportion leaves one the reference player beats
   less than TRAINER_FLOOR of the time, it is lowered to the highest level
   that clears it (`solveTrainer`). A trainer party is often not the gym's
   type, so the player's counters miss it: Unova's Ace Trainer Jeanne, in
   proportion, won 60%. */
export const TRAINER_FLOOR = 0.85;
export const TRAINER_RECORD = { n: 60, seed: 29 };
export function trainerTop(t, leader, leaderTop) {
  const ace = Math.max(...leader.party.map(([, lv]) => lv));
  const top = Math.round(Math.min(100, leaderTop) * Math.max(...t.party.map(([, lv]) => lv)) / ace);
  return Math.max(1, Math.min(100, top));
}
export function solveTrainer(rung, share) {
  const at = (top) => winRate(rung, top, { ...TRAINER_RECORD, share }).win;
  let top = trainerTop(rung.o, rung.leader, rung.leaderTop), win = at(top);
  if (win >= TRAINER_FLOOR) return { top, win };
  let lo = 1, hi = top - 1, best = { top: 1, win: at(1) };
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, w = at(mid);
    if (w >= TRAINER_FLOOR) { best = { top: mid, win: w }; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

/* THE REFERENCE PLAYER: a box of catches off the maps open at trainer level
   T, the strongest of what each will be at the level its candy reaches,
   favouring types that hit the gym's type and resist it, raised lowest-first
   with `share` of the candy earned by T, never past the cap. AI 2 plays it.
   Measured in phase 0: a player blind to the gym's type made Wattson 1% and
   Flannery 98%, which is not a player. */
const REF_BOX = 250;
const bst = (sp) => sp.stats.reduce((a, b) => a + b, 0);
const PARENT_ROW = new Map();
for (const sp of SPECIES) for (const r of evolutionsOf(sp.id)) if (!PARENT_ROW.has(r.to)) PARENT_ROW.set(r.to, r);

function upTo(id, level) {
  // What a caught Pokemon becomes by candy: any level-priced row it reaches
  // (level and the synthetic `bond`), never a stone, a trade or a form.
  let cur = id;
  for (let guard = 0; guard < 4; guard++) {
    const row = evolutionsOf(cur).find((r) => (r.kind === "level" || r.kind === "bond")
      && r.to < 10000 && evoLevel(r) <= level && speciesById(r.to));
    if (!row) break;
    cur = row.to;
  }
  return cur;
}

export function playerTeam(T, cap, rng, { size = TEAM_MAX, share, type = null, legendOk = false } = {}) {
  const open = openAt(T);
  const box = [];
  for (let n = 0; n < Math.min(REF_BOX, Math.round(encountersBy(T) * 0.8)); n++) {
    const b = open[Math.floor(rng() * open.length)];
    const { t, tot } = tableOf(b, T);
    let x = rng() * tot, id = t[0][0];
    for (const [k, w] of t) if ((x -= w) <= 0) { id = k; break; }
    if (!speciesById(id) || (!legendOk && isLegendary(id))) continue;
    const [lo, hi] = wildBand(b);
    box.push({ id, level: Math.max(bornLevel(id), lo + Math.floor(rng() * (hi - lo + 1))), uid: Math.floor(rng() * 1e9) });
  }
  const reach = Math.min(cap, Math.round(share * candyBy(T) / size) + wildTop(T));
  const vs = (sp) => !type ? 1
    : (sp.types.some((t) => effectiveness(t, [typeIdx(type)]) > 1) ? 1.3 : 1)
      * (effectiveness(type, sp.types.map(typeIdx)) > 1 ? 0.7 : effectiveness(type, sp.types.map(typeIdx)) < 1 ? 1.15 : 1);
  const scored = box.filter((m) => m.level <= cap).map((m) => {
    const at = speciesById(upTo(m.id, Math.max(m.level, reach)));
    return { ...m, score: bst(at) * vs(at) };
  }).sort((a, b) => b.score - a.score);
  const team = [], seen = new Set();
  for (const m of scored) {
    if (seen.has(m.id)) continue;
    seen.add(m.id); team.push(m);
    if (team.length === size) break;
  }
  // Candy, water-filled: the lowest is raised first, never past the cap.
  let budget = Math.floor(share * candyBy(T));
  const lv = team.map((m) => m.level);
  let spent = 0;
  while (budget > 0) {
    let i = -1;
    for (let j = 0; j < lv.length; j++) if (lv[j] < cap && (i < 0 || lv[j] < lv[i])) i = j;
    if (i < 0) break;
    lv[i]++; budget--; spent++;
  }
  return {
    candy: spent,
    team: team.map((m, j) => fighter(upTo(m.id, lv[j]), lv[j], m.uid)),
  };
}
const typeIdx = (t) => TYPES.indexOf(t);

// ------------------------------------------------------------------ playing

/* THE REFERENCE PLAYER WITH A BATTLE SHELF (phase 5): AI 2 that also
   reaches for an item the way a sensible player does - a Potion when low and
   the foe cannot simply undo it next turn, a Full Heal for a status that
   stops it moving, a Revive for its best fallen Pokemon while the one out is
   healthy. It carries `kit` and spends from it; the CPU never uses one. The
   solved levels are measured WITHOUT items (the RECORD), so a shelf is help
   bought, never part of the ladder. */
export const KIT = { potion: 3, "full-heal": 1, revive: 1 };
// The seed and count the Battle shelf's price guard replays exactly (check.mjs).
export const KIT_RECORD = { n: 100, seed: 3 };
const PRICE = Object.fromEntries(HEALS.map((h) => [h.id, h.price]));
function withKit(b, left, rng) {
  const s = b.sides[0];
  if (b.need[0]) return { swap: s.team.findIndex((f) => f.hp > 0) };
  const me = s.team[s.active], foe = b.sides[1].team[b.sides[1].active];
  const threat = Math.max(0, ...foe.moves.filter((m) => m.pp > 0).map((m) => expected(foe, me, m.i)));
  const use = (item, target) => (left[item] > 0 && canUse(s.team[target], item) ? { item, target } : null);
  const down = s.team.map((f, k) => [f, k]).filter(([f]) => f.hp <= 0).sort((x, y) => y[0].level - x[0].level)[0];
  return (down && me.hp > me.max * 0.6 && use("revive", down[1]))
    || (me.hp < me.max * 0.35 && threat < me.max * 0.5 && use("potion", s.active))
    || ([0, 3, 4].includes(me.status) && me.hp > me.max * 0.4 && use("full-heal", s.active))
    || AIS[2](b, 0, rng);
}
export function playWithKit(mine, theirs, aiO, rng, kit = KIT) {
  const left = { ...kit };
  let b = newBattle([mine, theirs], [null, aiO]), spent = 0, used = 0;
  while (b.over < 0) {
    const a = withKit(b, left, rng);
    b = step(b, a, rng);
    if (a.item != null) { left[a.item]--; spent += PRICE[a.item]; used++; }
  }
  return { b, spent, used };
}

/* One opponent against the reference player, `n` battles on a seed. */
export function winRate(rung, top, { n = 200, seed = 1, share, aiP = 2, team = null, kit = null } = {}) {
  const { o, role, T, cap } = rung;
  const size = TEAM_MAX;                    // six against anyone, as the game allows
  const aiO = AI_FOR[role];
  let wins = 0, turns = 0, maxTurns = 0, spent = 0, used = 0;
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(seed * 7919 + i * 104729);
    const mine = team ? team(rng) : playerTeam(T, cap, rng, { size, share, type: o.type ?? rung.type }).team;
    const theirs = opponentTeam(o, top);
    const played = kit ? playWithKit(mine, theirs, aiO, rng, kit === true ? KIT : kit) : { b: simulate(mine, theirs, aiP, aiO, rng) };
    const { b } = played;
    wins += b.over === 0;
    spent += played.spent ?? 0; used += played.used ?? 0;
    turns += b.turn; maxTurns = Math.max(maxTurns, b.turn);
  }
  return { win: wins / n, turns: turns / n, maxTurns, spent: spent / n, used: used / n };
}

/* THE RECORD: every solved opponent's win rate is measured on this seed and
   count, written to gymtune.js, and replayed EXACTLY by check.mjs - the
   battles are seeded, so any change to the rules, the rosters or the model
   moves the number and says to re-solve, the way the ladder is held. */
export const RECORD = { n: 200, seed: 11 };

/* The `top` that brings an opponent's win rate to its target: bisection on
   the ace level and then its training (100 + effort), since more of either
   only ever makes it harder - up to the noise and the evolution cliffs. The
   bisection's answer and its neighbours are then measured on the RECORD, and
   the closest kept: a cliff next to the answer is where a single estimate
   lands on the wrong side. */
export function solve(rung, share, { n = 200, seed = 5 } = {}) {
  let lo = 1, hi = 100 + MAX_EFFORT, mid = 1;
  while (lo <= hi) {
    mid = (lo + hi) >> 1;
    if (winRate(rung, mid, { n, seed, share }).win > rung.target) lo = mid + 1; else hi = mid - 1;
  }
  let best = null;
  for (let top = Math.max(1, mid - 4); top <= Math.min(100 + MAX_EFFORT, mid + 4); top++) {
    const w = winRate(rung, top, { ...RECORD, share }).win;
    if (!best || Math.abs(w - rung.target) < Math.abs(best.win - rung.target)) best = { top, win: w };
  }
  return best;
}

export { mulberry32 };   // battle.js's - one seeded roll everywhere

// ------------------------------------------------------------------ hard mode

/* HARD MODE (docs/battles.md, phase 8). Every capped opponent again with its
   hard team, all at Lv 100 (`hardParty`), against the reference player as it
   stands where the ladder ends - cap 100, the candy of a whole playthrough -
   and played at AI 3 (`AI_FOR.hard`). What is solved is the training past
   100: the smallest that brings the reference player down to HARD_TARGET,
   or the most there is, where even that leaves it above. */
export const HARD_TARGET = 0.2;          // brutal: your call, over 40% and 60%
export const HARD_PRIZE_CEIL = 0.2;      // every first hard win, of a whole Lv 75 game's income
export const HARD_FEE_SHARE = 0.25;      // an attempt's fee, of its prize; given back with the win
export const HARD_RECORD = { n: 120, seed: 17 };
export function hardRungs() {
  const { rungs } = ladder();
  const T = rungs.at(-1).T;
  return rungs.map((r) => ({
    region: r.region, kind: r.role, k: r.k, role: "hard", T, cap: 100, target: HARD_TARGET,
    type: r.o.type, base: r.o, o: { ...r.o, id: `${r.o.id}:hard`, party: hardParty(r.o.hard) },
  }));
}
export function solveHard(rung, share, { n = 120, seed = 5 } = {}) {
  const top0 = 100, top1 = 100 + MAX_EFFORT;
  // Even the most training leaves it above target: it stays at the most (the record says how far).
  const most = winRate(rung, top1, { ...HARD_RECORD, share }).win;
  if (most > rung.target) return { top: top1, win: most };
  let lo = top0, hi = top1, mid = top1;
  while (lo <= hi) {
    mid = (lo + hi) >> 1;
    if (winRate(rung, mid, { n, seed, share }).win > rung.target) lo = mid + 1; else hi = mid - 1;
  }
  let best = null;
  for (let top = Math.max(top0, mid - 3); top <= Math.min(top1, mid + 3); top++) {
    const w = winRate(rung, top, { ...HARD_RECORD, share }).win;
    if (!best || Math.abs(w - rung.target) < Math.abs(best.win - rung.target)) best = { top, win: w };
  }
  return best;
}
/* The ace a first hard win gives: the highest level in the hard team as its
   game fields it, the last listed on a tie, at that level. */
export function signature(o) {
  let ace = o.hard[0];
  for (const row of o.hard) if (row[1] >= ace[1]) ace = row;
  return [ace[0], Math.max(1, Math.min(100, ace[1]))];
}
export function hardPrices(rungs) {
  const inc = incomePerStep();
  const lifetime = (encountersBy(PRICE_LEVEL) / ENCOUNTER_RATE) * (inc.catchPerStep + inc.wagePerStep);
  const prize = Math.floor(HARD_PRIZE_CEIL * lifetime / rungs.length);
  return { prize, fee: Math.round(prize * HARD_FEE_SHARE), lifetime };
}

// ------------------------------------------------------------------ prices

/* THE GAME THE PRICES ARE MEASURED ON: Lv 75, the cap they were solved at.
   The cap went to 100 (2026-10-01) as POST-GAME; measuring prizes and the
   hard fee against the longer game would have doubled every League prize for
   a trainer who had not moved, because the game got longer after them. */
export const PRICE_LEVEL = Math.min(75, MAX_LEVEL);

/* WHAT A GAME EARNS, per step, the way the Master Ball is priced: the best
   map's Poké Ball income at the cap, plus the wage. */
export function incomePerStep() {
  let perEnc = 0;
  for (const b of BIOMES) perEnc = Math.max(perEnc, mapYield(b, PRICE_LEVEL).cash);
  let wages = 0;
  for (let s = STEP_PARCEL; s <= 50000; s += STEP_PARCEL) wages += stepReward(s, 30)?.money ?? 0;
  return { catchPerStep: perEnc * ENCOUNTER_RATE, wagePerStep: wages / 50000, perEnc, wages };
}

export const PRIZE_CEIL = 0.1;         // every first win in the game, of a whole Lv 75 game's income
export const REMATCH_CEIL = 0.2;       // rematching everything as fast as possible, of income per step
export { REMATCH_SHARE, TRAINER_SHARE };   // league.js's - the shares the engine pays are the ones priced

/* PRIZES AND THE REMATCH CLOCK, SOLVED FROM THEIR BOUNDS. A capped opponent
   pays `gymPrize` encounters of the best map's income at its intended level
   (so prizes re-price with the shop); a gym trainer a fifth of its leader.
   `gymPrize` is the most that keeps every first win in the game under
   PRIZE_CEIL of a Lv 75 game's income; the clock is the shortest that keeps
   rematching every capped opponent at once under REMATCH_CEIL of income per
   step, rounded up to a walking parcel. */
export function prices(rungs) {
  const inc = incomePerStep();
  const steps75 = encountersBy(PRICE_LEVEL) / ENCOUNTER_RATE;
  const lifetime = steps75 * (inc.catchPerStep + inc.wagePerStep);
  const unit = rungs.map((r) => Math.max(1, best(r.T, "cash")));
  const trainerUnits = rungs.reduce((n, r, k) => n + (r.role === "leader" ? r.o.trainers.length * unit[k] * TRAINER_SHARE : 0), 0);
  const perPrize = unit.reduce((a, b) => a + b, 0) + trainerUnits;
  const gymPrize = Math.floor(PRIZE_CEIL * lifetime / perPrize);
  const prize = unit.map((u) => Math.round(gymPrize * u));
  const rematchPerClock = prize.reduce((a, b) => a + b, 0) * REMATCH_SHARE;
  const perStep = inc.catchPerStep + inc.wagePerStep;
  const rematchSteps = Math.ceil(rematchPerClock / (REMATCH_CEIL * perStep) / STEP_PARCEL) * STEP_PARCEL;
  const oneOff = prize.reduce((a, b) => a + b, 0)
    + rungs.reduce((n, r, k) => n + (r.role === "leader" ? r.o.trainers.length * Math.round(prize[k] * TRAINER_SHARE) : 0), 0);
  return { gymPrize, prize, rematchSteps, lifetime, oneOff, perStep, inc };
}
