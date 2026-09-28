/* THE BATTLE RULES. docs/battles.md is the design; this is its rules core.

   Browser-free and PURE: `step(battle, action, rng)` returns a new battle and
   never touches the one it was given, and every roll comes from `rng` (a
   `mulberry32`), so the same seed plays the same battle. That is what lets
   check.mjs and the gym solver play thousands of them in Node, and what lets
   the League page hand the engine each step without the engine running any
   of this (it never imports this file - the League's data stays in its lazy
   chunk).

   A BATTLE NEVER GIVES A POKEMON EXP OR A LEVEL. Nothing here writes a box
   entry; the result is a winner, and what a win is worth is the engine's.

   Singles. Side 0 is the player, side 1 the opponent; either may be driven by
   an AI (`ai[side]`), which is how a whole battle is simulated. */

import { MOVES } from "../data/moves.js";
import { LEARNSETS } from "../data/learnsets.js";
import { TYPES, CHART } from "../data/types.js";
import { EVOLUTIONS } from "../data/evolutions.js";
import { speciesById } from "./biomes.js";
import { evoLevel, HEALS } from "./items.js";
import { hash } from "./daily.js";
/* Who may enter lives with the rest of what the ENGINE enforces, in a module
   free of the battle data (phase 4); re-exported so the League reads one place. */
export { LEGEND_BST, legendLevel, refusal, TEAM_MAX } from "./league.js";
import { RANKED_LEVEL, RANKED_IV } from "./ranked.js";

// ------------------------------------------------------------------ limits

/* A battle nobody can finish is a loss for the player, never a hang. PP and
   Struggle end every real battle long before this (check.mjs measures). */
export const TURN_LIMIT = 500;

// ------------------------------------------------------------------ species

/* WHAT A POKEMON KNOWS: the four most recent usable level-up moves at its
   level, read ACROSS ITS LINE. A Metapod keeps the Tackle it learned as a
   Caterpie, which PokéAPI records only under Caterpie - read alone, Bugsy's
   Metapod and Cynthia's Roserade had nothing that hits. */
const PARENT = new Map();
for (const e of EVOLUTIONS) if (!PARENT.has(e.to)) PARENT.set(e.to, e.from);

const lineRows = new Map();
function rowsOf(id) {
  let rows = lineRows.get(id);
  if (!rows) {
    rows = [];
    for (let x = id, guard = 0; x && guard < 8; x = PARENT.get(x), guard++) rows.push(...(LEARNSETS[x] ?? []));
    rows.sort((a, b) => a - b);
    lineRows.set(id, rows);
  }
  return rows;
}

/* ...AND ONE OF THEM HITS. Recency alone gave a Lv 54 Weavile Hone Claws,
   Agility, Nasty Plot and Screech - four set-up moves and nothing to set up
   for. When the four have no power, the oldest makes way for the most
   recent move that has some. */
export function movesAt(id, level) {
  const out = [];
  const rows = rowsOf(id);
  for (let i = rows.length - 1; i >= 0 && out.length < 4; i--) {
    const mi = rows[i] % 1000;
    if (Math.floor(rows[i] / 1000) <= level && !MOVES[mi].no && !out.includes(mi)) out.push(mi);
  }
  if (out.length && !out.some((mi) => MOVES[mi].p)) {
    const hit = rows.map((x) => [Math.floor(x / 1000), x % 1000])
      .filter(([lv, mi]) => lv <= level && MOVES[mi].p && !MOVES[mi].no).at(-1);
    if (hit) out[out.length - 1] = hit[1];
  }
  return out.reverse();
}

/* A species whose whole line learns nothing with power (Wobbuffet counters,
   it never attacks). It fights with Struggle, as it all but does in the games. */
export const neverHits = (id) => !rowsOf(id).some((x) => MOVES[x % 1000].p && !MOVES[x % 1000].no);

/* THE STAGE OF ITS LINE A LEVEL REACHES, both ways, for an opponent whose
   level was solved rather than played: below its own evolution level it is
   the stage before (a Lv 8 Slaking is a Slakoth - a species a player cannot
   own at that level), and at or past the price of any evolution a player
   could buy - a level, a stone, a trade, a bond - it is the stage after.
   Level rows alone left Brassius's Petilil (a Sun Stone) a Petilil at 100. */
const PRICED = new Set(["level", "stone", "trade", "bond"]);
export function stageAt(id, level) {
  let cur = id;
  for (let guard = 0; guard < 4; guard++) {
    const from = PARENT.get(cur);
    const row = from && EVOLUTIONS.find((e) => e.from === from && e.to === cur);
    if (!row || row.to >= 10000 || evoLevel(row) <= level) break;
    cur = from;
  }
  for (let guard = 0; guard < 4; guard++) {
    const row = EVOLUTIONS.find((e) => e.from === cur && PRICED.has(e.kind) && e.to < 10000);
    if (!row || evoLevel(row) > level || !speciesById(row.to)) break;
    cur = row.to;
  }
  return cur;
}

// ------------------------------------------------------------------ stats

/* The Gen 3 formula with no EVs and no nature. IVs are 0-31 per stat from a
   hash of the uid, the trick `sizeOf` uses, so every Pokemon already in a save
   has them. A tier, a size and an alpha change NOTHING here: measured, +5%
   Speed wins a mirror 88% of the time - there is no "slight" stat. */
export const ivOf = (uid, stat) => (hash(`${uid}:${stat}`) >>> 3) % 32;

/* `effort` is an OPPONENT'S training, 0 to MAX_EFFORT a stat - the Gen 3 EV
   term (EV / 4), so 63 is 252 EVs. A player's Pokemon never has any (no EVs:
   docs/battles.md, *Stats*). It is how difficulty keeps going once a solved
   ace reaches Lv 100, as post-game trainers in the games are trained. */
export const MAX_EFFORT = 63;
/* `iv`, when given, is every stat's IV: ranked's format (ranked.js), where a
   uid - which a save can choose - must not pick a Pokemon's strength. */
export function statsOf(species, level, uid, effort = 0, iv = null) {
  return species.stats.map((b, i) => {
    const core = Math.floor((2 * b + (iv ?? ivOf(uid, i)) + effort) * level / 100);
    return i === 0 ? core + level + 10 : core + 5;
  });
}

/* A FIGHTER: everything a battle reads, computed once at the start. `uid` is
   a box entry's, or a hash of the opponent's id and slot. */
export function fighter(speciesId, level, uid, moves = movesAt(speciesId, level), effort = 0, iv = null) {
  const sp = speciesById(speciesId);
  const st = statsOf(sp, level, uid, effort, iv);
  return {
    id: speciesId, level, uid, types: sp.types.map((t) => TYPES.indexOf(t)),
    st, hp: st[0], max: st[0],
    moves: moves.map((i) => ({ i, pp: MOVES[i].pp })),
    stages: [0, 0, 0, 0, 0, 0, 0, 0], status: -1, sleep: 0,
  };
}

/* A RANKED FIGHTER (docs/ranked.md, *Format*): a species at the format's
   level, IVs and level-up moves - nothing a save could choose. The uid only
   names it. */
export const rankedFighter = (speciesId, uid) =>
  fighter(speciesId, RANKED_LEVEL, uid, movesAt(speciesId, RANKED_LEVEL), 0, RANKED_IV);

/* AN OPPONENT: a roster row `[species, game level, moves?]` at the level the
   ladder solved for it. `top` is its ace's level; past 100 it is training
   (100 + effort). The rest of the party keeps its game's spread, each is the
   stage its level reaches, and each fights with its OWN game moveset - the
   coverage a leader's type lacks is in it - falling back to the level-up
   rule for a row with none (a gym trainer's) or none the rules can use. */
export const MOVE_INDEX = new Map(MOVES.map((m, i) => [m.n, i]));

export function opponent(party, top, uidOf) {
  const ace = Math.max(...party.map(([, lv]) => lv));
  const level100 = Math.min(100, top), effort = Math.max(0, Math.min(MAX_EFFORT, top - 100));
  return party.map(([sp, lv, names], slot) => {
    const level = Math.max(1, Math.min(100, Math.round(level100 * lv / ace)));
    const id = stageAt(sp, level);
    const own = (names ?? []).map((n) => MOVE_INDEX.get(n)).filter((i) => i != null && !MOVES[i].no);
    return fighter(id, level, uidOf(slot), own.length ? own : movesAt(id, level), effort);
  });
}

// ------------------------------------------------------------------ the battle

export function newBattle(teams, ai = [null, 2]) {
  return {
    turn: 0, over: -1, ai,
    sides: teams.map((team) => ({ team, active: 0 })),
    need: [false, false],        // a fainted active waits for its replacement
    log: [],
  };
}

// A copy deep enough that `step` can write to it: the two sides and fighters.
function clone(b) {
  return {
    ...b, need: [...b.need], log: [],
    sides: b.sides.map((s) => ({
      active: s.active,
      team: s.team.map((f) => ({ ...f, st: f.st, stages: [...f.stages], moves: f.moves.map((m) => ({ ...m })) })),
    })),
  };
}

const active = (b, side) => b.sides[side].team[b.sides[side].active];
const STAGE = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const ACC_STAGE = (s) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));
const CRIT = [1 / 24, 1 / 8, 1 / 2, 1];
const PAR = 0, BRN = 1, PSN = 2, SLP = 3, FRZ = 4;
const IMMUNE = { [BRN]: "fire", [PSN]: ["poison", "steel"], [PAR]: "electric", [FRZ]: "ice" };

export const STRUGGLE = -1;
const moveOf = (i) => (i === STRUGGLE
  ? { n: "struggle", t: null, c: 0, p: 50, pp: 1 }
  : MOVES[i]);

export const speed = (f) => f.st[5] * STAGE(f.stages[5]) * (f.status === PAR ? 0.5 : 1);
export const effectiveness = (moveType, defTypes) => (moveType == null ? 1
  : defTypes.reduce((m, d) => m * CHART[TYPES.indexOf(moveType)][d], 1));
const immuneTo = (f, st) => [IMMUNE[st]].flat().some((t) => f.types.includes(TYPES.indexOf(t)));

function base(a, d, m, crit) {
  const phys = m.c === 0;
  const as = phys ? 1 : 3, ds = phys ? 2 : 4;
  const aS = crit ? Math.max(0, a.stages[as]) : a.stages[as];
  const dS = crit ? Math.min(0, d.stages[ds]) : d.stages[ds];
  const A = a.st[as] * STAGE(aS), D = d.st[ds] * STAGE(dS);
  let dmg = Math.floor(Math.floor(Math.floor(2 * a.level / 5 + 2) * m.p * A / D) / 50) + 2;
  if (m.t && a.types.includes(TYPES.indexOf(m.t))) dmg *= 1.5;
  dmg *= effectiveness(m.t, d.types);
  if (phys && a.status === BRN) dmg *= 0.5;
  return dmg;
}

/* What a move is worth against this foe, on average - the AIs read it. */
export function expected(a, d, i) {
  const m = moveOf(i);
  if (!m.p) return 0;
  const hits = m.hits ? (m.hits[0] + m.hits[1]) / 2 : 1;
  return base(a, d, m, false) * 0.925 * hits * (m.a ? m.a / 100 : 1);
}

const HITS_2_5 = [2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5];   // Gen 5+: 35/35/15/15

function useMove(b, side, i, rng, first) {
  const a = active(b, side), d = active(b, 1 - side);
  const m = moveOf(i);
  const ev = { side, move: i };
  b.log.push(ev);
  if (a.status === SLP) {
    if (--a.sleep > 0) { ev.asleep = true; return; }
    a.status = -1; ev.woke = true;
  }
  if (a.status === FRZ) {
    if (rng() < 0.2) { a.status = -1; ev.thawed = true; } else { ev.frozen = true; return; }
  }
  if (a.flinch) { a.flinch = false; ev.flinched = true; return; }
  if (a.status === PAR && rng() < 0.25) { ev.paralysed = true; return; }
  const onSelf = m.self && !m.p;
  if (!onSelf && m.a && rng() >= (m.a / 100) * ACC_STAGE(a.stages[6] - d.stages[7])) { ev.miss = true; return; }

  if (m.p) {
    const n = !m.hits ? 1 : m.hits[0] === 2 && m.hits[1] === 5
      ? HITS_2_5[Math.floor(rng() * 20)] : m.hits[0] + Math.floor(rng() * (m.hits[1] - m.hits[0] + 1));
    let dealt = 0;
    for (let k = 0; k < n && d.hp > 0; k++) {
      const crit = rng() < CRIT[Math.min(3, m.cr ?? 0)];
      let dmg = base(a, d, m, crit) * (crit ? 1.5 : 1) * (0.85 + rng() * 0.15);
      dmg = Math.max(effectiveness(m.t, d.types) ? 1 : 0, Math.floor(dmg));
      d.hp = Math.max(0, d.hp - dmg);
      dealt += dmg;
      if (crit) ev.crit = true;
    }
    ev.dmg = dealt; ev.hits = n; ev.eff = effectiveness(m.t, d.types);
    if (i === STRUGGLE) a.hp = Math.max(0, a.hp - Math.max(1, Math.floor(a.max / 4)));
    else if (m.dr) a.hp = Math.max(0, Math.min(a.max, a.hp + Math.trunc(dealt * m.dr / 100)));
    if (m.fl && first && d.hp > 0 && rng() * 100 < m.fl) d.flinch = true;
  }
  if (m.h && !m.p) { const before = a.hp; a.hp = Math.min(a.max, a.hp + Math.floor(a.max * m.h / 100)); ev.healed = a.hp - before; }
  if (m.st != null && d.hp > 0 && d.status < 0 && !immuneTo(d, m.st)
      && (m.c === 2 || rng() * 100 < (m.stc ?? 100))) {
    d.status = m.st;
    if (m.st === SLP) d.sleep = 2 + Math.floor(rng() * 3);
    ev.status = m.st;
  }
  if (m.sg && (m.c === 2 || rng() * 100 < (m.sgc ?? 100))) {
    const who = m.self || m.sgu ? a : d;
    if (who.hp > 0) for (const [s, c] of m.sg) who.stages[s] = Math.max(-6, Math.min(6, who.stages[s] + c));
    ev.stages = { side: who === a ? side : 1 - side, sg: m.sg };
  }
}

const alive = (b, side) => b.sides[side].team.some((f) => f.hp > 0);

/* THE BATTLE SHELF (items.js `HEALS`): a Potion heals a share of max HP, a
   Full Heal cures a status, a Revive raises a fainted Pokemon to a share of
   it. `canUse` is the one answer to whether one would do anything - the page
   greys on it and `step` refuses on it, so a wasted item cannot happen. */
const HEAL = new Map(HEALS.map((h) => [h.id, h]));
export function canUse(f, id) {
  const h = HEAL.get(id);
  if (!h || !f) return false;
  if (h.revive) return f.hp <= 0;
  return f.hp > 0 && Boolean((h.heal && f.hp < f.max) || (h.cure && f.status >= 0));
}
function useItem(f, id) {
  const h = HEAL.get(id);
  if (h.revive) { f.hp = Math.max(1, Math.floor(f.max * h.revive)); f.status = -1; f.sleep = 0; }
  if (h.heal) f.hp = Math.min(f.max, f.hp + Math.max(1, Math.floor(f.max * h.heal)));
  if (h.cure) { f.status = -1; f.sleep = 0; }
}
const usable = (f) => f.moves.filter((m) => m.pp > 0).map((m) => m.i);

/* THE NEXT ONE IN after a faint: an AI side sends its best match-up (AI 3) or
   the next in order; a player's side waits for a choice (`need`). */
function nextIn(b, side, rng) {
  const s = b.sides[side];
  const live = s.team.map((f, k) => [f, k]).filter(([f]) => f.hp > 0);
  if (!live.length) return;
  if (b.ai[side] == null) { b.need[side] = true; return; }
  if (b.ai[side] >= 3) {
    const foe = active(b, 1 - side);
    const score = (f) => (foe.hp > 0 ? Math.max(0, ...usable(f).map((i) => expected(f, foe, i))) / foe.hp
      - Math.max(0, ...usable(foe).map((i) => expected(foe, f, i))) / f.hp : 0);
    live.sort((x, y) => score(y[0]) - score(x[0]));
  }
  s.active = live[0][1];
  b.log.push({ side, sent: s.active, after: snap(b) });
}

/* WHAT THE SCREEN SHOWS AFTER AN EVENT: each side's active slot, its HP and
   its status. The League page plays a turn's log one beat at a time, and a
   health bar has to fall with the hit that caused it, not all at once at the
   end of the turn. Read-only, and it draws no roll, so a battle plays
   exactly as it did before it was added. */
const snap = (b) => [0, 1].map((side) => {
  const f = active(b, side);
  return { slot: b.sides[side].active, hp: f.hp, status: f.status };
});

function endOfTurn(b) {
  for (const side of [0, 1]) {
    const f = active(b, side);
    if (f.hp <= 0) continue;
    if (f.status === BRN || f.status === PSN) {
      const dmg = Math.max(1, Math.floor(f.max / (f.status === BRN ? 16 : 8)));
      f.hp = Math.max(0, f.hp - dmg);
      b.log.push({ side, residual: dmg, status: f.status, after: snap(b) });
    }
    f.flinch = false;
  }
}

/* ONE TURN. `action` is side 0's choice when a person plays it -
   `{ move: i }` (an index into its moves), `{ swap: k }` (a team slot),
   `{ item: id, target: k }` (a Battle-shelf item on a team slot: it costs the
   turn, like a switch, and one that would do nothing is refused with no turn
   passing), or, when its fighter has fainted, the `{ swap: k }` that
   replaces it (no turn passes) - and is ignored for a side an AI drives.
   Returns a new battle. The CPU uses no items. */
export function step(battle, action, rng) {
  if (battle.over >= 0) return battle;
  const b = clone(battle);
  // A side with nobody left standing (or nobody at all) has lost before a turn.
  if (!alive(b, 1) || !alive(b, 0)) { b.over = alive(b, 0) ? 0 : 1; return b; }

  // A replacement after a faint is not a turn, and nothing else is allowed
  // until one is chosen.
  if (b.need[0]) {
    const f = b.sides[0].team[action?.swap];
    if (f && f.hp > 0) { b.sides[0].active = action.swap; b.need[0] = false; b.log.push({ side: 0, sent: action.swap, after: snap(b) }); }
    return b;
  }

  if (action?.item != null && b.ai[0] == null && !canUse(b.sides[0].team[action.target], action.item)) return b;

  b.turn++;
  const choice = [0, 1].map((side) => (b.ai[side] == null ? action : choose(b, side, rng)));
  // An item, then a switch, before any move, as in the games.
  for (const side of [0, 1]) {
    const c = choice[side];
    if (c?.item != null && b.ai[side] == null) {
      useItem(b.sides[side].team[c.target], c.item);
      b.log.push({ side, item: c.item, target: c.target, after: snap(b) });
    }
  }
  for (const side of [0, 1]) {
    const c = choice[side];
    if (c?.swap != null && b.sides[side].team[c.swap]?.hp > 0) {
      b.sides[side].active = c.swap;
      b.log.push({ side, sent: c.swap, after: snap(b) });
    }
  }
  const acts = [];
  for (const side of [0, 1]) {
    const c = choice[side];
    if (c?.swap != null || c?.item != null) continue;
    const f = active(b, side);
    const left = usable(f);
    let i = STRUGGLE;
    if (left.length) {
      const pick = c?.move != null ? f.moves[c.move] : null;
      i = pick && pick.pp > 0 ? pick.i : left[0];
      f.moves.find((m) => m.i === i).pp--;
    }
    acts.push({ side, i, pri: moveOf(i).pr ?? 0, spd: speed(f), tie: rng() });
  }
  acts.sort((x, y) => (y.pri - x.pri) || (y.spd - x.spd) || (x.tie - y.tie));
  acts.forEach((act, n) => {
    if (active(b, act.side).hp <= 0 || active(b, 1 - act.side).hp <= 0) return;
    useMove(b, act.side, act.i, rng, n === 0);
    b.log[b.log.length - 1].after = snap(b);
  });
  endOfTurn(b);

  for (const side of [0, 1]) {
    if (active(b, side).hp > 0) continue;
    b.log.push({ side, fainted: b.sides[side].active, after: snap(b) });
  }
  if (!alive(b, 1)) b.over = 0;
  else if (!alive(b, 0)) b.over = 1;
  else if (b.turn >= TURN_LIMIT) b.over = 1;
  else for (const side of [0, 1]) if (active(b, side).hp <= 0) nextIn(b, side, rng);
  return b;
}

// ------------------------------------------------------------------ the AIs

/* THREE LEVELS. 1 picks at random; 2 picks the most expected damage, valuing
   a status or a set-up move by a small table; 3 plays one move ahead and
   switches out of a losing match-up. Gym trainers use 1, leaders 2, the
   League 3 - and 3 exists only while it measurably beats 2 (check.mjs). */
const STATUS_VALUE = [0.25, 0.2, 0.2, 0.35, 0.35];   // par brn psn slp frz, a share of the foe's HP

function statusValue(me, foe, i) {
  const m = moveOf(i);
  if (m.st != null && m.c === 2) {
    return foe.status < 0 && !immuneTo(foe, m.st) ? STATUS_VALUE[m.st] * (m.a ? m.a / 100 : 1) : 0;
  }
  if (m.h && !m.p) return me.hp < me.max / 2 ? 0.45 : 0;
  if (m.sg && m.c === 2) {
    const mine = m.self;
    const room = m.sg.every(([s, c]) => (mine ? me : foe).stages[s] * Math.sign(c) < 2);
    return room && me.hp > me.max * 0.6 ? 0.12 : 0;
  }
  return 0;
}

function aiRandom(b, side, rng) {
  const me = active(b, side);
  return { move: Math.floor(rng() * me.moves.length) };
}

function aiDamage(b, side) {
  const me = active(b, side), foe = active(b, 1 - side);
  let best = 0, v = -1;
  me.moves.forEach((m, k) => {
    if (m.pp <= 0) return;
    const x = expected(me, foe, m.i) || statusValue(me, foe, m.i) * foe.hp;
    if (x > v) { v = x; best = k; }
  });
  return { move: best };
}

function aiLook(b, side, rng) {
  const me = active(b, side), foe = active(b, 1 - side);
  const reply = (f) => Math.max(0, ...usable(foe).map((i) => expected(foe, f, i)));
  const first = (i) => (moveOf(i).pr ?? 0) > 0 || speed(me) > speed(foe);
  let best = 0, v = -Infinity;
  me.moves.forEach((m, k) => {
    if (m.pp <= 0) return;
    const dmg = expected(me, foe, m.i);
    const ko = dmg >= foe.hp;
    // A KO before the reply is worth a whole Pokemon; otherwise the reply lands.
    let score = ko && first(m.i) ? 2 : Math.min(1, dmg / foe.hp);
    if (!dmg) score = reply(me) < me.hp * 0.45 ? statusValue(me, foe, m.i) * 2 : -1;
    if (score > v) { v = score; best = k; }
  });
  /* SWITCH OUT only when this one loses the exchange outright - it falls to
     the reply before it can KO - and someone on the bench takes that reply
     for under a third of its HP. A switch hands the foe a free hit, which is
     why switching on anything softer measured worse than never switching. */
  const threat = reply(me);
  if (threat >= me.hp && !(v >= 2)) {
    let pick = -1, pv = Infinity;
    b.sides[side].team.forEach((f, k) => {
      if (f.hp <= 0 || k === b.sides[side].active) return;
      const t = reply(f) / f.hp;
      if (t < pv) { pv = t; pick = k; }
    });
    if (pick >= 0 && pv < 1 / 3) return { swap: pick };
  }
  return { move: best };
}

export const AIS = { 1: aiRandom, 2: aiDamage, 3: aiLook };
// Who plays which: docs/battles.md, *AI*.
export const AI_FOR = { trainer: 1, leader: 2, league: 3, champion: 3 };
export const choose = (b, side, rng) => AIS[b.ai[side]](b, side, rng);

/* THE ONE SEEDED ROLL. check.mjs, the solver and the League page all take
   their rng from here, so a seed means the same battle everywhere. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A whole battle between two AIs: what the solver and check.mjs play. */
export function simulate(teamA, teamB, aiA, aiB, rng) {
  let b = newBattle([teamA, teamB], [aiA, aiB]);
  while (b.over < 0) b = step(b, null, rng);
  return b;
}
