/* THE RANKED-STEP REQUESTS (docs/ranked.md, 6b) - portable: the Deno shell
   (index.ts) hands in who is asking (from their token), a way to call the
   database's service-only functions (db/ranked.sql), and the clock; the tests
   hand in the same from Node, so what is tested is what is deployed.

   Every answer is `{ status, body }`. A body with `error` names it in a word
   the game turns into a sentence (cloud.js `rankedStep`, Ranked.jsx). The
   seed and the state never go out: a challenger gets `viewOf` - their side,
   and of the defender only what has been sent out. */
import {
  openBattle, refereeTurn, viewOf, teamProblem, RULES_VERSION, DEFENSE_MIN, TURN_SECONDS,
} from "./rules.js";

const reply = (status, body) => ({ status, body });
const deadlineFrom = (now) => new Date(now + TURN_SECONDS * 1000).toISOString();
// The words a service-only SQL function raises, as the game's error codes.
const FROM_SQL = [
  [/not in your saved box/, "uploading"], [/twice/, "twice"], [/team size/, "size"], [/already in a battle/, "busy"],
];

// What a challenger is sent about their battle: never the seed, never the state.
function out(row, state, extra = {}) {
  return {
    id: row.id,
    opponent: { username: row.username ?? "A trainer", char: row.char ?? "red" },
    view: viewOf(state, row.teams),
    mine: row.teams.mine,
    deadline: row.deadline,
    ...extra,
  };
}

/* A fair coin for the server's picks (which defender, which of their
   teams, the seed): crypto, not Math.random, since the picks are what a
   challenger would want to predict. */
const pick = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

async function start(me, body, rpc, now) {
  const open = await rpc("ranked_load", { me });
  if (open) return reply(200, out(open, open.state, { resumed: true }));

  const mine = await rpc("ranked_team", { me, uids: body.uids });
  const problem = teamProblem(mine.map((m) => m.species));
  if (problem) return reply(400, { error: problem });

  // The first candidate (they come in random order) with MIN legal teams.
  const candidates = await rpc("ranked_candidates", { me });
  for (const c of candidates) {
    const legal = c.teams.filter((t) => !teamProblem(t.team.map((m) => m.species)));
    if (legal.length < DEFENSE_MIN) continue;
    const chosen = legal[pick(legal.length)];
    const teams = { mine, foe: chosen.team };
    const state = openBattle(mine, chosen.team);
    const deadline = deadlineFrom(now);
    const id = await rpc("ranked_create", {
      me, defender: c.user_id, slot: chosen.slot, teams,
      seed: pick(2 ** 31), state, deadline, version: RULES_VERSION,
    });
    return reply(200, out({ id, username: c.username, char: c.char, teams, deadline }, state));
  }
  return reply(404, { error: "nobody" });
}

async function turn(me, body, rpc, now) {
  const row = await rpc("ranked_load", { me });
  if (!row) return reply(404, { error: "none" });
  if (row.id !== body.id) return reply(409, { error: "stale" });
  const late = now > Date.parse(row.deadline);
  const r = refereeTurn(row.state, body.action, { seed: row.seed, late });
  if (r.error) return reply(400, { error: r.error });
  const over = r.state.b.over;
  const deadline = deadlineFrom(now);
  const saved = await rpc("ranked_save", {
    me, id: row.id, expect: row.n, state: r.state, n: r.state.n,
    status: over < 0 ? "active" : over === 0 ? "won" : "lost", deadline,
  });
  // Another request took this turn first (a second tab, a retry): resync.
  if (!saved) return reply(409, { error: "stale" });
  return reply(200, out({ ...row, deadline }, r.state, { log: r.log, auto: r.auto }));
}

async function forfeit(me, body, rpc) {
  const row = await rpc("ranked_load", { me });
  if (!row || row.id !== body.id) return reply(404, { error: "none" });
  const saved = await rpc("ranked_save", {
    me, id: row.id, expect: row.n, state: row.state, n: row.n, status: "lost", deadline: row.deadline,
  });
  return saved ? reply(200, { over: 1 }) : reply(409, { error: "stale" });
}

export async function handle({ user, body, rpc, now = Date.now() }) {
  if (!user) return reply(401, { error: "signin" });
  if (body?.version !== RULES_VERSION) return reply(409, { error: "version" });
  try {
    switch (body.op) {
      case "resume": {
        const row = await rpc("ranked_load", { me: user });
        return reply(200, row ? out(row, row.state, { resumed: true }) : { none: true });
      }
      case "start": return await start(user, body, rpc, now);
      case "turn": return await turn(user, body, rpc, now);
      case "forfeit": return await forfeit(user, body, rpc);
      default: return reply(400, { error: "op" });
    }
  } catch (e) {
    const known = FROM_SQL.find(([re]) => re.test(e?.message ?? ""));
    return known ? reply(400, { error: known[1] }) : reply(500, { error: "server" });
  }
}
