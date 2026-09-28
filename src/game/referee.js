/* THE REFEREE (docs/ranked.md, 6b): a ranked battle as the SERVER plays it.
   Pure and browser-free; bundled into the ranked-step Edge Function as
   `rules.js` by `npm run edge` (a deployed function cannot reach src/). The
   page never imports it (asserted) - the page gets views, never the state.

   The state is `{ b, n, seen }`: the battle (battle.js), the number of steps
   taken (each step's rolls come from `hash(seed:n)`, so the seed decides every
   roll and the client, which never holds it, cannot try moves against the
   dice), and the foe's slots that have been sent out (what a challenger may
   know of the defender's team). */
import { newBattle, step, rankedFighter, AIS, mulberry32 } from "./battle.js";
import { teamProblem, RULES_VERSION, DEFENSE_MIN } from "./ranked.js";
import { hash } from "./daily.js";

export { teamProblem, RULES_VERSION, DEFENSE_MIN };

export const TURN_SECONDS = 60;       // a decision; after it the AI plays yours
export const ABANDON_MINUTES = 10;    // no request at all: the battle is lost (db/ranked.sql)
/* THE TURN CAP, decided on health: battle.js calls 500 turns a loss for the
   player, which is wrong when both sides are players. The share of max HP
   left decides it, the challenger winning a tie. 400 AI 3 mirrors at Lv 50
   ran 54 turns at most (docs/ranked.md). */
export const RANKED_TURNS = 150;
const AI_DEFENDER = 3;                // the strongest the game has, for every defender
const AI_STANDIN = 2;                 // plays a late challenger's turn

export const rngFor = (seed, n) => mulberry32(hash(`${seed}:${n}`));

/* The battle two teams of snapshots (`{uid, species, ...}`) make, in ranked's
   format: species alone decide strength (`rankedFighter`). */
export function openBattle(mine, foe) {
  const b = newBattle([mine.map((m) => rankedFighter(m.species, m.uid)),
    foe.map((m) => rankedFighter(m.species, m.uid))], [null, AI_DEFENDER]);
  return { b, n: 0, seen: [0] };
}

/* WHAT THE CHALLENGER MAY DO NOW. A replacement when their Pokemon has
   fainted; otherwise a move it has PP for (any move when none has, which is
   Struggle) or a switch to a standing teammate. No items - ranked has none. */
export function legal(b, action) {
  const side = b.sides[0];
  const standing = (k) => Number.isInteger(k) && side.team[k]?.hp > 0 && k !== side.active;
  if (b.need[0]) return action?.swap != null && Object.keys(action).length === 1 && standing(action.swap);
  if (action?.move != null && Object.keys(action).length === 1) {
    const me = side.team[side.active];
    const k = action.move;
    if (!Number.isInteger(k) || k < 0 || k >= me.moves.length) return false;
    return me.moves[k].pp > 0 || !me.moves.some((m) => m.pp > 0);
  }
  if (action?.swap != null && Object.keys(action).length === 1) return standing(action.swap);
  return false;
}

// What plays a turn the challenger ran out of time for.
export function autoAction(b) {
  if (b.need[0]) return { swap: b.sides[0].team.findIndex((f) => f.hp > 0) };
  return AIS[AI_STANDIN](b, 0);
}

const share = (team) => team.reduce((n, f) => n + Math.max(0, f.hp), 0) / team.reduce((n, f) => n + f.max, 0);

/* ONE REFEREED STEP. `late` plays the stand-in's choice instead of `action`.
   Answers `{ state, log, auto }`, or `{ error }` for an illegal action or a
   battle already over - nothing moves then. */
export function refereeTurn(state, action, { seed, late = false }) {
  if (state.b.over >= 0) return { error: "over" };
  const chosen = late ? autoAction(state.b) : action;
  if (!legal(state.b, chosen)) return { error: "illegal" };
  const b = step(state.b, chosen, rngFor(seed, state.n));
  if (b.over < 0 && b.turn >= RANKED_TURNS) {
    b.over = share(b.sides[0].team) >= share(b.sides[1].team) ? 0 : 1;
  }
  const sent = b.log.filter((ev) => ev.side === 1 && ev.sent != null).map((ev) => ev.sent);
  return {
    state: { b, n: state.n + 1, seen: [...new Set([...state.seen, ...sent])].sort((x, y) => x - y) },
    log: b.log,
    auto: late ? chosen : null,
  };
}

/* WHAT THE CHALLENGER SEES: their own side whole, and of the defender's only
   the Pokemon sent out - the rest are placeholders, so the view never holds a
   species the challenger has not met (asserted). `teams` are the snapshots
   the battle opened with, for each Pokemon's look (its tier). */
export function viewOf(state, teams) {
  const { b, seen } = state;
  const look = (m) => ({ tier: m?.tier ?? null, alpha: Boolean(m?.alpha) });
  const mine = b.sides[0].team.map((f, k) => ({ ...f, ...look(teams.mine[k]) }));
  const foe = b.sides[1].team.map((f, k) => (seen.includes(k)
    ? { id: f.id, uid: f.uid, level: f.level, types: f.types, hp: f.hp, max: f.max, status: f.status,
      stages: f.stages, moves: [], ...look(teams.foe[k]) }
    : { hidden: true, id: null, uid: null, level: 0, types: [], hp: 1, max: 1, status: -1, stages: f.stages.map(() => 0), moves: [], tier: null, alpha: false }));
  return {
    turn: b.turn, over: b.over, need: [...b.need], ai: [null, AI_DEFENDER], log: [],
    sides: [{ active: b.sides[0].active, team: mine }, { active: b.sides[1].active, team: foe }],
  };
}
