/* node tools/play.mjs — drive the REAL engine, in Node, with no browser.

   The engine is the one part of this game a unit test could never reach: it
   owns mutable state behind a `requestAnimationFrame` loop and draws to a
   canvas, so every check.mjs suite tests the pure functions AROUND it and
   nothing tests the loop that calls them. That gap shipped a catch that froze
   mid-animation - the ball landed and the phase machine simply stopped - and
   nothing in twenty-five suites could see it, because every function it calls
   was individually correct.

   So: stub the six DOM things the engine touches, drive the frame clock by
   hand, and play. A FAKE CLOCK rather than a real one is the whole trick -
   `tick(ms)` advances `performance.now()` and calls the frame callback, so a
   3.2-second catch animation resolves in a few dozen synchronous frames and
   the whole run takes milliseconds. It is also deterministic.

   Two things it deliberately does NOT do: draw anything (the canvas stub
   records nothing - what is on screen is the render harness's job) and use
   React. What it proves is that the STATE MACHINE completes: that a throw
   reaches `caught`, that a caught Pokémon lands in the box, that the encounter
   closes, and that nothing throws on the way. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// ---------------------------------------------------------------- the stubs
let now = 1000;
const raf = [];
const noop = () => {};
// Every call on a 2D context is counted: `draws` is how much the engine painted.
let draws = 0;
let calls = null;       // set to [] to record every call as [name, ...args]
const paint = () => { draws++; };
const ctx2d = new Proxy({}, {
  get: (_, k) => (k === "canvas" ? { width: 0, height: 0 }
    : calls ? (...a) => { draws++; calls.push([k, ...a]); } : paint),
  set: () => true,
});
const canvas = () => ({
  width: 480, height: 352, style: {}, getContext: () => ctx2d,
});

const store = new Map();
// Set to a DOMException-shaped error to make the next write fail, as a full
// quota does. Null means writes succeed.
let writeFails = null;
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => {
    if (writeFails) throw writeFails;
    store.set(k, String(v));
  },
  removeItem: (k) => store.delete(k),
};
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = (cb) => raf.push(cb);
globalThis.cancelAnimationFrame = noop;
globalThis.document = {
  createElement: () => canvas(),
  addEventListener: noop,
  removeEventListener: noop,
  baseURI: "http://localhost/",
};
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.Image = class { set src(_) {} };

/* Advance the clock and run exactly the frames that were asked for. The engine
   re-registers one callback per frame, so draining the queue each time is what
   keeps this honest: if the loop ever stops asking, `tick` runs out of
   callbacks and the test hangs visibly rather than passing quietly. */
function tick(ms = 16, steps = 1) {
  for (let i = 0; i < steps; i++) {
    now += ms;
    const due = raf.splice(0, raf.length);
    if (!due.length) throw new Error("the frame loop stopped asking for frames");
    for (const cb of due) cb(now);
  }
}

const { createEngine } = await import("../src/game/engine.js");
const { BALLS, berryById, levelReward } = await import("../src/game/items.js");
const { PHASES, phaseAt } = await import("../src/game/clock.js");
const {
  wildBand, biomeFor, bornLevel, SIZE_MIN, SIZE_MAX,
} = await import("../src/game/biomes.js");

// --------------------------------------------------------------- the harness
function boot(save) {
  store.clear();
  if (save) store.set("meadow-route", JSON.stringify(save));
  raf.length = 0;
  let changes = 0;
  const e = createEngine(canvas(), () => changes++, canvas());
  return { e, changes: () => changes };
}

const SAVE = {
  dex: Array(358).fill(0),
  box: [],
  nextUid: 1,
  money: 50000,
  candy: 0,
  xp: 60000,
  /* Paid for every level it has, so a test about something else does not
     open on a level-up banner - 60,000 XP was the old Lv 50 cap and is Lv 60
     now, and an unpaid save is owed 51-60 at boot. The back-pay has its own
     test below. */
  paid: 75,
  steps: 4000,
  caught: 0,
  areaId: "meadow",
  bag: {
    "poke-ball": 99, "great-ball": 20, "ultra-ball": 10, "master-ball": 2,
    "razz-berry": 5, "nanab-berry": 5, "pinap-berry": 5,
    repel: 2, "white-flute": 2, honey: 2, "honey-shiny": 1,
  },
  stats: {},
  medals: [],
};

/* Walk until something appears. Held keys move the trainer a tile at a time,
   so this is the same path a player takes - not `startEncounter()` called
   directly, which would skip exactly the code an encounter bug lives in. */
function walkToEncounter(e, limit = 6000) {
  /* A FIXED PATTERN PINS THE TRAINER IN A CORNER and then walks him into the
     same wall for four thousand frames, which reads as "the map spawns
     nothing". Re-rolled every 24 frames instead. */
  const dirs = ["right", "down", "left", "up"];
  let dir = dirs[0];
  for (let i = 0; i < limit; i++) {
    if (i % 24 === 0) { e.clearHeld(); dir = dirs[(Math.random() * 4) | 0]; }
    e.press(dir);
    tick(16);
    if (e.state.encounter) {
      e.clearHeld();
      return e.state.encounter;
    }
  }
  e.clearHeld();
  return null;
}

// Run frames until a predicate holds, or give up loudly.
function until(e, what, label, max = 2000) {
  for (let i = 0; i < max; i++) {
    if (what(e.state)) return i;
    tick(16);
  }
  const enc = e.state.encounter;
  throw new Error(
    `${label}: never happened in ${max} frames ` +
    `(phase ${enc?.phase ?? "-"}, msg ${JSON.stringify(enc?.msg ?? "")})`);
}

// ------------------------------------------------------------------- the play
{
  const { e } = boot(SAVE);
  const enc = walkToEncounter(e);
  assert.ok(enc, "walked a whole map and met nothing");

  /* THROW UNTIL ONE STICKS, and follow the phase machine the whole way. This
     is the assertion the freeze needed: not "does a catch work" but "does the
     phase machine ever stop moving". */
  let caught = null;
  for (let attempt = 1; attempt <= 40 && !caught; attempt++) {
    const live = e.state.encounter;
    if (!live) { walkToEncounter(e); continue; }
    if (live.phase !== "idle") { until(e, (s) => !s.encounter || s.encounter.phase === "idle", "back to idle"); }
    const before = e.state.box.length;
    e.throwBall("ultra-ball");
    until(e, (s) => !s.encounter || ["caught", "fled", "broke"].includes(s.encounter.phase)
      || s.encounter.phase === "idle" && s.encounter.throws > 0, "the throw to resolve");
    if (e.state.box.length > before) caught = e.state.box.at(-1);
    if (!e.state.encounter) { if (!caught) walkToEncounter(e); }
  }
  assert.ok(caught, "forty Ultra Balls and nothing was ever caught");
  assert.ok(caught.species > 0 && caught.level > 0, "a caught Pokémon with no species or level");

  /* THE SIZE HAS TO SURVIVE THE CATCH. It is rolled on the encounter and
     copied onto the box entry, and the failure is silent in the worst way: the
     enormous Rattata you threw six balls at is an ordinary one in the Box,
     because `sizeOf` quietly falls back to the uid hash when nothing was
     stored. Only a real catch goes through that copy. */
  assert.ok(caught.size >= SIZE_MIN && caught.size <= SIZE_MAX,
    `a caught Pokémon came out of the ball with size ${caught.size}`);

  /* THE CLOCK IS FROZEN ONTO THE ENCOUNTER, and only a real one goes through
     that copy. A ball that read the clock at throw time would change value
     because you took a step mid-animation. */
  assert.equal(typeof enc.night, "boolean", "the encounter carries no night flag");
  assert.ok(PHASES.some((p) => p.id === enc.phaseId),
    `the encounter froze phase "${enc.phaseId}", which is not one`);

  /* AND IT MUST BE IN THE MAP'S OWN BAND. The band is computed from the biome
     the encounter started in, which nothing but the engine knows. */
  {
    const [lo, hi] = wildBand(biomeFor(e.state.areaId));
    const floor = Math.max(bornLevel(caught.species) + 2, lo);
    assert.ok(caught.level >= floor && caught.level <= floor + (hi - lo),
      `caught at Lv ${caught.level}, outside ${floor}-${floor + hi - lo} for this map`);
  }

  /* AND THE ENCOUNTER HAS TO CLOSE. A catch that registers but leaves the
     overlay up is the same bug wearing a different face. */
  until(e, (s) => !s.encounter, "the encounter to close after a catch", 4000);
  assert.equal(e.state.caught > 0, true, "the catch counter never moved");
  console.log(`catch ok — caught #${caught.species} at Lv ${caught.level} ` +
    `(size ${caught.size}), box ${e.state.box.length}, encounter closed`);
}

/* THE VARIANT BOUNTY IS PAID BY THE ENGINE, AND NOTHING ELSE CAN SEE IT.

   `catchBounty` is pure and check.mjs pins its shape, but the money is added
   in `settle` - so the whole feature can be correct and disconnected at once,
   and the symptom is a number that simply never moves. Exactly the shape of
   the size roll above: computed in one place, copied in another, silent if
   the copy is dropped.

   Driven over a REAL catch with the tier forced onto the encounter, which is
   where the engine keeps it anyway - `e.variant` is frozen at spawn and read
   by `settle`. A Master Ball because it cannot miss, so the test is about the
   payment and not about the odds; and the dex slot is filled first, because
   a NEW entry pays too and that is a different stream. Both directions,
   because a bounty that paid on an ORDINARY catch would inflate the grind
   and nothing would say so. */
{
  const { catchBounty } = await import("../src/game/items.js");
  const { speciesById, dexIndex } = await import("../src/game/biomes.js");
  const { TASKS } = await import("../src/game/research.js");
  const { e } = boot(SAVE);
  const paid = {};

  for (const tier of [null, "showdown"]) {
    let enc = e.state.encounter ?? walkToEncounter(e);
    assert.ok(enc, "walked a whole map and met nothing");
    if (enc.phase !== "idle")
      until(e, (s) => !s.encounter || s.encounter.phase === "idle", "back to idle");
    enc = e.state.encounter;
    enc.variant = tier;
    e.state.dex[dexIndex(enc.speciesId)] = 2;   // not a new entry: that pays too
    // And research already finished, because a research level pays too.
    e.state.research[enc.speciesId] = TASKS.map((t) => t.steps.at(-1));
    const sp = speciesById(enc.speciesId);
    const before = e.state.money;
    /* THE MASTER BALL ASKS NOW, so this drives the real path rather than
       reaching past it - the press, the question, the answer. This test broke
       the day the gate shipped, which is the gate working: a harness that
       could still throw one without answering would be proof the dialog is
       skippable. */
    e.throwBall("master-ball");
    assert.equal(e.state.ask?.kind, "master",
      "a Master Ball threw without asking - the gate is not in the engine");
    e.answerAsk(true);
    until(e, (s) => !s.encounter || s.encounter.phase === "caught",
      "the master ball to land");
    const got = e.state.money - before;
    paid[tier ?? "ordinary"] = got;
    assert.equal(got, catchBounty(sp, tier),
      `a ${tier ?? "ordinary"} catch of ${sp.name} paid ¥${got}, not the ` +
      `¥${catchBounty(sp, tier)} catchBounty says - computed but not wired`);
    until(e, (s) => !s.encounter, "the encounter to close", 4000);
  }

  assert.equal(paid.ordinary, 0, "an ordinary catch paid a variant bounty");
  assert.ok(paid.showdown > 0, "the rarest tier in the game paid nothing");
  console.log(`bounty ok — an ordinary catch pays ¥0 and a showdown pays ` +
    `¥${paid.showdown}, both through a real throw`);
}

/* TWO PRESSES THAT CANNOT BE TAKEN BACK HAVE TO ASK, AND ONLY THE ENGINE CAN
   BE ASKED WHETHER THEY DO.

   `throwBall` and `flee` are reached from eight call sites across `App.jsx`,
   `Pad.jsx` and three panels, and this repo has already shipped the failure
   where a rule lived at one of two call sites and not the other. The gate is
   in the ENGINE for that reason, so what is worth testing is the ENGINE: that
   the press does not go through, that the question names the right thing, that
   NO is free and YES is what spends.

   Both directions on both gates, because a confirmation that cannot be
   declined is a click tax, and one that spends the item anyway is worse than
   none at all. */
{
  const { isLegendary, LEGENDARY, dexIndex } = await import("../src/game/biomes.js");
  const { GUARANTEED } = await import("../src/catch.js");
  const { ballById } = await import("../src/game/items.js");
  const { e } = boot(SAVE);

  const fresh = () => {
    const enc = e.state.encounter ?? walkToEncounter(e);
    assert.ok(enc, "walked a whole map and met nothing");
    if (enc.phase !== "idle")
      until(e, (s) => !s.encounter || s.encounter.phase === "idle", "back to idle");
    return e.state.encounter;
  };

  // --- the Master Ball, on an ordinary encounter, both answers.
  {
    const enc = fresh();
    enc.speciesId = 19;                       // a Rattata: nothing legendary here
    e.state.bag["master-ball"] = 2;
    const held = e.state.bag["master-ball"];

    e.throwBall("master-ball");
    assert.equal(e.state.ask?.kind, "master", "the Master Ball did not ask");
    assert.equal(e.state.bag["master-ball"], held,
      "asking already spent the ball - the question has to come BEFORE the cost");
    assert.equal(e.state.encounter.phase, "idle", "asking started the throw anyway");

    e.answerAsk(false);
    assert.equal(e.state.ask, null, "NO left the question up");
    assert.equal(e.state.bag["master-ball"], held, "NO spent the ball anyway");
    assert.equal(e.state.encounter.phase, "idle", "NO threw it anyway");

    e.throwBall("master-ball");
    e.answerAsk(true);
    assert.equal(e.state.bag["master-ball"], held - 1, "YES did not spend the ball");
    assert.notEqual(e.state.encounter?.phase, "idle", "YES did not throw it");
    until(e, (s) => !s.encounter, "the encounter to close", 4000);
  }

  // --- and an ORDINARY ball is not gated, or the dialog is a click tax.
  {
    const enc = fresh();
    e.state.bag["poke-ball"] = 5;
    const held = e.state.bag["poke-ball"];
    e.throwBall("poke-ball");
    assert.equal(e.state.ask, null, "a Poke Ball asked - only a ball that cannot fail may");
    assert.equal(e.state.bag["poke-ball"], held - 1, "the plain throw did not happen");
    /* A plain throw can BREAK FREE and hand the encounter back at "idle", so
       waiting for it to close is a wait that never ends. Resolve, then leave
       by the ungated door - this one is a Rattata. */
    until(e, (s) => !s.encounter || s.encounter.phase === "idle", "the throw to resolve");
    if (e.state.encounter) {
      e.state.encounter.speciesId = 19;
      e.state.encounter.alpha = false;     // an alpha asks too (1 in 250)
      e.flee();
      until(e, (s) => !s.encounter, "the encounter to close", 4000);
    }
  }

  // --- running from a legendary, both answers; and running from anything else.
  {
    const enc = fresh();
    const legend = LEGENDARY[0];
    assert.ok(isLegendary(legend), "LEGENDARY[0] is not legendary");
    enc.speciesId = legend;
    e.flee();
    assert.equal(e.state.ask?.kind, "flee", "running from a legendary did not ask");
    assert.equal(e.state.encounter.phase, "idle", "asking ran anyway");
    e.answerAsk(false);
    assert.equal(e.state.encounter.phase, "idle", "NO ran anyway");
    e.flee();
    e.answerAsk(true);
    assert.equal(e.state.encounter.phase, "ran", "YES did not run");
    until(e, (s) => !s.encounter, "the encounter to close", 4000);
  }
  {
    const enc = fresh();
    enc.speciesId = 19;
    enc.alpha = false;                     // a plain one: an alpha asks too
    e.flee();
    assert.equal(e.state.ask, null, "running from a Rattata asked");
    assert.equal(e.state.encounter.phase, "ran", "the plain run did not happen");
    until(e, (s) => !s.encounter, "the encounter to close", 4000);
  }

  /* AND A QUESTION ABOUT AN ENCOUNTER DIES WITH IT. The frame loop runs under
     an open dialog, so the Pokemon can leave while the question is up - and a
     YES answered into nothing would be a dialog that lies about what it did.
     `throwBall` re-runs every guard it has, so the worst case is already a
     no-op; this pins the tidier half, that the question is not still sitting
     on `state` afterwards. */
  {
    const enc = fresh();
    enc.speciesId = LEGENDARY[0];
    e.flee();
    assert.ok(e.state.ask, "no question to strand");
    e.answerAsk(true);
    until(e, (s) => !s.encounter, "the encounter to close", 4000);
    assert.equal(e.state.ask, null, "the question outlived the encounter");
  }

  // And it is never written to disk - it is a question about this moment.
  {
    e.setChar(e.state.char === "red" ? "leaf" : "red");
    await new Promise((r) => setTimeout(r, 600));
    const raw = store.get("meadow-route");
    assert.ok(raw && !JSON.parse(raw).ask, "`ask` was saved - it is not save state");
  }

  console.log("confirm gates ok — the Master Ball and a legendary RUN both ask, " +
    "NO costs nothing, YES spends, and the question dies with the encounter");
}

/* WALKING PAYS A WAGE, AND THE WHOLE POINT OF IT IS THAT IT NEEDS NO CATCH.

   Asked for as *"having no pokeballs at all because you have no money to buy
   it is very possible"* - so this is the floor under the economy, and a floor
   that is computed and not wired is worse than none, because the shop still
   charges. `stepReward` is pure and check.mjs pins its shape; the money is
   added in `onArrive`, which nothing outside the engine can see.

   **THE STEPS ARE SET, NOT WALKED**, which is the one thing this file says
   twice: every step is a 7% chance of an encounter and an encounter stops the
   leg, so walking 250 tiles to provoke a parcel is a coin toss with a
   near-certain loss. The parcel boundary is what is being tested, not the
   walking - so `state.steps` is put one short and ONE real step is taken. */
{
  const { stepReward, STEP_PARCEL } = await import("../src/game/items.js");
  const { levelFromXp } = await import("../src/game/biomes.js");
  const { e } = boot(SAVE);
  const level = levelFromXp(e.state.xp);
  const due = stepReward(STEP_PARCEL, level);
  assert.ok(due?.money > 0, `a parcel pays no cash at Lv ${level}`);

  e.state.steps = STEP_PARCEL - 1;
  const before = e.state.money;
  const bag = { ...e.state.bag };

  /* One step, in whichever direction actually moves. An encounter may start
     on the arrival; the parcel is paid in the same `onArrive` either way. */
  for (const dir of ["down", "up", "left", "right"]) {
    e.press(dir);
    for (let i = 0; i < 40 && e.state.steps < STEP_PARCEL; i++) tick(16);
    e.clearHeld();
    if (e.state.steps >= STEP_PARCEL) break;
  }
  assert.equal(e.state.steps, STEP_PARCEL,
    `the trainer would not take one step (steps ${e.state.steps})`);

  assert.equal(e.state.money - before, due.money,
    `crossing a parcel paid ¥${e.state.money - before}, not the ¥${due.money} ` +
    "stepReward says - the wage is computed but not wired to the money");
  assert.ok(Object.entries(due.items).some(([id, n]) => (e.state.bag[id] ?? 0) >= (bag[id] ?? 0) + n),
    "the parcel's balls did not arrive either - give() and the wage disagree");
  console.log(`wage ok — crossing step ${STEP_PARCEL} paid ¥${due.money} ` +
    `and its balls, through a real step`);
}

/* A BERRY MUST NOT BREAK THE THROW. Each of the three touches a different roll
   and any of them could throw inside the frame loop; the suite in check.mjs
   proves the arithmetic, and this proves the machine survives it. */
{
  for (const berry of ["razz-berry", "nanab-berry", "pinap-berry"]) {
    const { e } = boot(SAVE);
    assert.ok(walkToEncounter(e), `met nothing while testing ${berry}`);
    assert.equal(e.useBerry(berry), true, `${berry} refused to be fed`);
    const eff = berryById(berry).effect;
    assert.equal(e.state.encounter.berries?.[eff]?.id, berry,
      `${berry} did not land in its own effect slot`);
    assert.equal(e.state.encounter.berries[eff].stage, 1,
      `${berry} landed at the wrong depth`);
    /* FEEDING THE SAME ONE AGAIN either deepens it or is refused outright, and
       which of the two is a fact about the berry - never "spent and ignored". */
    const cap = berryById(berry).stages;
    const again = e.useBerry(berry);
    if (cap > 1) {
      assert.equal(again, true, `a second ${berry} was refused below its cap`);
      assert.equal(e.state.encounter.berries[eff].stage, 2,
        `a second ${berry} did not deepen it`);
    } else {
      assert.equal(again, false, `a second ${berry} was eaten for nothing`);
    }
    e.throwBall("poke-ball");
    until(e, (s) => !s.encounter || s.encounter.phase !== "throw", `the throw after ${berry}`);
  }
  console.log("berries ok — all three survive a real throw in the frame loop");
}

/* A FIELD ITEM MUST NOT BREAK THE WALK. The step loop decrements these every
   tile, which is the most-run line of code the whole feature added. */
{
  const { e } = boot(SAVE);
  assert.equal(e.useField("repel"), true, "a repel refused to start");
  const left = () => e.state.field.repel?.steps ?? 0;
  const start = left();
  assert.ok(start > 0, "a repel started with no steps on it");
  for (let i = 0; i < 400 && left() > 0; i++) { e.press("right"); tick(16); }
  e.clearHeld();
  assert.ok(left() < start, `a repel ran ${start} -> ${left()} steps - it is not counting down`);
  /* AND THE WORLD'S CLOCK MOVES WITH THE WALK. It is derived from the step
     counter, so this is really asserting that the counter itself advances -
     which nothing else here does directly. */
  assert.ok(e.state.steps > SAVE.steps, "walking did not advance the step counter");
  assert.ok(PHASES.some((p) => p.id === phaseAt(e.state.steps).id),
    "the clock landed outside every phase");
  assert.equal(e.useField("honey"), true, "a honey refused to start");
  assert.equal(e.state.field.variant.id, "honey", "the honey did not land in its family slot");
  const honeyLeft = e.state.field.variant.steps;
  assert.equal(e.useField("honey-shiny"), true, "a shiny honey refused to start");
  assert.equal(e.state.field.variant.id, "honey-shiny",
    "a second honey did not take the slot - two variant tilts can run at once");
  /* AND IT STACKS (asked for, 2026-10-03): the first honey's steps carry over
     onto the second, and the ring drains against the whole stack. */
  const { fieldById } = await import("../src/game/items.js");
  const stacked = honeyLeft + fieldById("honey-shiny").steps;
  assert.equal(e.state.field.variant.steps, stacked, "a second honey did not add its steps to the first's");
  assert.equal(e.state.field.variant.total, stacked, "the stack's length is not what its ring reads");
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(boot(JSON.parse(store.get("meadow-route"))).e.state.field.variant.total, stacked, "a stack's length did not survive a reload");
  /* A REPEL IS EXCLUSIVE, because it is total: it stops every encounter, so a
     honey burning its 600 steps underneath one is buying odds on encounters
     that cannot happen. Starting the honey therefore cancelled the repel. */
  assert.equal(e.state.field.repel, null,
    "a honey left the repel running - it would burn its steps on nothing");

  /* BUT RARITY AND VARIANT STACK, and that is the point of owning both. The
     flute moves WHICH SPECIES and a honey moves WHICH TIER - different levers
     by construction - so "a rarer species, and a better chance it is a variant"
     is coherent, and blocking it made the two dearest items in the shop
     mutually exclusive for no reason a player could act on. */
  assert.equal(e.useField("white-flute"), true, "a flute refused to start");
  assert.equal(e.state.field.rarity.id, "white-flute", "the flute did not land in its slot");
  assert.ok(e.state.field.variant,
    "the flute cancelled the honey - these two move different levers and must stack");

  // And a repel started on top of both still clears them, in that direction too.
  assert.equal(e.useField("repel"), true, "a repel refused to start over the others");
  assert.equal(e.state.field.variant, null, "a repel left a honey running underneath it");
  assert.equal(e.state.field.rarity, null, "a repel left a flute running underneath it");
  /* AND IT SAYS SO WHEN IT RUNS OUT. The only event in the game with no tell
     of its own: the card in the corner stops being there, which is what
     nothing happening also looks like. Driven through the real step handler,
     because the announcement lives in the same three lines as the countdown
     and a unit test of either would miss the other.

     Walking is legitimate here - the walking IS the subject - and a REPEL is
     the one effect that can be walked out safely, because it stops every
     encounter so nothing can interrupt the leg. The steps are cut to one
     first: 400 real tiles is not a test, it is a benchmark.

     ONE ENGINE FOR THE WHOLE BLOCK. `boot()` does `raf.length = 0`, so
     standing a second engine up midway through silently kills the first one -
     its pending frame is dropped and it never asks for another. It looked
     exactly like the trainer refusing to walk, down to the direction not even
     changing, and it was this test rather than the engine. */
  {
    const f = boot(SAVE).e;
    assert.equal(f.useField("repel"), true, "a repel refused to start");
    assert.deepEqual(f.state.worn, [], "something wore off before anything ran");
    f.state.field.repel.steps = 1;
    for (let i = 0; i < 60 && !f.state.worn.length; i++) { f.press("right"); tick(16); }
    f.clearHeld();
    assert.equal(f.state.field.repel, null, "the repel did not actually run out");
    assert.equal(f.state.worn.length, 1,
      "a field effect ran out and said nothing - there is no way to notice it");
    assert.equal(f.state.worn[0].id, "repel", "the notice named the wrong item");

    /* IT IS NOT A CHEER. A cheer holds the screen for three seconds with
       sparks on it, and an effect ending is news rather than an occasion - if
       this ever starts queueing there, the walk is interrupted every 400
       steps by a celebration of something running out. */
    assert.equal(f.state.cheers.length, 0, "wearing off queued a celebration");

    /* The notice clears, and the id is what a panel keys its timer on: two of
       the same item wearing out have to be two notices, or the second card
       inherits the tail of the first one's clock and vanishes early. */
    const n = f.state.worn[0].n;
    f.dropWorn();
    assert.deepEqual(f.state.worn, [], "dropWorn left the notice up");

    /* AND AN ENCOUNTER CAN START ON THE VERY STEP A REPEL RUNS OUT. The slot
       is emptied at the top of `onArrive` and the encounter is rolled further
       down the SAME function, so the step the repel dies on is the first
       unprotected one in the game. */
    if (f.state.encounter) {
      f.flee(true);           // leaving, whatever it is - an alpha would ask
      for (let i = 0; i < 300 && f.state.encounter; i++) tick(16);
    }
    assert.equal(f.state.encounter, null, "could not get back out onto the map");

    assert.equal(f.useField("repel"), true, "the save ran out of repels");
    f.state.field.repel.steps = 1;
    // Back the way we came: a leg that never moves never reaches `onArrive`.
    for (let i = 0; i < 60 && !f.state.worn.length; i++) { f.press("left"); tick(16); }
    f.clearHeld();
    assert.ok(f.state.worn[0]?.n > n,
      "a second expiry reused the first one's id - its card cannot restart");
  }

  /* CANCELLING IS NOT EXPIRING. Starting a repel clears any honey under it,
     and telling somebody their honey wore off when they replaced it
     themselves is worse than saying nothing at all. Its own engine, last,
     for the rAF reason above. */
  {
    const g = boot(SAVE).e;
    g.useField("honey");
    g.useField("repel");
    assert.equal(g.state.field.variant, null, "the repel did not cancel the honey");
    assert.deepEqual(g.state.worn, [],
      "cancelling an effect announced it as having worn off");
  }

  console.log("field ok — counts down while walking, says so when it runs out; " +
    "rarity and variant stack, repel is exclusive");
}

/* A PRE-HOENN SAVE, THROUGH THE REAL LOADER. check.mjs proves the remap
   arithmetic; only this proves `loadState` actually calls it - and getting that
   wrong turns somebody's Sinnoh collection into somebody else's, silently, with
   no error anywhere to notice. */
{
  const { layoutIds, dexIndex: at, speciesById: by } =
    await import("../src/game/biomes.js");
  const ids = layoutIds(358);
  const dex = new Array(358).fill(0);
  const shiny = new Array(358).fill(0);
  for (const id of [25, 151, 251, 387, 448, 493]) dex[ids.indexOf(id)] = 2;
  shiny[ids.indexOf(387)] = 1;                 // a shiny Turtwig, the real test

  const { e } = boot({ ...SAVE, dex, shiny, box: [], caught: 6 });
  for (const [id, want] of [[25, 2], [151, 2], [251, 2], [387, 2], [448, 2], [493, 2]]) {
    assert.equal(e.state.dex[at(id)], want,
      `#${id} (${by(id).name}) loaded as ${e.state.dex[at(id)]}, not ${want}`);
  }
  assert.equal(e.state.shiny[at(387)], 1, "the shiny Turtwig did not survive the move");
  const hoenn = [252, 300, 386];
  for (const id of hoenn) {
    assert.equal(e.state.dex[at(id)], 0,
      `#${id} (${by(id).name}) came back registered in a save written before Hoenn`);
  }
  assert.equal(e.state.dex.length, (await import("../src/data/dex.js")).SPECIES.length,
    "the loaded dex is not the current size");
  console.log(`save ok — a 358-entry save loads onto ${e.state.dex.length} entries, ` +
    "Sinnoh and its shinies intact, Hoenn empty");
}

/* A SAVE THAT CANNOT BE READ MUST SURVIVE THE SESSION THAT COULD NOT READ IT.
   `loadState` falls back to a fresh state, which is right; what was wrong is
   that the first step then wrote that fresh state straight over the file. One
   bad parse and a real collection was gone, with nothing to recover from. */
{
  const { recoverable } = await import("../src/game/engine.js");
  // One wait, named once: the debounce is 400ms and a margin on top of it.
  const saved = () => new Promise((r) => setTimeout(r, 600));
  const MANGLED = '{"dex":[2,2,2],"box":[{"uid":1,"species":25,"level":30}],'
    + '"money":9999,"caught":42,"nextUid":2,';        // truncated - unparseable
  store.clear();
  store.set("meadow-route", MANGLED);
  raf.length = 0;
  const e = createEngine(canvas(), () => {}, canvas());

  // Play a while - this is what used to destroy it.
  for (let i = 0; i < 300; i++) { e.press("right"); tick(16); }
  e.clearHeld();
  for (let i = 0; i < 60; i++) tick(16);
  /* `save()` is debounced on a REAL timer (400ms), and `tick` only moves the
     fake clock the frame loop reads - so this has to wait on the wall clock,
     longer than the debounce, or the write never happens and the test proves
     nothing. It has to be the real write that fails to destroy the file. */
  await saved();

  assert.notEqual(store.get("meadow-route"), MANGLED,
    "the session never saved at all - this test is not exercising the overwrite");
  assert.equal(store.get("meadow-route.broken"), MANGLED,
    "the unreadable save was not kept - this is the bug that cost a collection");
  const got = recoverable();
  assert.ok(got.broken?.unreadable, "recoverable() cannot see the broken save");

  /* AND A GOOD SAVE IS BACKED UP AT LOAD TIME, so the backup is a whole
     previous session rather than a copy of whatever just went wrong. */
  store.clear();
  const good = JSON.stringify({ ...SAVE, caught: 77, money: 4242 });
  store.set("meadow-route", good);
  raf.length = 0;
  const e2 = createEngine(canvas(), () => {}, canvas());
  assert.equal(store.get("meadow-route.backup"), good,
    "a clean load left no backup behind");
  for (let i = 0; i < 200; i++) { e2.press("down"); tick(16); }
  e2.clearHeld();
  for (let i = 0; i < 60; i++) tick(16);
  await saved();
  assert.notEqual(store.get("meadow-route"), good, "the session never saved");
  assert.equal(store.get("meadow-route.backup"), good,
    "the backup was overwritten by the session that followed it");
  assert.equal(recoverable().backup.caught, 77, "the backup does not read back");
  console.log("save guard ok — an unreadable save is kept, and a good one is " +
    "backed up at load time and not touched again");
}

/* A BULK ACTION MUST NOT TAKE A KEEPER, EVEN IF IT IS HANDED ONE.

   `duplicateUids` already refuses to put a variant on the spare list, and that
   was the whole protection - a rule in one of two places, which this codebase
   has already watched fail once when the Box built a SECOND list that offered a
   Lv 2 shiny as the single thing to sell. Driven through the real engine with
   the uids passed in DELIBERATELY, which is the case the caller-side filter
   cannot cover. */
{
  store.clear();
  store.set("meadow-route", JSON.stringify({
    ...SAVE,
    box: [
      { uid: 1, species: 19, level: 5 },                  // ordinary Rattata
      { uid: 2, species: 19, level: 5, shiny: 1 },        // and a shiny one
      { uid: 3, species: 19, level: 5, astral: 1 },
    ],
    nextUid: 4,
  }));
  raf.length = 0;
  const e = createEngine(canvas(), () => {}, canvas());

  const earned = e.sell([1, 2, 3]);                       // every uid, on purpose
  const left = e.state.box.map((m) => m.uid).sort();
  assert.deepEqual(left, [2, 3],
    `sell() took a keeper: box holds ${JSON.stringify(left)}, expected the shiny ` +
    "and the Astral to survive being named directly");
  assert.ok(earned > 0, "the ordinary one should still have sold");

  const got = e.convert([2, 3]);
  assert.equal(got, 0, "convert() paid candy for keepers");
  assert.equal(e.state.box.length, 2, "convert() ate a keeper");
  console.log("keeper guard ok — sell and convert refuse a variant handed to them directly");
}

/* COACH PAYS THROUGH THE ENGINE, and the Box quotes the same sum: `convert`
   rounds the batch once, as the Box's `candyAt` does. Two Rattata, because
   per Pokemon a common's 1 candy rounded the bonus away entirely. */
{
  const { candyValue } = await import("../src/game/items.js");
  const { candyAt } = await import("../src/game/trainer.js");
  const { speciesById, LEVEL_XP } = await import("../src/game/biomes.js");
  store.clear();
  store.set("meadow-route", JSON.stringify({
    ...SAVE,
    xp: LEVEL_XP[40],
    stats: { coach: 20 },
    box: [{ uid: 1, species: 19, level: 5 }, { uid: 2, species: 19, level: 5 }],
    nextUid: 3,
  }));
  raf.length = 0;
  const e = createEngine(canvas(), () => {}, canvas());
  const base = candyValue(speciesById(19));
  const candy0 = e.state.candy;
  const got = e.convert([1, 2]);
  assert.equal(got, candyAt(2 * base, e.state.stats), "convert() did not pay what the Box quotes");
  assert.ok(got > 2 * base, `Coach 20 paid ${got} candy for two Rattata, no more than ${2 * base}`);
  assert.equal(e.state.candy, candy0 + got, "the candy paid never reached the bag");
  console.log(`coach ok — two Rattata convert to ${got} candy at Coach 20, ${2 * base} without`);
}

/* AN EVOLUTION IS NOT A CATCH. `state.caught` renders in the top bar under the
   word CAUGHT and means throws that landed; `evolve` incremented it anyway, and
   unconditionally, so re-evolving a species already owned counted too. */
{
  store.clear();
  store.set("meadow-route", JSON.stringify({
    ...SAVE,
    // Caterpie at Lv 20, well past its Lv 7 evolution.
    box: [{ uid: 1, species: 10, level: 20 }],
    nextUid: 2,
    caught: 7,
  }));
  raf.length = 0;
  const e = createEngine(canvas(), () => {}, canvas());
  const before = e.state.caught;
  const dexBefore = e.state.dex.filter((v) => v === 2).length;
  const out = e.evolve(1, 11);                            // Caterpie -> Metapod
  assert.ok(out, "the evolution did not run - this test is asserting nothing");
  assert.equal(e.state.caught, before,
    `evolving moved the CAUGHT counter ${before} -> ${e.state.caught}`);
  assert.ok(e.state.dex.filter((v) => v === 2).length > dexBefore,
    "evolving must still register the species in the dex");
  // Research credits the species evolved FROM: evolving a Caterpie is Caterpie research.
  assert.equal(e.state.research[10]?.[7], 1, "evolving did not count towards the research it evolved from");
  // AND WHAT IT BECAME: an ordinary Caterpie evolved is an ordinary Metapod owned.
  assert.equal(e.state.research[11]?.[0], 1, "evolving into a species did not count towards its research");
  console.log("caught counter ok — an evolution fills a dex slot without counting as a catch");
}

/* A SAVE THAT STOPS WORKING MUST SAY SO. `save()` swallowed every write error
   under a comment naming only private mode, so a full quota meant an hour of
   catching went nowhere with nothing on screen to say it had. */
{
  store.clear();
  store.set("meadow-route", JSON.stringify({ ...SAVE, money: 4242 }));
  raf.length = 0;
  const e = createEngine(canvas(), () => {}, canvas());
  assert.ok(!e.state.stale, "a healthy session must not warn");

  /* SAVE THROUGH A DIRECT MUTATION, NOT BY WALKING. The first version walked
     60 frames to make `onArrive` call `save()` and was flaky half the time:
     every step has a 7% chance of starting an encounter, an encounter stops
     movement, and a leg that never moves never saves - so the flag under test
     simply never changed. Anything that walks is a coin toss unless the
     encounter is what is being tested. `buyCandy` saves unconditionally. */
  const flush = () => new Promise((r) => setTimeout(r, 600));  // past the 400ms debounce

  writeFails = Object.assign(new Error("quota"), { name: "QuotaExceededError" });
  assert.ok(e.buyCandy(1), "the buy did not happen - this test is asserting nothing");
  await flush();
  assert.equal(e.state.stale, "full",
    `a failed write left stale=${JSON.stringify(e.state.stale)} - the player is ` +
    "not being told the game has stopped saving");

  // And it clears itself when writes start working again.
  writeFails = null;
  assert.ok(e.buyCandy(1), "the second buy did not happen");
  await flush();
  assert.ok(!e.state.stale, "the warning latched after saving recovered");

  /* The flag is SESSION state and must never reach the file - a saved warning
     would come back on every load and could not be cleared. */
  assert.ok(!("stale" in JSON.parse(store.get("meadow-route"))),
    "the stale flag was written into the save");
  console.log("save warning ok — a failed write is surfaced, clears on recovery, never persisted");
}

/* EVERY BUTTON ON THE TOUCH PAD MUST CALL SOMETHING THAT EXISTS.

   `Pad.jsx` renders only under `(hover: none) and (pointer: coarse)`, so a
   mistyped engine method is invisible on every machine this is developed on and
   is a dead button on the one device it ships to. Nothing else in the suite can
   see it: the pad adds no action of its own, it only re-dials the keyboard's,
   so checking the names against a LIVE engine is the whole test. */
{
  const src = readFileSync(new URL("../src/ui/Pad.jsx", import.meta.url), "utf8");
  const called = [...src.matchAll(/engine\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
  assert.ok(called.length >= 6,
    `only found ${called.length} engine calls in Pad.jsx - the scan is not working`);

  store.clear();
  raf.length = 0;
  const e = createEngine(canvas(), () => {}, canvas());
  const missing = [...new Set(called)].filter((fn) => typeof e[fn] !== "function");
  assert.equal(missing.length, 0,
    `Pad.jsx calls engine.${missing.join("(), engine.")}() which the engine does ` +
    "not have - a dead button on touch devices only");

  /* And it must stay touch-gated. A width query here would put a d-pad on a
     narrow desktop window, where it is useless, and hide it on a landscape
     tablet, where it is the only control there is. */
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const gate = "@media (hover: none) and (pointer: coarse) {";
  assert.ok(css.includes(gate), "the touch pad's media gate is gone");
  assert.ok(css.slice(css.indexOf(gate)).includes(".pad {"),
    "the touch pad is no longer gated on a coarse pointer");
  /* THE HOLD FLAG MUST OUTLIVE A RENDER. Tapping A throws and holding it opens
     the ball picker, and the two are told apart by a flag set in a timer. The
     engine calls `changed()` freely - a step lands, an animation ticks - so the
     component re-renders between the pointer going down and coming up. Closing
     over two locals meant the release read a FRESH `taken === false` and threw
     a ball behind the picker it had just opened: two actions from one press, on
     the one control in the game that spends an item.

     Asserted on the source because there is no DOM here to press. The shape is
     the rule - the flag lives in a ref that is passed in, not in the closure. */
  assert.ok(/function tapOrHold\(ref,/.test(src),
    "the tap-or-hold handler no longer takes its state from outside itself");
  assert.ok(/ref\.current\.taken/.test(src),
    "the hold flag is a local again - a re-render mid-press will throw a ball behind the picker");
  assert.ok(/const held = useRef\(/.test(src), "Pad has no ref to keep the press in");
  /* And the hook has to run every time. `Pad` returns early when there is no
     engine yet, and a hook after that return is a hook that sometimes does not
     happen - which React answers by throwing the whole app away. */
  assert.ok(src.indexOf("useRef(") < src.indexOf("if (!engine) return null;"),
    "the ref is declared after Pad's early return - that is a conditional hook");

  /* EXACTLY ONE OF THE TWO INVENTORIES IS ON SCREEN. The rail down the left
     edge is the desktop one and the sheet off the bottom is the touch one, and
     they are opposites on purpose: both at once is two bags disagreeing, and
     neither is a phone with no way to reach a berry. Gated on the POINTER and
     never on width, the rule `.pad` already follows. */
  /* ASKED OF THE RULE, NOT OF THE DISTANCE. This used to slice 900 characters
     after `.ballwrap {` and look for the media query inside them - which is a
     magic distance, and it broke the day `.ballwrap` grew a sibling rule with
     a comment on it. The gate was still there and still correct; the window
     was what was wrong. It reads every coarse-pointer block now and asks
     whether any of them hides the rail, which is the thing actually meant. */
  const coarse = [...css.matchAll(/@media \(hover: none\) and \(pointer: coarse\)\s*\{/g)]
    .map((m) => {
      let depth = 0, i = m.index + m[0].length - 1;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) break;
      }
      return css.slice(m.index, i);
    });
  assert.ok(coarse.some((b) => /\.ballwrap\s*\{[^}]*display:\s*none/.test(b)),
    "the ball rail is no longer hidden on touch - it will sit on top of the map");
  assert.ok(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.bagsheet \{ display: none/.test(css),
    "the touch bag sheet is no longer hidden on a desktop");

  /* AND THE A BUTTON IS THE PRIMARY ACTION, so it has to look like one. It did
     not: `.pad button` is a class AND a type, `.pad-a` was one class, so the
     base rule won and the throw button wore the DISABLED fill from the day the
     pad was written. Nothing failed and no rule was missing - it took reading
     the computed background off a real render to see it. The extra type is
     load-bearing, so it is what this asserts. */
  assert.ok(/\.pad button\.pad-a \{/.test(css),
    "the A button's fill no longer out-specifies `.pad button` - it will render as disabled");

  console.log(`pad ok — ${new Set(called).size} engine calls, the hold survives a render, ` +
    "and one bag per pointer");
}

/* A 493-ENTRY SAVE IS WHAT EVERY CURRENT PLAYER HOLDS, and the dex just went to
   1145. Appending cannot move a position, so `padDex` is the right answer and
   `remap` correctly declines - but "cannot" is the kind of claim that wants a
   real save driven through the real loader rather than an argument. */
{
  const { SPECIES } = await import("../src/data/dex.js");
  const { dexIndex, speciesById } = await import("../src/game/biomes.js");
  const NOW = SPECIES.length;

  const dex = new Array(493).fill(0);
  const shiny = new Array(493).fill(0);
  // Position and id agree below Hoenn, and these are the edges that matter:
  // the first, the last of the old dex, and one either side of a boundary.
  const held = [1, 25, 151, 251, 386, 387, 493];
  for (const id of held) dex[id - 1] = 2;
  shiny[492] = 1;                                   // a shiny Arceus, at the very end
  store.clear();
  store.set("meadow-route", JSON.stringify({
    ...SAVE, dex, shiny, caught: held.length, box: [], nextUid: 1,
  }));
  raf.length = 0;
  const e = createEngine(canvas(), () => {}, canvas());

  assert.equal(e.state.dex.length, NOW, `a 493 save loaded onto ${e.state.dex.length}, not ${NOW}`);
  for (const id of held) {
    assert.equal(e.state.dex[dexIndex(id)], 2,
      `#${id} (${speciesById(id).name}) was lost when the dex grew to ${NOW}`);
  }
  assert.equal(e.state.shiny[dexIndex(493)], 1, "the shiny Arceus did not survive");
  // And nothing new came back pre-registered.
  const fresh = [494, 800, 1025].filter((id) => e.state.dex[dexIndex(id)] !== 0);
  assert.deepEqual(fresh, [], `new species arrived already caught: ${fresh}`);
  const forms = SPECIES.filter((sp) => sp.id >= 10000)
    .filter((sp) => e.state.dex[dexIndex(sp.id)] !== 0);
  assert.equal(forms.length, 0, `${forms.length} forms arrived already registered`);
  console.log(`save growth ok — a 493-entry save pads onto ${NOW} with every ` +
    "position still meaning what it meant");
}

/* A FORM IS A HUNDRED LEVELS AND A CHOICE, driven through the real engine.

   Mega, Primal and Gigantamax needed no new evolution machinery - `evoLevel`
   already honours a row's own `level` and `evolveState` already gates on the
   Pokemon's - so what is worth asserting is that the whole path actually runs:
   refused under 100, offered as a BRANCH at 100, permanent once taken, and the
   dex slot filled. */
{
  const { EVOLUTIONS } = await import("../src/data/evolutions.js");
  const { evolutionsOf, evoLevel } = await import("../src/game/items.js");
  const { speciesById, dexIndex, isForm } = await import("../src/game/biomes.js")
    .then(async (b) => ({ ...b, isForm: (await import("../src/data/dex.js")).isForm }));

  // Charizard: the one species with three forms, so the branch is real.
  const CHARIZARD = 6;
  const forms = evolutionsOf(CHARIZARD).filter((r) => isForm(r.to));
  assert.ok(forms.length >= 2,
    `Charizard offers ${forms.length} forms - this test needs a branch to be a test`);
  for (const r of forms) {
    assert.equal(evoLevel(r), 100, `${speciesById(r.to).name} is not a Lv 100 evolution`);
  }

  const boot99 = (level) => {
    store.clear();
    store.set("meadow-route", JSON.stringify({
      ...SAVE, box: [{ uid: 1, species: CHARIZARD, level }], nextUid: 2, candy: 0,
    }));
    raf.length = 0;
    return createEngine(canvas(), () => {}, canvas());
  };

  // Ninety-nine is not a hundred.
  const e99 = boot99(99);
  assert.equal(e99.evolve(1, forms[0].to), null,
    "a form evolved at Lv 99 - the hundred is the whole price");
  assert.equal(e99.state.box[0].species, CHARIZARD, "the Pokemon changed anyway");

  // A hundred is.
  const e = boot99(100);
  const target = forms[0].to;
  assert.ok(e.evolve(1, target), `evolving into ${speciesById(target).name} was refused at Lv 100`);
  const mon = e.state.box[0];
  assert.equal(mon.species, target, "the box entry did not become the form");
  assert.equal(mon.uid, 1, "the uid did not survive - a form is the same Pokemon");
  assert.equal(e.state.dex[dexIndex(target)], 2, "the form did not register in the dex");

  /* AND IT IS PERMANENT AND EXCLUSIVE. The other branch is gone, because the
     Pokemon is no longer a Charizard - which is what "choose one" means here
     and is the same shape Slowpoke's branch already had. */
  assert.equal(e.evolve(1, forms[1].to), null,
    "the second form was still reachable after taking the first");
  console.log(`form evolution ok — ${speciesById(CHARIZARD).name} offers ` +
    `${forms.length} forms at Lv 100, refuses at 99, and keeps its uid`);
}

/* WHICH TRAINER YOU PLAY, through the real engine. The value indexes into the
   art - a character is a block of four rows in one strip - so an unknown one
   would draw four rows off the end of `player.png`, which is empty, and the
   trainer would simply vanish. Both the setter and the loader refuse it. */
{
  const { CHARS } = await import("../src/game/engine.js");
  assert.ok(CHARS.length >= 2, `only ${CHARS.length} trainer(s) - there is no choice to make`);

  store.clear();
  store.set("meadow-route", JSON.stringify({ ...SAVE }));   // written before the choice
  raf.length = 0;
  let e = createEngine(canvas(), () => {}, canvas());
  assert.equal(e.state.char, null,
    "a save from before the choice must be NULL, not a default - a default that " +
    "looks like an answer means the question can never be asked");

  assert.equal(e.setChar("leaf"), true, "picking the other trainer was refused");
  assert.equal(e.state.char, "leaf", "the choice did not stick");
  assert.equal(e.setChar("leaf"), false, "picking the one already chosen counted as a change");
  assert.equal(e.setChar("pikachu"), false, "an unknown trainer was accepted");
  assert.equal(e.state.char, "leaf", "a refused pick changed it anyway");

  // It survives a reload, and a corrupt one comes back as Red rather than blank.
  await new Promise((r) => setTimeout(r, 600));
  raf.length = 0;
  e = createEngine(canvas(), () => {}, canvas());
  assert.equal(e.state.char, "leaf", "the trainer did not survive a reload");

  store.set("meadow-route", JSON.stringify({ ...SAVE, char: "nobody" }));
  raf.length = 0;
  e = createEngine(canvas(), () => {}, canvas());
  assert.equal(e.state.char, null,
    "a save naming a trainer that does not exist loaded it anyway - that is four " +
    "rows off the end of the strip, and an invisible trainer");
  console.log(`trainer ok — ${CHARS.join("/")}, chosen, saved, and validated on load`);
}

/* A TIP ARRIVES ONCE AND NEVER AGAIN, driven through the real engine. The
   "once" is the entire feature - a hint you have already read is the one thing
   that makes the rest of them annoying - and it has to survive a reload, which
   is the only part a pure test of `nextHint` cannot show. */
{
  const { HINT_IDS, nextHint } = await import("../src/game/hints.js");

  // Pure first: at most one, ranked, and never one already shown.
  const both = nextHint({ kind: "encounter", variant: "holo" }, []);
  assert.equal(both.id, "throw", "the first encounter should teach the throw first");
  const rare = nextHint({ kind: "encounter", variant: "holo" }, ["throw"]);
  assert.equal(rare.id, "variant", "the rare form is not taught after the throw");
  assert.ok(rare.text.includes("HOLO"), `the tip does not name the tier: ${rare.text}`);
  assert.equal(nextHint({ kind: "encounter", variant: null }, HINT_IDS), null,
    "a hint came back after every id had been shown");

  /* THE BACKUP TIP IS SAID ONCE, AT A COLLECTION WORTH LOSING - and it has to
     be FED the count, because the engine's `caught` event carried only
     `duplicate` and a rule reading a field nobody sends never fires. */
  const { BACKUP_AT } = await import("../src/game/hints.js");
  assert.equal(nextHint({ kind: "caught", caught: BACKUP_AT - 1 }, ["duplicate"]), null,
    "the backup tip came before there was a collection worth keeping");
  assert.equal(nextHint({ kind: "caught", caught: BACKUP_AT }, ["duplicate"])?.id, "backup",
    "the backup tip never arrives");
  assert.ok(/caught: state\.caught/.test(
    readFileSync(new URL("../src/game/engine.js", import.meta.url), "utf8")),
    "the engine's caught event does not carry the count the backup tip reads");

  // Then through the engine, which is where "once ever" actually lives.
  store.clear();
  store.set("meadow-route", JSON.stringify({ ...SAVE, hints: [] }));
  raf.length = 0;
  let e = createEngine(canvas(), () => {}, canvas());
  assert.equal(e.state.hint, null, "a tip was showing before anything happened");

  /* NOT cleared here, deliberately. The direction stays held exactly as it
     would on a touch screen when the scrim swallows the `pointerup`, which is
     the case the assertion below exists for - releasing it first would test
     nothing. */
  for (let i = 0; i < 200 && !e.state.hint; i++) { e.press("right"); tick(16); }
  assert.ok(e.state.hint, "walking taught nothing at all");
  const first = e.state.hint.id;
  assert.ok(e.state.hints.includes(first), "the tip was shown without being banked");

  /* A TIP OPENS UNPROMPTED, so it can open mid-stride - and on a touch screen
     the dialog's scrim then takes the `pointerup` the d-pad was waiting for.
     The direction has to be dropped here or the trainer walks on behind it. */
  assert.equal(e.state.running, false, "a tip left the trainer running");
  const before = { ...e.state.player };
  for (let i = 0; i < 90; i++) tick(16);
  assert.deepEqual({ ...e.state.player }, before,
    "the trainer kept moving while a tip was up - the held direction was not dropped");

  e.clearHint();
  assert.equal(e.state.hint, null, "dismissing did not clear it");

  /* AND IT DOES NOT COME BACK. Banked on the save, so a reload is the real
     test - `hint` itself is screen state and must NOT be in the file, or a tip
     would be showing on every load with no way to get rid of it. */
  await new Promise((r) => setTimeout(r, 600));
  const raw = JSON.parse(store.get("meadow-route"));
  assert.ok(raw.hints.includes(first), "the banked tip did not reach the save");
  assert.ok(!("hint" in raw), "the live tip was written into the save");

  raf.length = 0;
  e = createEngine(canvas(), () => {}, canvas());
  assert.equal(e.state.hint, null, "a tip was showing again straight after a reload");
  for (let i = 0; i < 200; i++) { e.press("right"); tick(16); }
  e.clearHeld();
  assert.notEqual(e.state.hint?.id, first, `"${first}" was taught twice`);

  // A retired id in an old save cannot sit there blocking its own slot.
  store.set("meadow-route", JSON.stringify({ ...SAVE, hints: ["gone", first] }));
  raf.length = 0;
  e = createEngine(canvas(), () => {}, canvas());
  assert.deepEqual(e.state.hints, [first], "an unknown hint id survived a load");
  console.log(`hints ok — ${HINT_IDS.length} tips, one at a time, banked on sight ` +
    "and never repeated");
}

/* A FAILED UPLOAD IS KEPT, NOT DROPPED - the bug this exists for lost a whole
   session. `flush` cleared `pending` before awaiting the push, so a dropped
   request threw the payload away; the game only recovered because the next
   write repopulated it, which means stopping play right after a failed request
   lost that session from the account permanently.

   Driven through `flushNow`, which pushes immediately, so the property is
   asserted with no timers at all - the backoff schedule is a separate concern
   and not worth ten seconds of suite time to watch tick. */
{
  const { mirror, flushNow, onSyncTrouble } = await import("../src/game/store.js");
  let down = true;
  const seen = [];
  const push = async (raw) => {
    seen.push(JSON.parse(raw).steps);
    return down ? { ok: false, why: "offline" } : { ok: true };
  };
  const told = [];
  onSyncTrouble((why) => told.push(why));

  mirror(JSON.stringify({ steps: 10 }), push);
  const first = await flushNow(push);
  assert.equal(first.ok, false, "flushNow claimed a failed upload landed");
  assert.deepEqual(seen, [10], `the first attempt sent ${seen}`);

  // THE POINT: it is still queued, and it is the same save.
  down = false;
  const second = await flushNow(push);
  assert.equal(second.ok, true, "the retry did not land");
  assert.deepEqual(seen, [10, 10],
    `a failed upload was discarded instead of retried - attempts were ${seen}`);

  // And a newer save supersedes a failed one rather than queueing behind it.
  down = true;
  seen.length = 0;
  mirror(JSON.stringify({ steps: 20 }), push);
  await flushNow(push);
  mirror(JSON.stringify({ steps: 21 }), push);
  down = false;
  await flushNow(push);
  assert.equal(seen.at(-1), 21, `a newer save was not preferred: ${seen}`);

  // Nothing queued is not a failure.
  assert.equal((await flushNow(push)).ok, true, "an empty flush reported trouble");
  onSyncTrouble(null);
  console.log("sync ok — a failed upload is kept and retried, a newer one supersedes it");
}

/* THE LOGIN-TIME MERGE, DRIVEN. `settle` lived in Boot.jsx and needed a
   server, so for as long as it did this file could only grep its source - and
   every way it has lost a collection was found in play. It takes `pull` as an
   argument now, so a fake server is a one-line async function and every case
   below is the real function against the real localStorage stub. */
{
  const {
    settle, SAVE_KEY, OWNER_KEY, OTHER_KEY, CHOSEN_KEY, PARKED_KEY, scoped,
  } = await import("../src/game/store.js");
  const S = (steps, caught = 0, xp = 0) => JSON.stringify({ steps, caught, xp, dex: [] });
  const ok = (raw) => async () => ({ ok: true, raw });
  const down = async () => ({ ok: false });
  const given = (entries) => {
    store.clear();
    for (const [k, v] of Object.entries(entries)) store.set(k, v);
  };
  let got;

  // An UNOWNED cache - a guest's, or from before accounts - is never adopted.
  given({ [SAVE_KEY]: S(9000, 400) });
  got = await settle("A", ok(null));
  assert.equal(got.raw, null,
    "a new account was handed an UNOWNED cache - this is the production bug");
  assert.equal(store.get(SAVE_KEY), undefined,
    "the stranger's save is still in SAVE_KEY, where the engine will read it anyway");
  assert.equal(store.get(PARKED_KEY), S(9000, 400),
    "the guest's save was cleared without being parked - that was its only copy");
  assert.equal(store.get(OWNER_KEY), "A");

  // Another account's unsynced play is parked under its owner, and comes back.
  given({ [SAVE_KEY]: S(5000, 50), [OWNER_KEY]: "A" });
  got = await settle("B", ok(S(100)));
  assert.equal(got.raw, S(100), "B was handed A's save");
  assert.equal(store.get(scoped(PARKED_KEY, "A")), S(5000, 50),
    "logging in as B wrote straight over A's unsynced play");
  got = await settle("A", ok(S(4000, 40)));
  assert.equal(got.raw, S(5000, 50),
    "A's parked play is ahead of the account and was not picked up at A's next login");
  assert.equal(store.get(scoped(PARKED_KEY, "A")), undefined,
    "a parked save was merged and left behind to merge again");
  assert.equal(store.get(scoped(PARKED_KEY, "B")), S(100),
    "B's cache was not parked when A logged back in");

  // A failed read writes NOTHING, and never plays somebody else's SAVE_KEY.
  given({ [SAVE_KEY]: S(700), [OWNER_KEY]: "B", [scoped(PARKED_KEY, "A")]: S(5000) });
  const before = JSON.stringify([...store]);
  got = await settle("A", down);
  assert.deepEqual(got, { ok: false, raw: null },
    "a failed read played a parked save - the engine would have loaded B's dex as A");
  assert.equal(JSON.stringify([...store]), before, "a failed read wrote to localStorage");
  // ...but this account's OWN cache is played: offline play is a feature.
  given({ [SAVE_KEY]: S(700), [OWNER_KEY]: "A", [CHOSEN_KEY]: "1" });
  got = await settle("A", down);
  assert.equal(got.raw, S(700), "offline, this account's own cache was not played");
  assert.equal(store.get(CHOSEN_KEY), "1",
    "a failed read spent the restore marker it could not honour");

  // Ahead wins; an older copy of the winner is not offered back as a branch.
  given({ [SAVE_KEY]: S(900, 10, 100), [OWNER_KEY]: "A" });
  got = await settle("A", ok(S(800, 9, 90)));
  assert.equal(got.raw, S(900, 10, 100), "offline play ahead of the account was thrown away");
  assert.equal(store.get(scoped(OTHER_KEY, "A")), undefined,
    "a copy that is simply BEHIND was kept as if it were a branch");
  // A branch - behind on steps, ahead on catches - is kept, not erased.
  given({ [SAVE_KEY]: S(900, 12, 100), [OWNER_KEY]: "A" });
  got = await settle("A", ok(S(1000, 10, 150)));
  assert.equal(store.get(SAVE_KEY), S(1000, 10, 150));
  assert.equal(store.get(scoped(OTHER_KEY, "A")), S(900, 12, 100),
    "a branch holding catches the winner lacks was erased by the step count");

  // A hand-picked save wins ONCE, and the account's copy is kept to undo it.
  given({ [SAVE_KEY]: S(300), [OWNER_KEY]: "A", [CHOSEN_KEY]: "1" });
  got = await settle("A", ok(S(2000)));
  assert.equal(got.raw, S(300),
    "restoring a backup was a no-op online - the account won on steps");
  assert.equal(store.get(scoped(OTHER_KEY, "A")), S(2000),
    "a restore replaced the account's copy without keeping it");
  assert.equal(store.get(CHOSEN_KEY), undefined, "the restore marker outlived its boot");
  // Another account's marker picks nothing for this one.
  given({ [SAVE_KEY]: S(300), [OWNER_KEY]: "B", [CHOSEN_KEY]: "1" });
  got = await settle("A", ok(S(2000)));
  assert.equal(got.raw, S(2000), "B's restore marker chose a save for A");

  /* OLD RECOVERY COPIES MOVE TO THEIR OWNER ONCE. They were written under the
     bare key, which a signed-in player is no longer offered; a failed save
     there would have gone quiet. Once, and never over a copy already scoped. */
  const { BACKUP_KEY, BROKEN_KEY, SCOPED_KEY } = await import("../src/game/store.js");
  given({ [SAVE_KEY]: S(5), [OWNER_KEY]: "A", [BACKUP_KEY]: S(4), [BROKEN_KEY]: "{bad" });
  await settle("A", ok(S(1)));
  assert.equal(store.get(scoped(BACKUP_KEY, "A")), S(4), "a pre-update backup went quiet");
  assert.equal(store.get(scoped(BROKEN_KEY, "A")), "{bad", "a pre-update failed save went quiet");
  assert.equal(store.get(BACKUP_KEY), undefined, "the legacy copy was duplicated, not moved");
  // An EMPTY slot, so only the flag can be what stops the second move.
  store.delete(scoped(BACKUP_KEY, "A"));
  store.set(BACKUP_KEY, S(3));
  await settle("A", ok(S(1)));
  assert.equal(store.get(BACKUP_KEY), S(3), "the one-time move ran twice");
  assert.equal(store.get(SCOPED_KEY), "1");

  // Local mode: no account, and the browser's save is simply the save.
  given({ [SAVE_KEY]: S(50) });
  got = await settle(null, ok(null));
  assert.equal(got.raw, S(50), "local mode lost its own save");
  assert.equal(store.get(PARKED_KEY), undefined, "local mode parked its own save");

  // No login-time source grep survives: nothing may adopt an unowned cache.
  const code = readFileSync(new URL("../src/game/store.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/!owner \|\| owner === uid/.test(code),
    "settle is adopting unowned local data again - that is the production bug");
  console.log("settle ok — owned only, parked not clobbered, branches kept, a failed read writes nothing");
}

/* WHAT THE ENGINE WILL NOT WRITE, AND WHAT IT WILL NOT LOSE. Each of these is
   a path by which a session wrote a save it should not have, or failed to
   write one it should: all of them silent, because a write that lands is
   indistinguishable from one that should not have. */
{
  const {
    SAVE_KEY, OWNER_KEY, BACKUP_KEY, BROKEN_KEY, OTHER_KEY, CHOSEN_KEY, WRITER_KEY,
    flushNow, scoped,
  } = await import("../src/game/store.js");
  const { SPECIES } = await import("../src/data/dex.js");
  const reloads = [];
  globalThis.location = { reload: () => reloads.push(1) };

  /* A SAVE FROM A NEWER BUILD is kept, never written over, never uploaded.
     Padding cannot invent what extra positions mean and saving would drop
     them, so the verdict latches the session shut - locally AND upward. */
  {
    const future = { ...SAVE, dex: Array(SPECIES.length + 70).fill(0) };
    const { e } = boot(future);
    const raw = store.get(SAVE_KEY);
    assert.equal(e.state.stale, "outdated", "a newer build's save loaded as if it were ours");
    assert.equal(store.get(BROKEN_KEY), raw, "the newer save was not kept aside");
    assert.ok(e.setChar("red"), "nothing changed - this test is asserting nothing");
    e.saveNow();
    assert.equal(store.get(SAVE_KEY), raw,
      "an older build wrote a fresh game over a newer build's save");
    let pushed = 0;
    await flushNow(async () => { pushed++; return { ok: true }; });
    assert.equal(pushed, 0, "an older build uploaded a fresh game over the account");
    e.syncTrouble("offline");
    assert.equal(e.state.stale, "outdated", "a sync blip cleared the out-of-date latch");
    e.destroy();
  }

  /* A SAVE THAT COULD NOT BE READ plays a fresh game here - and never uploads
     it, or the account's real collection is replaced by a Lv 1 trainer. */
  {
    const { e } = boot("a string where a save should be");
    assert.ok(!e.state.stale, "an unreadable save latched the session");
    assert.ok(e.setChar("red"), "nothing changed - this test is asserting nothing");
    e.saveNow();
    let pushed = 0;
    await flushNow(async () => { pushed++; return { ok: true }; });
    assert.equal(pushed, 0, "a fresh game from an unreadable save was uploaded over the account");
    e.destroy();
  }

  /* SESSION STATE IS NEVER A SAVE. A file exported mid-session carried
     `stale: "taken"`, and importing it latched the new session shut on its
     first frame; `rev` and an encounter rode along the same way. */
  {
    const { e } = boot({ ...SAVE, stale: "taken", rev: 99, encounter: { speciesId: 1 } });
    assert.equal(e.state.stale, null, "a saved `stale` latched a fresh session shut");
    assert.equal(e.state.encounter, null, "a saved encounter came back as live");
    const out = e.exportSave();
    for (const k of ["stale", "rev", "colRev", "encounter", "ask", "cheers", "defense"]) {
      assert.ok(!(k in out), `the exported save carries the session field "${k}"`);
    }
    e.destroy();
  }

  /* A BOX ENTRY THIS BUILD CANNOT USE IS SET ASIDE, NOT DELETED - and a
     repeated uid is renumbered, because every Box action names ONE uid. */
  {
    const ghost = { uid: 7, species: 987654, level: 5 };
    const { e } = boot({
      ...SAVE, nextUid: 2,
      box: [{ uid: 1, species: 16, level: 3 }, { uid: 1, species: 19, level: 4 }, ghost],
    });
    assert.deepEqual(e.state.box.map((m) => m.species), [16, 19],
      "an entry with an unknown species reached the Box, which crashes rendering it");
    assert.deepEqual(e.state.limbo, [ghost], "an unusable entry was deleted rather than set aside");
    const uids = e.state.box.map((m) => m.uid);
    assert.equal(new Set(uids).size, uids.length, "two Pokemon still answer to one uid");
    assert.ok(e.state.nextUid > Math.max(7, ...uids),
      "nextUid can hand out a uid an entry already has");
    e.buyCandy(1);
    e.saveNow();
    assert.deepEqual(JSON.parse(store.get(SAVE_KEY)).limbo, [ghost],
      "the set-aside entry did not survive a save");
    e.destroy();
  }

  /* THE LAST 400ms. `save()` is debounced, so what you did just before
     logging out was in a timer the unmount cancelled. */
  {
    const { e } = boot(SAVE);
    const was = store.get(SAVE_KEY);
    assert.ok(e.buyCandy(1));
    e.saveNow();
    assert.notEqual(store.get(SAVE_KEY), was, "saveNow did not write what was pending");
    e.destroy();
    const at = store.get(SAVE_KEY);
    e.buyCandy(1);
    e.saveNow();
    assert.equal(store.get(SAVE_KEY), at,
      "a destroyed engine wrote - log out clears the cache and this puts it back");
  }

  /* ONE WRITER PER BROWSER. The newest tab stamps WRITER_KEY and every other
     tab hears it through `storage` - so the older one stops writing, as a lost
     claim does, rather than putting an hour-old save back. Listeners captured
     for the length of one boot, because the harness otherwise throws them away. */
  {
    const heard = {};
    globalThis.addEventListener = (t, f) => { (heard[t] ??= []).push(f); };
    const { e } = boot(SAVE);
    globalThis.addEventListener = () => {};
    assert.ok(store.get(WRITER_KEY), "the tab never stamped itself as the writer");
    for (const f of heard.storage) f({ key: WRITER_KEY, newValue: "a-newer-tab" });
    assert.equal(e.state.stale, "taken", "an older tab went on writing after a newer one opened");
    const frozen = store.get(SAVE_KEY);
    e.buyCandy(1);
    for (const f of heard.pagehide) f();
    assert.equal(store.get(SAVE_KEY), frozen, "the displaced tab wrote over the live tab's save");
    e.destroy();
  }

  /* A RESTORE IS A CHOICE, AND IT SURVIVES THE RELOAD IT CAUSES. The restore
     marker makes it beat the account once; `halted` stops the reload's own
     `pagehide` writing the OLD game back over the one just chosen. */
  {
    const heard = {};
    globalThis.addEventListener = (t, f) => { (heard[t] ??= []).push(f); };
    const { e } = boot(SAVE);
    globalThis.addEventListener = () => {};
    const file = { ...SAVE, money: 1234, steps: 5 };
    e.buyCandy(1);                       // leave a debounce in flight
    assert.equal(e.importSave(file), null, "a valid file was refused");
    assert.equal(reloads.length > 0, true, "an import did not reload");
    e.buyCandy(1);                       // and the game runs on until it lands
    for (const f of heard.pagehide) f();
    assert.equal(JSON.parse(store.get(SAVE_KEY)).money, 1234,
      "the reload's pagehide wrote the old game back over the imported one");
    assert.equal(store.get(CHOSEN_KEY), "1", "an import is not marked as chosen, so the account beats it");
    e.destroy();
  }

  /* RECOVERY COPIES BELONG TO THEIR OWNER. They were one key per browser, so
     B was offered - and could restore - whatever A had left behind. */
  {
    const { e } = boot(SAVE);
    store.set(OWNER_KEY, "B");
    store.set(scoped(BACKUP_KEY, "A"), JSON.stringify({ ...SAVE, caught: 412 }));
    store.set(scoped(OTHER_KEY, "A"), JSON.stringify({ ...SAVE, caught: 412 }));
    const b = e.recoverable();
    assert.equal(b.backup, null, "B was offered A's backup");
    assert.equal(b.other, null, "B was offered A's set-aside copy");
    assert.equal(e.restore("backup"), false, "B restored A's backup");
    store.set(OWNER_KEY, "A");
    assert.equal(e.recoverable().other.caught, 412, "A's own set-aside copy is not offered to A");
    e.destroy();
  }
  /* A GUEST SAVE COMES BACK ON PURPOSE, AND ONLY ONCE. Parked at the first
     sign-in rather than adopted or deleted; restoring it moves it into the
     account and takes it off the offer, or the next person to sign in here
     would be handed the same collection. */
  {
    const { PARKED_KEY } = await import("../src/game/store.js");
    const { e } = boot(SAVE);
    store.set(OWNER_KEY, "A");
    const guest = JSON.stringify({ ...SAVE, caught: 77, money: 4242 });
    store.set(PARKED_KEY, guest);
    assert.equal(e.recoverable().guest?.caught, 77, "the guest save is not offered back");
    assert.equal(e.restore("guest"), true, "the guest save could not be restored");
    assert.equal(store.get(SAVE_KEY), guest, "restoring the guest save did not load it");
    assert.equal(store.get(PARKED_KEY), undefined,
      "a restored guest save is still on offer to the next account");
    assert.equal(store.get(CHOSEN_KEY), "1", "the guest restore will lose to the account at login");
    e.destroy();
  }
  delete globalThis.location;
  console.log("save paths ok — newer builds, session state, bad entries, the last 400ms, two tabs, restore and recovery");
}

/* A TOKEN OUTLIVES THE USER IT NAMES. `restore` read the session out of
   localStorage and trusted it, and `getSession` never asks the server - so an
   account deleted since the token was issued came back as a perfectly good
   session for a row that is gone. `getProfile` then found nothing, the app
   asked who you are, and the insert died on `profiles_user_id_fkey`: a
   database word, on a screen whose only control was the button that had just
   failed. It shipped to production and trapped the owner.

   This needs a live project, so the RULES are asserted over the source with
   comments stripped - the same shape as the ownership suite above, and for the
   same reason the repel check strips them: the prose here quotes the very
   calls the assertions forbid. */
{
  const bare = (f) => f
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

  const cloud = bare(readFileSync(new URL("../src/net/cloud.js", import.meta.url), "utf8"));
  const at = (name) => {
    const i = cloud.indexOf(`export async function ${name}(`);
    assert.ok(i >= 0, `${name} is gone from cloud.js`);
    return cloud.slice(i, cloud.indexOf("\nexport ", i + 1));
  };

  const restore = at("restore");
  assert.ok(/getUser\(\)/.test(restore),
    "restore trusts the cached token again - getSession cannot tell a deleted user from a live one");
  assert.ok(/signOut\(\)/.test(restore),
    "restore no longer drops a session the server has rejected");

  /* OFFLINE IS NOT DELETED, and that is the half that is easy to lose: a
     restore that signs out on any failed request logs out everybody whose
     train goes into a tunnel. auth-js says which kind it was by CLASS. */
  assert.ok(/AuthRetryableFetchError/.test(restore),
    "restore cannot tell a dropped connection from a deleted account - it will sign out offline players");
  assert.ok(restore.indexOf("AuthRetryableFetchError") < restore.indexOf("signOut"),
    "restore signs out before checking whether the failure was merely a network one");

  /* THE SAME FAILURE ARRIVING FROM THE OTHER DIRECTION. A session can die
     while somebody is sitting on the trainer screen, so the insert has to
     answer for it too - 23503 is that foreign key, and a retry cannot fix it. */
  const made = at("createProfile");
  assert.ok(/23503/.test(made),
    "createProfile does not recognise the foreign-key violation a deleted user produces");
  assert.ok(/gone: true/.test(made),
    "createProfile reports a dead session as an ordinary error, so the screen offers a retry that cannot work");

  /* AND NO GATE SCREEN MAY BE A ROOM WITH NO DOOR. Both signed-in screens are
     reached with a token in hand, so whatever goes wrong with it, the way out
     has to be on the card. */
  const gate = bare(readFileSync(new URL("../src/ui/Gate.jsx", import.meta.url), "utf8"));
  assert.ok(/onOut/.test(gate), "the trainer gate has no way back to the account screen");
  const boot = bare(readFileSync(new URL("../src/Boot.jsx", import.meta.url), "utf8"));
  assert.ok(/onOut=\{out\}/.test(boot), "the trainer gate is rendered without its way out");
  assert.ok(/got\.gone/.test(boot), "Boot ignores a dead session reported by createProfile");

  console.log("ghost session ok — a token for a deleted user signs out instead of trapping the gate");
}

/* NEVER OVERWRITE A SAVE YOU HAVE NOT READ, and never let two sessions write.

   Both of these destroy a real collection and neither one fails loudly.

   The first: `pull` returned null for "this account has no save" and null for
   "the request failed", so a reachable-but-broken backend read as a brand new
   player - and a free Supabase project PAUSES after a week idle, which makes
   that an ordinary Tuesday rather than a freak event. Fresh save, four seconds
   later, uploaded over a finished dex. It is the exact mistake this repo
   already records twice about the LOCAL save, made again on the way out.

   The second: two tabs or two devices each ran an engine and each upserted the
   whole save, so last writer won, continuously.

   Both fixes live across a network call, so the RULES are asserted over the
   source with comments stripped - the same shape as the ownership and ghost
   suites above. The claim's own behaviour is tested against the live database
   instead; see SUPABASE.md. */
{
  const bare = (f) => f
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

  const cloud = bare(readFileSync(new URL("../src/net/cloud.js", import.meta.url), "utf8"));
  const at = (name) => {
    const i = cloud.indexOf(`export async function ${name}(`);
    assert.ok(i >= 0, `${name} is gone from cloud.js`);
    const j = cloud.indexOf("\nexport ", i + 1);
    return cloud.slice(i, j < 0 ? undefined : j);
  };

  /* A READ HAS THREE ANSWERS, and the caller is made to look at which.

     NAMING THE BRANCH, not the string. The first version asserted that
     `ok: false` appeared anywhere in `pull` - which the `catch` also says, so
     turning the ERROR branch back into "there is nothing here" passed. Both
     paths have to be spelt out, because they are two different ways for the
     same read to fail and only one of them was ever the bug. */
  const read = at("pull");
  assert.ok(/if \(error\) return \{ ok: false \};/.test(read),
    "a rejected save-read reports as an empty account - a paused project empties a dex");
  assert.ok(/catch \{\s*return \{ ok: false \};/.test(read),
    "a thrown save-read reports as an empty account");
  assert.ok(/pulled = true/.test(read), "pull no longer records that it succeeded");

  /* AND THE PROFILE READ IS THE SAME SHAPE, because the same conflation there
     puts an existing player on the WHO ARE YOU screen after a hiccup - and the
     insert that follows collides with their own primary key and reports it as
     a name somebody else has taken. */
  const who = at("getProfile");
  assert.ok(/if \(error\) return \{ ok: false \};/.test(who),
    "a rejected profile-read reports as no profile - an existing player is asked to sign up again");

  // And a write refuses until one of them has been the good one.
  const write = at("push");
  assert.ok(/if \(!pulled\)/.test(write),
    "push will upload without having read - this is the bug that empties a dex");
  assert.ok(write.indexOf("!pulled") < write.indexOf("rpc"),
    "push checks whether it has read AFTER it has already sent something");

  /* THE CLAIM IS THE SERVER'S JOB, not a read-then-write from here: two
     devices can both read "nobody owns this" and both proceed. */
  assert.ok(/save_game/.test(write),
    "push is writing directly again - the claim check is no longer part of the write");
  assert.ok(/why: "taken"/.test(write), "push cannot report losing the save to another session");
  assert.ok(!/updated_at/.test(write),
    "push is sending its own updated_at again - a device with a wrong clock writes a wrong time");

  /* THE LATCHES ARE PER USER, or a second login inherits the first one's and
     writes blind. Two halves, and the first version of this asserted neither:
     it matched `pulled = false` and so passed on the DECLARATION, with the
     reset deleted. A test that its own subject cannot break is not a test.

     ONE PLACE ASSIGNS THE SESSION, which is what makes the reset reachable
     from every path at all - five call sites used to do it directly, and a
     sixth would simply not have reset anything. And the reset is guarded on
     the USER rather than the event, because a token refresh is the same person
     and clearing `pulled` there would block every write until the next
     reload. */
  const assigns = (cloud.match(/^\s*session = /gm) ?? []).length;
  assert.equal(assigns, 1,
    `${assigns} places assign the session directly - all but \`hold\` skip the latch reset`);
  assert.ok(/if \(now !== was\) \{ pulled = false; lost = false; claimed = false; \}/.test(cloud),
    "the read/claim latches are not reset when the user changes, or are reset on every refresh");

  // The failed-read rule is DRIVEN above ("settle ok"); Boot must still claim.
  const boot = bare(readFileSync(new URL("../src/Boot.jsx", import.meta.url), "utf8"));
  assert.ok(/await claim\(\)/.test(boot), "Boot never takes the save, so an old tab keeps writing");
  /* AND A CLAIM THAT FAILED IS RETRIED BY THE NEXT UPLOAD. It used to be fire
     and forget, so a hiccup at boot left the row with the OLD device and the
     newest session was told it was "playing somewhere else". */
  assert.ok(/if \(!claimed && !\(await claim\(\)\)\)/.test(cloud),
    "push no longer claims first when the boot-time claim did not land");

  /* AND THE LOSER STOPS WRITING LOCALLY TOO. Two tabs share one localStorage
     key, so an abandoned tab that keeps writing overwrites the copy the LIVE
     tab is keeping - and `newer` can then hand the resurrected loser back at
     the next boot. Syncing off but writing on would be a worse bug than the
     one it fixes. */
  /* IN `save`, not merely somewhere in the file - `syncTrouble` latches on the
     same word one function away, so a version with the local write restored
     still matched. A guard is only a guard on the path it is on. */
  const engine = bare(readFileSync(new URL("../src/game/engine.js", import.meta.url), "utf8"));
  const writes = engine.slice(engine.indexOf("function save()"), engine.indexOf("loadArt()"));
  assert.ok(writes.length > 100 && writes.length < 4000, "save() is not where it was in engine.js");
  assert.ok(/state\.stale === "taken"[^;]*\) return/.test(writes),
    "a session that lost the save still writes to localStorage, over the live tab's copy");

  /* THE PROFILE'S COLUMN GRANTS AND THE CLIENT'S WRITES ARE ONE FACT IN TWO
     PLACES. SUPABASE.md §3c grants `authenticated` exactly the columns the
     browser writes, so a profile field added to the insert or to Settings
     without a grant fails as "permission denied" on the one screen nobody
     tests after sign-up. Read out of both files rather than typed here. */
  {
    const doc = readFileSync(new URL("../SUPABASE.md", import.meta.url), "utf8");
    const granted = (verb) => new Set((doc.match(
      new RegExp(String.raw`grant\s+${verb}\s*\(([^)]*)\)\s*on public\.profiles`)) ?? ["", ""])[1]
      .split(",").map((c) => c.trim()).filter(Boolean));
    const ins = cloud.slice(cloud.indexOf("export async function createProfile"));
    const inserted = [...ins.slice(ins.indexOf(".insert({"), ins.indexOf("});"))
      .matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    const settings = readFileSync(new URL("../src/ui/Settings.jsx", import.meta.url), "utf8");
    const updated = [...settings.matchAll(/onProfile\(\{\s*(\w+):/g)].map((m) => m[1]);
    assert.ok(inserted.length >= 3 && updated.length >= 3, "the profile writes were not found");
    for (const c of inserted) {
      assert.ok(granted("insert").has(c), `sign-up writes profiles.${c} and SUPABASE.md does not grant it`);
    }
    for (const c of updated) {
      assert.ok(granted("update").has(c), `Settings writes profiles.${c} and SUPABASE.md does not grant it`);
    }
  }

  console.log("write safety ok — never blind, one writer, and the loser stops writing");
}

/* AND THE STORE GIVES UP WHEN IT IS BEATEN. A refused claim is not a flaky
   connection: every retry is refused by the same claim, and the payload it is
   holding belongs to a game the account has already moved past. Retrying it
   forever would be a background loop uploading a dead session. */
{
  const { mirror, flushNow, onSyncTrouble } = await import("../src/game/store.js");
  const sent = [];
  const push = async (raw) => {
    sent.push(JSON.parse(raw).steps);
    return { ok: false, why: "taken" };
  };
  const told = [];
  onSyncTrouble((why) => told.push(why));

  mirror(JSON.stringify({ steps: 50 }), push);
  assert.equal((await flushNow(push)).ok, false, "a refused claim reported success");
  assert.deepEqual(told, ["taken"], `the top bar was told ${told} rather than "taken"`);

  /* AND IT IS NOT QUEUED FOR LATER. An offline payload goes back on the queue
     and that is right; a refused CLAIM must not, or the tab keeps a dead
     session's save in hand and offers it again at every opportunity. Asserted
     by flushing twice: the second call must have nothing left to send. */
  assert.deepEqual(sent, [50], `the refused attempt sent ${sent}`);
  const again = await flushNow(push);
  assert.equal(again.ok, true, "a refused claim was queued for retry");
  assert.deepEqual(sent, [50], `a refused claim was sent a second time: ${sent}`);

  onSyncTrouble(null);
  console.log("beaten ok — a lost claim is reported once and not retried forever");
}

/* ONE ANSWER ABOUT WHAT IS IN THE BAG. The rail and the touch sheet draw the
   same inventory, and the rules for it - which balls hide until owned, which
   items are worth showing right now - are one-liners over `items.js` and
   exactly the sort of thing that gets copied and then fixed in one copy. This
   repo has already shipped a shiny protected from one bulk action and not its
   sibling, and a whole generation with no evolutions because a second list of
   ranges drifted. So both screens call the same two selectors. */
{
  const bare = (f) => f
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const rail = bare(readFileSync(new URL("../src/ui/BallRail.jsx", import.meta.url), "utf8"));
  const sheet = bare(readFileSync(new URL("../src/ui/Bag.jsx", import.meta.url), "utf8"));

  for (const [what, body] of [["BallRail", rail], ["Bag", sheet]]) {
    assert.ok(/carriedBalls\(/.test(body), `${what} filters the balls itself instead of asking items.js`);
    assert.ok(/usefulItems\(/.test(body), `${what} filters the kit itself instead of asking items.js`);
    assert.ok(!/BALLS\.filter\(/.test(body), `${what} has its own copy of the which-balls-show rule`);
  }

  /* AND THE BICYCLE IS GONE, not merely unreachable. It was a second answer to
     "go faster" - a toggle where the shoes are held - and it cost a face button
     on a pad that has four. Comments may absolutely still name it; this repo
     explains its deletions. Code may not. */
  const src = ["src/game/engine.js", "src/game/items.js", "src/App.jsx",
    "src/ui/Pad.jsx", "src/ui/Rail.jsx", "src/ui/Trainer.jsx"];
  for (const f of src) {
    const body = bare(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
    assert.ok(!/bicycle|biking|toggleBike/.test(body),
      `${f} still has the bicycle in its CODE`);
  }

  /* NO SCRIM CLOSES ON A GESTURE IT DID NOT SEE BEGIN.

     `onClick={onClose}` on a backdrop is not "click away to dismiss", and the
     difference shipped: the BAG key fires on `pointerdown`, the sheet mounts
     under a thumb that is still down, and the `touchEnd` hit-tests to the
     scrim that has just appeared there. Driven over CDP with real touch input
     the sequence read `view = all` then `view = null, closes = 1` - the bag
     opening and shutting on one tap. Holding A did the same one beat later.

     The same guard fixes a case nobody had reported: a drag that STARTS inside
     the card and ends outside it fires its click on the nearest common
     ancestor, which is the scrim. Swiping the ball strip and drifting off shut
     the bag; selecting text in Settings and releasing past the edge threw away
     what had been typed.

     Asserted as an absence across every dialog, because the failure is one
     component being converted and the next one being written the old way. */
  const scrims = readdirSync(new URL("../src/ui/", import.meta.url))
    .filter((f) => f.endsWith(".jsx"))
    .map((f) => [f, readFileSync(new URL(`../src/ui/${f}`, import.meta.url), "utf8")])
    .filter(([, body]) => /className="(sheet|bagsheet)"/.test(body));
  assert.ok(scrims.length >= 5, `only ${scrims.length} dialogs found - the scan is not working`);
  for (const [f, body] of scrims) {
    assert.ok(/className="(sheet|bagsheet)" \{\.\.\.useDismiss\(/.test(body),
      `${f}'s backdrop does not use useDismiss - it will close on the tap that opened it`);
  }

  /* AND THE GUARD ITSELF STARTS CLOSED. `from` beginning true would mean the
     very first click closes, which is the bug with extra steps. */
  const modal = readFileSync(new URL("../src/ui/modal.js", import.meta.url), "utf8");
  assert.ok(/useRef\(false\)/.test(modal), "useDismiss starts armed - the opening tap will close it");
  assert.ok(/from\.current = e\.target === e\.currentTarget/.test(modal),
    "useDismiss no longer records where the gesture started");

  console.log(`bag ok — one answer about what is in it, no bicycle in the code, ` +
    `and ${scrims.length} scrims that ignore a gesture they did not see begin`);
}

/* A SAVE WRITTEN AT FOUR TIERS MUST LOAD AT EIGHT, and docs/decisions.md's claim that
   adding a tier is "a non-event for saves" is exactly the sort of thing that
   is true right up until it is not. The rows are BUILT from `TIERS` in both
   `freshState` and `loadState`, so a save that predates a tier simply has no
   key for it and `normalise(undefined)` gives a fresh row of zeroes - but the
   failure if that ever stops holding is silent and total: every variant
   anybody has ever caught, gone, with no error anywhere.

   Driven through the real engine over a real four-tier save, and it checks
   BOTH directions - the old rows survive, and the new ones are written back
   out rather than being dropped on the next save. */
{
  const { SPECIES } = await import("../src/data/dex.js");
  const { TIERS } = await import("../src/game/biomes.js");
  const OLD = ["astral", "shiny", "holo", "origin"];
  const dex = new Array(SPECIES.length).fill(0);
  dex[0] = 2; dex[24] = 2;
  const old = { ...SAVE, dex, caught: 2 };
  for (const t of TIERS) delete old[t];
  for (const t of OLD) {
    const row = new Array(SPECIES.length).fill(0);
    if (t === "shiny") row[24] = 1;
    if (t === "holo") row[0] = 1;
    old[t] = row;
  }

  store.clear();
  store.set("meadow-route", JSON.stringify(old));
  raf.length = 0;
  const e = createEngine(canvas(), () => {}, canvas());

  for (const t of TIERS) {
    assert.equal(e.state[t]?.length, SPECIES.length,
      `"${t}" is missing or the wrong length after loading a ${OLD.length}-tier save`);
  }
  assert.equal(e.state.shiny[24], 1, "a shiny did not survive the ladder growing");
  assert.equal(e.state.holo[0], 1, "a holo did not survive the ladder growing");
  assert.equal(e.state.dex[24], 2, "a caught species was demoted to seen");
  for (const t of TIERS.filter((x) => !OLD.includes(x))) {
    assert.equal(e.state[t].reduce((a, b) => a + b, 0), 0, `"${t}" arrived non-empty`);
  }

  /* AND BACK OUT AGAIN. `setChar` rather than walking: every step is a 7%
     chance of an encounter and an encounter stops the leg, so walking to
     provoke a save is a coin toss - this file already records that. */
  e.setChar(e.state.char === "red" ? "leaf" : "red");
  await new Promise((r) => setTimeout(r, 600));
  const back = JSON.parse(store.get("meadow-route"));
  const dropped = TIERS.filter((t) => !Array.isArray(back[t]));
  assert.deepEqual(dropped, [], `the save was written back without: ${dropped.join(", ")}`);

  console.log(`tier growth ok — a ${OLD.length}-tier save loads onto ${TIERS.length}, ` +
    "old rows intact, new rows empty, all of them written back");
}

/* A SAVED FIELD IS SAFE ON THREE COUNTS, and every new one gets all three:
   a save written before the field existed loads with it empty; a real value
   survives a write and a reload; and garbage (a hand-edit, an import from
   another build) is dropped to empty rather than trusted. These are the save
   rules that protect collections, stated once so each new field - an
   outbreak, research, a rift - costs one line here instead of a test of its
   own that might skip a count. Proved on `dry`, the pity counter. */
async function savedField(name, good, bad, empty, base = SAVE) {
  const SAVE = base;          // a field that depends on others (gifted on dex) brings its own
  const old = { ...SAVE };
  delete old[name];
  assert.deepEqual(boot(old).e.state[name], empty,
    `a save written before "${name}" existed did not load it as empty`);

  const e = boot({ ...SAVE, [name]: good }).e;
  e.setChar(e.state.char === "red" ? "leaf" : "red");     // any real change saves
  await new Promise((r) => setTimeout(r, 600));
  const back = JSON.parse(store.get("meadow-route"));
  assert.deepEqual(boot(back).e.state[name], good,
    `"${name}" did not survive a save and a reload`);

  assert.deepEqual(boot({ ...SAVE, [name]: bad }).e.state[name], empty,
    `a garbage "${name}" was trusted instead of dropped to empty`);
}
await savedField("dry", 123, "lots", 0);
/* CARDS (docs/cards.md): each field loads empty from an old save, survives a
   reload, and drops garbage - row by row for the collection. */
await savedField("cards", { "me01-001": { n: 2, r: 1, earned: ["badge:kanto-brock"] } }, "junk", {});
assert.deepEqual(boot({ ...SAVE, cards: { "me01-001": { n: 1 }, "me01-002": { n: "lots" }, "x y": { n: 1 } } }).e.state.cards,
  { "me01-001": { n: 1 } }, "one bad card row cost the collection, or a bad row was kept");
await savedField("packs", { me01: 3 }, "junk", {});
await savedField("earnedPacks", { me01: ["badge:kanto-brock"] }, "junk", {}, { ...SAVE, packs: { me01: 1 } });
assert.deepEqual(boot({ ...SAVE, packs: { me01: 1 }, earnedPacks: { me01: ["a", "b"] } }).e.state.earnedPacks,
  { me01: ["a"] }, "more earned packs than unopened ones were kept");
await savedField("cardPity", { me01: { hit: 2, special: 14, mega: 61 } }, "junk", {});

/* COSMETICS (docs/cosmetics.md): the follower is a Box uid, the skins are
   bought ids (one from a newer build is KEPT - a purchase is never lost),
   and the skin worn is one of them. */
{
  const pika = { ...SAVE, box: [{ uid: 1, species: 25, level: 5, shiny: 1, at: 1 }], nextUid: 2 };
  await savedField("buddy", 1, "x", null, pika);
  await savedField("party", [1], "junk", [], pika);
  assert.deepEqual(boot({ ...pika, party: [1, 7] }).e.state.party, [1], "a party member not in the Box was kept");
  assert.equal(boot({ ...pika, buddy: 7 }).e.state.buddy, null, "a follower not in the Box was kept");
  await savedField("skins", ["giovanni", "from_a_newer_build"], "junk", []);
  await savedField("skin", "lass", 42, null, { ...SAVE, skins: ["lass"] });
  assert.equal(boot({ ...SAVE, skin: "lass" }).e.state.skin, null, "a skin worn but never bought was kept");

  const C = await import("../src/game/cosmetics.js");
  const e = boot({ ...SAVE, money: C.skinPrice("lass") + 10 }).e;
  assert.equal(e.buySkin("nobody"), false, "a skin that does not exist was sold");
  assert.equal(e.buySkin("giovanni"), false, "a skin was sold to someone who cannot pay");
  assert.equal(e.buySkin("lass"), true);
  assert.equal(e.state.money, 10, "a skin did not cost exactly its price");
  assert.equal(e.state.skin, "lass", "buying a skin did not wear it");
  assert.equal(e.buySkin("lass"), false, "a skin was sold twice");
  assert.equal(e.wearSkin("giovanni"), false, "a skin not bought was worn");
  assert.equal(e.wearSkin(null), true);
  assert.equal(e.state.skin, null, "taking a skin off did not give your own trainer back");

  // THE WALKING PARTY: up to three, each once, from the Box; the one walking is one of them.
  const four = { ...pika, box: [1, 2, 3, 4].map((uid) => ({ uid, species: [25, 1, 4, 7][uid - 1], level: 5, at: 1 })), nextUid: 5 };
  const f = boot(four).e;
  assert.equal(f.setBuddy(1), false, "a Pokemon outside the party was sent walking");
  assert.equal(f.setParty([1, 99]), false, "a party with a uid not in the Box was taken");
  assert.equal(f.setParty([1, 2, 3, 4]), false, "a party of four was taken");
  const col = f.state.colRev;
  assert.equal(f.setParty([1, 2, 3]), true);
  assert.equal(f.state.buddy, 1, "the first of a new party did not start walking");
  assert.ok(f.state.colRev > col, "joining the party did not tell the Box");
  const col2 = f.state.colRev;
  assert.equal(f.cycleBuddy(), true);
  assert.equal(f.state.buddy, 2, "Q did not send out the next of the party");
  f.cycleBuddy(); f.cycleBuddy();
  assert.equal(f.state.buddy, 1, "the party does not cycle round");
  assert.equal(f.state.colRev, col2, "switching who walks rebuilt the collection - a big Box stutters on it");
  assert.equal(f.setBuddy(null), true);
  assert.equal(f.state.buddy, null);
  f.setBuddy(3);
  assert.equal(f.setParty([1, 2]), true);
  assert.equal(f.state.buddy, 1, "the one walking left the party and nobody took over");
  console.log("cosmetics ok — follower, skins and the skin worn load, save and refuse what they must");
}

/* FIELD ABILITIES AND FRIENDSHIP (abilities.js): the one walking lends its
   ability's overworld effect and grows friendship, counted on its Box entry -
   and only while it is out. Each effect through a real step. */
{
  const AB = await import("../src/game/abilities.js");
  const { ENCOUNTER_RATE } = await import("../src/game/biomes.js");
  const real = Math.random;
  // One step that arrives, from whichever direction is open, with Math.random pinned.
  const stepWith = (e, r) => {
    Math.random = typeof r === "function" ? r : () => r;
    try {
      for (const dir of ["right", "down", "left", "up"]) {
        const n = e.state.steps;
        e.press(dir);
        for (let i = 0; i < 30 && e.state.steps === n; i++) tick(16);
        e.clearHeld();
        for (let i = 0; i < 12; i++) tick(16);
        if (e.state.steps > n) return true;
      }
      return false;
    } finally { Math.random = real; }
  };
  const walking = (species, uid, extra = {}) => boot({ ...SAVE, box: [{ uid, species, level: 20, at: 1, ...extra }],
    nextUid: uid + 1, party: [uid], buddy: uid }).e;
  assert.equal(AB.abilityOf({ uid: 2, species: 52 }), "pickup", "the sample Meowth lost Pickup - pick another uid");
  assert.equal(AB.abilityOf({ uid: 2, species: 88 }), "stench");
  assert.equal(AB.abilityOf({ uid: 3, species: 25, alpha: 1 }), "lightning-rod", "an alpha did not get its hidden ability");

  // Friendship: a step out together counts; a new heart says so and is one changed().
  {
    const e = walking(25, 1, { walked: AB.HEARTS[0] - 1 });
    const col = e.state.colRev;
    assert.ok(stepWith(e, 0.999));
    const mon = e.state.box.find((m) => m.uid === 1);
    assert.equal(mon.walked, AB.HEARTS[0], "a step together was not counted");
    assert.equal(AB.heartsOf(mon.walked), 1);
    assert.ok(e.state.worn.some((w) => w.id === "friend"), "a new heart was not announced");
    assert.ok(e.state.colRev > col, "a new heart did not tell the UI");
    const col2 = e.state.colRev;
    stepWith(e, 0.999);
    assert.equal(e.state.colRev, col2, "a plain step together rebuilt the collection");
    e.setBuddy(null);
    const w = mon.walked;
    stepWith(e, 0.999);
    assert.equal(mon.walked, w, "friendship grew with the Pokemon in its ball");
  }
  // Pickup: a low roll on a step finds something, into the bag.
  {
    const e = walking(52, 2);
    const before = JSON.stringify(e.state.bag);
    let calls = 0;
    // Low for the find rolls, high for everything else (no encounter).
    assert.ok(stepWith(e, () => (++calls <= 2 ? 0.0001 : 0.999)));
    assert.ok(e.state.worn.some((w) => w.id === "find"), "Pickup found nothing on a sure roll");
    assert.notEqual(JSON.stringify(e.state.bag), before, "the find did not reach the bag");
  }
  // Stench halves the encounter rate: a roll between the halved and the full rate meets nothing.
  {
    const between = ENCOUNTER_RATE * 0.75;
    const plain = walking(25, 1);
    stepWith(plain, between);
    assert.ok(plain.state.encounter, "the test roll should meet something without Stench");
    const smelly = walking(88, 2);
    stepWith(smelly, between);
    assert.equal(smelly.state.encounter, null, "Stench did not cut the encounter rate");
  }
  // A bad step count is dropped, never the Pokemon.
  {
    const e = boot({ ...SAVE, box: [{ uid: 1, species: 25, level: 5, at: 1, walked: "lots" }, { uid: 2, species: 25, level: 5, at: 1, walked: 40 }], nextUid: 3 }).e;
    assert.equal(e.state.box.length, 2, "a bad step count cost the Pokemon");
    assert.equal(e.state.box[0].walked, undefined, "a garbage step count was kept");
    assert.equal(e.state.box[1].walked, 40, "a good step count was dropped");
  }
  console.log("abilities ok — friendship counts only while out and announces each heart once, Pickup finds into the bag, Stench halves encounters, an alpha has its hidden ability, a bad count drops alone");
}

/* THE DAILY CHECK-IN (checkin.js): once a day, a streak kept by yesterday
   and broken by a gap, the week's rewards in order, and every seventh day a
   roulette spin - decided and saved before any reel, packs or a Gold gift. */
{
  const CI = await import("../src/game/checkin.js");
  const { dayKey } = await import("../src/game/daily.js");
  const { dexIndex } = await import("../src/game/biomes.js");
  const ago = (n) => dayKey(new Date(Date.now() - n * 86400000));
  await savedField("checkin", { last: ago(1), streak: 3, best: 5, spins: 1 }, "junk", { last: null, streak: 0, best: 0, spins: 0 });

  // A first check-in: day 1, paid once; the second press the same day is nothing.
  {
    const e = boot({ ...SAVE }).e;
    assert.equal(e.checkinStatus().due, true);
    const money = e.state.money;
    const r = e.checkIn();
    assert.equal(r.streak, 1);
    assert.equal(e.state.money, money + CI.CHECKIN_REWARDS[0].money, "day 1 did not pay");
    assert.equal(e.checkIn(), null, "a day was checked in twice");
    assert.equal(e.checkinStatus().due, false);
    await new Promise((res) => setTimeout(res, 600));
    assert.equal(JSON.parse(store.get("meadow-route")).checkin.last, dayKey(), "the check-in was not saved");
  }
  // Yesterday keeps it: day 7 banks a spin and is a milestone; a gap breaks it.
  {
    const e = boot({ ...SAVE, checkin: { last: ago(1), streak: 6, best: 6, spins: 0 } }).e;
    const r = e.checkIn();
    assert.equal(r.streak, 7, "yesterday's streak was not kept");
    assert.equal(r.day, 7);
    assert.ok(r.milestone, "day 7 was not a milestone");
    assert.equal(e.state.checkin.spins, 1, "the seventh day banked no spin");
    const gap = boot({ ...SAVE, checkin: { last: ago(3), streak: 12, best: 12, spins: 0 } }).e;
    assert.ok(gap.checkinStatus().broken, "a gap did not read as a broken streak");
    assert.equal(gap.checkIn().streak, 1, "a gap kept the streak");
    assert.equal(gap.state.checkin.best, 12, "breaking the streak lost the best");
  }
  // The roulette: a pack slot gives a set's packs, earned; a Gold slot a gift; no spin, no roll.
  {
    const e = boot({ ...SAVE, checkin: { last: ago(1), streak: 7, best: 7, spins: 2 } }).e;
    const before = Object.values(e.state.packs ?? {}).reduce((a, b) => a + b, 0);
    const seq = (...v) => () => v.shift() ?? 0;
    const p = e.spinRoulette(seq(0, 0));
    assert.equal(p.kind, "pack");
    assert.equal(Object.values(e.state.packs).reduce((a, b) => a + b, 0), before + CI.ROULETTE_PACKS, "the packs did not arrive");
    assert.equal(e.state.earnedPacks[p.set].length, CI.ROULETTE_PACKS, "roulette packs were not stamped as earned");
    const g = e.spinRoulette(seq(0.999, 0.5));
    assert.equal(g.kind, "gold");
    const mon = e.state.box.find((m) => m.uid === g.uid);
    assert.ok(mon?.gold && !mon.traded, "the Gold prize did not arrive as a caught Gold");
    assert.equal(e.state.gold[dexIndex(g.species)], 1, "the Gold prize left the Dex's Gold mark empty");
    assert.equal(e.state.dex[dexIndex(g.species)], 2, "the Gold gift did not register its species");
    assert.equal(e.spinRoulette(), null, "a spin was rolled with none banked");
    assert.equal(e.state.checkin.spins, 0);
  }
  // Fifteen equal slots: packs two thirds, every set alike; Gold a third.
  {
    const sets = ["a", "b", "c", "d", "e"];
    const n = { gold: 0 }; for (const s of sets) n[s] = 0;
    let x = 7;
    const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    for (let i = 0; i < 30000; i++) { const r = CI.rollRoulette(sets, [25], rng); n[r.kind === "gold" ? "gold" : r.set]++; }
    const slots = CI.ROULETTE.pack + CI.ROULETTE.gold;
    assert.ok(Math.abs(n.gold / 30000 - CI.ROULETTE.gold / slots) < 0.01, `Gold landed ${n.gold / 300}% of spins`);
    for (const s of sets) assert.ok(Math.abs(n[s] / 30000 - CI.ROULETTE.pack / slots / sets.length) < 0.015, `set ${s} landed ${n[s] / 300}%`);
  }
  console.log("check-in ok — once a day, kept by yesterday and broken by a gap (the best kept), day 7 banks a spin, a spin gives earned packs or a caught Gold, the odds are 15 equal slots");
}

/* A SLOW FRAME IS NOT A TAB AWAY (2026-10-07): a gap over STALL with the
   window focused pays the deadlines back but neither drops a held walk nor
   bumps colRev - it did both, and a big Box rebuilding on the bump made the
   next frame slow too, in a loop. A long gap, or no focus, still drops keys. */
{
  const e = boot({ ...SAVE }).e;
  globalThis.document.hasFocus = () => true;
  const real = Math.random;
  Math.random = () => 0.999;
  try {
    for (let i = 0; i < 10; i++) tick(16);
    const col = e.state.colRev;
    tick(800);                              // one slow frame, standing still
    assert.equal(e.state.colRev, col, "a slow frame marked the collection changed");
    // A direction with room to walk, found rather than named.
    const dir = ["right", "left", "down", "up"].find((d) => {
      const n = e.state.steps;
      e.press(d);
      for (let i = 0; i < 30; i++) tick(16);
      e.clearHeld();
      for (let i = 0; i < 20; i++) tick(16);
      return e.state.steps > n;
    });
    const steps = e.state.steps;
    e.press(dir);
    tick(16); tick(800);                    // and one mid-walk, focused
    for (let i = 0; i < 40; i++) tick(16);
    assert.ok(e.state.steps > steps + 1, "a slow frame dropped the held walk");
    tick(2500);                             // a sleep
    const after = e.state.steps;
    for (let i = 0; i < 40; i++) tick(16);
    assert.ok(e.state.steps <= after + 1, "a long gap kept walking on a key that may have been let go");
  } finally {
    Math.random = real;
    delete globalThis.document.hasFocus;
    e.clearHeld();
  }
  console.log("slow frame ok — a focused slow frame keeps the walk and the collection; a long gap drops held keys");
}

/* THE FOLLOWER WALKS ONE STEP BEHIND, read off what the frame actually
   draws: its sheet arrives (an Image that loads), it is unseen on your tile
   after a load, then stands on the tile you left - drawn a tile behind the
   trainer, in the shiny row for a shiny - and it is back in its ball after
   travel. Every draw is recorded; the follower's are the ones from its sheet. */
{
  const OldImage = globalThis.Image;
  globalThis.Image = class {
    set src(v) { this.url = v; this.width = 256; this.height = 64; queueMicrotask(() => this.onload?.()); }
  };
  const e = boot({ ...SAVE, box: [{ uid: 1, species: 25, level: 5, shiny: 1, at: 1 }, { uid: 2, species: 1, level: 5, at: 1 }], nextUid: 3, buddy: 1 }).e;
  tick(16);                                        // the first frame asks for the sheet
  await new Promise((r) => setTimeout(r, 0));      // and it arrives
  // A still scene is not redrawn, so each look asks for one (a rev bump).
  const frame = (sheet = 25) => {
    e.wearSkin(null);
    calls = [];
    tick(16);
    const out = calls;
    calls = null;
    const fol = out.filter(([k, img]) => k === "drawImage" && (img?.url ?? "").endsWith(`follow/${sheet}.png`));
    const me = out.find(([k]) => k === "ellipse");   // the stand-in trainer's shadow: ellipse(px + 16, py + 29)
    return { fol, me };
  };
  const settle = () => { for (let i = 0; i < 40; i++) tick(16); };
  settle();
  assert.equal(frame().fol.length, 0, "the follower was drawn on the trainer's own tile after a load");
  // One step that arrives, with every encounter roll missed; two the same way.
  const real = Math.random;
  Math.random = () => 0.999;
  const step = (d) => {
    const n = e.state.steps;
    e.press(d);
    for (let i = 0; i < 30 && e.state.steps === n; i++) tick(16);
    e.clearHeld();
    settle();
    return e.state.steps > n;
  };
  let walked = null;
  try {
    for (const d of ["right", "left", "down", "up"]) if (step(d) && step(d)) { walked = d; break; }
  } finally { Math.random = real; }
  assert.ok(walked && !e.state.encounter, "the trainer could not take two steps one way from the spawn");
  const { fol, me } = frame();
  assert.equal(fol.length, 1, "the follower was not drawn behind the trainer after two steps");
  const [, , sx, sy, sw, , dx, dy, dw] = fol[0];
  const [ddx, ddy] = { right: [-1, 0], left: [1, 0], down: [0, -1], up: [0, 1] }[walked];
  const px = me[1] - 16, py = me[2] - 29;
  assert.equal(dx - (32 - dw) / 2, px + ddx * 32, "the follower is not one tile behind the trainer");
  assert.equal(dy - (32 - dw), py + ddy * 32, "the follower is not one tile behind the trainer");
  assert.equal(sy, 32, "a shiny follower was drawn from the normal palette's row");
  assert.equal(dw, 64, "a 32px follower frame was not drawn at the trainer's scale");
  assert.equal(sx % sw, 0);
  /* A SWITCH IS A RELEASE: the next of the party grows out of a flash on the
     same tile - smaller than a full frame at first, whole once it settles. */
  assert.equal(e.setParty([1, 2]), true);
  e.cycleBuddy();
  tick(16);
  await new Promise((r) => setTimeout(r, 0));     // Bulbasaur's sheet arrives (preloaded with the party)
  const popping = frame(1);
  assert.equal(popping.fol.length, 1, "the next of the party did not come out where the last one stood");
  assert.ok(popping.fol[0][8] < 64, "the switch did not play: it appeared at full size at once");
  for (let i = 0; i < 30; i++) tick(16);
  assert.equal(frame(1).fol[0][8], 64, "the released Pokemon never grew to its full size");
  e.travel("meadow");
  settle();
  assert.equal(frame(1).fol.length, 0, "the follower was left standing after a warp");
  globalThis.Image = OldImage;
  console.log(`follower ok — unseen after a load, one tile behind after two steps ${walked}, shiny row for a shiny, a switch grows the next out of a flash, back in its ball after a warp`);
}

/* BUYING AND OPENING, through the real engine: a pack costs exactly its
   price, a refused buy changes nothing, an open is saved before any scene
   plays (a reload keeps it), calls `changed()` once, never puts a card twice
   in a pack, and an earned pack opens first and stamps its cards. */
{
  const C = await import("../src/game/cards.js");
  const set = await import("../src/data/cards/sets/me01.js");
  const { LEVEL_XP } = await import("../src/game/biomes.js");
  const low = boot({ ...SAVE, xp: LEVEL_XP[C.SET_LEVEL.me01 - 3], paid: C.SET_LEVEL.me01 - 2 }).e;
  const m0 = low.state.money;
  assert.equal(low.buyPacks("me01", 1), false, "a pack was sold below its set's level");
  assert.equal(low.state.money, m0);

  const { e, changes } = boot({ ...SAVE, money: C.PACK_PRICE * 3 + 5 });
  assert.equal(e.buyPacks("me01", 1.5), true);
  assert.equal(e.state.money, C.PACK_PRICE * 2 + 5, "a pack and a half was not a pack");
  assert.equal(e.buyPacks("me01", 3), false, "packs were sold past the wallet");
  assert.equal(e.buyPacks("nope", 1), false, "a pack of an unknown set was sold");
  assert.equal(e.state.money, C.PACK_PRICE * 2 + 5, "a refused buy moved money");
  assert.equal(e.openCardPack({ SET: { id: "me01" }, CARDS: set.CARDS.slice(1) }), null, "a set that is not what it says opened");

  e.state.packs = { me01: 2 };
  e.state.earnedPacks = { me01: ["badge:kanto-brock"] };
  const c0 = changes();
  const got = e.openCardPack(set);
  assert.equal(changes() - c0, 1, "an open must be one changed()");
  assert.equal(got.pulls.length, C.PACK_SIZE);
  assert.equal(new Set(got.pulls.map((p) => p.id)).size, C.PACK_SIZE, "a card came twice in one pack");
  assert.ok(got.pulls.every((p) => p.earned === "badge:kanto-brock" && e.state.cards[p.id].earned.includes(p.earned)),
    "the earned pack did not open first, or did not stamp its cards");
  assert.equal(e.state.packs.me01, 1);
  assert.equal(e.state.earnedPacks.me01, undefined);
  await new Promise((r) => setTimeout(r, 600));
  const back = boot(JSON.parse(store.get("meadow-route"))).e;
  assert.deepEqual(back.state.cards, e.state.cards, "an opened pack did not survive a reload");
  assert.equal(back.state.packs.me01, 1);
  const second = back.openCardPack(set);
  assert.ok(second.pulls.every((p) => !p.earned), "a bought pack stamped its cards");
  assert.equal(back.state.packs.me01, undefined, "the last pack was not used up");
  assert.equal(back.openCardPack(set), null, "a pack opened with none held");
  console.log("cards ok — a pack is bought at its price and level only, opened once, saved before the scene, " +
    "never twice a card, and an earned pack opens first and stamps");
}

/* PHASE 2 (docs/cards.md): dust, the sweep, crafting, milestones, the Pulls
   wall and the daily first pack, through the real engine. */
await savedField("dust", 1234, "lots", 0);
await savedField("cardLog", [["me01-187", "h", 1730000000000]], "junk", []);
assert.deepEqual(boot({ ...SAVE, cardLog: [["me01-187", "h", 1], ["x y", "h", 1], ["me01-1", "q", 1]] }).e.state.cardLog,
  [["me01-187", "h", 1]], "a bad Pulls wall entry was kept, or a good one dropped with it");
await savedField("milestones", { me01: 2 }, "junk", {});
await savedField("cardDay", "2026-10-02", 42, null);
await savedField("boxVouchers", ["dex:1"], "junk", []);
await savedField("cardShowcase", ["me01-187:h"], "junk", []);
assert.deepEqual(boot({ ...SAVE, cardShowcase: ["me01-187:h", "bad", "me01-187:h", "me01-1:q"] }).e.state.cardShowcase,
  ["me01-187:h"], "a bad showcase key or a repeat was kept");
{
  const C = await import("../src/game/cards.js");
  const set = await import("../src/data/cards/sets/me01.js");
  const common = set.CARDS.find((c) => c[3] === "common");
  const rare = set.CARDS.find((c) => c[3] === "rare");
  const key = (c) => C.cardId("me01", c[0]);

  // DUST: spares only, exact, and a rare asks first.
  const { e } = boot({ ...SAVE, cards: { [key(common)]: { n: 3 }, [key(rare)]: { h: 2 } } });
  assert.equal(e.dustCard(set, common[0], "n", 3), false, "the last copy was dusted");
  assert.equal(e.dustCard(set, common[0], "n", 2), true);
  assert.equal(e.state.cards[key(common)].n, 1);
  assert.equal(e.state.dust, 2 * C.dustOf("common", "n"), "dust did not pay its value");
  assert.equal(e.dustCard(set, rare[0], "h", 1), true);
  assert.equal(e.state.ask?.kind, "dust", "a rare was dusted without asking");
  assert.equal(e.state.cards[key(rare)].h, 2, "asking already took the card");
  e.answerAsk(true);
  assert.equal(e.state.cards[key(rare)].h, 1);
  assert.equal(e.state.dust, 2 * C.dustOf("common", "n") + C.dustOf("rare", "h"));

  // EARNED copies are not spares.
  const ear = boot({ ...SAVE, cards: { [key(common)]: { n: 2, earned: ["badge:x", "badge:y"] } } }).e;
  assert.equal(ear.dustCard(set, common[0], "n", 1), false, "an earned copy was dusted as a spare");

  // THE SWEEP: asks, then takes every spare common/uncommon normal copy, nothing else.
  const sw = boot({ ...SAVE, cards: { [key(common)]: { n: 4, r: 3 }, [key(rare)]: { h: 3 } } }).e;
  assert.equal(sw.dustSpares(set), true);
  assert.equal(sw.state.ask?.kind, "sweep", "the sweep did not ask first");
  sw.answerAsk(true);
  assert.deepEqual(sw.state.cards[key(common)], { n: 1, r: 3 }, "the sweep took a foil, or the last copy");
  assert.equal(sw.state.cards[key(rare)].h, 3, "the sweep took a rare");
  assert.equal(sw.state.dust, 3 * C.dustOf("common", "n"));

  // CRAFT: exact cost, a variant it is printed in, refused when short.
  const cr = boot({ ...SAVE, dust: C.craftCost("common", "n") }).e;
  // THE CHASE IS PACKS ONLY: no dust buys a Special illustration rare or a Mega Hyper Rare.
  const rich = boot({ ...SAVE, dust: 1e7 }).e;
  for (const r of C.PACK_ONLY) {
    const chase = set.CARDS.find((c) => c[3] === r);
    if (!chase) continue;                       // a rung this set does not print (a Hyper rare in Mega Evolution)
    assert.equal(rich.craftCard(set, chase[0], "h"), false, `a ${r} was crafted`);
  }
  assert.equal(rich.state.dust, 1e7, "a refused craft spent dust");
  // With dust for any craft at all, so only the printing can refuse it.
  assert.equal(boot({ ...SAVE, dust: 1e6 }).e.craftCard(set, common[0], "h"), false,
    "a common was crafted in a holo it is never printed in");
  assert.equal(cr.craftCard(set, rare[0], "h"), false, "a craft was paid for with dust not held");
  assert.equal(cr.craftCard(set, common[0], "n"), true);
  assert.equal(cr.state.dust, 0);
  assert.equal(cr.state.cards[key(common)].n, 1);

  // MILESTONES pay once, as a share is reached, and never again.
  const quarter = Math.ceil(C.MILESTONES[0][0] * set.CARDS.length);
  const most = Object.fromEntries(set.CARDS.slice(0, quarter - 1).map((c) => [key(c), { [c[4][0]]: 1 }]));
  const ms = boot({ ...SAVE, cards: most, dust: C.craftCost(set.CARDS[quarter - 1][3], set.CARDS[quarter - 1][4][0]) * 2 }).e;
  const d0 = ms.state.dust;
  ms.craftCard(set, set.CARDS[quarter - 1][0], set.CARDS[quarter - 1][4][0]);
  assert.equal(ms.state.milestones.me01, 1, "reaching a quarter of the set paid no milestone");
  assert.equal(ms.state.dust, d0 - C.craftCost(set.CARDS[quarter - 1][3], set.CARDS[quarter - 1][4][0]) + C.MILESTONES[0][1]);
  const d1 = ms.state.dust;
  ms.craftCard(set, set.CARDS[quarter - 1][0], set.CARDS[quarter - 1][4][0]);
  assert.equal(ms.state.milestones.me01, 1, "a milestone paid twice");
  assert.ok(ms.state.dust < d1, "a second craft paid a milestone again");

  // THE PULLS WALL and THE DAILY FIRST PACK: every hit logged; the first pack
  // of a day says so, the second does not, and the rolls ignore it.
  const real = Math.random;
  try {
    Math.random = () => 0.05;                // the rare slot is an ultra, the second reverse an illustration
    const lg = boot({ ...SAVE, packs: { me01: 2 }, cardDay: null }).e;
    const a = lg.openCardPack(set);
    assert.equal(a.daily, true, "the day's first pack was not the daily one");
    assert.ok(lg.state.cardLog.length >= 2 && lg.state.cardLog.every(([id]) => id.startsWith("me01-")), "the hits were not logged");
    assert.ok(C.isHit(set.CARDS.find((c) => key(c) === lg.state.cardLog[0][0])[3]));
    const b = lg.openCardPack(set);
    assert.equal(b.daily, false, "a second pack the same day was daily too");
  } finally { Math.random = real; }
  /* PHASE 3: a box costs its price for its packs, at its set's level only;
     Open all opens every held pack as one save; a 7th day of a streak pays
     a pack. */
  {
    const { LEVEL_XP } = await import("../src/game/biomes.js");
    const B = boot({ ...SAVE, money: C.BOXES.me01.price + 1 }).e;
    assert.equal(B.buyBox("me01"), true);
    assert.equal(B.state.money, 1, "a box did not cost its price");
    assert.equal(B.state.packs.me01, C.BOXES.me01.packs, "a box did not hold its packs");
    assert.equal(B.buyBox("me01"), false, "a box was sold past the wallet");
    const lowB = boot({ ...SAVE, money: 1e6, xp: LEVEL_XP[C.SET_LEVEL["me02.5"] - 3], paid: C.SET_LEVEL["me02.5"] - 2 }).e;
    assert.equal(lowB.buyBox("me02.5"), false, "a bundle was sold below its set's level");
    for (const id of Object.keys(C.BOXES)) {
      assert.ok(C.BOXES[id].price < C.BOXES[id].packs * C.PACK_PRICE, `${id}'s ${C.BOXES[id].name} is no discount`);
    }

    const { e: all, changes: allChanges } = boot({ ...SAVE, packs: { me01: 5 } });
    const n0 = allChanges();
    const got = all.openAllPacks(set);
    assert.equal(got.length, 5, "Open all did not open every held pack");
    assert.equal(allChanges() - n0, 1, "Open all was not one changed()");
    assert.equal(all.state.packs.me01, undefined);
    assert.equal(all.openAllPacks(set), null, "Open all with nothing held opened something");
    // Open 10 opens ten, no more.
    const ten = boot({ ...SAVE, packs: { me01: 12 } }).e;
    assert.equal(ten.openAllPacks(set, 10).length, 10, "Open 10 did not open ten");
    assert.equal(ten.state.packs.me01, 2, "Open 10 opened more than ten");

    const { dayKey } = await import("../src/game/daily.js");
    const { dailyFor } = await import("../src/game/daily.js");
    const today = dayKey();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const st = boot({ ...SAVE, daily: { key: today, done: dailyFor(today).need, claimed: false,
      streak: C.STREAK_PACK - 1, last: dayKey(y) } }).e;
    const before = Object.values(st.state.packs).reduce((a, b) => a + b, 0);
    const won = st.claimDaily();
    assert.equal(won.streak % C.STREAK_PACK, 0, "the test's streak did not reach its pack day");
    assert.ok(won.pack, "a 7th day of a streak paid no pack");
    assert.equal(Object.values(st.state.packs).reduce((a, b) => a + b, 0), before + 1);
    assert.deepEqual(st.state.earnedPacks[won.pack], [`streak:${won.streak}`]);
  }
  /* PHASE 4: the box of choice, the showcase, the master set, the titles - and
     a generation's Pokédex, paid even to a save that finished it before the
     medal existed (the asker's own case). */
  {
    const T = await import("../src/game/titles.js");
    const M = await import("../src/game/medals.js");
    const { dexIndex: di, speciesById: byId } = await import("../src/game/biomes.js");
    const { SPECIES } = await import("../src/data/dex.js");
    const { CARD_SETS } = await import("../src/data/cards/index.js");
    const kanto = M.MEDALS.find((m) => m.id === "gen:1");
    const dex = Array(SAVE.dex.length).fill(0);
    for (const id of kanto.need) dex[di(id)] = 2;
    const old = { ...SAVE, dex, medals: [], caught: 151, bag: { ...SAVE.bag, "master-ball": 0 } };
    /* CLAIMED, NEVER PAID ON ITS OWN (asked for, 2026-10-03): a finished
       Kanto is a claim at load, and nothing moves until it is pressed. */
    const g = boot(old).e;
    assert.deepEqual(g.dexClaims(), [1], "a finished Kanto is not a claim");
    assert.ok(!g.state.medals.includes("gen:1") && g.state.money === old.money, "a finished Pokédex paid without a claim");
    const won = g.claimDex(() => 0.999);
    const last = CARD_SETS.at(-1).id;
    assert.deepEqual([won.gen, won.set, won.packs], [1, last, C.BOXES[last].packs], "the claim did not roll the set it said");
    assert.ok(g.state.medals.includes("gen:1"), "the claim banked no medal");
    assert.equal(g.state.bag["master-ball"], 1, "the Kanto medal paid no Master Ball");
    assert.equal(g.state.money, old.money + kanto.money, "the Kanto medal did not pay its money");
    assert.deepEqual(g.state.earnedPacks[last], Array(C.BOXES[last].packs).fill("dex:1"), "the box's packs are not earned and stamped");
    assert.equal(g.claimDex(), null, "a claimed Pokédex claimed twice");
    assert.deepEqual(g.dexClaims(), [], "a claimed Pokédex is still a claim");
    assert.ok(!g.state.medals.includes("gen:2"), "an unfinished generation paid");
    await new Promise((r) => setTimeout(r, 600));
    const again = boot(JSON.parse(store.get("meadow-route"))).e;
    assert.deepEqual(again.dexClaims(), [], "the Kanto claim came back after a reload");
    // A box of choice from before is a claim too, rolled; the medal is not paid again.
    const vou = boot({ ...old, medals: ["gen:1"], boxVouchers: ["dex:1"] }).e;
    assert.deepEqual(vou.dexClaims(), [1]);
    const v = vou.claimDex(() => 0);
    assert.deepEqual([v.set, v.medal, vou.state.money], [CARD_SETS[0].id, false, old.money], "an old voucher paid its medal again");
    assert.deepEqual(vou.state.boxVouchers, [], "an old voucher was not spent");

    /* A LOOK FINISHES ITS FAMILY: Johto with Unown B and never Unown A is
       finished (reported: a whole Johto paid nothing). */
    const johto = M.MEDALS.find((m) => m.id === "gen:2");
    const jd = Array(SAVE.dex.length).fill(0);
    for (const id of johto.need) jd[di(id)] = 2;
    jd[di(201)] = 0;
    const unownB = SPECIES.find((sp) => sp.form === "look" && sp.of === 201).id;
    jd[di(unownB)] = 2;
    assert.deepEqual(M.genMedalsDue(jd).map((m) => m.id), ["gen:2"], "Johto with a lettered Unown is not finished");
    assert.ok(M.medalsFor(unownB, jd).some((m) => m.id === "gen:2"), "catching a lettered Unown did not finish Johto");
    // Where the reward stands, for the Dex's region bar.
    assert.equal(M.genReward(2, jd).ready, true, "Johto with every species was not ready");
    assert.equal(M.genReward(2, jd, ["gen:2"]).claimed, true);
    jd[di(unownB)] = 0;
    assert.deepEqual(M.genMedalsDue(jd), [], "Johto without any Unown is finished");
    assert.equal(M.genReward(2, jd).left, 1, "Johto without any Unown is not one short");
    // The Pokédex Charm: Kanto's species only, a Mega through to its base.
    assert.equal(M.dexCharm(25, g.state.medals), M.DEX_CHARM);
    assert.equal(M.dexCharm(10033, g.state.medals), M.DEX_CHARM, "Mega Venusaur did not read through to Kanto");
    assert.equal(M.dexCharm(152, g.state.medals), 1, "Johto took Kanto's charm");
    assert.deepEqual(T.titleIds({}, g.state.medals), ["dex:1"]);
    assert.equal(T.titleName("dex:1"), "Kanto Dex Master");

    // The showcase: held printings only, the cap, off again.
    const sh = boot({ ...SAVE, cards: { "me01-001": { n: 1 }, "me01-003": { h: 1 } } }).e;
    assert.equal(sh.showCard("me01-001", "r"), false, "a printing not held went on the trainer card");
    assert.equal(sh.showCard("me01-001", "n"), true);
    assert.equal(sh.showCard("me01-003", "h"), true);
    assert.deepEqual(sh.state.cardShowcase, ["me01-001:n", "me01-003:h"]);
    sh.showCard("me01-001", "n", false);
    assert.deepEqual(sh.state.cardShowcase, ["me01-003:h"]);
    const full = boot({ ...SAVE, cards: { "me01-001": { n: 1 } }, cardShowcase: Array.from({ length: C.CARD_SHOW }, (_, k) => `x-${k}:n`) }).e;
    assert.equal(full.showCard("me01-001", "n"), false, "the showcase went past its cap");

    // The master set: every printing, once, past the whole-set step.
    const allButOne = Object.fromEntries(set.CARDS.map((c) => [C.cardId("me01", c[0]),
      Object.fromEntries(c[4].split("").map((v) => [v, 1]))]));
    const lastCard = set.CARDS.find((c) => C.canCraft(c[3]) && c[4].includes("r"));
    allButOne[C.cardId("me01", lastCard[0])] = { [lastCard[4][0]]: 1 };      // the reverse is missing
    const ms = boot({ ...SAVE, cards: allButOne, milestones: { me01: C.MILESTONES.length }, dust: 1e6 }).e;
    const d0 = ms.state.dust;
    assert.equal(ms.craftCard(set, lastCard[0], "r"), true);
    assert.equal(ms.state.milestones.me01, T.MASTER_STEP, "the last printing did not complete the master set");
    assert.equal(ms.state.dust, d0 - C.craftCost(lastCard[3], "r") + C.MASTER_DUST, "the master set did not pay its dust");
    assert.deepEqual(T.titleIds(ms.state.milestones, []), ["master:me01", "set:me01"]);
    void byId;
  }
  console.log("cards dust ok — spares only (never the last copy or an earned one), rares and the sweep ask, " +
    "crafts cost exactly, milestones pay once, every hit reaches the Pulls wall, and the daily pack is the day's first");
}
{
  const { dayKey } = await import("../src/game/daily.js");
  const { outbreakPool } = await import("../src/game/events.js");
  const { BIOMES } = await import("../src/game/biomes.js");
  const pool = outbreakPool(BIOMES.find((b) => b.id === "meadow"), 50);
  const ob = { key: dayKey(), areaId: "meadow", speciesId: pool[pool.length - 1], left: 7 };
  await savedField("outbreak", ob, { key: 5, areaId: "nowhere", speciesId: -1, left: 99 }, null);
  assert.equal(boot({ ...SAVE, outbreak: { ...ob, left: 16 } }).e.state.outbreak, null,
    "an outbreak with more left than an outbreak holds was trusted");

  /* AN OUTBREAK SPAWNS, COUNTS DOWN, AND ENDS WITH A NOTICE - through a real
     step, because the substitution lives in `startEncounter` and nothing else
     can see it. `Math.random` pinned low makes every roll land: the step
     spawns, the outbreak takes it, and the tier rolls. One real step from a
     walkable direction, found rather than named, then run from it. */
  const real = Math.random;
  const step = (e) => {
    Math.random = () => 0.01;
    try {
      for (const dir of ["right", "down", "left", "up"]) {
        e.press(dir);
        for (let i = 0; i < 30 && !e.state.encounter; i++) tick(16);
        e.clearHeld();
        if (e.state.encounter) break;
      }
    } finally { Math.random = real; }
    const enc = e.state.encounter;
    assert.ok(enc, "a step with every roll landing started no encounter");
    until(e, (st) => st.encounter?.phase === "idle", "the encounter to settle");
    e.flee(true);           // leaving, whatever it is - an alpha would ask
    until(e, (st) => !st.encounter, "the encounter to close", 4000);
    return enc;
  };
  const e = boot({ ...SAVE, outbreak: { ...ob, left: 2 } }).e;
  const met = step(e);
  assert.equal(met.speciesId, ob.speciesId, "an outbreak step did not meet the outbreak species");
  // Not a number on an ordinary one either: `enc.alpha && <x/>` renders a 0 as "0".
  assert.equal(typeof met.alpha, "boolean", "enc.alpha is not a boolean");
  assert.equal(e.state.outbreak.left, 1, "meeting the outbreak did not count it down");
  assert.equal(e.events()[0]?.id, "outbreak", "a running outbreak has no event card");
  step(e);
  assert.equal(e.state.outbreak.left, 0, "the last of the outbreak did not count down to 0");
  assert.ok(e.state.worn.some((w) => w.id === "outbreak" && w.event),
    "an outbreak ended without a notice");
  assert.deepEqual(e.events().filter((ev) => ev.id !== "rift"), [], "an outbreak that is over still has a card");
  assert.equal(e.outbreakArea(), null, "an outbreak that is over still badges a map");

  // Off its own map an outbreak takes nothing.
  const off = boot({ ...SAVE, outbreak: { ...ob, areaId: "pond" } }).e;
  assert.equal(off.outbreakArea(), "pond", "the Travel badge names the wrong map");
  step(off);
  assert.equal(off.state.outbreak.left, 7, "an outbreak on another map took this map's encounter");
}
console.log("saved fields ok — dry, outbreak: missing loads empty, a value survives a reload, garbage is dropped");
console.log("outbreak ok — spawns on its map, counts down, ends with a notice");

/* RESEARCH COUNTS REAL PLAY. The save half first, then a catch through a real
   step and a real throw: the tasks read facts frozen on the encounter, and
   only a live catch can show that `settle` actually reads them. The species
   is forced with an outbreak, the one honest way to choose what a step meets. */
{
  const { dayKey } = await import("../src/game/daily.js");
  const { outbreakPool } = await import("../src/game/events.js");
  const { BIOMES, speciesById } = await import("../src/game/biomes.js");
  const { sellValue } = await import("../src/game/items.js");
  const { TASKS, researchLevel, researchPay, researchLift, RESEARCH_MAX, RESEARCH_LIFT, STAR_COST } =
    await import("../src/game/research.js");
  const slot = (id) => TASKS.findIndex((t) => t.id === id);

  await savedField("research", { 16: [3, 1, 0, 0, 1, 0, 0, 0] }, "junk", {});
  // One bad row costs that row, never the rest.
  assert.deepEqual(boot({ ...SAVE, research: { 16: [1], 99999: [1], 19: "x", 21: [-2] } }).e.state.research,
    { 16: [1] }, "a damaged research row took the good ones with it, or was kept");

  const pool = outbreakPool(BIOMES.find((b) => b.id === "meadow"), 50);
  const id = pool[0];
  /* Short by exactly what this test does live: a berry, then a first-ball
     catch that lands a rare form (the pinned roll makes one). `fed`, `first`
     and `variant` start at 0, or asserting them would prove nothing. */
  const start = { catch: 10, night: 1, xs: 1, xl: 1, evolve: 1 };
  const nearly = TASKS.map((t) => start[t.id] ?? 0);
  assert.ok(researchLevel(id, nearly) < RESEARCH_MAX - 1, "the fixture is nearly finished already");
  const { e } = boot({ ...SAVE,
    outbreak: { key: dayKey(), areaId: "meadow", speciesId: id, left: 5 },
    research: { [id]: nearly } });

  const real = Math.random;
  Math.random = () => 0.01;              // the step spawns, the outbreak takes it, the throw lands
  try {
    for (const dir of ["right", "down", "left", "up"]) {
      e.press(dir);
      for (let i = 0; i < 30 && !e.state.encounter; i++) tick(16);
      e.clearHeld();
      if (e.state.encounter) break;
    }
    assert.equal(e.state.encounter?.speciesId, id, "the research test met the wrong species");
    until(e, (st) => st.encounter?.phase === "idle", "the encounter to settle");
    assert.equal(e.useBerry("razz-berry"), true, "the berry was refused");
    assert.equal(e.state.research[id][slot("fed")], 1, "feeding a berry did not count");
    assert.ok(researchLevel(id, e.state.research[id]) > researchLevel(id, nearly), "a berry did not level research");
    const money = e.state.money;
    e.throwBall("poke-ball");
    until(e, (st) => !st.encounter || st.encounter.phase === "caught", "the catch");
    const row = e.state.research[id];
    assert.equal(row[slot("variant")], 1, "a rare-form catch did not count");
    assert.equal(row[slot("first")], 1, "a first-ball catch did not count");
    assert.equal(researchLevel(id, row), RESEARCH_MAX, "the last level was not reached");
    assert.ok(e.state.cheers.some((c) => c.kind === "research"), "finishing research raised no banner");
    assert.ok(e.state.money - money >= researchPay(sellValue(speciesById(id)), 1),
      "the research level crossed on the catch was not paid");
  } finally { Math.random = real; }
  until(e, (st) => !st.encounter, "the encounter to close", 4000);
}
console.log("research ok — counts a real catch, a first ball and a berry, pays the level, banners the tenth");

/* A STAR: finished research, paid for in ordinary ones. Which ten go is the
   part that can hurt a collection - the lowest levels, never a keeper - so the
   box holds more than ten, at different levels, beside a shiny and an alpha. */
{
  const { TASKS, researchLift, RESEARCH_LIFT, STAR_COST } = await import("../src/game/research.js");
  await savedField("stars", [16], "junk", []);
  assert.deepEqual(boot({ ...SAVE, stars: [16, 16, 99999, "x"] }).e.state.stars, [16],
    "a damaged star list kept its garbage or lost its good entry");

  const id = 16;
  const done = TASKS.map((t) => t.steps.at(-1));
  const box = Array.from({ length: STAR_COST + 2 }, (_, i) =>
    ({ uid: i + 1, species: id, level: 5 + i, size: 100, at: 1 }));
  box.push({ uid: 50, species: id, level: 1, size: 100, shiny: 1, at: 1 },
    { uid: 51, species: id, level: 1, size: 150, alpha: 1, at: 1 });
  const fresh = (extra) => boot({ ...SAVE, box: structuredClone(box), nextUid: 52,
    research: { [id]: done }, ...extra }).e;

  const e = fresh();
  assert.equal(e.star(id), true, "finished research with enough ordinary ones could not be starred");
  assert.equal(e.state.ask?.kind, "star", "starring did not ask first");
  assert.deepEqual(e.state.stars, [], "the star was taken before the answer");
  e.answerAsk(true);
  assert.deepEqual(e.state.stars, [id], "answering yes did not star it");
  assert.deepEqual(e.state.box.map((m) => m.uid).sort((a, b) => a - b), [STAR_COST + 1, STAR_COST + 2, 50, 51],
    "the star spent the wrong ones - a keeper, or higher levels before lower");
  assert.equal(researchLift(id, e.state.stars), RESEARCH_LIFT, "a starred species is not lifted");
  assert.equal(e.star(id), false, "a species was starred twice");

  assert.equal(fresh({ box: structuredClone(box).slice(0, STAR_COST - 1) }).star(id), false,
    "a star was offered with fewer than its ordinary ones");
  assert.equal(fresh({ research: { [id]: done.map((n, i) => (i === 0 ? n - 1 : n)) } }).star(id), false,
    "unfinished research was starred");

  /* A LEGENDARY: its catch credited from the dex on load, Lv 100 credited by
     candy - and its star spends one, never the last one you hold. */
  const { LEGENDARY, dexIndex } = await import("../src/game/biomes.js");
  const { researchLevel, RESEARCH_MAX } = await import("../src/game/research.js");
  const leg = LEGENDARY[0];
  const at = (tid) => TASKS.findIndex((t) => t.id === tid);
  const dex = [...SAVE.dex]; dex[dexIndex(leg)] = 2;
  const one = [{ uid: 60, species: leg, level: 50, size: 100, at: 1 }];
  const le = boot({ ...SAVE, dex, box: one, nextUid: 99, candy: 80 }).e;
  assert.equal(le.state.research[leg]?.[at("legend")], 1,
    "a legendary already in the dex did not have its catch credited on load");
  assert.equal(le.levelUp(60, 50), 50, "the legendary could not be raised");
  assert.equal(le.state.research[leg][at("hundred")], 1, "raising a legendary to Lv 100 did not count");
  const legDone = TASKS.map((t) => t.steps.at(-1));
  assert.equal(researchLevel(leg, legDone), RESEARCH_MAX, "the finished legendary row is not finished");
  const two = [...one, { uid: 61, species: leg, level: 70, size: 100, at: 1 }];
  assert.equal(boot({ ...SAVE, dex, box: structuredClone(one), nextUid: 99, research: { [leg]: legDone } }).e.star(leg),
    false, "a legendary's star spent the only one held");
  const ls = boot({ ...SAVE, dex, box: structuredClone(two), nextUid: 99, research: { [leg]: legDone } }).e;
  assert.equal(ls.star(leg), true, "a finished legendary with a spare could not be starred");
  ls.answerAsk(true);
  assert.deepEqual(ls.state.box.filter((m) => m.species === leg).map((m) => m.uid), [61],
    "a legendary's star did not spend exactly the lower-level one");
  const no = fresh();
  no.star(id);
  no.answerAsk(false);
  assert.equal(no.state.box.length, box.length, "cancelling the star still spent the ordinary ones");

  /* A DEFENDER GOES LAST, AND SAYS SO (docs/ranked.md, the warning deferred
     from 6c). `setDefense` takes `my_defense` as the server answers it; a
     member gone from the saved box defends nothing; the lowest-level one here
     defends, so the star passes over it, and the question names it when a
     star cannot. Never saved: it is the server's, read again at sign-in. */
  const { defenders } = await import("../src/game/ranked.js");
  const teams = [{ slot: 1, team: [{ uid: 1, species: id }, { uid: 77, missing: true }] },
    { slot: 2, team: [{ uid: 1, species: id }] }];
  assert.deepEqual(defenders(teams), { 1: "Teams A and B" }, "a defender's teams are misnamed, or a gone one defends");
  const d = fresh();
  d.setDefense(teams);
  d.star(id);
  assert.ok(!/defends/.test(d.state.ask.body), "the star asked about a defender it did not have to take");
  d.answerAsk(true);
  assert.ok(d.state.box.some((m) => m.uid === 1), "the star spent a defender while ordinary ones were left");
  assert.ok(!("defense" in d.exportSave()), "who defends rode in the save");
  const forced = fresh({ box: structuredClone(box).slice(0, STAR_COST) });
  forced.setDefense(teams);
  forced.star(id);
  assert.match(forced.state.ask.body, /\(Teams A and B\) defends in ranked/, "a star that must take a defender did not say so");
}
console.log("star ok — asks first, spends the lowest ordinary ones and never a keeper, once, only when finished; a defender last, and named");

/* AN ALPHA, END TO END, through a real step and real throws - it is a flag on
   the encounter that four different places have to read (the flee roll, the
   catch, the box copy, the sweep), and a flag dropped by any one of them is
   silent. The species is forced with an outbreak; `Math.random` pinned at
   0.001 lands BOTH rolls - the alpha and a tier - which is the point of the
   alpha being a layer rather than a rung: this one is an alpha AND a rare form. */
{
  const { dayKey } = await import("../src/game/daily.js");
  const { outbreakPool } = await import("../src/game/events.js");
  const { BIOMES, speciesById, canBeAlpha, SIZE_MAX } = await import("../src/game/biomes.js");
  const { alphaCandy } = await import("../src/game/items.js");
  const { TASKS } = await import("../src/game/research.js");
  const { TIERS: TIERS_ALL } = await import("../src/game/biomes.js");
  const id = outbreakPool(BIOMES.find((b) => b.id === "meadow"), 50).find(canBeAlpha);
  const { e } = boot({ ...SAVE, outbreak: { key: dayKey(), areaId: "meadow", speciesId: id, left: 5 } });

  const real = Math.random;
  try {
    Math.random = () => 0.001;
    for (const dir of ["right", "down", "left", "up"]) {
      e.press(dir);
      for (let i = 0; i < 30 && !e.state.encounter; i++) tick(16);
      e.clearHeld();
      if (e.state.encounter) break;
    }
    const enc = e.state.encounter;
    assert.equal(enc?.speciesId, id, "the alpha test met the wrong species");
    assert.equal(enc.alpha, true, "a roll under 1 in 250 did not make an alpha - or made it a number, which renders as \"0\" in JSX");
    assert.ok(enc.variant, "an alpha could not also be a rare form - the two rolls are not independent");
    assert.ok(enc.size > SIZE_MAX, `an alpha came out size ${enc.size}`);
    until(e, (st) => st.encounter?.phase === "idle", "the encounter to settle");

    /* A MISS THAT WOULD HAVE FLED. The throw's two rolls are the catch then
       the flee: 0.99 misses, 0 would run from any ordinary Pokemon. */
    const rolls = [0.99, 0];
    Math.random = () => (rolls.length ? rolls.shift() : 0.5);
    const col = e.state.colRev, rev = e.state.rev;
    e.throwBall("poke-ball");
    until(e, (st) => !st.encounter || ["idle", "fled", "caught"].includes(st.encounter.phase),
      "the missed throw to resolve", 4000);
    /* A THROW'S ANIMATION IS NOT THE COLLECTION. Every phase bumped `colRev`
       once, so the Dex, the Box and the rail rebuilt seven times a throw -
       the lag reported on every variant catch. The throw itself and its
       result may; the phases between may not (they still move `rev`). */
    assert.ok(e.state.colRev - col <= 2, `one throw rebuilt the collection panels ${e.state.colRev - col} times`);
    assert.ok(e.state.rev - rev > e.state.colRev - col, "a throw's phases no longer redraw the scene");
    assert.ok(e.state.encounter && e.state.encounter.phase === "idle",
      `an alpha that should never flee ended the throw ${e.state.encounter?.phase ?? "gone"}`);

    // Running from an alpha asks first, as from a legendary.
    e.flee();
    assert.equal(e.state.ask?.kind, "flee", "running from an alpha did not ask first");
    e.answerAsk(false);
    assert.equal(e.state.encounter?.phase, "idle", "cancelling the run still ran");

    Math.random = () => 0.001;
    const candy = e.state.candy;
    e.throwBall("poke-ball");
    until(e, (st) => !st.encounter || st.encounter.phase === "caught", "the alpha to be caught");
    assert.equal(e.state.candy - candy, alphaCandy(speciesById(id)), "the alpha's candy was not paid");
    assert.ok(e.state.cheers.some((c) => c.kind === "alpha"), "catching an alpha raised no banner");
    assert.equal(e.state.research[id][TASKS.findIndex((t) => t.id === "alpha")], 1,
      "an alpha catch did not count for research");
    // An alpha rare form is not an ordinary one: a star must never count it.
    assert.equal(e.state.research[id][TASKS.findIndex((t) => t.id === "catch")], 0,
      "an alpha rare form counted as an ordinary catch");
  } finally { Math.random = real; }
  until(e, (st) => !st.encounter, "the encounter to close", 4000);

  const mon = e.state.box.at(-1);
  assert.equal(mon.alpha, 1, "the alpha flag did not reach the box");
  assert.ok(TIERS_ALL.some((t) => mon[t]), "the alpha's tier did not reach the box beside it");
  assert.equal(e.sell([mon.uid]), 0, "an alpha was sold");
  assert.ok(e.state.box.includes(mon), "selling took the alpha out of the box");

  e.setChar(e.state.char === "red" ? "leaf" : "red");     // any real change saves
  await new Promise((r) => setTimeout(r, 600));
  const back = boot(JSON.parse(store.get("meadow-route"))).e.state.box.find((m) => m.uid === mon.uid);
  assert.equal(back?.alpha, 1, "the alpha flag did not survive a save and a reload");
  assert.equal(back.size, mon.size, "the alpha's size did not survive a save and a reload");
}
console.log("alpha ok — never flees, caught pays candy and research, boxed, unsellable, survives a reload");

/* LUSTRE REACHES THE ENGINE'S TIER ROLL. One fixed roll, 1.25x past the
   likeliest open tier's odds under the outbreak's lift: no rare form at rank 0,
   one at rank 20 (x1.5). The outbreak pins the species, as the alpha test's. */
{
  const { dayKey } = await import("../src/game/daily.js");
  const { outbreakPool, OUTBREAK_LIFT } = await import("../src/game/events.js");
  const { BIOMES, TIER_ODDS, lockedTiers } = await import("../src/game/biomes.js");
  const id = outbreakPool(BIOMES.find((b) => b.id === "meadow"), 50)[0];
  const top = Math.max(...TIER_ODDS.filter(([t]) => !lockedTiers(id)?.has(t)).map(([, o]) => o));
  const met = (lustre) => {
    const { e } = boot({ ...SAVE, stats: { lustre },
      outbreak: { key: dayKey(), areaId: "meadow", speciesId: id, left: 5 } });
    const real = Math.random;
    try {
      Math.random = () => top * OUTBREAK_LIFT * 1.25;
      for (const dir of ["right", "down", "left", "up"]) {
        e.press(dir);
        for (let i = 0; i < 30 && !e.state.encounter; i++) tick(16);
        e.clearHeld();
        if (e.state.encounter) break;
      }
    } finally { Math.random = real; }
    assert.equal(e.state.encounter?.speciesId, id, "the Lustre test met the wrong species");
    return e.state.encounter.variant;
  };
  assert.equal(met(0), null, "the fixed roll made a rare form with no Lustre - the test proves nothing");
  assert.ok(met(20), "Lustre 20 did not lift the engine's tier roll");
}
console.log("lustre ok — rank 20 turns a roll just past the odds into a rare form");

/* LOOKS, THROUGH THE ENGINE (2026-10-01). Walking Tanoby meets Unown in more
   than one letter; Type: Null evolves into the Silvally the roll picks; a Blue
   Flabebe evolves into a Blue Floette, by its own row and with no roll. */
{
  const { looksOf, speciesById } = await import("../src/game/biomes.js");
  const { FORMS } = await import("../src/data/forms.js");
  const letters = new Set();
  {
    const { e } = boot({ ...SAVE, areaId: "tanoby" });
    for (let i = 0; i < 12; i++) {
      const enc = walkToEncounter(e);
      assert.ok(enc && looksOf(201).includes(enc.speciesId),
        `Tanoby met ${enc && speciesById(enc.speciesId)?.name} - it is Unown's alone`);
      letters.add(enc.speciesId);
      e.flee();
      if (e.state.ask) e.answerAsk(true);
      until(e, (st) => !st.encounter, "the Unown to be left", 4000);
    }
    assert.ok(letters.size > 1, "twelve Unown were all one letter - meeting does not roll a look");
  }

  const silvally = looksOf(773);
  const pick = silvally.length - 1;
  const { e } = boot({ ...SAVE, box: [
    { uid: 1, species: 772, level: 100 },
    { uid: 2, species: FORMS.find((f) => f.name === "flabebe-blue").id, level: 40 },
  ], nextUid: 3 });
  const real = Math.random;
  try {
    Math.random = () => (pick + 0.5) / silvally.length;
    assert.ok(e.evolve(1, 773), "Type: Null would not evolve");
  } finally { Math.random = real; }
  assert.equal(e.state.box[0].species, silvally[pick],
    `Type: Null became ${speciesById(e.state.box[0].species).name}, not the Silvally its roll picked`);
  e.closeEvolution();

  const blue = FORMS.find((f) => f.name === "floette-blue").id;
  try {
    Math.random = () => { throw new Error("a look's own evolution rolled"); };
    assert.ok(e.evolve(2, blue), "Blue Flabebe would not evolve into Blue Floette");
  } finally { Math.random = real; }
  assert.equal(e.state.box[1].species, blue, "Blue Flabebe lost its colour evolving");
  console.log(`looks ok — ${letters.size} Unown letters in 12 meetings, Type: Null rolled ` +
    `${speciesById(silvally[pick]).name}, Blue Flabebe kept its colour`);
}

/* A BOX ENTRY WEARING A TIER PROVES THE TIER. If the tier row lost it (a save
   from before the row existed, a hand edit), loading sets it back from the
   entry - or the Dex says you have never found the one you are holding. */
{
  const { dexIndex } = await import("../src/game/biomes.js");
  const old = { ...SAVE, box: [{ uid: 1, species: 16, level: 30, size: 100, shiny: 1, at: 1 }], nextUid: 2 };
  delete old.shiny;
  const st = boot(old).e.state;
  assert.equal(st.shiny[dexIndex(16)], 1, "a shiny in the box did not register its tier row on load");
}
console.log("tier repair ok — a boxed tier registers its row on load");

/* A SAVED SPOT THE MAP NO LONGER HAS - rock, or off the edge - loads at the
   map's way in, not inside a wall. */
{
  const { AREAS } = await import("../src/game/mapdata.js");
  const rows = AREAS.ember.rows;
  const y = rows.findIndex((r) => r.includes("M"));
  for (const player of [{ x: rows[y].indexOf("M"), y, dir: "up" }, { x: 999, y: 999, dir: "up" }]) {
    const st = boot({ ...SAVE, areaId: "ember", xp: 60000, player }).e.state;
    assert.deepEqual([st.player.x, st.player.y], [AREAS.ember.spawn.x, AREAS.ember.spawn.y],
      `a save standing at ${player.x},${player.y} on rock loaded there`);
  }
}
console.log("stranded ok — a saved spot on rock or off the map loads at the map's way in");

/* TRADING, PHASE 0: the client's half (docs/trading.md). What the server says
   arrives through ONE engine call, `reconcileTrades`, so every rule about a
   traded Pokemon is tested here without a network. */
{
  const { dexIndex } = await import("../src/game/biomes.js");
  const { TASKS } = await import("../src/game/research.js");
  const { duplicateUids } = await import("../src/game/items.js");
  const M = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const dexWith = (...ids) => SAVE.dex.map((v, i) => (ids.some((id) => dexIndex(id) === i) ? 2 : v));

  /* A TRADE COUNTS (your call, 2026-10-03). A save from before, whose traded
     species were held back as `gifted`, is paid what they finish ONCE at load:
     here the smallest medal there is, finished by the trade of one of it. */
  {
    const { MEDALS } = await import("../src/game/medals.js");
    const line = MEDALS.filter((m) => m.kind !== "gen" && m.kind !== "dex").sort((a, b) => a.need.length - b.need.length)[0];
    const old = { ...SAVE, dex: dexWith(...line.need), gifted: [line.need[0]], medals: [] };
    const g = boot(old).e;
    assert.ok(g.state.medals.includes(line.id), "a medal finished by a traded species was not paid at load");
    assert.equal(g.state.money, old.money + line.money, "the medal a trade finished paid the wrong money");
    assert.deepEqual(g.state.gifted, [], "the legacy gift list was not cleared once paid");
    await new Promise((r) => setTimeout(r, 600));
    const again = boot(JSON.parse(store.get("meadow-route"))).e;
    assert.equal(again.state.money, g.state.money, "a medal finished by a trade paid twice across a reload");
  }

  // A box entry's trade fields: kept when sound, each dropped alone when not.
  const good = { uid: 1, species: 16, level: 5, size: 100, at: 1, mid: M(1), ot: "Ash", traded: 2, lock: "offer" };
  const bad = { uid: 2, species: 16, level: 5, size: 100, at: 1, mid: "nope", ot: "<b>x</b>", traded: -1, lock: "steal" };
  const st = boot({ ...SAVE, box: [good, bad], nextUid: 3, dex: dexWith(16) }).e.state;
  assert.deepEqual(st.box.find((m) => m.uid === 1), good, "a sound traded entry lost a field on load");
  const b2 = st.box.find((m) => m.uid === 2);
  assert.ok(b2, "a box entry with bad trade fields was dropped instead of cleaned");
  assert.ok(!("mid" in b2) && !("ot" in b2) && !("traded" in b2) && !("lock" in b2),
    `bad trade fields were kept: ${JSON.stringify(b2)}`);
  // The load-time repair raises the dex from a traded entry, never its tier row.
  const rep = boot({ ...SAVE, nextUid: 2, box: [{ uid: 1, species: 25, level: 5, size: 100, at: 1, mid: M(7), traded: 1, shiny: 1 }] }).e.state;
  assert.equal(rep.dex[dexIndex(25)], 2, "a traded entry did not prove its dex entry on load");
  assert.equal(rep.shiny[dexIndex(25)] ?? 0, 0, "a traded shiny set its tier row on load");

  // LOCKED MEANS FROZEN, enforced in the engine for every action.
  const box = [
    { uid: 1, species: 16, level: 30, size: 100, at: 1, mid: M(1), lock: "listing" },
    { uid: 2, species: 16, level: 5, size: 100, at: 1 },
    { uid: 3, species: 16, level: 4, size: 100, at: 1 },
  ];
  const e = boot({ ...SAVE, box: structuredClone(box), nextUid: 4, candy: 50, dex: dexWith(16) }).e;
  assert.equal(e.sell([1]), 0, "a locked Pokemon was sold");
  assert.equal(e.convert([1]), 0, "a locked Pokemon was converted");
  assert.equal(e.levelUp(1, 5), 0, "a locked Pokemon was levelled");
  assert.equal(e.evolve(1, 17), null, "a locked Pokemon evolved");
  assert.ok(e.state.box.some((m) => m.uid === 1), "a locked Pokemon left the box");
  assert.ok(!duplicateUids(e.state.box).includes(1), "the sweep offered a locked Pokemon");
  // And where the locked one is the LOWEST level - exactly the one a sweep sells first.
  assert.ok(!duplicateUids([{ uid: 10, species: 19, level: 30 }, { uid: 11, species: 19, level: 2, mid: M(3), lock: "offer" }]).includes(11),
    "the sweep offered a locked Pokemon it would otherwise sell first");

  // reconcileTrades: assign, lock, free, gone - each idempotent.
  assert.ok(e.reconcileTrades({ assign: { 2: M(2) } }), "assigning a server id changed nothing");
  assert.equal(e.state.box.find((m) => m.uid === 2).mid, M(2), "the server id was not assigned");
  e.reconcileTrades({ locks: { [M(2)]: "pool" } });
  assert.equal(e.state.box.find((m) => m.uid === 2).lock, "pool", "a lock was not applied");
  e.reconcileTrades({ locks: { [M(2)]: null } });
  assert.ok(!("lock" in e.state.box.find((m) => m.uid === 2)), "a lock was not lifted");
  e.reconcileTrades({ gone: [M(1)] });
  assert.ok(!e.state.box.some((m) => m.uid === 1), "a Pokemon traded away stayed in the box");

  // ARRIVED: fills the dex and counts like a catch; its tier row stays yours alone.
  const money = e.state.money, pika = dexIndex(25);
  const gift = { mid: M(9), species: 25, level: 12, size: 100, tier: "shiny", alpha: false, ot: "Misty", traded: 1 };
  e.reconcileTrades({ arrived: [gift] });
  e.reconcileTrades({ arrived: [gift] });
  const got = e.state.box.filter((m) => m.mid === M(9));
  assert.equal(got.length, 1, "one delivery made two Pokemon");
  assert.equal(got[0].shiny, 1, "the arriving Pokemon lost its tier");
  assert.equal(got[0].ot, "Misty", "the arriving Pokemon lost its original trainer");
  assert.equal(e.state.dex[pika], 2, "a traded Pokemon did not fill the Pokedex");
  assert.equal(e.state.shiny[pika] ?? 0, 0, "a traded shiny set the tier row - a mark of your own play");
  assert.ok(e.state.money > money, "a trade's new species paid no dex bonus - a trade counts");
  assert.equal(e.state.research[25]?.[TASKS.findIndex((t) => t.id === "trade")], 1,
    "receiving one did not count the trade research task");

  // A traded Pokemon evolving registers the new species, and it counts; its tier row does not.
  const theirs = boot({ ...SAVE, dex: dexWith(16), nextUid: 3,
    box: [{ uid: 1, species: 16, level: 40, size: 100, at: 1, mid: M(5), traded: 1, shiny: 1 },
      { uid: 2, species: 16, level: 3, size: 100, at: 1 }] }).e;
  const before = theirs.state.money;
  assert.ok(theirs.evolve(1, 17), "a traded Pidgey could not evolve");
  assert.equal(theirs.state.dex[dexIndex(17)], 2, "a traded Pokemon's evolution did not register");
  assert.ok(theirs.state.money > before, "a traded Pokemon's new evolution paid no dex bonus");
  assert.equal(theirs.state.shiny[dexIndex(17)] ?? 0, 0, "evolving a traded shiny set the tier row");
}
console.log("trade foundation ok — trade fields load clean, locks freeze every action, reconcile assigns/locks/removes/receives idempotently, a trade counts for the dex and its rewards, never a tier row");

/* A RIFT, through real steps. Opening, counting down, finding and closing all
   happen in `onArrive`, which only a walk reaches - so each is one real step
   with `Math.random` pinned to the answer being tested. */
{
  const { RIFT_STEPS, RIFT_SURE } = await import("../src/game/events.js");
  await savedField("rift", { areaId: "meadow", left: 40 }, { areaId: "nowhere", left: 999 }, null);
  await savedField("sinceTravel", 1234, "lots", 0);
  assert.equal(boot({ ...SAVE, rift: { areaId: "meadow", left: RIFT_STEPS + 1 } }).e.state.rift, null,
    "a rift with more steps left than a rift lasts was trusted");

  const real = Math.random;
  // One step that arrives, from whichever direction is open. Returns false if boxed in.
  const step = (e, r) => {
    Math.random = () => r;
    try {
      for (const dir of ["right", "down", "left", "up"]) {
        const n = e.state.steps;
        e.press(dir);
        for (let i = 0; i < 30 && e.state.steps === n; i++) tick(16);
        e.clearHeld();
        if (e.state.steps > n) return true;
      }
      return false;
    } finally { Math.random = real; }
  };
  const leave = (e) => {
    if (!e.state.encounter) return;
    until(e, (st) => st.encounter?.phase === "idle", "the encounter to settle");
    e.flee(true);           // leaving, whatever it is - an alpha would ask
    until(e, (st) => !st.encounter, "the encounter to close", 4000);
  };

  // Certain at RIFT_SURE: the next step opens one, whatever the roll says.
  const { e } = boot({ ...SAVE, sinceTravel: RIFT_SURE - 1 });
  assert.ok(step(e, 0.5), "the rift test could not take a step");
  assert.deepEqual(e.state.rift, { areaId: e.state.areaId, left: RIFT_STEPS },
    "a certain rift did not open");
  assert.ok(e.state.cheers.some((c) => c.kind === "rift"), "a rift opened without a banner");
  assert.ok(e.riftHere() && e.events().some((ev) => ev.id === "rift" && ev.open), "an open rift has no card or tint");
  /* THE RING: open, it drains with the steps the rift has left. */
  {
    const ring = e.events().find((ev) => ev.id === "rift");
    assert.equal(ring.ring, e.state.rift.left / RIFT_STEPS, "an open rift's ring is not the steps it has left");
    assert.equal(ring.count, e.state.rift.left);
  }
  assert.equal(e.state.sinceTravel, 0, "opening a rift did not restart the clock");
  // The Events page reads the world through one call; it must be the same rift.
  assert.deepEqual(e.world().rift, e.state.rift, "the Events page sees a different rift");
  assert.ok(e.world().outbreak, "the Events page sees no outbreak on a day that has one");

  // A find: pinned under RIFT_FIND and under the stone half, so a stone lands.
  const stones = Object.keys(e.state.bag).filter((k) => k.endsWith("-stone"))
    .reduce((n, k) => n + e.state.bag[k], 0);
  step(e, 0.009);
  leave(e);
  const after = Object.keys(e.state.bag).filter((k) => k.endsWith("-stone"))
    .reduce((n, k) => n + e.state.bag[k], 0);
  assert.equal(after, stones + 1, "a rift find did not land a stone in the bag");
  assert.equal(e.state.rift.left, RIFT_STEPS - 1, "a step in a rift did not count it down");

  // The last step closes it, with a notice.
  e.state.rift.left = 1;
  step(e, 0.5);
  leave(e);
  assert.equal(e.state.rift, null, "a rift did not close when it ran out");
  assert.ok(e.state.worn.some((w) => w.id === "rift" && w.event), "a rift closed without a notice");
  assert.ok(!e.riftHere() && !e.events().some((ev) => ev.id === "rift" && ev.open), "a closed rift kept its card");
  /* AND BEFORE ONE OPENS THE RING IS STILL THERE, filling with the steps on
     this map toward the one that makes a rift certain (reported from play:
     that progress was only on the Events page). */
  {
    const building = (since) => {
      e.state.sinceTravel = since;
      return e.events().find((ev) => ev.id === "rift");
    };
    assert.deepEqual([building(0).ring, building(0).open], [0, false], "a fresh map's rift ring is not empty");
    assert.equal(building(RIFT_SURE / 2).ring, 0.5, "the ring does not fill with the steps on this map");
    assert.equal(building(RIFT_SURE).ring, 1);
    assert.equal(building(0).label, "CALM");
    e.state.sinceTravel = 0;
  }

  // Leaving the map closes it too, and starts the clock again.
  const t = boot({ ...SAVE, rift: { areaId: "meadow", left: 90 }, sinceTravel: 0 }).e;
  t.state.sinceTravel = 500;
  assert.ok(t.travel("woods"), "the rift test could not travel");
  // It asks first, and nothing moves until the answer.
  assert.equal(t.state.ask?.kind, "rift", "leaving a rift did not ask first");
  assert.ok(t.state.rift && t.state.areaId === "meadow", "the rift closed before the answer");
  t.answerAsk(false);
  assert.ok(t.state.rift && t.state.areaId === "meadow", "cancelling still left the rift");
  t.travel("woods");
  t.answerAsk(true);
  assert.equal(t.state.areaId, "woods", "answering yes did not travel");
  assert.equal(t.state.rift, null, "a rift stayed open on the map you left");
  assert.equal(t.state.sinceTravel, 0, "travelling did not restart the rift clock");
}
console.log("saved fields ok — rift, sinceTravel");
console.log("rift ok — opens when certain, counts down, finds, closes on time and on travel");

/* A PURCHASE IS A WHOLE NUMBER, in the engine. The shop floors its input, so
   only a caller that is not the shop can send 1.5 or NaN - which is exactly
   why the engine is where it has to be refused. */
{
  const { e } = boot(SAVE);
  const { money } = e.state, balls = e.state.bag["poke-ball"];
  e.buy("poke-ball", 1.5);
  assert.equal(e.state.bag["poke-ball"], balls + 1, "a fractional purchase put a fraction in the bag");
  assert.equal(e.buy("poke-ball", NaN), false, "a NaN purchase went through");
  assert.equal(e.buyCandy(NaN), false, "a NaN candy purchase went through");
  e.state.box.push({ uid: 999, species: 16, level: 5, size: 100, at: 1 });
  assert.equal(e.levelUp(999, NaN), 0, "raising by NaN spent something");
  assert.equal(e.state.box.at(-1).level, 5, "raising by NaN changed the level");
  e.buyCandy(2.7);
  assert.ok(Number.isInteger(e.state.money) && Number.isInteger(e.state.candy) && e.state.money < money,
    `a fractional purchase left money ${e.state.money} and candy ${e.state.candy}`);
}
console.log("purchases ok — whole numbers only, NaN refused");

/* MONSOON TRAIL: rails and the first door to another map, through real key
   presses - `tryStep` and `onArrive` are where both live, and a table that is
   right with an engine that reads it wrong is silent. */
{
  const { AREAS, RAIL, HIGH_ELEV, walkable } = await import("../src/game/map.js");
  const { LEVEL_XP, BIOMES } = await import("../src/game/biomes.js");
  const { SURF_LEVEL } = await import("../src/game/items.js");
  const walk = (e, dir, frames = 40) => {
    const { x, y, } = e.state.player, area = e.state.areaId;
    e.press(dir);
    for (let i = 0; i < frames && !e.state.encounter; i++) tick(16);
    e.clearHeld();
    if (e.state.encounter) { until(e, (st) => st.encounter?.phase === "idle", "settle"); e.flee(true); until(e, (st) => !st.encounter, "close", 4000); }
    return e.state.areaId !== area || e.state.player.x !== x || e.state.player.y !== y;
  };
  const rows = AREAS.woods.rows;
  const W = rows[0].length;
  // A rail with walkable ground beside it, found rather than named.
  let spot = null;
  const DIRS = [[1, 0, "left"], [-1, 0, "right"], [0, 1, "up"], [0, -1, "down"]];
  for (let y = 1; y < rows.length - 1 && !spot; y++) for (let x = 1; x < W - 1 && !spot; x++) {
    if (!RAIL[rows[y][x]]) continue;
    for (const [ox, oy, dir] of DIRS) {
      const fx = x + ox, fy = y + oy;
      if (!RAIL[rows[fy][fx]] && !"TwRMIPHLFCWXBEVkKdtYGAZJQl".includes(rows[fy][fx])) {
        spot = { rail: [x, y], from: [fx, fy], dir };
        break;
      }
    }
  }
  assert.ok(spot, "Monsoon Trail has no rail with ground beside it");

  /* PLACED BY LOADING THERE, not by writing x and y: a trainer keeps the
     elevation he walks at, and one dropped onto a raised bank from the
     south spawn still walked at the spawn's - a state no walk can reach. */
  let e;
  const place = ([x, y]) => { e = boot({ ...SAVE, areaId: "woods", player: { x, y, dir: "down" } }).e; };

  place(spot.from);
  e.state.bag["acro-bike"] = 0;
  assert.equal(walk(e, spot.dir), false, "a rail let a trainer on foot onto it");
  e.state.bag["acro-bike"] = 1;
  assert.ok(walk(e, spot.dir), "the Acro Bike could not ride onto a rail along its axis");
  assert.deepEqual([e.state.player.x, e.state.player.y], spot.rail, "the bike did not stop on the rail");
  // Off a rail is always allowed, even with the bike gone - nobody is stranded.
  e.state.bag["acro-bike"] = 0;
  const back = { left: "right", right: "left", up: "down", down: "up" }[spot.dir];
  assert.ok(walk(e, back), "a trainer could not step off a rail");
  e.state.bag["acro-bike"] = 1;

  // The door, both ways: Monsoon Trail -> Mansion -> back, landing on the pairs.
  const [dx, dy, to, ax, ay] = AREAS.woods.doors[0];
  const home = AREAS.mansion.doors[0];
  assert.equal(to, "mansion", "Monsoon Trail's door does not lead to the Mansion");
  place([dx, dy + 1]);
  assert.ok(walk(e, "up"), "walking into the Weather Institute went nowhere");
  assert.equal(e.state.areaId, "mansion", "the Weather Institute door did not reach the Mansion");
  assert.deepEqual([e.state.player.x, e.state.player.y], [ax, ay], "the Mansion arrival is not its paired tile");
  assert.ok(walk(e, "down"), "walking out of the Mansion went nowhere");
  assert.equal(e.state.areaId, "woods", "the Mansion's front door did not lead back to Monsoon Trail");
  assert.deepEqual([e.state.player.x, e.state.player.y], [home[3], home[4]], "the way back is not the paired tile");

  /* MT MOON'S EXIT LADDER CLIMBS OUT TO THE POWER PLANT (reported from play
     as a ladder that did nothing): stepped on, as a ladder is, and back
     through the Power Plant's front door, walked into, as a door is. */
  {
    const [mx, my, mto, max_, may] = AREAS.ridge.doors[0];
    const [px, py, pto, rax, ray] = AREAS.power.doors[0];
    assert.deepEqual([mto, pto], ["power", "ridge"], "Mt Moon's exit and the Power Plant's door are not a pair");
    // LEVEL_XP[k] is the XP that reaches level k + 1.
    const at = (areaId, x, y, lv = 20) => boot({ ...SAVE, areaId, xp: LEVEL_XP[lv - 1], paid: lv, player: { x, y, dir: "up" },
      field: { repel: { id: "max-repel", steps: 9999 } } }).e;
    const m = at("ridge", rax, ray);
    // From the arrival tile beside it, the one step onto the ladder.
    const toLadder = { "0,-1": "up", "0,1": "down", "-1,0": "left", "1,0": "right" }[`${mx - rax},${my - ray}`];
    assert.ok(toLadder, "Mt Moon's arrival tile is not beside its exit ladder");
    walk(m, toLadder);
    assert.equal(m.state.areaId, "power", "Mt Moon's exit ladder did not reach the Power Plant");
    assert.deepEqual([m.state.player.x, m.state.player.y], [max_, may], "the Power Plant arrival is not inside its door");
    walk(m, "down");
    assert.equal(m.state.areaId, "ridge", "walking out of the Power Plant's front door did not reach Mt Moon");
    assert.deepEqual([m.state.player.x, m.state.player.y], [rax, ray], "the way back is not beside the exit ladder");
    // Below the Power Plant's level the ladder stays shut, and says why.
    const shut = at("ridge", rax, ray, BIOMES.find((b) => b.id === "power").level - 1);
    walk(shut, toLadder);
    assert.equal(shut.state.areaId, "ridge", "Mt Moon's exit opened onto a map the level has not reached");
    assert.ok(shut.state.worn.some((w) => w.id === "door"), "Mt Moon's shut exit said nothing");
  }

  // Below the Mansion's level the door stays shut, and says why.
  const low = boot({ ...SAVE, areaId: "woods", xp: LEVEL_XP[5], paid: 6 }).e;
  low.state.player.x = dx; low.state.player.y = dy + 1;
  walk(low, "up");
  assert.equal(low.state.areaId, "woods", "a door opened onto a map the level has not reached");
  assert.ok(low.state.worn.some((w) => w.id === "door"), "a shut door said nothing");

  /* A BRIDGE IS WALKED OVER FROM A BANK AND SURFED UNDER FROM THE RIVER - the
     planks drew over a trainer standing on them. Found, not named: a plank
     with a high bank on one side and river on another. */
  // What the old `lift` row said, read off the real elevation it came from.
  const lv = (x, y) => {
    const e = parseInt(AREAS.woods.elev[y][x], 16);
    return HIGH_ELEV.has(e) ? "^" : e === 0 || e === 15 ? "." : "v";
  };
  const lift = rows.map((r, y) => [...r].map((_, x) => lv(x, y)));
  let bridge = null;
  for (let y = 1; y < rows.length - 1 && !bridge; y++) for (let x = 1; x < W - 1 && !bridge; x++) {
    if (rows[y][x] !== "N") continue;
    const side = (ch, l) => DIRS.find(([ox, oy]) => rows[y + oy][x + ox] === ch && lift[y + oy][x + ox] === l);
    const bank = DIRS.find(([ox, oy]) => lift[y + oy][x + ox] === "^" && !"TwN".includes(rows[y + oy][x + ox]));
    const river = side("w", "v");
    if (bank && river) bridge = { bank: [x + bank[0], y + bank[1], bank[2]], river: [x + river[0], y + river[1], river[2]] };
  }
  assert.ok(bridge, "Monsoon Trail has no bridge with a bank and a river beside it");
  const back0 = { left: "right", right: "left", up: "down", down: "up" };
  const at2 = ([x, y]) => ({ ...SAVE, areaId: "woods", xp: LEVEL_XP[SURF_LEVEL], player: { x, y, dir: "down" },
    field: { repel: { id: "max-repel", steps: 9999 } } });
  /* River -> under the planks, and NO FURTHER onto the high bank. This used
     to be allowed on purpose ("surf under a bridge and climb its bank"), and
     it is the move reported from Seaside Road as a bug: out from under the
     road onto the land beneath it, then up onto the road. From under a
     bridge the step is a walk (`shore_ok`), and no map lost a cell by it. */
  const b2 = boot(at2(bridge.river)).e;
  assert.ok(walk(b2, bridge.river[2]), "could not surf under the bridge");
  assert.ok(!b2.above(), "surfing under a bridge drew the trainer over its planks");
  const from = [b2.state.player.x, b2.state.player.y];
  walk(b2, back0[bridge.bank[2]]);
  assert.ok(!b2.above() && rows[b2.state.player.y][b2.state.player.x] !== ".",
    `a surfer under the bridge at ${from} climbed out onto its high bank`);
  // Still afloat under it: paddling on crosses to the river on the far side,
  // which a trainer set down on the planks on foot cannot do.
  const b3 = boot(at2(bridge.river)).e;
  walk(b3, bridge.river[2]);
  while (rows[b3.state.player.y][b3.state.player.x] === "N" && walk(b3, bridge.river[2]));
  assert.equal(rows[b3.state.player.y][b3.state.player.x], "w", "could not paddle under the bridge to the far side");

  /* ELEVATION IS WHERE YOU MAY WALK, not only how you are drawn. The copies
     walked straight off Seafoam's raised shelf (4) onto the ice (3) and up the
     Safari Zone's platforms (5, 7) from the grass (3): edges the real maps close
     with elevation alone. Found, not named: two open cells side by side at
     different elevations, and a step (0) joining a shelf to the ice. */
  {
  const E = (a, x, y) => parseInt(AREAS[a].elev[y][x], 16);
  const at3 = (a, x, y, dir = "down") => ({ ...SAVE, areaId: a, xp: LEVEL_XP[SURF_LEVEL], player: { x, y, dir },
    field: { repel: { id: "max-repel", steps: 9999 } } });
  const lip = (a) => {
    const rows = AREAS[a].rows;   // this map's, not Monsoon Trail's
    for (let y = 1; y < rows.length - 1; y++) for (let x = 1; x < rows[0].length - 1; x++) {
      if (!walkable(rows, x, y)) continue;
      for (const [ox, oy, dir] of DIRS) {
        const [a1, b1] = [E(a, x, y), E(a, x + ox, y + oy)];
        if (walkable(rows, x + ox, y + oy) && a1 !== b1 && ![a1, b1].some((e) => e === 0 || e === 15)) return { x, y, dir: back0[dir] };
      }
    }
    return null;
  };
  for (const a of ["frost", "safari"]) {
    const edge = lip(a);
    assert.ok(edge, `${a}: no two open cells at different elevations - the fixture is gone`);
    const e = boot(at3(a, edge.x, edge.y)).e;
    walk(e, edge.dir);
    assert.deepEqual([e.state.player.x, e.state.player.y], [edge.x, edge.y],
      `${a}: walked from elevation ${E(a, edge.x, edge.y)} straight onto another at (${edge.x},${edge.y}) ${edge.dir}`);
  }
  // Frost Hollow's steps DO join the ice to the shelf, and on the shelf you
  // stand over its upper layer - its lip drew over the trainer before.
  const fr = AREAS.frost.rows;
  let stair = null;
  for (let y = 1; y < fr.length - 1 && !stair; y++) for (let x = 1; x < fr[0].length - 1 && !stair; x++) {
    if (E("frost", x, y) !== 0 || !walkable(fr, x, y)) continue;
    const ice = DIRS.find(([ox, oy]) => walkable(fr, x + ox, y + oy) && E("frost", x + ox, y + oy) === 3);
    const shelf = DIRS.find(([ox, oy]) => walkable(fr, x + ox, y + oy) && E("frost", x + ox, y + oy) === 4);
    if (ice && shelf) stair = { ice: [x + ice[0], y + ice[1]], on: ice[2], up: back0[shelf[2]] };
  }
  assert.ok(stair, "frost: no step joins the ice to the shelf");
  const s = boot(at3("frost", ...stair.ice)).e;
  assert.ok(!s.above(), "frost: a trainer on the lower ice drew over the upper layer");
  assert.ok(walk(s, stair.on), "frost: could not step from the ice onto the stairs");
  assert.ok(walk(s, stair.up), "frost: the stairs do not lead up onto the shelf");
  assert.equal(E("frost", s.state.player.x, s.state.player.y), 4, "frost: the stairs did not reach the shelf");
  assert.ok(s.above(), "frost: a trainer on the raised shelf is drawn under its upper layer");
  }
}
console.log("monsoon ok — rails need the bike, stepping off is always allowed, the door runs both ways, a shut door says so, bridges are walked over and surfed under");
console.log("elevation ok — Frost Hollow's shelf and the Safari Zone's platforms are not walked onto from below, Frost's steps join them, and the shelf draws the trainer over its lip");


/* THE CAP ROSE AND BANKED XP IS OWED, EXACTLY ONCE. XP was never clamped at
   Lv 50, so a trainer who kept playing arrives at 75's table already past 50 -
   and rewards were paid only on a GAIN that crossed a level, so without `paid`
   they would load with the points (derived from level) and none of the balls.
   Three saves: one owed, the same one reloaded, and one under the old cap. */
{
  const { levelFromXp, LEVEL_XP } = await import("../src/game/biomes.js");
  const xp = LEVEL_XP[57];                     // exactly Lv 58
  const owed = {};
  for (let lv = 51; lv <= 58; lv++) {
    for (const [id, n] of Object.entries(levelReward(lv))) owed[id] = (owed[id] ?? 0) + n;
  }
  const old = { ...SAVE, xp };
  delete old.paid;                             // written before the field existed
  const first = boot(old).e;
  assert.equal(levelFromXp(first.state.xp), 58, "the fixture is not at Lv 58");
  assert.equal(first.state.paid, 58, "a save owed levels 51-58 was not paid up to 58 at boot");
  for (const [id, n] of Object.entries(owed)) {
    assert.equal(first.state.bag[id] ?? 0, (SAVE.bag[id] ?? 0) + n,
      `${id}: the back-pay for levels 51-58 did not land`);
  }
  assert.ok(first.state.cheers.some((c) => c.kind === "level"),
    "levels were paid in silence - the banner is how a player learns the cap rose");

  // The same trainer, reloaded: nothing is paid twice.
  await new Promise((r) => setTimeout(r, 600));
  const saved = JSON.parse(store.get("meadow-route"));
  assert.equal(saved.paid, 58, "the payment was not written to the save");
  const again = boot(saved).e;
  assert.deepEqual(again.state.bag, first.state.bag, "a reload paid the levels a second time");
  assert.equal(again.state.cheers.length, 0, "a reload raised a level banner for nothing");

  // Under the old cap: paid for exactly what it has, owed nothing.
  const low = { ...SAVE, xp: LEVEL_XP[29] };   // Lv 30
  delete low.paid;
  const third = boot(low).e;
  assert.equal(third.state.paid, 30, "a Lv 30 save was credited with levels it has not reached");
  assert.deepEqual(third.state.bag, { ...third.state.bag, ...SAVE.bag },
    "a save under the old cap was paid something at boot");
  assert.equal(third.state.cheers.length, 0, "a save under the old cap opened on a banner");

  console.log(`level cap ok — banked XP past Lv 50 is paid once at boot (51-58: ` +
    `${Object.entries(owed).map(([id, n]) => `${n} ${id}`).join(", ")}), never twice, and never below the old cap`);
}

/* A TIER'S IDLE MUST NEVER OUTRANK THE ANIMATION THAT ENDS AN ENCOUNTER.

   This shipped. An Origin would not go into the ball - reported from play,
   and the computed `animation-name` on a captured Origin was `origin-form,
   mon-idle`. `.sprite-origin.mon` names its own animation and is TWO classes,
   exactly like `.mon.captured`, so the cascade fell through to source order
   and the tier rule is further down the file. `mon-absorb` never ran. The
   same tie broke fleeing, and a `!important` animation on Glitched broke the
   evolution reveal as well.

   It is the THIRD time this file's "naming an `animation` replaces the whole
   list" note has been paid for, and the first two were fixed one rule at a
   time. So the assertion is the general rule rather than the three cases:
   every state that ends an encounter marks its animation `!important`, and no
   tier does. A CSS cascade cannot be evaluated here, so this reads the
   declarations - which is the thing that actually decides it. */
{
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const ruleFor = (sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at >= 0, `${sel} has no rule - the encounter cannot end`);
    return css.slice(at, css.indexOf("}", at));
  };

  for (const sel of [".mon.captured", ".mon.gone"]) {
    const body = ruleFor(sel);
    assert.ok(/animation:[^;]*!important/.test(body),
      `${sel}'s animation is not !important - a tier that names one will win on ` +
      "source order and the Pokemon will never leave the screen");
  }

  /* AND NO TIER MAY CLAIM ONE. `filter: !important` is required of every tier
     (an animation outranks a plain declaration, so `mon-appear`'s
     `filter: none` would erase it) - `animation: !important` is required of
     none, and any tier that takes it beats a two-class state outright. */
  const { TIERS } = await import("../src/game/biomes.js");
  for (const tier of TIERS) {
    const at = css.indexOf(`.sprite-${tier} {`);
    if (at < 0) continue;                       // a tier may be pure artwork
    const body = css.slice(at, css.indexOf("}", at));
    assert.ok(!/animation:[^;]*!important/.test(body),
      `.sprite-${tier} marks its animation !important - it will outrank ` +
      "mon-absorb, mon-flee and the evolution reveal all at once");
  }

  console.log(`state animation ok — absorb and flee outrank all ${TIERS.length} tier idles`);
}

/* SURF, DRIVEN. It touches `tryStep` and the step handler, which is what this
   file exists for - and every one of these went wrong at least once while it
   was being written.

   Surfing is DERIVED from the tile under the player rather than stored, so the
   thing to assert is that the derivation and the movement rules agree: you
   cannot walk onto water, you can ride onto it, you can cross it, you can
   always step off, and you cannot ride at all without the item. */
{
  const { AREAS } = await import("../src/game/mapdata.js");
  const { SURFABLE } = await import("../src/game/map.js");
  const { SURF_LEVEL } = await import("../src/game/items.js");
  const { LEVEL_XP } = await import("../src/game/biomes.js");

  /* A BANK, FOUND RATHER THAN TYPED - a coordinate in a generated map is a
     coordinate that moves the next time the map is generated. Any walkable
     tile with a rideable one beside it will do. */
  function bank(areaId) {
    const rows = AREAS[areaId].rows;
    const solid = (x, y) => rows[y]?.[x];
    for (let y = 1; y < rows.length - 1; y++) {
      for (let x = 1; x < rows[y].length - 1; x++) {
        if (SURFABLE.includes(solid(x, y))) continue;
        if (!/[.,f#rmipbh]/.test(solid(x, y) ?? "")) continue;
        for (const [dx, dy, dir] of [[0, -1, "up"], [0, 1, "down"],
                                     [-1, 0, "left"], [1, 0, "right"]]) {
          if (SURFABLE.includes(solid(x + dx, y + dy))) {
            return { x, y, dir, liquid: solid(x + dx, y + dy), to: [x + dx, y + dy] };
          }
        }
      }
    }
    return null;
  }

  const pond = bank("pond");
  assert.ok(pond, "Pond & Shore has no bank beside its water");
  const ember = bank("ember");
  assert.ok(ember, "Ember Caldera has no rock beside its lava");
  assert.equal(ember.liquid, "V", "the lava beside Ember's rock is not lava");

  const ride = (spot, areaId, level) => {
    const save = {
      ...SAVE, areaId, xp: LEVEL_XP[level - 1],
      bag: { "poke-ball": 5 },
      player: { x: spot.x, y: spot.y, dir: spot.dir },
      /* UNDER A REPEL, BECAUSE THIS TEST WALKS. Getting ashore is the subject
         here, so walking is the right way to drive it - but every step carries
         a 7% chance of an encounter and an encounter stops movement, so the
         trainer sometimes halted still afloat and the run failed about one time
         in five. It was doing so before this comment was written and read as a
         real fault in `tryStep`. A repel is total and is the game's own answer,
         so nothing here has to be stubbed. */
      field: { repel: { id: "max-repel", steps: 9999 } },
    };
    const { e } = boot(save);
    return e;
  };

  /* 1. BELOW THE LEVEL IT IS NOT OFFERED, AND WALKING IN STILL FAILS.

        The bag is NOT the way to test this, and finding that out is worth
        keeping: `loadState` grants every key item a save is past the level
        for, so a Lv 20 save handed itself the item and "without it" could not
        be reached. Below the level is the real gate.

        The second half is the half that matters: if `tryStep` had been relaxed
        for everyone, the gate would be nothing but a missing prompt. */
  {
    const e = ride(pond, "pond", SURF_LEVEL - 1);
    assert.equal(e.surfable(), null, "surf is offered below its level");
    assert.equal(e.surf(), false, "surf ran below its level");
    e.press(pond.dir); for (let i = 0; i < 40; i++) tick(16); e.clearHeld();
    assert.deepEqual([e.state.player.x, e.state.player.y], [pond.x, pond.y],
      "walked onto open water on foot");
  }

  /* 2. WITH IT: onto the water, and the ride is a real move. */
  for (const [spot, areaId, what] of [[pond, "pond", "water"], [ember, "ember", "lava"]]) {
    const e = ride(spot, areaId, SURF_LEVEL);
    assert.equal(e.surfable(), spot.liquid,
      `surf is not offered at the ${what} - surfable() said ${e.surfable()}`);
    assert.ok(e.surf(), `surf refused the ${what}`);
    for (let i = 0; i < 60; i++) tick(16);
    assert.deepEqual([e.state.player.x, e.state.player.y], spot.to,
      `the ride onto the ${what} did not land`);

    /* 3. AND IT CANNOT BE CAST FROM. The rod set is drawn standing on a bank
          and the bobber would land beside a trainer already in the pool. */
    assert.equal(e.castable(), null, `a line went out from on top of the ${what}`);

    /* 4. ASHORE IS ALWAYS ALLOWED. Stepping back the way you came has to work
          or the ride is a trap - and this is the case that `tryStep` gets
          wrong if it asks what you HOLD rather than where you ARE. */
    const back = { up: "down", down: "up", left: "right", right: "left" }[spot.dir];
    e.press(back); for (let i = 0; i < 80; i++) tick(16); e.clearHeld();
    /* ASHORE IS THE PROPERTY, NOT A COORDINATE. The first version asserted the
       exact tile ridden from and failed at [30,3] against [30,5] - because a
       key held for eighty ticks lands ashore and then keeps walking inland,
       which is correct behaviour and not what was being tested. */
    const tile = AREAS[areaId].rows[e.state.player.y][e.state.player.x];
    assert.ok(!SURFABLE.includes(tile),
      `still afloat on ${tile} after riding back off the ${what}`);
  }

  console.log("surf ok — onto water and lava at Lv " + SURF_LEVEL +
    ", refused without it, ashore always allowed, no casting afloat");
}

{
  /* A LEDGE IS ONE-WAY, AND WHICH WAY IS THE CHARACTER'S - ridden, because
     nothing else can see `tryStep` reading the face backwards. check.mjs pins
     the two LEDGE tables to each other and the generator holds every map to
     them, so with the engine hopping the wrong axis all of that goes on
     passing: the data is right and the game is wrong.

     Cinderpeak is Route 112, whose 38 east hops are what `J` was added for.
     They were laid as FLOOR before that - a terrace wall you could walk back
     up, which is not a ledge - and reported from play with the four vertical
     runs circled. */
  const { AREAS } = await import("../src/game/mapdata.js");
  const { LEDGE, walkable } = await import("../src/game/map.js");
  const { LEVEL_XP } = await import("../src/game/biomes.js");

  const DIR = { "1,0": ["right", "left"], "0,1": ["down", "up"] };

  /* FOUND, NEVER TYPED: a coordinate in a generated map is a coordinate that
     moves the next time the map is generated. Any ledge with ground on both
     the approach and the landing will do. */
  function ledges(areaId) {
    const rows = AREAS[areaId].rows;
    const out = [];
    for (let y = 1; y < rows.length - 1; y++) {
      for (let x = 1; x < rows[y].length - 1; x++) {
        const face = LEDGE[rows[y][x]];
        if (!face) continue;
        const [dx, dy] = face;
        if (!walkable(rows, x - dx, y - dy) || !walkable(rows, x + dx, y + dy)) continue;
        out.push({ ch: rows[y][x], x, y, dx, dy });
      }
    }
    return out;
  }

  let rode = 0;
  const kinds = new Set();
  for (const areaId of Object.keys(AREAS)) {
    for (const L of ledges(areaId)) {
      if (kinds.has(areaId + L.ch)) continue;      // one of each per map is the rule
      kinds.add(areaId + L.ch);
      const [into, back] = DIR[`${L.dx},${L.dy}`];
      const mapLevel = (await import("../src/game/biomes.js")).biomeFor(areaId).level;
      assert.ok(into, `no direction for a ledge facing ${L.dx},${L.dy}`);
      const at = (x, y) => ({
        // At least the map's own level: one opening past Lv 25 sends a
        // lower save home before it takes a step.
        ...SAVE, areaId, xp: LEVEL_XP[Math.max(24, mapLevel - 1)],
        bag: { "poke-ball": 5 },
        player: { x, y, dir: into },
        /* UNDER A REPEL, BECAUSE THIS TEST WALKS - the same trap the surf test
           records. A 7% encounter per step stops movement, and a hop that
           never happened reads exactly like a hop that was refused. */
        field: { repel: { id: "max-repel", steps: 9999 } },
      });

      // DOWN THE FACE: one press clears the ledge and lands two tiles on.
      {
        const { e } = boot(at(L.x - L.dx, L.y - L.dy));
        e.press(into); for (let i = 0; i < 40; i++) tick(16); e.clearHeld();
        assert.deepEqual([e.state.player.x, e.state.player.y],
          [L.x + L.dx, L.y + L.dy],
          `${areaId}: walking ${into} into the "${L.ch}" at ${L.x},${L.y} did not hop it`);
      }
      // AND NOT BACK UP IT, which is the whole point of a ledge.
      {
        const { e } = boot(at(L.x + L.dx, L.y + L.dy));
        e.press(back); for (let i = 0; i < 40; i++) tick(16); e.clearHeld();
        assert.deepEqual([e.state.player.x, e.state.player.y],
          [L.x + L.dx, L.y + L.dy],
          `${areaId}: the "${L.ch}" at ${L.x},${L.y} can be climbed going ${back}`);
      }
      rode += 1;
    }
  }

  assert.ok(kinds.size >= Object.keys(LEDGE).length,
    `only ${kinds.size} ledge kinds ridden, and LEDGE declares ${Object.keys(LEDGE).length} - ` +
    "a character no map uses is a direction nothing tests");
  console.log(`ledges ok — ${rode} ridden, each one-way, ` +
    `${Object.keys(LEDGE).map((c) => c + ":" + LEDGE[c]).join(" ")}`);
}

/* THE LADDERS, DRIVEN. Mt Moon is the first area with more than one floor, and
   the warp is the only new thing in the step handler since Surf - so it gets
   the same treatment: a real engine, a held key, and the assertion on where the
   trainer ENDS UP rather than on what a function returned.

   Every pair is walked, in both directions, because a ladder that only works
   downwards is a hole you fall into and cannot climb out of - and with seven of
   them and three floors, the one that is wrong is the one nobody tries. */
{
  const { AREAS, AREA_IDS } = await import("../src/game/mapdata.js");
  const { LEVEL_XP, biomeFor } = await import("../src/game/biomes.js");
  const { SOLID } = await import("../src/game/map.js");
  /* EVERY AREA THAT HAS WARPS, not the one that had them first. This named
     `AREAS.ridge` while Mt Moon was the only multi-floor map; Ember Caldera
     has seven pairs and Cinderpeak two, and neither was being ridden. */
  const WARPED = AREA_IDS.filter((id) => AREAS[id].warps?.length);
  assert.ok(WARPED.length >= 2,
    `only ${WARPED.length} area(s) carry warps - this test has stopped covering them`);

  const DIRS = [[0, -1, "up"], [0, 1, "down"], [-1, 0, "left"], [1, 0, "right"]];

  let rode = 0, pairs = 0, brushed = 0, dirs = 0, holes = 0;
  for (const areaId of WARPED) {
  const area = AREAS[areaId];
  pairs += area.warps.length;
  const solidAt = (x, y) => !area.rows[y] || SOLID.includes(area.rows[y][x] ?? "");
  const walkIn = new Set((area.enter ?? []).map(([x, y]) => `${x},${y}`));
  for (const [ax, ay, bx, by, oneWay] of area.warps) {
    /* A HOLE (a fifth element) drops you and nothing brings you back up
       through it: the landing is ordinary floor, and stepping onto it again
       goes nowhere - it went back up, an invisible hole in Frost Hollow. */
    if (oneWay) {
      holes++;
      const land = DIRS.find(([dx, dy]) => !solidAt(bx - dx, by - dy));
      const [ldx, ldy, ldir] = land;
      const { e } = boot({
        ...SAVE, areaId, xp: LEVEL_XP[biomeFor(areaId).level],
        player: { x: bx - ldx, y: by - ldy, dir: ldir },
        field: { repel: { id: "max-repel", steps: 9999 } },
      });
      e.press(ldir);
      for (let i = 0; i < 40; i++) tick(16);
      e.clearHeld();
      for (let i = 0; i < 20; i++) tick(16);
      assert.deepEqual([e.state.player.x, e.state.player.y], [bx, by],
        `${areaId}: stepping onto the landing at ${[bx, by]} took you somewhere - an invisible hole`);
    }
    const ways = oneWay ? [[[ax, ay], [bx, by]]] : [[[ax, ay], [bx, by]], [[bx, by], [ax, ay]]];
    dirs += ways.length;
    for (const [from, to] of ways) {
      /* Step ONTO the ladder from a neighbour rather than starting on it: a
         warp taken at boot would prove the table and not the step handler.
         A door, cave mouth or stairway is walked INTO - the step has to point
         at its wall - so that is the approach it gets. */
      const into = walkIn.has(`${from[0]},${from[1]}`);
      const step = DIRS.find(([dx, dy]) => !solidAt(from[0] - dx, from[1] - dy)
        && (!into || solidAt(from[0] + dx, from[1] + dy)));
      if (!step) continue;
      /* AND BRUSHING PAST ONE DOES NOTHING - reported from play as doors that
         grabbed you. Onto it along open floor, it holds you; pushing into its
         wall from there is what takes you through. */
      const past = into && DIRS.find(([dx, dy]) => !solidAt(from[0] - dx, from[1] - dy)
        && !solidAt(from[0] + dx, from[1] + dy));
      if (past) {
        const [pdx, pdy, pdir] = past;
        const { e } = boot({
          ...SAVE, areaId, xp: LEVEL_XP[biomeFor(areaId).level],
          player: { x: from[0] - pdx, y: from[1] - pdy, dir: pdir },
          field: { repel: { id: "max-repel", steps: 9999 } },
        });
        e.press(pdir);
        for (let i = 0; i < 12; i++) tick(16);
        e.clearHeld();
        for (let i = 0; i < 20; i++) tick(16);
        if (e.state.player.x === from[0] && e.state.player.y === from[1]) {
          e.press(step[2]);
          for (let i = 0; i < 12; i++) tick(16);
          e.clearHeld();
          for (let i = 0; i < 20; i++) tick(16);
          assert.deepEqual([e.state.player.x, e.state.player.y], to,
            `${areaId}: pushing into the ${from} doorway did not take it`);
          brushed++;
        } else {
          assert.notDeepEqual([e.state.player.x, e.state.player.y], to,
            `${areaId}: brushing past the doorway at ${from} took it`);
        }
      }
      const [dx, dy, dir] = step;
      const { e } = boot({
        ...SAVE, areaId, xp: LEVEL_XP[biomeFor(areaId).level],
        player: { x: from[0] - dx, y: from[1] - dy, dir },
        // Under a repel, for the reason the surf test records: an encounter
        // stops the walk and the trainer never reaches the rung.
        field: { repel: { id: "max-repel", steps: 9999 } },
      });
      e.press(dir);
      for (let i = 0; i < 40; i++) tick(16);
      e.clearHeld();
      for (let i = 0; i < 20; i++) tick(16);
      assert.deepEqual([e.state.player.x, e.state.player.y], to,
        `${areaId}: the warp at ${from} came out at ${[e.state.player.x, e.state.player.y]}, not ${to}`);
      rode++;
    }
  }
  }
  assert.equal(rode, dirs, `only ${rode} of ${dirs} warp directions could be driven`);
  assert.ok(holes >= 4, `only ${holes} one-way holes - Frost Hollow's four have stopped being tested`);
  assert.ok(brushed > 0, "no doorway was ever brushed past - the walk-in rule is untested");
  console.log(`warps ok — ${pairs} pairs across ${WARPED.length} areas ` +
    `(${WARPED.join(", ")}), every one ridden both ways but ${holes} holes, which only drop you and whose landing ` +
    `goes nowhere; ${brushed} doorways stepped onto from the side hold you until you push into them`);
}

/* SEASIDE ROAD'S CYCLING ROAD, driven. Reported from play as a trainer on a
   surf blob in the middle of the grass: the road crosses a meadow on bridge
   cells (elevation 15), and every low bridge cell was being read as water.
   Walked under from the grass, you are on foot; the road itself is bike
   ground, refused without the Acro Bike and ridden with it. */
{
  const { AREAS } = await import("../src/game/mapdata.js");
  const { LEVEL_XP } = await import("../src/game/biomes.js");
  const { BIKE_LEVEL } = await import("../src/game/items.js");
  const { SOLID } = await import("../src/game/map.js");
  const a = AREAS.pond;
  assert.ok(a.cycling, "Seaside Road is not marked as having a cycling road");
  const E = (x, y) => parseInt(a.elev[y][x], 16);
  const ch = (x, y) => a.rows[y]?.[x] ?? "T";
  const DIRS = [[1, 0, "right"], [-1, 0, "left"], [0, 1, "down"], [0, -1, "up"]];
  const quiet = { field: { repel: { id: "max-repel", steps: 9999 } } };
  const walk = (e, dir) => { e.press(dir); for (let i = 0; i < 14; i++) tick(16); e.clearHeld(); for (let i = 0; i < 20; i++) tick(16); };

  // Under the road, from the grass: a bridge cell with low GROUND beside it.
  let under = null;
  for (let y = 1; y < a.rows.length - 1 && !under; y++) {
    for (let x = 1; x < a.rows[0].length - 1 && !under; x++) {
      if (ch(x, y) !== "N" || E(x, y) !== 15) continue;
      for (const [dx, dy, dir] of DIRS) {
        const gx = x - dx, gy = y - dy;
        if (".,#".includes(ch(gx, gy)) && E(gx, gy) === 3) { under = { gx, gy, x, y, dir }; break; }
      }
    }
  }
  assert.ok(under, "no bridge cell on Seaside Road crosses grass - the test has nothing to walk");
  {
    const { e } = boot({ ...SAVE, ...quiet, areaId: "pond", xp: LEVEL_XP[6],
      player: { x: under.gx, y: under.gy, dir: under.dir } });
    walk(e, under.dir);
    assert.deepEqual([e.state.player.x, e.state.player.y], [under.x, under.y],
      "could not walk under the Cycling Road from the grass");
    assert.ok(!e.afloat(), "walking under the road from the grass put the trainer afloat");
    assert.ok(!e.above(), "a trainer under the road is drawn above it");
  }

  // Onto the road: a deck cell (elevation 4) with ground at elevation 0 beside it.
  let ramp = null;
  for (let y = 1; y < a.rows.length - 1 && !ramp; y++) {
    for (let x = 1; x < a.rows[0].length - 1 && !ramp; x++) {
      if (E(x, y) !== 4 || SOLID.includes(ch(x, y))) continue;
      for (const [dx, dy, dir] of DIRS) {
        const gx = x - dx, gy = y - dy;
        if (!SOLID.includes(ch(gx, gy)) && E(gx, gy) === 0 && !"wWkV".includes(ch(gx, gy))) { ramp = { gx, gy, x, y, dir }; break; }
      }
    }
  }
  assert.ok(ramp, "no way onto Seaside Road's Cycling Road from the ground");
  {
    // Under the bike's level: key items are granted by level (`grantKeys`).
    const { e } = boot({ ...SAVE, ...quiet, areaId: "pond", xp: LEVEL_XP[BIKE_LEVEL - 2],   // LEVEL_XP[n] is Lv n + 1
      bag: { ...SAVE.bag, "acro-bike": 0 }, player: { x: ramp.gx, y: ramp.gy, dir: ramp.dir } });
    walk(e, ramp.dir);
    assert.deepEqual([e.state.player.x, e.state.player.y], [ramp.gx, ramp.gy],
      "the Cycling Road let a trainer on without the Acro Bike");
  }
  {
    const { e } = boot({ ...SAVE, ...quiet, areaId: "pond", xp: LEVEL_XP[BIKE_LEVEL],
      bag: { ...SAVE.bag, "acro-bike": 1 }, player: { x: ramp.gx, y: ramp.gy, dir: ramp.dir } });
    walk(e, ramp.dir);
    assert.deepEqual([e.state.player.x, e.state.player.y], [ramp.x, ramp.y],
      "the Cycling Road refused a trainer with the Acro Bike");
  }
  /* AND NOT FROM THE WATER. Reported from play: a surfer slipped under the
     deck, hopped onto the land beneath it and came out on top of the road.
     The deck never touches open water - a span (15) or a railing is always
     between - so the way that was open is water -> under a span -> into the
     deck (elevation 4). Refused, bike or no bike. */
  const { SURF_LEVEL } = await import("../src/game/items.js");
  let dock = null;
  for (let y = 1; y < a.rows.length - 1 && !dock; y++) {
    for (let x = 1; x < a.rows[0].length - 1 && !dock; x++) {
      if (ch(x, y) !== "N" || E(x, y) !== 15) continue;
      const water = DIRS.find(([dx, dy]) => ch(x - dx, y - dy) === "w");
      const deck = DIRS.find(([dx, dy]) => ch(x + dx, y + dy) === "N" && E(x + dx, y + dy) === 4);
      if (water && deck) dock = { wx: x - water[0], wy: y - water[1], in: water[2], x, y, out: deck[2] };
    }
  }
  assert.ok(dock, "no span on the Cycling Road has water on one side and deck on another");
  {
    const { e } = boot({ ...SAVE, ...quiet, areaId: "pond", xp: LEVEL_XP[Math.max(SURF_LEVEL, BIKE_LEVEL)],
      bag: { ...SAVE.bag, "acro-bike": 1 }, player: { x: dock.wx, y: dock.wy, dir: dock.in } });
    assert.ok(e.afloat(), "the trainer booted on the water is not afloat");
    walk(e, dock.in);
    assert.deepEqual([e.state.player.x, e.state.player.y], [dock.x, dock.y], "could not surf under the span");
    assert.ok(e.afloat() && !e.above(), "under the span the trainer is not a surfer below the road");
    walk(e, dock.out);
    assert.deepEqual([e.state.player.x, e.state.player.y], [dock.x, dock.y],
      `a surfer under the span at (${dock.x},${dock.y}) climbed into the Cycling Road's deck`);
  }
  console.log(`cycling road ok — walked under it from the grass at (${under.x},${under.y}) on foot, ` +
    `refused onto it at (${ramp.x},${ramp.y}) without the Acro Bike, ridden with it, ` +
    `and never entered from the water (${dock.x},${dock.y})`);
}

/* METEOR FALLS' LOG BRIDGE (reported): its span is floor at elevation 15 in
   Emerald, so it was read as floor - you surfed down off it onto the river,
   came back under it and were set ashore on the span, with the deck (4)
   refused on both sides. Now the span is a bridge, nobody surfs down off
   raised ground (the GBA surfs from elevation 3 only), and a save left out
   there is sent to the way in. */
{
  const { AREAS } = await import("../src/game/mapdata.js");
  const { LEVEL_XP, BIOMES } = await import("../src/game/biomes.js");
  const { SURF_LEVEL } = await import("../src/game/items.js");
  const DIRS = [[1, 0, "right"], [-1, 0, "left"], [0, 1, "down"], [0, -1, "up"]];
  const quiet = { field: { repel: { id: "max-repel", steps: 9999 } } };
  const walk = (e, dir) => { e.press(dir); for (let i = 0; i < 14; i++) tick(16); e.clearHeld(); for (let i = 0; i < 20; i++) tick(16); };
  const a = AREAS.falls;
  const ch = (x, y) => a.rows[y]?.[x];
  const E = (x, y) => parseInt(a.elev[y]?.[x] ?? "0", 16);
  let span = null;
  for (let y = 1; y < a.rows.length - 1 && !span; y++) {
    for (let x = 1; x < a.rows[0].length - 1 && !span; x++) {
      if (ch(x, y) !== "N") continue;
      const deck = DIRS.find(([dx, dy]) => ch(x - dx, y - dy) === "m" && E(x - dx, y - dy) === 4);
      const water = DIRS.find(([dx, dy]) => ch(x + dx, y + dy) === "w");
      if (deck && water) span = { x, y, dx: x - deck[0], dy: y - deck[1], on: deck[2], face: water[2], wx: x + water[0], wy: y + water[1] };
    }
  }
  assert.ok(span, "Meteor Falls has no bridge span between its deck and the river");
  const lv = Math.max(SURF_LEVEL, BIOMES.find((b) => b.id === "falls").level);
  const at = (x, y, dir = "down") => boot({ ...SAVE, ...quiet, areaId: "falls", xp: LEVEL_XP[lv], paid: lv + 1,
    player: { x, y, dir } }).e;
  {
    const e = at(span.dx, span.dy, span.on);
    walk(e, span.on);
    assert.deepEqual([e.state.player.x, e.state.player.y], [span.x, span.y], "could not walk from the deck onto the span");
    e.state.player.dir = span.face;
    assert.equal(e.surfable(), null, `surf was offered down off the bridge at (${span.x},${span.y})`);
  }
  for (const [x, y, what] of [[span.x, span.y, "span"], [span.wx, span.wy, "river"]]) {
    const e = at(x, y);
    assert.deepEqual([e.state.player.x, e.state.player.y], [a.spawn.x, a.spawn.y],
      `a save on Meteor Falls' ${what} at (${x},${y}) was left where it cannot get out`);
  }
  console.log(`falls bridge ok — the span at (${span.x},${span.y}) is walked from the deck, never surfed down from, ` +
    "and a save left on it or the river below goes to the way in");
}

/* THE LEAGUE THROUGH THE ENGINE (docs/battles.md, phase 3). The page computes
   every turn with battle.js and hands it over: a turn is `stepped()` - the
   collection did not move, so `colRev` must not, or the Dex and Box rebuild
   on every hit - and the result is the one `changed()`. The battle is
   VOLATILE: a save written mid-battle does not carry it. While the page covers
   the game the walk stops, and an encounter's clock stops with it. */
{
  const { step, newBattle, fighter, mulberry32 } = await import("../src/game/battle.js");
  const { e } = boot({ ...SAVE, box: [{ uid: 1, species: 6, level: 40 }, { uid: 2, species: 9, level: 40 }], nextUid: 3 });
  tick(16, 3);
  const col0 = e.state.colRev, rev0 = e.state.rev;
  let b = newBattle([[fighter(6, 40, 1), fighter(9, 40, 2)], [fighter(3, 40, 3), fighter(65, 40, 4)]], [2, 2]);
  // A gym trainer of the first gym: open from the start, and no cap.
  assert.equal(e.battleBegin(b, { id: "kanto-brock-camper-liam", uids: [1, 2] }), null);
  const rng = mulberry32(5);
  let turns = 0;
  while (b.over < 0) { b = step(b, null, rng); e.battleStep(b); turns++; tick(16, 30); }
  assert.equal(e.state.colRev, col0, `a battle's ${turns} turns bumped colRev - the collection panels rebuilt on every hit`);
  assert.ok(e.state.rev >= rev0 + turns, "a battle turn did not tell React it happened");
  /* A SAVE WRITTEN WHILE IT IS ON: turns write nothing, so something else has
     to - a purchase, then the flush a closing tab does. Reading the save from
     before the battle proved nothing, and missed a missing VOLATILE entry. */
  e.buy("poke-ball", 1);
  e.saveNow();
  const saved = JSON.parse(store.get("meadow-route"));
  assert.ok(!("battle" in saved), "a save written mid-battle carries the battle - it must be VOLATILE");
  // The result is ONE changed(), counted from just before it (the purchase had its own).
  const colEnd = e.state.colRev;
  assert.equal(e.battleEnd().over, b.over);
  assert.equal(e.state.colRev, colEnd + 1, "a battle's result is not exactly one changed()");
  assert.equal(e.state.battle, null);

  // Paused, a held key walks nobody and a waiting encounter's clock stands still.
  const at = [e.state.player.x, e.state.player.y];
  e.pause(true);
  e.press("right");
  tick(16, 90);
  assert.deepEqual([e.state.player.x, e.state.player.y], at, "the trainer walked while the League page covered the game");
  e.release("right");
  /* Ordinary frames, not long ones: a gap over STALL is the stall
     compensation's to shift, and a first version of this test passed on that
     alone with the pause's own shift deleted. */
  e.state.encounter = { phase: "idle", until: now + 500 };
  const until = e.state.encounter.until;
  tick(16, 200);
  e.pause(false);
  assert.ok(e.state.encounter.until >= until + 3000, "an encounter's clock ran on under the League page");
  e.state.encounter = null;
  console.log(`league engine ok — a ${turns}-turn battle moved rev only, its result was one changed(), ` +
    "no save carried it, and a paused game walked nowhere and lost no time");
}

/* THE LEAGUE'S ORDER AND PAY, ENFORCED BY THE ENGINE (docs/battles.md,
   phase 4). The page offers only what league.js allows, so every refusal
   here is the engine's own - a page bug, a stale tab or a Box that changed
   under the picker cannot start a battle it should not. A result is forced
   (`over: 0`) where the rules of the fight are not the question: this is the
   judge, not the battle. */
{
  const { newBattle, fighter, opponent } = await import("../src/game/battle.js");
  const L = await import("../src/game/league.js");
  const { dexIndex } = await import("../src/game/biomes.js");
  const { GYMTUNE, REMATCH_STEPS } = await import("../src/data/gymtune.js");
  const { LEAGUES } = await import("../src/data/leagues.js");
  const byId = new Map(LEAGUES.flatMap((r) => [...r.gyms, ...r.gyms.flatMap((g) => g.trainers), ...r.league])
    .map((o) => [o.id, o]));
  const kanto = LEAGUES[0], johto = LEAGUES[1];
  const [brock, misty] = kanto.gyms;
  const cap = GYMTUNE[brock.id].cap;
  const box = [
    { uid: 1, species: 4, level: 5 }, { uid: 2, species: 7, level: 5 }, { uid: 3, species: 1, level: 5 },
    { uid: 4, species: 1, level: 100 },                      // far over what Brock was solved for
    { uid: 5, species: 150, level: 100 },                    // a legendary at full strength
    { uid: 6, species: 16, level: 5 },                       // locked in a trade, below
  ];
  const at = (beaten = {}) => {
    const { e } = boot({ ...SAVE, box, nextUid: 7, beaten });
    e.state.box.find((m) => m.uid === 6).lock = "offer";
    return e;
  };
  // A battle as the page builds it: the Box's own Pokemon, the opponent at its level now.
  const battle = (e, id, uids) => newBattle([
    uids.map((uid) => { const m = e.state.box.find((x) => x.uid === uid) ?? { species: 1, level: 5 }; return fighter(m.species, m.level, uid); }),
    opponent(byId.get(id).party, L.topOf(id, e.state.beaten), (k) => k + 1),
  ], [null, 2]);
  const begin = (e, id, uids) => e.battleBegin(battle(e, id, uids), { id, uids });
  const win = (e, id, uids = [1]) => {
    const b = battle(e, id, uids);
    const no = e.battleBegin(b, { id, uids });
    assert.equal(no, null, `${id} refused (${no}) where it should be open`);
    e.battleStep({ ...b, over: 0 });
    return e.battleEnd();
  };
  const everyone = (r) => [...r.gyms.flatMap((g) => [g.id, ...g.trainers.map((t) => t.id)]), ...r.league.map((p) => p.id)];
  const allOf = (ids) => Object.fromEntries(ids.map((id) => [id, { wins: 1, at: 0 }]));

  /* A REGION'S CHAMPION PAYS A BOX of the newest open set (docs/cards.md,
     phase 3) - the bundle's worth for Ascended Heroes - every pack earned. */
  {
    const C = await import("../src/game/cards.js");
    const { levelFromXp } = await import("../src/game/biomes.js");
    const region = LEAGUES[0];
    const champ = region.league.find((p) => GYMTUNE[p.id].kind === "champion");
    const e = at(allOf(everyone(region).filter((id) => id !== champ.id)));
    const set = C.newestOpen(levelFromXp(e.state.xp));
    const r = win(e, champ.id);
    assert.equal(r.pack, set, "a first Champion win paid no box");
    assert.equal(e.state.packs[set], C.BOXES[set].packs, "the Champion's box is not the set's box");
    assert.deepEqual(e.state.earnedPacks[set], Array(C.BOXES[set].packs).fill(`champion:${champ.id}`),
      "the Champion's packs are not all earned");
  }

  // Who may come: the engine's refusal, reason by reason, and nothing starts.
  {
    const e = at(allOf(brock.trainers.map((t) => t.id)));
    assert.equal(begin(e, brock.id, [6]), "locked", "a Pokemon locked in a trade was let into the battle");
    assert.equal(begin(e, brock.id, [99]), "team", "a Pokemon not in the Box was let in");
    assert.equal(begin(e, brock.id, [1, 1]), "team", "one Pokemon was let in twice");
    // A fighter that is not the Box's Pokemon at its own level is not that Pokemon.
    const b = battle(e, brock.id, [1]);
    b.sides[0].team[0] = fighter(4, 60, 1);
    assert.equal(e.battleBegin(b, { id: brock.id, uids: [1] }), "team", "a Lv 60 fighter passed as a Lv 5 Charmander");
    assert.equal(e.state.battle, null, "a refused battle was started anyway");
  }

  // NO LEVEL CAP (your call, 2026-10-03): a Lv 100 and a Lv 100 Mewtwo walk into Brock, in the order given.
  {
    const e = at(allOf(brock.trainers.map((t) => t.id)));
    assert.equal(begin(e, brock.id, [5, 4]), null, "a Lv 100 team was refused by Brock");
    assert.deepEqual(e.state.team, [5, 4], "the team taken was not kept in its order");
  }

  // YOUR TEAM (engine.setTeam): box uids only, each once, six at most, in order, and saved.
  {
    const e = at();
    e.setTeam([3, 1, 99, 3, 2]);
    assert.deepEqual(e.state.team, [3, 1, 2], "setTeam kept a uid not in the Box, or a repeat, or lost the order");
    e.setTeam([1, 2, 3, 4, 5, 6, 1]);
    assert.equal(e.state.team.length, L.TEAM_MAX);
    e.setTeam("junk");
    assert.equal(e.state.team.length, L.TEAM_MAX, "setTeam took garbage");
    e.setTeam([2, 1]);
    await new Promise((r) => setTimeout(r, 600));
    assert.deepEqual(boot(JSON.parse(store.get("meadow-route"))).e.state.team, [2, 1], "your team did not survive a reload");
  }

  // SIX MAY COME TO ANY BATTLE (your call, 2026-10-02): Brock fields two, and a
  // team of three is not refused for its size. Read off the roster.
  {
    const e = at(allOf(brock.trainers.map((t) => t.id)));
    assert.ok(brock.party.length < 3, "Brock fields three - this test needs a leader with a smaller party");
    assert.notEqual(begin(e, brock.id, [1, 2, 3]), "team", "a team bigger than Brock's party was refused");
  }

  // A gym is walked through (rev 5): its trainers in the roster's order, then its
  // leader; the next gym waits for this leader. A first win pays once and gives the badge.
  {
    const e = at();
    assert.equal(begin(e, brock.id, [1]), "shut", "Brock opened before his gym trainers were beaten");
    assert.equal(begin(e, misty.trainers[0].id, [1]), "shut", "Misty's gym opened before Brock was beaten");
    const firstPay = win(e, brock.trainers[0].id).pay;
    assert.equal(firstPay, Math.round(GYMTUNE[brock.id].prize * L.TRAINER_SHARE), "a gym trainer's first win did not pay a fifth of its leader");
    for (const t of brock.trainers.slice(1)) win(e, t.id);
    const before = JSON.stringify({ box: e.state.box, xp: e.state.xp, candy: e.state.candy });
    const money = e.state.money;
    const was = e.state.beaten;
    /* A FIRST BADGE PAYS A CARD PACK (docs/cards.md): the newest set open,
       held as earned so its cards carry the badge's stamp. */
    const { newestOpen } = await import("../src/game/cards.js");
    const { levelFromXp: lvOf } = await import("../src/game/biomes.js");
    const newest = newestOpen(lvOf(e.state.xp));      // the newest set this level has open
    const packs0 = e.state.packs[newest] ?? 0;
    const r = win(e, brock.id);
    assert.deepEqual(r, { over: 0, pay: GYMTUNE[brock.id].prize, first: true, fee: 0, gift: null, master: false, charm: null, pack: newest });
    assert.equal(e.state.packs[newest], packs0 + 1, "a first badge did not add its pack");
    assert.deepEqual(e.state.earnedPacks[newest].slice(-1), [`badge:${brock.id}`], "the badge pack is not marked earned");
    assert.notEqual(e.state.beaten, was, "a win was written into `beaten` in place - the League page's memo never sees it");
    assert.equal(e.state.money, money + GYMTUNE[brock.id].prize, "the first win did not pay its prize");
    assert.deepEqual(e.state.beaten[brock.id], { wins: 1, at: e.state.steps });
    assert.equal(L.badgesOf(e.state.beaten), 1);
    assert.equal(JSON.stringify({ box: e.state.box, xp: e.state.xp, candy: e.state.candy }), before,
      "a battle changed a level, the XP or the candy - battles never give EXP");
    assert.deepEqual(e.state.team, [1], "the team taken was not remembered");
    assert.equal(begin(e, misty.id, [1]), "shut", "Misty opened before her gym trainers were beaten");
    assert.equal(begin(e, misty.trainers[1].id, [1]), "shut", "a gym trainer opened before the one before it was beaten");
    assert.equal(begin(e, misty.trainers[0].id, [1]), null, "Misty's first gym trainer stayed shut after Brock was beaten");
    // Losing, forfeiting or leaving pays and records nothing.
    const lost = e.battleEnd();
    assert.deepEqual(lost, { over: -1, pay: 0, first: false, fee: 0, gift: null, master: false, charm: null, pack: null }, "a battle left unfinished paid");
    assert.ok(!e.state.beaten[misty.trainers[0].id], "a battle left unfinished was recorded as a win");

    // A rematch at once pays nothing; the clock refills as you walk.
    const again = win(e, brock.id);
    assert.deepEqual(again, { over: 0, pay: 0, first: false, fee: 0, gift: null, master: false, charm: null, pack: null }, "a rematch straight after the win paid");
    assert.equal(e.state.beaten[brock.id].wins, 2);
    assert.equal(L.capOf(brock.id, e.state.beaten), Math.min(100, cap + 2 * L.REMATCH_CAP_STEP),
      "each win did not raise Brock's cap");
    e.state.steps += REMATCH_STEPS / 2;
    const half = win(e, brock.id);
    assert.equal(half.pay, Math.round(GYMTUNE[brock.id].prize * L.REMATCH_SHARE / 2), "a rematch did not pay pro rata");
    e.state.steps += REMATCH_STEPS * 3;
    assert.equal(e.world().rematches, 1, "Brock's full clock is not reported by world()");
    assert.equal(win(e, brock.id).pay, Math.round(GYMTUNE[brock.id].prize * L.REMATCH_SHARE),
      "a rematch past its full clock paid other than the full rematch share");

    // A gym trainer pays once (its first win, above), however long you wait.
    e.state.steps += REMATCH_STEPS * 2;
    assert.equal(win(e, brock.trainers[0].id).pay, 0, "a gym trainer paid twice");
  }

  // A win is never taken back: a save that beat Brock past his trainers (rev 3)
  // keeps his rematch, and Misty's gym is reached on it.
  {
    const e = at(allOf([brock.id]));
    assert.equal(begin(e, brock.id, [1]), null, "a leader beaten before rev 5 was shut again for its unbeaten trainers");
    e.battleEnd();
    assert.equal(begin(e, misty.trainers[0].id, [1]), null, "a gym was not reached on a leader beaten before rev 5");
    e.battleEnd();
  }

  /* HARD MODE (phase 8): shut until the region is cleared, then its run in
     order; every attempt pays HARD_FEE and a win gives it back; a first win
     pays the prize and gives the signature Pokemon as a gift; the whole run
     gives a Master Ball and a step of the Region Charm. */
  {
    const { HARDTUNE, HARD_FEE, HARD_PRIZE } = await import("../src/data/gymtune.js");
    const { hardParty } = await import("../src/game/battle.js");
    const run = L.hardRunOf(kanto.id);
    assert.equal(run.length, kanto.gyms.length + kanto.league.length, "Kanto's hard run is not every leader and League member");
    assert.equal(run[0], `${brock.id}:hard`, "the hard run does not start with Kanto's first leader");
    const hardBattle = (e, id, uids) => newBattle([
      uids.map((uid) => { const m = e.state.box.find((x) => x.uid === uid); return fighter(m.species, m.level, uid); }),
      opponent(hardParty(byId.get(id.replace(/:hard$/, "")).hard), L.topOf(id, e.state.beaten), (k) => k + 1),
    ], [null, 3]);
    const hbegin = (e, id) => e.battleBegin(hardBattle(e, id, [1]), { id, uids: [1] });
    const hwin = (e, id) => {
      const b = hardBattle(e, id, [1]);
      assert.equal(e.battleBegin(b, { id, uids: [1] }), null, `${id} refused where it should be open`);
      e.battleStep({ ...b, over: 0 });
      return e.battleEnd();
    };
    const cleared = allOf(everyone(kanto));
    const shut = at(allOf(everyone(kanto).filter((id) => id !== kanto.league.at(-1).id)));
    shut.state.money = 1e6;
    assert.equal(hbegin(shut, run[0]), "shut", "hard mode opened before the region was cleared");

    const e = at(cleared);
    e.state.money = HARD_FEE - 1;
    assert.equal(hbegin(e, run[0]), "fee", "a hard battle began without its entry fee");
    e.state.money = 1e6;
    assert.equal(hbegin(e, run[1]), "shut", "the second hard opponent opened before the first was beaten");
    // A loss keeps the fee.
    const m0 = e.state.money;
    assert.equal(hbegin(e, run[0]), null);
    assert.equal(e.state.money, m0 - HARD_FEE, "the entry fee was not taken");
    e.battleEnd();
    assert.equal(e.state.money, m0 - HARD_FEE, "a hard battle left unfinished gave its fee back");
    // A first win: the fee back, the prize, the signature Pokemon as a gift.
    const boxBefore = e.state.box.length, m1 = e.state.money;
    // A gift that is a new species counts like a catch (a trade counts): the dex bonus on top.
    const fresh = e.state.dex[dexIndex(L.giftOf(run[0]).species)] !== 2;
    const r = hwin(e, run[0]);
    if (fresh) assert.ok(e.state.money > m1 + HARD_PRIZE, "a gift of a new species paid no dex bonus");
    else assert.equal(e.state.money, m1 + HARD_PRIZE, "a first hard win did not give the fee back and pay the prize");
    assert.equal(r.pay, HARD_PRIZE);
    const gift = L.giftOf(run[0]);
    assert.deepEqual(r.gift, gift, "the result does not name the gift given");
    assert.equal(e.state.box.length, boxBefore + 1, "a first hard win gave no Pokemon");
    const g = e.state.box.at(-1);
    assert.deepEqual([g.species, g.level, g.traded, g[gift.tier]], [HARDTUNE[run[0]].gift[0], HARDTUNE[run[0]].gift[1], 1, 1],
      "the signature Pokemon is not the solved ace, at its level, a gift, in its tier");
    assert.equal(e.state.dex[dexIndex(g.species)], 2, "the signature Pokemon did not fill the Pokedex");
    // A hard rematch: no prize, no second gift, the fee back.
    const m2 = e.state.money, n2 = e.state.box.length;
    const again = hwin(e, run[0]);
    assert.deepEqual([again.pay, again.gift, e.state.money, e.state.box.length], [0, null, m2, n2],
      "a hard rematch paid, gave a second Pokemon or kept the fee");
    // The whole run: a Master Ball and the charm, once.
    const balls = e.state.bag["master-ball"] ?? 0;
    assert.equal(L.charmOf(e.state.beaten), 1, "the Region Charm grew before a hard run was cleared");
    let last = null;
    for (const id of run.slice(1)) last = hwin(e, id);
    assert.equal(last.master, true, "clearing Kanto's hard run gave no Master Ball");
    assert.equal(e.state.bag["master-ball"], balls + 1, "the Master Ball did not reach the bag");
    assert.ok(Math.abs(last.charm - (1 + L.CHARM_MAX / L.REGIONS.length)) < 1e-12, "the Region Charm is not one region's step");
    assert.equal(hwin(e, run.at(-1)).master, false, "a hard rematch of the Champion gave a second Master Ball");
  }

  /* THE MOVE TUTOR (phase 8): each new move costs TUTOR_PRICE (through
     Haggle), a taught set that moved under the page is refused, and the
     moves are saved by name - a malformed field is dropped, never the entry. */
  {
    const { TUTOR_PRICE } = await import("../src/game/items.js");
    const { pricedAt } = await import("../src/game/trainer.js");
    const e = at();
    e.state.money = 1e6;
    const price = pricedAt(TUTOR_PRICE, e.state.stats);
    const now = ["scratch", "growl"];
    const m0 = e.state.money;
    assert.equal(e.tutor(1, ["scratch", "ember", "smokescreen"], now), null);
    assert.equal(e.state.money, m0 - 2 * price, "two new moves did not cost two tutor prices");
    assert.deepEqual(e.state.box.find((m) => m.uid === 1).moves, ["scratch", "ember", "smokescreen"]);
    assert.equal(e.tutor(1, ["ember"], now), "stale", "a taught set that moved under the page was overwritten");
    assert.equal(e.tutor(1, ["scratch", "ember", "smokescreen"], ["scratch", "ember", "smokescreen"]), "same", "teaching nothing new was charged");
    e.state.money = price - 1;
    assert.equal(e.tutor(2, ["bubble"], ["tackle"]), "money", "a move was taught without the money");
    e.saveNow();
    const back = boot(JSON.parse(store.get("meadow-route"))).e;
    assert.deepEqual(back.state.box.find((m) => m.uid === 1).moves, ["scratch", "ember", "smokescreen"], "taught moves did not survive a reload");
    const junk = boot({ ...SAVE, box: [{ uid: 1, species: 4, level: 5, moves: ["a", "a"] }, { uid: 2, species: 7, level: 5, moves: 7 }], nextUid: 3 }).e;
    assert.equal(junk.state.box.length, 2, "a malformed taught set lost the Pokemon");
    assert.ok(junk.state.box.every((m) => m.moves === undefined), "a malformed taught set was kept");
  }

  // The Elite Four waits for every badge, and each member for the one before.
  {
    const leaders = kanto.gyms.map((g) => g.id);
    const e = at(allOf([...leaders.slice(0, -1), ...kanto.gyms.at(-1).trainers.map((t) => t.id)]));
    assert.equal(begin(e, kanto.league[0].id, [1]), "shut", "the Elite Four opened one badge short");
    win(e, leaders.at(-1));
    assert.equal(begin(e, kanto.league[1].id, [1]), "shut", "the second member opened before the first was beaten");
    assert.equal(begin(e, kanto.league[0].id, [1]), null, "the Elite Four stayed shut with every badge");
    e.battleEnd();
  }

  // A region waits for the whole of the one before - gym trainers and Champion
  // included - and opens on the win that clears it.
  {
    const all = everyone(kanto);
    const champ = kanto.league.at(-1).id;
    const trainer = kanto.gyms.at(-1).trainers[0].id;
    // Johto's first door is its first gym's first trainer (a gym is walked through).
    const door = johto.gyms[0].trainers[0]?.id ?? johto.gyms[0].id;
    const e1 = at(allOf(all.filter((id) => id !== trainer)));
    assert.equal(begin(e1, door, [1]), "shut", "Johto opened with a Kanto gym trainer unbeaten");
    const e = at(allOf(all.filter((id) => id !== champ)));
    assert.equal(begin(e, door, [1]), "shut", "Johto opened before Kanto's Champion was beaten");
    win(e, champ);
    assert.ok(L.regionCleared(kanto.id, e.state.beaten));
    assert.equal(begin(e, door, [1]), null, "Johto stayed shut once Kanto was cleared");
    e.battleEnd();
  }

  // A reload mid-battle is a forfeit with nothing spent: no battle, no win, no money.
  {
    const e = at();
    assert.equal(begin(e, brock.trainers[0].id, [1]), null);
    e.buy("poke-ball", 1);                  // something to save
    e.saveNow();
    const saved = JSON.parse(store.get("meadow-route"));
    const back = boot(saved).e;
    assert.equal(back.state.battle, null, "a battle survived a reload");
    assert.deepEqual(back.state.beaten, {}, "a reload mid-battle recorded a win");
    assert.equal(back.state.money, saved.money);
    assert.deepEqual(back.battleEnd(), { over: -1, pay: 0, first: false, fee: 0, gift: null, master: false, charm: null, pack: null }, "the reloaded game paid for the old battle");
    assert.equal(JSON.stringify(back.state.box.map(({ uid, species, level }) => [uid, species, level])),
      JSON.stringify(saved.box.map(({ uid, species, level }) => [uid, species, level])), "a reload mid-battle changed the Box");
  }

  // The saved fields: each on its three counts, then each entry cleaned on its own.
  await savedField("beaten", { [brock.id]: { wins: 2, at: 40 } }, "junk", {});
  await savedField("team", [1, 3], "junk", [], { ...SAVE, box, nextUid: 7 });
  {
    const e = boot({ ...SAVE, box, nextUid: 7, team: [3, 99, 1],
      beaten: { [brock.id]: { wins: 1, at: 5 }, [misty.id]: { wins: "x", at: 1 }, "from-a-newer-build": { wins: 1, at: 0 } } }).e;
    assert.deepEqual(e.state.beaten, { [brock.id]: { wins: 1, at: 5 }, "from-a-newer-build": { wins: 1, at: 0 } },
      "one bad beaten row was not dropped alone, or an unknown id was not kept");
    assert.deepEqual(e.state.team, [3, 1], "a team uid no longer in the Box was kept");
  }

  // What the save costs when everything in the game is beaten (docs/battles.md, *Performance*).
  const full = allOf([...byId.keys()]);
  // hrtime: `performance.now` here is the hand-driven clock.
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) JSON.stringify(full);
  const each = Number(process.hrtime.bigint() - t0) / 100 / 1e6;
  console.log(`league progress ok — order, refusals, first wins, rematch pay and caps, the Elite Four and ` +
    `region unlocks all enforced by the engine; everything beaten is ${(JSON.stringify(full).length / 1000).toFixed(1)}KB ` +
    `in the save, ${each.toFixed(2)}ms to stringify`);
}

/* THE BATTLE SHELF THROUGH THE ENGINE (docs/battles.md, phase 5). The page
   computes an item turn with battle.js; the engine spends the item when the
   turn is handed over - the one place it is spent - and refuses the whole
   turn when the bag does not hold it. The bag moving is `stepped()`, like
   every turn, and what was spent stays spent whatever the result. */
{
  const { newBattle, fighter, step, mulberry32 } = await import("../src/game/battle.js");
  const box = [{ uid: 1, species: 6, level: 40 }, { uid: 2, species: 9, level: 40 }];
  const { e } = boot({ ...SAVE, box, nextUid: 3, bag: { ...SAVE.bag, potion: 2 } });
  tick(16, 3);
  const mine = [fighter(6, 40, 1), fighter(9, 40, 2)];
  mine[0].hp = 5;
  mine[1].hp = 0;
  const b = newBattle([mine, [fighter(129, 5, 3)]], [null, 1]);
  assert.equal(e.battleBegin(b, { id: "kanto-brock-camper-liam", uids: [1, 2] }), null);
  const col = e.state.colRev;
  const rng = mulberry32(2);
  const healed = step(b, { item: "potion", target: 0 }, rng);
  assert.equal(e.battleStep(healed), null);
  assert.equal(e.state.bag.potion, 1, "a Potion used in a battle was not spent");
  assert.equal(e.state.colRev, col, "an item turn bumped colRev - the collection panels rebuilt mid-battle");
  // A Revive the bag does not hold: the turn is refused whole, and nothing moves.
  const revived = step(healed, { item: "revive", target: 1 }, rng);
  assert.ok(revived.turn > healed.turn, "battle.js refused a Revive on a fainted Pokemon");
  assert.equal(e.battleStep(revived), "bag", "a turn using an item the bag does not hold was taken");
  assert.equal(e.state.battle, healed, "a refused turn replaced the battle");
  // Spent stays spent: leaving the battle gives nothing back, and the save carries it.
  e.battleEnd();
  e.saveNow();
  assert.equal(boot(JSON.parse(store.get("meadow-route"))).e.state.bag.potion, 1,
    "a Potion spent in a battle came back after it or a reload");
  console.log("battle shelf ok — an item turn spends from the bag once, moves rev only, " +
    "a turn using one not held is refused whole, and nothing spent comes back");
}

/* HOW MANY OF THIS FORM YOU HOLD, on the nameplate (reported from play: a
   collector wants to know before spending a ball). Counted from the Box for
   this species IN THIS TIER - an ordinary one is not a Shiny - and frozen at
   the start like `knownForm`, through a real walk into a real encounter. */
{
  const { SPECIES } = await import("../src/data/dex.js");
  const { TIERS } = await import("../src/game/biomes.js");
  const box = [];
  let uid = 1;
  for (const { id } of SPECIES) {
    box.push({ uid: uid++, species: id, level: 5 }, { uid: uid++, species: id, level: 6 },
      { uid: uid++, species: id, level: 7, shiny: 1 });
  }
  const { e } = boot({ ...SAVE, box, nextUid: uid });
  const enc = walkToEncounter(e);
  assert.ok(enc, "no encounter to count against");
  const want = e.state.box.filter((m) => m.species === enc.speciesId && (TIERS.find((t) => m[t]) ?? null) === enc.variant).length;
  assert.equal(enc.ownedForm, want, `the nameplate counts ${enc.ownedForm} of this form; the Box holds ${want}`);
  assert.equal(enc.ownedForm, enc.variant === "shiny" ? 1 : enc.variant ? 0 : 2,
    "an ordinary Pokemon counted its species' rare forms, or the other way round");
  const frozen = enc.ownedForm;
  e.state.box.push({ uid: 99999, species: enc.speciesId, level: 3, ...(enc.variant ? { [enc.variant]: 1 } : {}) });
  tick(16, 5);
  assert.equal(e.state.encounter.ownedForm, frozen, "the count moved mid-encounter");
  console.log(`owned ok — the nameplate's count is the Box's for that species in that tier (${frozen} ` +
    `for this ${enc.variant ?? "ordinary"} #${enc.speciesId}), frozen at the start`);
}

/* A LEAGUE WIN TEACHES (research's `league` task, a legendary's in place of
   the first ball): credited in `battleEnd` to every Pokemon that fought, on a
   win and never on a loss. */
{
  const { newBattle, fighter, opponent } = await import("../src/game/battle.js");
  const { topOf } = await import("../src/game/league.js");
  const { TASKS } = await import("../src/game/research.js");
  const { LEAGUES } = await import("../src/data/leagues.js");
  const slot = TASKS.findIndex((t) => t.id === "league");
  const brock = LEAGUES[0].gyms[0];
  const box = [{ uid: 1, species: 146, level: 5 }, { uid: 2, species: 16, level: 5 }];
  const play = (over) => {
    // Brock's gym trainers beaten, so Brock is open (a gym is walked through).
    const beaten = Object.fromEntries(brock.trainers.map((t) => [t.id, { wins: 1, at: 0 }]));
    const { e } = boot({ ...SAVE, box, nextUid: 3, beaten });
    const b = newBattle([[fighter(146, 5, 1), fighter(16, 5, 2)], opponent(brock.party, topOf(brock.id, {}), (k) => k + 1)], [null, 2]);
    assert.equal(e.battleBegin(b, { id: brock.id, uids: [1, 2] }), null, "the battle was refused");
    e.battleStep({ ...b, over });
    e.battleEnd();
    return e.state.research;
  };
  const lost = play(1);
  assert.ok(!(lost[146]?.[slot] > 0), "a lost League battle credited the league task");
  const won = play(0);
  assert.equal(won[146]?.[slot], 1, "a League win did not credit the legendary that fought");
  assert.equal(won[16]?.[slot], 1, "a League win did not credit every Pokemon that fought");
  console.log("league research ok — a League win credits `league` to every Pokemon that fought, a loss credits nothing");
}

/* THE POKÉDEX RANK IS ANNOUNCED whichever way the count crosses a step - an
   evolution or a trade, as well as a catch (one `register` for all three) -
   once, and never when the count did not move. */
{
  const { DEX_RANKS } = await import("../src/game/medals.js");
  const { SPECIES } = await import("../src/data/dex.js");
  const { dexIndex } = await import("../src/game/biomes.js");
  const withCaught = (n) => {
    const dex = SPECIES.map(() => 0);
    for (const sp of SPECIES.filter((x) => ![10, 11, 25, 133].includes(x.id)).slice(0, n)) dex[dexIndex(sp.id)] = 2;
    dex[dexIndex(10)] = 2;                                      // the Caterpie in the box
    return dex;
  };
  const ranks = (e) => e.state.cheers.filter((c) => c.kind === "rank");
  const one = DEX_RANKS[1], two = DEX_RANKS[2];
  // An evolution into a new species: one short of Researcher, then on it.
  const ev = boot({ ...SAVE, dex: withCaught(one.at - 2), box: [{ uid: 1, species: 10, level: 20 }], nextUid: 2 }).e;
  ev.state.cheers.length = 0;
  assert.ok(ev.evolve(1, 11), "the evolution did not run - this test is asserting nothing");
  assert.deepEqual(ranks(ev).map((c) => c.title), [one.name.toUpperCase()], "an evolution onto a rank step did not announce it");
  // The ceremony raises the medal you had into the one you reached.
  assert.deepEqual([ranks(ev)[0].from, ranks(ev)[0].step], [0, 1], "the rank-up does not say which step it left");
  // A trade arriving: one short of the next step.
  const tr = boot({ ...SAVE, dex: withCaught(two.at - 2), box: [], nextUid: 2 }).e;
  tr.state.cheers.length = 0;
  const gift = { mid: "11111111-1111-4111-8111-111111111111", species: 25, level: 5, size: 100, tier: null, alpha: false, ot: "Misty", traded: 1 };
  tr.reconcileTrades({ arrived: [gift] });
  assert.deepEqual(ranks(tr).map((c) => c.rank), [two.id], "a traded species onto a rank step did not announce it");
  tr.reconcileTrades({ arrived: [{ ...gift, mid: "22222222-2222-4222-8222-222222222222" }] });
  assert.equal(ranks(tr).length, 1, "a species already registered announced the rank again");
  // A new species one past the step is not a step.
  tr.reconcileTrades({ arrived: [{ ...gift, species: 133, mid: "33333333-3333-4333-8333-333333333333" }] });
  assert.equal(tr.state.dex[dexIndex(133)], 2, "the second gift did not register - this asserts nothing");
  assert.equal(ranks(tr).length, 1, "a new species off a rank step announced a rank");
  console.log(`dex rank ok — ${DEX_RANKS.length} ranks, announced once on the step whether it is reached by evolving or a trade`);
}

/* A STILL SCENE IS NOT DRAWN AGAIN (engine `drawnKey`): standing still, the
   loop keeps running and paints nothing; a step paints every frame of it,
   and a resize (which clears a canvas) paints once. */
{
  const { VIEW_W } = await import("../src/game/engine.js");
  /* Repelled: this walks to test painting, and a step that started an
     encounter stopped the walk it measures ("a step was not painted", now
     and then, 2026-10-02). */
  const { e } = boot({ ...SAVE, field: { ...SAVE.field, repel: { id: "max-repel", steps: 9999 } } });
  tick(16, 4);
  draws = 0;
  tick(16, 30);
  assert.equal(draws, 0, `standing still painted ${draws} calls in 30 frames`);
  e.setView(VIEW_W + 2);
  tick(16, 1);
  assert.ok(draws > 0, "a resized view was not repainted");
  const at = [e.state.player.x, e.state.player.y];
  for (const dir of ["right", "left", "down", "up"]) {
    e.press(dir); tick(16, 30); e.clearHeld(); tick(16, 30);
    if (e.state.player.x !== at[0] || e.state.player.y !== at[1]) break;
  }
  assert.notDeepEqual([e.state.player.x, e.state.player.y], at, "the trainer never moved - this test is asserting nothing");
  draws = 0;
  e.press("right"); tick(16, 8); e.clearHeld();
  assert.ok(draws > 0, "a step was not painted");
  e.destroy();
  console.log("idle draw ok — a still scene paints nothing, a step and a resize paint");
}

/* A WALK TELLS REACT A FEW TIMES A SECOND (engine `walked`): steps bump `rev`
   at once but hand the UI one notice per WALK_NOTICE ms, and anything else
   that changes notifies at once. The clock here is the fake one, so a whole
   walk runs before the real timer can fire. (The baked ground needs the
   tile art, which Node never loads: it was held pixel for pixel against the
   tile loop in a browser, every map - docs/decisions.md.) */
{
  // Repelled, like the paint test: a step that started an encounter cut the walk short now and then.
  const b = boot({ ...SAVE, field: { ...SAVE.field, repel: { id: "max-repel", steps: 9999 } } });
  const { e } = b;
  tick(16, 4);
  const start = [e.state.player.x, e.state.player.y];
  const rev0 = e.state.rev, n0 = b.changes();
  for (const dir of ["right", "left", "down", "up"]) {
    e.press(dir);
    tick(16, 40);
    e.clearHeld(); tick(16, 20);
  }
  const moved = e.state.rev - rev0;
  assert.ok(moved >= 4, `the walk took ${moved} steps - this test is asserting nothing`);
  assert.ok(b.changes() - n0 <= 1, `a walk of ${moved} steps notified the UI ${b.changes() - n0} times`);
  await new Promise((r) => setTimeout(r, 320));
  assert.ok(b.changes() - n0 >= 1, "a walk never told the UI at all");
  const n1 = b.changes();
  e.press("right"); tick(16, 12); e.clearHeld();
  e.buy("poke-ball", 1);
  assert.equal(b.changes(), n1 + 1, "a purchase mid-walk waited for the walk's notice");
  await new Promise((r) => setTimeout(r, 320));
  assert.equal(b.changes(), n1 + 1, "the walk's pending notice fired after a change had already told the UI");
  e.destroy();
  void start;
  console.log(`walk ok — ${moved} steps told the UI once, a purchase at once`);
}

console.log("play ok — the frame loop never stopped");
