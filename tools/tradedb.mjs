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
import { LIMITS } from "../src/game/trade.js";

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
// §3c every time (re-runnable): the live project runs it before trading.sql,
// so the test project must look the same - its column grants included.
{
  const md = readFileSync(new URL("../SUPABASE.md", import.meta.url), "utf8");
  const hard = md.slice(md.indexOf("## 3c."), md.indexOf("## 3d."));
  for (const m of hard.matchAll(/```sql\r?\n([\s\S]*?)```/g)) await db.query(m[1]);
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
await q("delete from public.surprise_pool where owner = any($1)", [both]);
await q("delete from public.surprise_log where owner = any($1)", [both]);
await q("delete from public.listings where owner = any($1)", [both]);
await q("delete from public.mons where owner = any($1)", [both]);
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
await q("delete from public.blocks where blocker = any($1) or blocked = any($1)", [both]);
await q("delete from public.reports where reporter = any($1) or reported = any($1)", [both]);
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
/* An offer may only ask for what is on the other trainer's SHELF (phase 3).
   The phase 0/2 tests are about the swap, not the shelf, so they shelve
   everything free first; phase 3 tests the shelf itself. */
const shelve = () => q("update public.mons set shelf = true where owner = any($1) and status = 'held'", [both]);
/* WHAT A TRAINER'S GAME DOES before it answers an offer (phase 6): write every
   server id the inbox names onto its box entries and upload. `answer_trade`
   says 'sync' until the saved box carries the ids of what it gives. */
const synced = async (who) => {
  const rows = await q("select id, local_uid from public.mons where owner = $1 and local_uid is not null and status <> 'released'", [who.id]);
  const by = new Map(rows.map((r) => [String(r.local_uid), r.id]));
  const data = await stored(who);
  const box = data.box.map((m) => (!m.mid && by.has(String(m.uid)) ? { ...m, mid: by.get(String(m.uid)) } : m));
  await rpc(who, "save_game", { payload: { ...data, box }, sess: `s-${who.tag}` });
};

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
await shelve();
const t1 = await rpc(A, "propose_trade", { target: B.id, give: [a1], want: [b1], msg: 0 });
assert.equal((await rpc(A, "trade_inbox", {})).locks[a1], "offered",
  "the inbox does not lock a Pokemon that is in an open offer - the game would let it be sold");
// ONE POKEMON, SEVERAL OFFERS (phase 6): the first accepted takes it.
const t1b = await rpc(A, "propose_trade", { target: B.id, give: [a1], want: [b1] });

// ---- 5. THE RACE: two accepts at once, exactly one trade --------------------------
assert.equal(await rpc(B, "answer_trade", { tid: t1, yes: true }), "sync",
  "an accept went through before the giver's saved box knew the id - the old copy would survive");
await synced(B);
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
assert.equal((await q("select status from public.trades where id = $1", [t1b]))[0].status, "failed",
  "a second offer of a Pokemon that just moved stayed open");

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
await save(B, [P(1, 16, 5, { mid: a1, traded: 1 }), P(13, 16, 4), ...boxB]);   // B completes the arrival
await save(A, [...boxNow, P(12, 16, 4)]);   // neither side gives its LAST Pidgey (phase 6's whole-offer rule)
await shelve();
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

// =============================================================== PHASE 2
// The daily-cap test above left ten finished trades for today; they go first.
await q("delete from public.trades where a = any($1) or b = any($1)", [both]);
// Fresh boxes: A holds Pidgey 20-29, B holds Rattata 30-39, all registered.
const boxA2 = Array.from({ length: 10 }, (_, i) => P(20 + i, 16, 5 + i));
const boxB2 = Array.from({ length: 10 }, (_, i) => P(30 + i, 19, 5 + i));
await save(A, boxA2);
await save(B, boxB2);
const midsA = (await rpc(A, "register_mons", { snaps: boxA2.map((m) => ({ uid: m.uid, species: 16, level: m.level })) })).map((r) => r.mid);
const midsB = (await rpc(B, "register_mons", { snaps: boxB2.map((m) => ({ uid: m.uid, species: 19, level: m.level })) })).map((r) => r.mid);
assert.equal(midsA.length + midsB.length, 20, "the phase 2 boxes did not register");

// ---- 16. a completed trade frees the lock of every offer it fails -------------------
await shelve();
await synced(B);
const t6 = await rpc(A, "propose_trade", { target: B.id, give: [midsA[0]], want: [midsB[0]] });
const t7 = await rpc(A, "propose_trade", { target: B.id, give: [midsA[1]], want: [midsB[0]] });
assert.equal(await rpc(B, "answer_trade", { tid: t6, yes: true }), "done", "the first offer did not trade");
assert.equal((await q("select status from public.trades where id = $1", [t7]))[0].status, "failed",
  "an offer for a Pokemon that just moved stayed open");
assert.equal((await mon(midsA[1])).status, "held",
  "a failed offer left its proposer's Pokemon locked - the phase 0 leak");

// ---- 17. Surprise Trade matches FRIENDS only ------------------------------------------
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
assert.equal((await rpc(A, "surprise_deposit", { mid: midsA[2] })).status, "waiting", "a lone deposit did not wait");
assert.equal((await mon(midsA[2])).status, "pooled", "a deposit did not lock its Pokemon");
assert.equal((await rpc(B, "surprise_deposit", { mid: midsB[2] })).status, "waiting",
  "two strangers were matched - Surprise Trade is friends-only");
assert.equal(await rpc(B, "surprise_withdraw", { mid: midsB[2] }), true, "a deposit could not be withdrawn");
assert.equal((await mon(midsB[2])).status, "held", "a withdrawn deposit kept its lock");
assert.equal(await rpc(A, "surprise_withdraw", { mid: midsB[2] }), false, "somebody withdrew another trainer's deposit");

// ---- 18. friends: the second deposit matches the first ---------------------------------
await q("insert into public.friends (a, b, status) values ($1, $2, 'accepted')", [A.id, B.id]);
const hit = await rpc(B, "surprise_deposit", { mid: midsB[3] });
assert.equal(hit.status, "matched", `a friend's waiting deposit was not matched: ${JSON.stringify(hit)}`);
assert.equal(hit.got.mid, midsA[2], "the match handed over the wrong Pokemon");
assert.equal(hit.from, "TesterA", "the match did not name who it came from");
assert.equal((await mon(midsA[2])).owner, B.id, "the pooled Pokemon did not move");
assert.equal((await mon(midsB[3])).owner, A.id, "the deposited Pokemon did not move");
assert.equal((await q("select count(*)::int n from public.surprise_pool where owner = any($1)", [both]))[0].n, 0,
  "a matched deposit stayed in the pool");
const inA2 = await rpc(A, "trade_inbox", {});
const last = inA2.recent.find((r) => r.id === hit.trade);
assert.ok(last && last.kind === "surprise" && last.partner === "TesterB", "A's inbox does not show the surprise trade");
assert.deepEqual([last.gave[0].mid, last.got[0].mid], [midsA[2], midsB[3]], "the trade scene would show the wrong pair");

// ---- 19. only a free Pokemon of your own goes in -----------------------------------------
assert.equal((await rpc(A, "surprise_deposit", { mid: midsB[4] })).status, "unavailable", "deposited somebody else's");
await rpc(A, "surprise_deposit", { mid: midsA[3] });
assert.equal((await rpc(A, "surprise_deposit", { mid: midsA[3] })).status, "unavailable", "one Pokemon was pooled twice");

// ---- 20. two friends depositing at once take DIFFERENT Pokemon ----------------------------
await rpc(A, "surprise_deposit", { mid: midsA[4] });          // A now waits with 3 and 4
const [r1, r2] = await Promise.all([
  rpc(B, "surprise_deposit", { mid: midsB[5] }),
  rpc(B, "surprise_deposit", { mid: midsB[6] }),
]);
assert.ok(r1.status === "matched" && r2.status === "matched", `racing deposits: ${r1.status}, ${r2.status}`);
assert.notEqual(r1.got.mid, r2.got.mid, "two deposits at once were both given the SAME Pokemon");

// ---- 21. the cap, and a deposit left a week comes home ------------------------------------
const left = (await rpc(A, "trade_inbox", {})).surprise_left;
assert.ok(left >= 0 && left < LIMITS.SURPRISE_PER_DAY, `surprise_left is ${left} after deposits`);
await q("insert into public.surprise_log (owner) select $1 from generate_series(1, $2)", [A.id, LIMITS.SURPRISE_PER_DAY]);
assert.equal((await rpc(A, "surprise_deposit", { mid: midsA[5] })).status, "capped", "the daily deposit cap did not hold");
await q("delete from public.surprise_log where owner = $1", [A.id]);
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
await rpc(A, "surprise_deposit", { mid: midsA[6] });
await q("update public.surprise_pool set deposited_at = now() - interval '8 days' where mon = $1", [midsA[6]]);
await rpc(A, "trade_inbox", {});
assert.equal((await mon(midsA[6])).status, "held", "a week-old deposit did not come home");

// =============================================================== PHASE 3
await q("delete from public.trades where a = any($1) or b = any($1)", [both]);
await q("delete from public.surprise_pool where owner = any($1)", [both]);
await q("update public.mons set shelf = false where owner = any($1)", [both]);
const boxA3 = Array.from({ length: 16 }, (_, i) => P(40 + i, 16, 3 + i));
await save(A, boxA3);

// ---- 22. the shelf: read off the STORED save, registered on the way, capped ------------
const all = boxA3.map((m) => m.uid);
const shelf = await rpc(A, "set_shelf", { uids: [...all, 999, 40] });
assert.equal(shelf.length, LIMITS.SHELF, `a shelf of ${shelf.length} - the cap, repeats or unknown uids were not handled`);
const shelved = (uid) => q("select shelf from public.mons where owner = $1 and local_uid = $2 and status <> 'released'", [A.id, uid]);
assert.equal((await shelved(40))[0]?.shelf, true, "the first uid asked for is not on the shelf");
assert.equal((await shelved(55)).length, 0, "a uid past the cap was registered anyway");
const small = await rpc(A, "set_shelf", { uids: [40, 41] });
assert.deepEqual(small.map((m) => m.species), [16, 16], "the shelf was not replaced whole");
assert.equal((await shelved(42))[0]?.shelf, false, "a Pokemon taken off the shelf stayed on it");

// ---- 23. others see the shelf and only the shelf ------------------------------------------
const seenShelf = await rpc(B, "trainer_shelf", { who: A.id });
assert.equal(seenShelf.length, 2, `B sees ${seenShelf.length} of A's Pokemon - only the shelf is public`);
const onShelf = seenShelf.map((m) => m.mid);
const offShelf = (await q("select id from public.mons where owner = $1 and local_uid = 42", [A.id]))[0].id;

// ---- 24. a stranger can only ask for what is on the shelf -----------------------------------
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
const bFree = (await q("select id from public.mons where owner = $1 and status = 'held' limit 1", [B.id]))[0].id;
await refuses(rpc(B, "propose_trade", { target: A.id, give: [bFree], want: [offShelf] }),
  "an offer asked for a Pokemon that is not up for trade");
const t8 = await rpc(B, "propose_trade", { target: A.id, give: [bFree], want: [onShelf[0]], msg: 2 });
const openA = (await rpc(A, "trade_inbox", {})).open.find((o) => o.id === t8);
assert.ok(openA && openA.partner === "TesterB" && !openA.mine && openA.msg === 2,
  `A's inbox does not show B's offer with its trainer and message: ${JSON.stringify(openA)}`);

// ---- 25. a traded Pokemon leaves its old owner's shelf ----------------------------------------
await synced(A);
assert.equal(await rpc(A, "answer_trade", { tid: t8, yes: true }), "done", "a shelf offer did not trade");
assert.equal((await mon(onShelf[0])).shelf, false, "a traded Pokemon stayed on a shelf");
assert.equal((await rpc(B, "trainer_shelf", { who: A.id })).length, 1, "A's shelf still shows what A traded away");

// =============================================================== PHASE 4
await q("delete from public.trades where a = any($1) or b = any($1)", [both]);
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
await q("insert into public.friends (a, b, status) values ($1, $2, 'accepted')", [A.id, B.id]);
// A: Pidgey 60-66 and a shiny Pikachu 67. B: Rattata 70-73, a plain Pikachu 74, a shiny one 75.
const boxA4 = [60, 61, 62, 63, 64, 65, 66].map((u) => P(u, 16, u - 55)).concat([P(67, 25, 9, { shiny: 1 })]);
const boxB4 = [P(70, 19, 5), P(71, 19, 6), P(72, 19, 7), P(73, 19, 8), P(74, 25, 7), P(75, 25, 8, { shiny: 1 })];
await save(A, boxA4);
await save(B, boxB4);
const reg4 = async (who, box) => Object.fromEntries((await rpc(who, "register_mons",
  { snaps: box.map((m) => ({ uid: m.uid, species: m.species, level: m.level })) })).map((r) => [r.uid, r.mid]));
const a4 = await reg4(A, boxA4), b4 = await reg4(B, boxB4);

// ---- 26. posting a listing ------------------------------------------------------------
const lid = await rpc(A, "post_listing", { mids: [a4[60]], want_species: 25, want_tier: "shiny" });
assert.equal((await mon(a4[60])).status, "listed", "a listed Pokemon was not locked");
await refuses(rpc(A, "post_listing", { mids: [a4[60]], want_species: 25 }), "one Pokemon was listed twice");
await refuses(rpc(A, "post_listing", { mids: [b4[70]], want_species: 25 }), "somebody listed another trainer's Pokemon");
const boardB = await rpc(B, "trade_board", {});
assert.ok(boardB.some((x) => x.id === lid && x.owner === "TesterA" && !x.mine && x.want_tier === "shiny"),
  "a friend's listing is not on the board");
assert.ok((await rpc(A, "trade_board", {})).some((x) => x.id === lid && x.mine), "your own listing is not on your board");
assert.ok((await rpc(B, "trade_board", { q: 25 })).some((x) => x.id === lid), "searching the WANTED species missed the listing");
assert.ok((await rpc(B, "trade_board", { q: 16 })).some((x) => x.id === lid), "searching the OFFERED species missed the listing");
assert.ok(!(await rpc(B, "trade_board", { q: 19 })).some((x) => x.id === lid), "a species search listed an unrelated listing");
assert.equal((await rpc(A, "trade_inbox", {})).listings.length, 1, "the inbox does not show your own listing");

// ---- 27. friends only -------------------------------------------------------------------
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
assert.ok(!(await rpc(B, "trade_board", {})).some((x) => x.id === lid), "a stranger's listing showed on the board");
assert.equal((await rpc(B, "fulfil_listing", { lid, mid: b4[75] })).status, "gone", "a stranger completed a listing");
await q("insert into public.friends (a, b, status) values ($1, $2, 'accepted')", [A.id, B.id]);

// ---- 28. only what was asked for ------------------------------------------------------------
assert.equal((await rpc(B, "fulfil_listing", { lid, mid: b4[74] })).status, "unfit", "a plain Pikachu filled a shiny-only listing");
assert.equal((await rpc(B, "fulfil_listing", { lid, mid: b4[70] })).status, "unfit", "the wrong species filled a listing");
assert.equal((await rpc(A, "fulfil_listing", { lid, mid: a4[67] })).status, "gone", "a trainer completed their own listing");

// ---- 29. THE RACE: two completions at once, one trade ----------------------------------------
const both4 = await Promise.all([
  rpc(B, "fulfil_listing", { lid, mid: b4[75] }),
  rpc(B, "fulfil_listing", { lid, mid: b4[75] }),
]);
assert.deepEqual(both4.map((r) => r.status).sort(), ["done", "gone"], `racing completions gave ${both4.map((r) => r.status)}`);
assert.equal((await mon(a4[60])).owner, B.id, "the listed Pokemon did not move");
assert.equal((await mon(b4[75])).owner, A.id, "the payment did not move");
assert.equal((await q("select status from public.listings where id = $1", [lid]))[0].status, "done", "a completed listing stayed open");
assert.equal((await q("select kind from public.trades where a = $1 and status = 'done' order by closed_at desc limit 1", [A.id]))[0].kind,
  "board", "a board trade was not recorded as one");
assert.ok(!(await rpc(B, "trade_board", {})).some((x) => x.id === lid), "a completed listing stayed on the board");

// ---- 30. "any form" takes any form, once the payment has arrived ------------------------------
const lid2 = await rpc(A, "post_listing", { mids: [a4[61]], want_species: 16 });
assert.equal((await rpc(B, "fulfil_listing", { lid: lid2, mid: a4[60] })).status, "unfit",
  "a Pokemon still arriving was used to complete a listing");
await save(B, [...boxB4, P(80, 16, 5, { mid: a4[60], traded: 1 })]);      // B completes the arrival
assert.equal((await rpc(B, "fulfil_listing", { lid: lid2, mid: a4[60] })).status, "done", "an any-form listing refused a fit");

// ---- 31. withdraw, the cap, and a listing left a week comes home -------------------------------
const lid3 = await rpc(A, "post_listing", { mids: [a4[62]], want_species: 1 });
assert.equal(await rpc(B, "withdraw_listing", { lid: lid3 }), false, "somebody withdrew another trainer's listing");
assert.equal(await rpc(A, "withdraw_listing", { lid: lid3 }), true, "a listing could not be withdrawn");
assert.equal((await mon(a4[62])).status, "held", "a withdrawn listing kept its lock");
for (const u of [62, 63, 64, 65, 66]) await rpc(A, "post_listing", { mids: [a4[u]], want_species: 1 });
await refuses(rpc(A, "post_listing", { mids: [a4[67] ?? b4[75]], want_species: 1 }), "a sixth listing went up past the cap");
await q("update public.listings set created_at = now() - interval '8 days' where mon = $1 and status = 'open'", [a4[62]]);
await rpc(A, "trade_inbox", {});
assert.equal((await mon(a4[62])).status, "held", "a week-old listing did not come home");

// =============================================================== PHASE 5
await q("delete from public.listings where owner = any($1)", [both]);
await q("delete from public.trades where a = any($1) or b = any($1)", [both]);
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
const boxA5 = [P(90, 16, 5), P(91, 16, 6)], boxB5 = [P(92, 19, 5), P(93, 19, 6)];
await save(A, boxA5);
await save(B, boxB5);
const a5 = await reg4(A, boxA5), b5 = await reg4(B, boxB5);
await q("update public.mons set shelf = true where id = any($1)", [[a5[91], b5[93]]]);

// ---- 32. a friend code is yours to hand out, never readable by others ----------------------
const code5 = (await card(A)).friend_code;
assert.ok((await B.c.from("trainer_cards").select("friend_code").eq("user_id", A.id)).error,
  "a player read another trainer's friend code off the table");
assert.ok((await B.c.from("trainer_cards").select("*").eq("user_id", A.id)).error, "select * handed out friend codes");
assert.ok(!("friend_code" in (await rpc(B, "find_trainers", { q: "testera" }))[0]), "search handed out a friend code");
assert.equal((await rpc(B, "card_by_name", { name: " testera " }))?.username, "TesterA", "a card by name was not found");
assert.ok(!("friend_code" in (await rpc(B, "card_by_name", { name: "TesterA" }))), "a card by name handed out a friend code");
assert.equal((await rpc(A, "my_card", {})).friend_code, code5, "your own card does not show your code");

// ---- 33. a friend request by trainer (a profile's button), and the inbox counts it ------------
assert.equal(await rpc(A, "request_friend", { other: B.id }), "sent", "a request by trainer failed");
assert.equal((await rpc(B, "trade_inbox", {})).friend_requests, 1, "the inbox did not count a friend request");
assert.equal((await rpc(A, "trade_inbox", {})).friend_requests, 0, "the inbox counted the asker's own request");
assert.ok(!(await rpc(B, "my_friends", {})).some((f) => "friend_code" in f.card), "the friends list handed out a friend code");
assert.equal(await rpc(B, "request_friend", { other: A.id }), "friends", "asking back by trainer did not accept");
assert.equal(await rpc(A, "request_friend", { other: A.id }), "self", "a trainer befriended themselves by trainer");
assert.equal(await rpc(A, "request_friend", { other: "00000000-0000-0000-0000-000000000000" }), "unknown",
  "a request to nobody did not say so");

// ---- 34. a block: friendship ends, offers close and unlock, and neither side finds the other ----
await rpc(B, "propose_trade", { target: A.id, give: [b5[92]], want: [a5[91]] });
await rpc(A, "propose_trade", { target: B.id, give: [a5[90]], want: [b5[93]] });
assert.equal(await rpc(A, "block_user", { other: B.id }), true, "a block was refused");
assert.equal(await rpc(A, "block_user", { other: B.id }), true, "blocking twice failed");
assert.equal(await rpc(A, "block_user", { other: A.id }), false, "a trainer blocked themselves");
assert.equal((await rpc(B, "trade_inbox", {})).locks[b5[92]], "held", "a block left the blocked trainer's offer locked");
assert.equal((await rpc(A, "trade_inbox", {})).locks[a5[90]], "held", "a block left the blocker's own offer locked");
assert.equal((await q("select count(*)::int n from public.trades where status = 'open' and (a = any($1) or b = any($1))", [both]))[0].n, 0,
  "a block left an offer open");
assert.deepEqual(await rpc(A, "my_friends", {}), [], "a block left the friendship");
for (const [x, y, name, other] of [[A, B, "testerb", "TesterB"], [B, A, "testera", "TesterA"]]) {
  const way = `${x.tag} -> ${y.tag}`;
  assert.deepEqual(await rpc(x, "find_trainers", { q: name }), [], `search found across a block (${way})`);
  assert.equal(await rpc(x, "card_by_name", { name: other }), null, `a card opened across a block (${way})`);
  assert.deepEqual(await rpc(x, "trainer_shelf", { who: y.id }), [], `a shelf showed across a block (${way})`);
  assert.equal(await rpc(x, "request_friend", { other: y.id }), "unknown", `a friend request crossed a block (${way})`);
  await refuses(rpc(x, "propose_trade", { target: y.id, give: [x === A ? a5[90] : b5[92]], want: [x === A ? b5[93] : a5[91]] }),
    `an offer crossed a block (${way})`);
}
assert.equal(await rpc(B, "add_friend", { code: code5 }), "unknown", "a friend code crossed a block");
assert.deepEqual((await B.c.from("blocks").select("blocker")).data, [], "the blocked trainer can see the block");
assert.deepEqual((await rpc(A, "my_blocks", {})).map((c) => [c.username, "friend_code" in c]), [["TesterB", false]],
  "your blocked list is wrong or hands out a code");
assert.equal(await rpc(B, "unblock_user", { other: A.id }), false, "the blocked trainer lifted the block");
assert.equal(await rpc(A, "unblock_user", { other: B.id }), true, "a block could not be lifted");
assert.equal((await rpc(A, "find_trainers", { q: "testerb" })).length, 1, "a lifted block still hides the trainer");

// ---- 34b. a NEW trainer signs up as themselves: the card trigger mints a code
// under the column grant (it reads friend_code, which players may not).
{
  const email = "trade-new@dexora.test";
  const old = (await q("select id from auth.users where email = $1", [email]))[0];
  if (old) await admin.auth.admin.deleteUser(old.id);
  const made = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  const C = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, OPTS);
  await C.auth.signInWithPassword({ email, password: PASS });
  const ins = await C.from("profiles").insert({ user_id: made.data.user.id, username: "TesterNew", char: "red" });
  assert.equal(ins.error, null, `a new trainer could not sign up: ${ins.error?.message}`);
  const mineC = (await C.rpc("my_card")).data;
  assert.match(mineC?.friend_code ?? "", /^[A-Z2-9]{8}$/, "a new trainer got no friend code");
  await admin.auth.admin.deleteUser(made.data.user.id);
}

// ---- 35. a report: a fixed reason, once a day per pair, readable by nobody -------------------
assert.equal(await rpc(B, "report_user", { other: A.id, reason: 1 }), true, "a report was refused");
assert.equal(await rpc(B, "report_user", { other: A.id, reason: 2 }), false, "a pair was reported twice in a day");
assert.equal(await rpc(A, "report_user", { other: B.id, reason: 99 }), false, "a report took a reason off the list");
assert.equal(await rpc(A, "report_user", { other: A.id, reason: 0 }), false, "a trainer reported themselves");
assert.deepEqual((await B.c.from("reports").select("id")).data, [], "a player read the reports");

// =============================================================== PHASE 6
await q("delete from public.blocks where blocker = any($1) or blocked = any($1)", [both]);
await q("delete from public.reports where reporter = any($1) or reported = any($1)", [both]);
await q("delete from public.listings where owner = any($1)", [both]);
await q("delete from public.trades where a = any($1) or b = any($1)", [both]);
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
// A: Pidgey 100-103, one Mew 104 (the last of its kind), a locked Pidgey 105.
// B: Rattata 110-117, one Eevee 118.
const boxA6 = [P(100, 16, 5), P(101, 16, 6), P(102, 16, 7), P(103, 16, 8), P(104, 151, 30),
  P(105, 16, 9, { lock: "listing", mid: "00000000-0000-4000-8000-000000000105" }),
  P(106, 25, 5), P(107, 25, 6)];                                     // A's only two Pikachu
const boxB6 = [...Array.from({ length: 8 }, (_, i) => P(110 + i, 19, 5 + i)), P(118, 133, 10)];
await save(A, boxA6);
await save(B, boxB6);
const b6 = await reg4(B, boxB6);

// ---- 36. a friend's box: spares only, and only to a friend -----------------------------------
assert.equal(await rpc(B, "friend_box", { who: A.id }), null, "a stranger browsed a trainer's box");
await q("insert into public.friends (a, b, status) values ($1, $2, 'accepted')", [A.id, B.id]);
const fb = await rpc(B, "friend_box", { who: A.id });
assert.deepEqual(fb.box.map((m) => m.uid).sort(), [100, 101, 102, 103, 106, 107],
  `a friend's box showed ${fb.box.map((m) => m.uid)} - never the last of a species, never a locked one`);
assert.ok(Array.isArray(fb.dex), "a friend's box came without their Pokedex");

// ---- 37. ask a friend for anything spare, by box uid ------------------------------------------
await refuses(rpc(B, "propose_trade", { target: A.id, give: [b6[110]], want: [], want_uids: [104] }),
  "an offer asked for the last of a friend's species");
await refuses(rpc(B, "propose_trade", { target: A.id, give: [b6[110]], want: [], want_uids: [105] }),
  "an offer asked for a Pokemon the friend's game has locked");
const t9 = await rpc(B, "propose_trade", { target: A.id, give: [b6[110], b6[111], b6[112]], want: [], want_uids: [101] });
const inA6 = await rpc(A, "trade_inbox", {});
const asked = inA6.assign["101"];
assert.ok(asked, "the inbox did not tell A's game which id its asked-for Pidgey got");
assert.deepEqual(inA6.open.find((o) => o.id === t9)?.want.map((m) => m.mid), [asked], "the offer does not name the Pidgey");
// A's game uploads BEFORE it learns the id: the asked-for Pidgey must stay held.
await save(A, boxA6);
assert.equal((await mon(asked)).status, "held", "an upload from a game that had not synced released a friend-asked Pokemon");
assert.equal(await rpc(A, "answer_trade", { tid: t9, yes: true }), "sync",
  "a friend-asked Pokemon was traded before its owner's save knew its id");
await synced(A);
assert.equal(await rpc(A, "answer_trade", { tid: t9, yes: true }), "done", "a three-for-one friend offer did not trade");
assert.equal((await mon(asked)).owner, B.id, "the asked-for Pidgey did not move");
for (const u of [110, 111, 112]) assert.equal((await mon(b6[u])).owner, A.id, "the three Rattata did not all move");
// YOU KEEP THE LAST, counted over the whole offer - each of two looks spare alone.
await refuses(rpc(B, "propose_trade", { target: A.id, give: [b6[113]], want: [], want_uids: [106, 107] }),
  "an offer asked for every copy a friend has of a species");
await refuses(rpc(B, "propose_trade", { target: A.id, give: [b6[118]], want: [], want_uids: [106] }),
  "an offer gave away the last of a species");
const pk = (await rpc(A, "register_mons", { snaps: [{ uid: 106, species: 25, level: 5 }, { uid: 107, species: 25, level: 6 }] }))
  .map((r) => r.mid);
await refuses(rpc(A, "post_listing", { mids: pk, want_species: 1 }), "a bundle listed every copy of a species");
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
await refuses(rpc(B, "propose_trade", { target: A.id, give: [b6[113]], want: [], want_uids: [102] }),
  "a stranger asked for something off a trainer's shelf");
await q("insert into public.friends (a, b, status) values ($1, $2, 'accepted')", [A.id, B.id]);
await refuses(rpc(B, "propose_trade", { target: A.id, give: [b6[113], b6[114], b6[115], b6[116], b6[117], b6[118], b6[113]].slice(0, 7).concat([b6[110]]), want: [], want_uids: [102] }),
  "an offer gave more than six");

// ---- 38. a Pokemon with no id is still stripped once it is traded away ------------------------
// A's game never learned the Pidgey's id: its entry comes back without one.
await save(A, boxA6);
assert.ok(!(await stored(A)).box.some((m) => m.uid === 101),
  "a traded-away Pokemon survived in a save that never learned its id");
assert.ok((await stored(A)).box.some((m) => m.uid === 100), "an untraded Pidgey was stripped with it");

// ---- 39. closing an offer never unlists what was listed since ---------------------------------
await synced(A);
const a6 = Object.fromEntries((await q("select local_uid, id from public.mons where owner = $1 and status = 'held' and local_uid is not null", [A.id]))
  .map((r) => [r.local_uid, r.id]));
const [p100] = (await rpc(A, "register_mons", { snaps: [{ uid: 100, species: 16, level: 5 }] })).map((r) => r.mid);
const t10 = await rpc(A, "propose_trade", { target: B.id, give: [p100], want: [b6[113]] });
const lid6 = await rpc(A, "post_listing", { mids: [p100], want_species: 133 });
await rpc(A, "cancel_trade", { tid: t10 });
assert.equal((await mon(p100)).status, "listed", "cancelling an offer pulled its Pokemon off the board");
await rpc(A, "withdraw_listing", { lid: lid6 });

// ---- 40. a bundle: several for one, all or nothing ------------------------------------------
const [p102, p103] = (await rpc(A, "register_mons", { snaps: [{ uid: 102, species: 16, level: 7 }, { uid: 103, species: 16, level: 8 }] }))
  .map((r) => r.mid);
const lid7 = await rpc(A, "post_listing", { mids: [p100, p102, p103], want_species: 133 });
const row7 = (await rpc(B, "trade_board", {})).find((x) => x.id === lid7);
assert.deepEqual(row7?.mons.map((m) => m.mid), [p100, p102, p103], "the board does not show the whole bundle");
assert.ok((await rpc(B, "trade_board", { q: 16 })).some((x) => x.id === lid7), "a search missed a bundled species");
for (const m of [p100, p102, p103]) assert.equal((await mon(m)).status, "listed", "a bundled Pokemon was not locked");
await refuses(rpc(A, "post_listing", { mids: [p100], want_species: 1 }), "a bundled Pokemon was listed twice");
const done7 = await rpc(B, "fulfil_listing", { lid: lid7, mid: b6[118] });
assert.equal(done7.status, "done", `a bundle was not completed: ${done7.status}`);
assert.equal(done7.gots?.length, 3, "completing a bundle did not say all three arrived");
for (const m of [p100, p102, p103]) assert.equal((await mon(m)).owner, B.id, "a bundled Pokemon did not move");

// ---- 41. who has one: friends' spares and anybody's shelf, never across a block -----------------
await save(B, [...boxB6, P(119, 19, 4)]);
const found = await rpc(A, "trade_search", { q: 19 });
assert.ok(found.friends.some((f) => f.username === "TesterB" && f.spare >= 1), "search missed a friend's spare Rattata");
await q("update public.mons set shelf = true where id = $1", [b6[117]]);
assert.ok((await rpc(A, "trade_search", { q: 19 })).shelves.some((s_) => s_.username === "TesterB"),
  "search missed a Rattata on a shelf");
await rpc(A, "block_user", { other: B.id });
const hidden = await rpc(A, "trade_search", { q: 19 });
assert.ok(!hidden.friends.length && !hidden.shelves.length, "search found a trainer across a block");

await q("delete from public.blocks where blocker = any($1) or blocked = any($1)", [both]);
await q("delete from public.reports where reporter = any($1) or reported = any($1)", [both]);
await q("delete from public.listings where owner = any($1)", [both]);
await q("delete from public.trades where a = any($1) or b = any($1)", [both]);
await q("delete from public.friends where a = any($1) or b = any($1)", [both]);
await q("delete from public.surprise_pool where owner = any($1)", [both]);
await db.end();
console.log("tradedb ok — never-traded saves untouched, registration checked against the stored save, RLS read-own/write-none, " +
  "two racing accepts make one trade, inbox matches reconcile, stale copies stripped, arrivals completed by saving, " +
  "release reversible, unknown ids kept, decline/cancel/expiry unlock, daily cap holds");
console.log("tradedb phase 1 ok — every trainer carded, stats from the save, showcase from the STORED save (pruned, evolved), " +
  "cards public to players and written by nobody, prefix search without yourself or wildcards, friend request/accept/decline/remove");
console.log("tradedb phase 2 ok — a completed trade frees the offers it fails, Surprise Trade matches friends only, a match swaps and " +
  "empties the pool and shows in both inboxes, only your own free Pokemon goes in, racing deposits take different Pokemon, " +
  "the daily cap holds, a week-old deposit comes home");
console.log("tradedb phase 3 ok — the shelf is read off the stored save, registered, capped and replaced whole; others see only " +
  "the shelf; an offer can ask only for what is on it; the inbox names the trainer and message; a traded Pokemon leaves the shelf");
console.log("tradedb phase 4 ok — a listing locks its Pokemon and shows to friends only, search by offered or wanted species, " +
  "only the asked-for species and tier completes it, racing completions make one trade, any-form listings, arriving Pokemon " +
  "cannot pay, withdraw, the cap, a week-old listing comes home");
console.log("tradedb phase 5 ok — friend codes readable only by their trainer, a request by trainer, the inbox counts requests, " +
  "a block ends the friendship and closes and unlocks offers both ways, hides search, card, shelf, requests and offers both " +
  "ways, is private and liftable only by its maker; reports take a listed reason once a day and are read by nobody");
console.log("tradedb phase 6 ok — one Pokemon in several offers (the first accepted takes it, the rest fail), accepting waits " +
  "for the giver's save to know the id, a friend's box shows spares only, friends ask for any spare by box uid and " +
  "strangers only for the shelf, six a side, a traded Pokemon with no id is still stripped, closing an offer never " +
  "unlists, bundles move all or nothing, search finds friends' spares and shelves but never across a block");
