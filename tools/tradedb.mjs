/* TRADING'S SERVER HALF, TESTED AGAINST THE TEST PROJECT ONLY (docs/trading.md).

     node tools/tradedb.mjs

   Applies the base schema (SUPABASE.md §3, the live project's state) if the
   test database is empty, then db/trading.sql (idempotent), then drives every
   function as two real trainers through the same client the game uses - RLS,
   PostgREST and all - and inspects the rows directly over Postgres.

   IT REFUSES TO RUN AGAINST THE LIVE PROJECT: the test URL and the database
   URL are both checked against VITE_SUPABASE_URL's project ref. */
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const read = (f) => existsSync(new URL(f, import.meta.url))
  ? Object.fromEntries(readFileSync(new URL(f, import.meta.url), "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]))
  : {};
const env = { ...read("../.env"), ...read("../.env.test") };
const NEED = ["TEST_SUPABASE_URL", "TEST_SUPABASE_ANON_KEY", "TEST_SUPABASE_SERVICE_KEY", "TEST_DATABASE_URL"];
const missing = NEED.filter((k) => !env[k]);
if (missing.length) {
  console.log(`tradedb skipped — missing ${missing.join(", ")} (see docs/trading.md, "The test project")`);
  process.exit(0);
}
const ref = (u) => (String(u).match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1];
const live = ref(env.VITE_SUPABASE_URL), test = ref(env.TEST_SUPABASE_URL);
assert.ok(test, "TEST_SUPABASE_URL is not a supabase.co project URL");
assert.ok(!live || test !== live, "REFUSING: the test URL is the LIVE project");
assert.ok(!live || !env.TEST_DATABASE_URL.includes(live), "REFUSING: the test database URL points at the LIVE project");
assert.ok(env.TEST_DATABASE_URL.includes(test), "the test database URL is not the test project's");

/* READ BY HAND, NOT AS A URL: a database password is whatever the dashboard
   generated, and a bare `%` or `#` in it makes the URI unparseable. Split at the
   LAST `@` (the password may hold one) and the first `:` after the scheme. */
function pgConfig(uri) {
  const m = String(uri).match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/:]+)(?::(\d+))?\/([^?]*)/);
  assert.ok(m, "TEST_DATABASE_URL is not a postgresql:// connection string");
  return { user: m[1], password: m[2], host: m[3], port: Number(m[4] || 5432), database: m[5] || "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 };
}
const db = new pg.Client(pgConfig(env.TEST_DATABASE_URL));
await db.connect();
const q = async (sql, args) => (await db.query(sql, args)).rows;

// ---- schema -----------------------------------------------------------------
if (!(await q("select to_regclass('public.saves') as t"))[0].t) {
  const md = readFileSync(new URL("../SUPABASE.md", import.meta.url), "utf8");
  const base = md.slice(md.indexOf("## 3."), md.indexOf("## 3c."));
  for (const m of base.matchAll(/```sql\r?\n([\s\S]*?)```/g)) await db.query(m[1]);
  console.log("  applied the base schema (SUPABASE.md §3) to the empty test project");
}
await db.query(readFileSync(new URL("../db/trading.sql", import.meta.url), "utf8"));

// ---- two trainers -------------------------------------------------------------
/* NO REALTIME HERE, and Node 20 has no WebSocket for supabase-js to find at
   construction - so it is handed one that says so if anything ever uses it. */
class NoSocket { constructor() { throw new Error("tradedb does not use realtime"); } }
const OPTS = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: NoSocket } };
const admin = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_SERVICE_KEY, OPTS);
const PASS = "trade-test-Password-1";
async function trainer(tag) {
  const email = `trade-${tag}@dexora.test`;
  const made = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (made.error && !/registered|exists/i.test(made.error.message)) throw made.error;
  const c = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, OPTS);
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  const id = data.user.id;
  await q("insert into public.profiles (user_id, username, char) values ($1, $2, 'red') on conflict (user_id) do nothing",
    [id, `Tester${tag.toUpperCase()}`]);
  return { c, id, tag };
}
const A = await trainer("a"), B = await trainer("b");
const both = [A.id, B.id];
await q("delete from public.trades where a = any($1) or b = any($1)", [both]);
await q("delete from public.trade_log where from_user = any($1) or to_user = any($1)", [both]);
await q("delete from public.mons where owner = any($1)", [both]);
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
// A browser pass signed in as a test trainer owns its save now (one writer per
// save): the harness takes the claim back, or every upload here is refused.
await q("update public.saves set session = null where user_id = any($1)", [both]);
await q("update public.trainer_cards set trades = 0, showcase = '[]', seeking = '{}' where user_id = any($1)", [both]);

const rpc = async (who, fn, args) => {
  const { data, error } = await who.c.rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { pg: error });
  return data;
};
const refuses = async (p, why) => {
  let threw = false;
  try { await p; } catch { threw = true; }
  assert.ok(threw, why);
};
const save = (who, box) => rpc(who, "save_game", { payload: { dex: [0], box, nextUid: 999 }, sess: `s-${who.tag}` });
const stored = async (who) => (await q("select data from public.saves where user_id = $1", [who.id]))[0]?.data;
const mon = async (id) => (await q("select * from public.mons where id = $1", [id]))[0];
const P = (uid, species, level, extra = {}) => ({ uid, species, level, size: 100, at: 1, ...extra });

// ---- 1. a save for a trainer who has never traded is untouched ----------------
const oddBox = [P(1, 16, 5), { uid: "x", mid: "not-a-uuid", level: "NaN" }];
assert.equal(await save(A, oddBox), true, "a save with odd entries was refused");
assert.deepEqual((await stored(A)).box, oddBox, "the save trigger touched a trainer who never traded");

// ---- 2. registration: checked against the STORED save --------------------------
const boxA = [P(1, 16, 5), P(2, 16, 9, { shiny: 1 }), P(3, 19, 4)];
const boxB = [P(1, 25, 7), P(2, 25, 12)];
await save(A, boxA);
await save(B, boxB);
const regA = await rpc(A, "register_mons", { snaps: [
  { uid: 1, species: 16, level: 5 }, { uid: 2, species: 16, level: 9 },
  { uid: 3, species: 150, level: 4 },      // lies about the species: skipped
  { uid: 44, species: 16, level: 5 },      // not in the stored save: skipped
] });
assert.deepEqual(regA.map((r) => r.uid), [1, 2], "registration accepted a claim the stored save does not back");
const [a1, a2] = regA.map((r) => r.mid);
assert.equal((await mon(a2)).tier, "shiny", "the tier was not read off the stored entry");
const again = await rpc(A, "register_mons", { snaps: [{ uid: 1, species: 16, level: 5 }] });
assert.equal(again[0].mid, a1, "registering twice made two rows");
const [b1] = (await rpc(B, "register_mons", { snaps: [{ uid: 1, species: 25, level: 7 }] })).map((r) => r.mid);

// ---- 3. RLS: read your own, write nothing ------------------------------------------
const peek = await B.c.from("mons").select("id").eq("owner", A.id);
assert.deepEqual(peek.data, [], "a trainer read another trainer's Pokemon rows");
await B.c.from("mons").update({ owner: B.id }).eq("id", a1);
assert.equal((await mon(a1)).owner, A.id, "a trainer rewrote ownership directly");
await refuses(B.c.from("mons").insert({ owner: B.id, species: 150, level: 100 }).then((r) => { if (r.error) throw r.error; }),
  "a trainer inserted a Pokemon row directly");

// ---- 4. propose: your side locks; nothing else is yours to offer ------------------
await refuses(rpc(B, "propose_trade", { target: A.id, give: [a1], want: [a2] }), "offered someone else's Pokemon");
const t1 = await rpc(A, "propose_trade", { target: B.id, give: [a1], want: [b1], msg: 0 });
assert.equal((await mon(a1)).status, "offered", "proposing did not lock the offered Pokemon");
await refuses(rpc(A, "propose_trade", { target: B.id, give: [a1], want: [b1] }), "one Pokemon was offered twice");

// ---- 5. THE RACE: two accepts at once, exactly one trade --------------------------
const results = await Promise.all([
  rpc(B, "answer_trade", { tid: t1, yes: true }),
  rpc(B, "answer_trade", { tid: t1, yes: true }),
]);
assert.deepEqual(results.sort(), ["done", "gone"], `two accepts gave ${results}`);
assert.equal((await mon(a1)).owner, B.id, "the offered Pokemon did not move");
assert.equal((await mon(b1)).owner, A.id, "the asked-for Pokemon did not move");
assert.equal((await mon(a1)).status, "arriving", "a moved Pokemon is not marked arriving");
assert.equal((await q("select count(*)::int n from public.trade_log where trade = $1", [t1]))[0].n, 2,
  "the trade log does not hold both sides");

// ---- 6. the inbox is exactly what reconcileTrades takes ---------------------------
const inA = await rpc(A, "trade_inbox", {});
assert.deepEqual(inA.arrived.map((m) => m.mid), [b1], "A's inbox does not show the Pikachu arriving");
assert.ok(inA.gone.includes(a1), "A's inbox does not say the Pidgey is gone");

// ---- 7. the save: stale copies stripped, deliveries completed by saving -------------
await save(A, [...boxA.map((m) => (m.uid === 1 ? { ...m, mid: a1 } : m.uid === 2 ? { ...m, mid: a2 } : m)),
  P(10, 25, 7, { mid: b1, traded: 1 })]);
const boxNow = (await stored(A)).box;
assert.ok(!boxNow.some((m) => m.mid === a1), "an old copy of a traded-away Pokemon survived the save");
assert.ok(boxNow.some((m) => m.mid === b1), "the arrived Pokemon was stripped from its new owner");
assert.equal((await mon(b1)).status, "held", "saving an arrival did not complete it");
assert.equal((await mon(b1)).local_uid, 10, "the server did not learn the arrival's box uid");
// Sold: gone from the box -> released; back (a restore) -> held again.
await save(A, boxNow.filter((m) => m.mid !== a2));
assert.equal((await mon(a2)).status, "released", "a sold Pokemon was not released");
await save(A, boxNow);
assert.equal((await mon(a2)).status, "held", "a restored Pokemon did not revive");
// Unknown ids are never stripped.
const ghost = "00000000-0000-4000-8000-000000000000";
await save(A, [...boxNow, P(11, 19, 3, { mid: ghost })]);
assert.ok((await stored(A)).box.some((m) => m.mid === ghost), "an entry with an unknown id was stripped");

// ---- 8. decline, cancel and expiry all give the Pokemon back ------------------------
// A Pokemon still ARRIVING cannot be asked for - it is not in anyone's box yet.
await refuses(rpc(A, "propose_trade", { target: B.id, give: [a2], want: [a1] }), "an arriving Pokemon was asked for");
await save(B, [P(1, 16, 5, { mid: a1, traded: 1 }), ...boxB]);        // B completes the arrival
const t2 = await rpc(A, "propose_trade", { target: B.id, give: [a2], want: [a1] });
assert.equal(await rpc(B, "answer_trade", { tid: t2, yes: false }), "declined", "decline did not answer");
assert.equal((await mon(a2)).status, "held", "a declined offer kept its lock");
const t3 = await rpc(A, "propose_trade", { target: B.id, give: [a2], want: [a1] });
assert.equal(await rpc(A, "cancel_trade", { tid: t3 }), true, "the proposer could not cancel");
assert.equal((await mon(a2)).status, "held", "a cancelled offer kept its lock");
assert.equal(await rpc(B, "cancel_trade", { tid: t3 }), false, "the other side cancelled someone's offer");
const t4 = await rpc(A, "propose_trade", { target: B.id, give: [a2], want: [a1] });
await q("update public.trades set created_at = now() - interval '8 days' where id = $1", [t4]);
await rpc(A, "trade_inbox", {});
assert.equal((await q("select status from public.trades where id = $1", [t4]))[0].status, "expired",
  "a week-old offer did not expire");
assert.equal((await mon(a2)).status, "held", "an expired offer kept its lock");

// ---- 9. the daily cap ----------------------------------------------------------------
await q(`insert into public.trades (kind, a, b, a_mons, status, closed_at)
         select 'direct', $1, $2, '{}', 'done', now() from generate_series(1, 10)`, [A.id, B.id]);
const t5 = await rpc(A, "propose_trade", { target: B.id, give: [a2], want: [a1] });
assert.equal(await rpc(B, "answer_trade", { tid: t5, yes: true }), "failed", "a trade went past the daily cap");
assert.equal((await mon(a2)).owner, A.id, "a capped trade moved a Pokemon");
assert.equal((await mon(a2)).status, "held", "a failed trade kept its lock");

// =============================================================== PHASE 1
const card = async (who) => (await q("select * from public.trainer_cards where user_id = $1", [who.id]))[0];

// ---- 10. every trainer has a card, with a code nobody misreads -----------------
for (const who of [A, B]) {
  const c = await card(who);
  assert.ok(c, `Tester${who.tag.toUpperCase()} has no trainer card - the backfill or the profile trigger missed`);
  assert.match(c.friend_code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/, `a friend code "${c.friend_code}" has a misreadable character`);
}
assert.equal((await card(A)).trades, 1, "the completed trade was not counted on the card");
assert.equal((await card(B)).trades, 1, "the completed trade was not counted on the other card");

// A trainer who signs up NOW gets a card from the profile insert itself.
{
  const email = `trade-new-${Date.now()}@dexora.test`;
  const made = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (made.error) throw made.error;
  const id = made.data.user.id;
  try {
    await q("insert into public.profiles (user_id, username, char) values ($1, $2, 'leaf')", [id, `New${Date.now() % 1e8}`]);
    const c = (await q("select char from public.trainer_cards where user_id = $1", [id]))[0];
    assert.equal(c?.char, "leaf", "a new profile did not get a trainer card");
    await q("update public.profiles set char = 'red' where user_id = $1", [id]);
    assert.equal((await q("select char from public.trainer_cards where user_id = $1", [id]))[0].char, "red",
      "a profile change did not reach the card");
  } finally {
    await admin.auth.admin.deleteUser(id);
  }
  assert.equal((await q("select count(*)::int n from public.trainer_cards where user_id = $1", [id]))[0].n, 0,
    "deleting an account left its card");
}

// ---- 11. stats come from the save, and a bad save still saves -------------------
const box8 = [1, 2, 3, 4, 5, 6, 7, 8].map((u) => P(u, 16 + (u % 3), u + 1, u === 2 ? { shiny: 1 } : {}));
const payload = { dex: [2, 2, 1, 0], box: box8, nextUid: 99, xp: 1234, stars: [16], shiny: [1, 0, 0, 0], holo: [0, 1] };
assert.equal(await rpc(A, "save_game", { payload, sess: "s-a" }), true, "a save was refused");
let ca = await card(A);
assert.deepEqual([ca.xp, ca.dex_count, ca.variants, ca.stars], [1234, 2, 2, 1],
  `card stats ${[ca.xp, ca.dex_count, ca.variants, ca.stars]} do not match the save`);
// Garbage only where the CARD reads: the base summary trigger (SUPABASE.md §3)
// has its own casts on dex and xp, which §3c hardens - not this file's business.
assert.equal(await rpc(A, "save_game", { payload: { dex: [2], xp: 5, box: 7, stars: "x", shiny: "y", holo: {} }, sess: "s-a" }), true,
  "a malformed save was refused because of the card");

// ---- 12. the showcase is built from the STORED save, never the request ----------
await rpc(A, "save_game", { payload, sess: "s-a" });
const mine = await rpc(A, "update_card", { showcase: [2, 1, 999, 2, 3, 4, 5, 6, 7, 8], seeking: [25, 0, 99999, 25, 150] });
assert.deepEqual(mine.showcase.map((m) => m.uid), [2, 1, 3, 4, 5, 6],
  `showcase ${mine.showcase.map((m) => m.uid)} - unknown uids, repeats or the cap were not handled`);
assert.equal(mine.showcase[0].tier, "shiny", "the showcase did not read the tier off the stored entry");
assert.deepEqual([...mine.seeking].sort((x, y) => x - y), [25, 150], `seeking ${mine.seeking} kept garbage or a repeat`);
// A showcased Pokemon that leaves the box leaves the showcase; one that evolves shows evolved.
await rpc(A, "save_game", { payload: { ...payload, box: box8.filter((m) => m.uid !== 3).map((m) => (m.uid === 1 ? { ...m, species: 18 } : m)) }, sess: "s-a" });
ca = await card(A);
assert.ok(!ca.showcase.some((m) => m.uid === 3), "a Pokemon that left the box stayed in the showcase");
assert.equal(ca.showcase.find((m) => m.uid === 1).species, 18, "the showcase did not follow an evolution");

// ---- 13. public to players, written by nobody -----------------------------------
const seen = await B.c.from("trainer_cards").select("username, showcase").eq("user_id", A.id);
assert.equal(seen.data?.[0]?.username, "TesterA", "a player could not read another trainer's card");
await B.c.from("trainer_cards").update({ trades: 999 }).eq("user_id", A.id);
await A.c.from("trainer_cards").update({ trades: 999, variants: 999 }).eq("user_id", A.id);
assert.equal((await card(A)).trades, 1, "a card was written directly - even its own trainer must not");
const anon = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, OPTS);
assert.deepEqual((await anon.from("trainer_cards").select("user_id")).data ?? [], [], "a signed-out visitor read cards");

// ---- 14. search: by prefix, never yourself, wildcards are literal -----------------
assert.deepEqual((await rpc(B, "find_trainers", { q: "testera" })).map((c) => c.username), ["TesterA"], "search by prefix missed");
assert.deepEqual(await rpc(B, "find_trainers", { q: "t" }), [], "a one-letter search listed trainers");
assert.ok(!(await rpc(A, "find_trainers", { q: "Tester" })).some((c) => c.user_id === A.id), "search found yourself");
assert.deepEqual(await rpc(B, "find_trainers", { q: "%%" }), [], "a wildcard search listed everyone");

// ---- 15. friends: request, answer, remove ------------------------------------------
const codeA = (await card(A)).friend_code, codeB = (await card(B)).friend_code;
assert.equal(await rpc(A, "add_friend", { code: ` ${codeB.toLowerCase()} ` }), "sent", "a friend request by code failed");
assert.equal(await rpc(A, "add_friend", { code: codeB }), "already", "a second request made a second row");
assert.equal(await rpc(A, "add_friend", { code: codeA }), "self", "a trainer befriended themselves");
assert.equal(await rpc(A, "add_friend", { code: "ZZZZZZZZ" }), "unknown", "an unknown code did not say so");
const inB = await rpc(B, "my_friends", {});
assert.ok(inB.length === 1 && inB[0].incoming && inB[0].card.username === "TesterA", "the request did not reach B as incoming");
assert.equal(await rpc(B, "add_friend", { code: codeA }), "friends", "asking back did not accept");
assert.equal((await rpc(A, "my_friends", {}))[0].status, "accepted", "the friendship is not accepted on both sides");
assert.equal(await rpc(B, "remove_friend", { other: A.id }), true, "a friend could not be removed");
assert.deepEqual(await rpc(A, "my_friends", {}), [], "removing a friend left a row");
await rpc(A, "add_friend", { code: codeB });
assert.equal(await rpc(B, "answer_friend", { other: A.id, yes: false }), true, "a request could not be declined");
assert.deepEqual(await rpc(A, "my_friends", {}), [], "a declined request stayed");

await q("delete from public.trades where a = any($1) or b = any($1)", [both]);
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
await db.end();
console.log("tradedb ok — never-traded saves untouched, registration checked against the stored save, RLS read-own/write-none, " +
  "two racing accepts make one trade, inbox matches reconcile, stale copies stripped, arrivals completed by saving, " +
  "release reversible, unknown ids kept, decline/cancel/expiry unlock, daily cap holds");
console.log("tradedb phase 1 ok — every trainer carded, stats from the save, showcase from the STORED save (pruned, evolved), " +
  "cards public to players and written by nobody, prefix search without yourself or wildcards, friend request/accept/decline/remove");
