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
const ctx2d = new Proxy({}, {
  get: (_, k) => (k === "canvas" ? { width: 0, height: 0 } : noop),
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
const { BALLS, berryById } = await import("../src/game/items.js");
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
  assert.equal(e.useField("honey-shiny"), true, "a shiny honey refused to start");
  assert.equal(e.state.field.variant.id, "honey-shiny",
    "a second honey did not REPLACE the first - two variant tilts can run at once");
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
      f.flee();
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

/* A CACHE IS ONLY YOURS IF YOU WROTE IT. `settle` treated an UNOWNED local save
   as the signed-in player's, meant to rescue somebody who played offline and
   then signed up - and what it did was hand every account whatever the browser
   happened to be holding. The deployed build is full of localStorage from
   before accounts existed, so logging in there produced a dex nobody earned,
   and clearing the database did not help because the data was never in it.

   `settle` needs a network, so the RULE is asserted rather than the function:
   the four ownership cases, and that the source still states them. */
{
  const owned = (owner, uid) => owner === uid;
  assert.equal(owned(null, null), true, "local mode must use the local save");
  assert.equal(owned("abc", "abc"), true, "your own cache must be used");
  assert.equal(owned(null, "abc"), false,
    "an UNOWNED cache was adopted by an account - this is the production bug");
  assert.equal(owned("xyz", "abc"), false, "another account's cache was adopted");

  /* COMMENTS STRIPPED FIRST. The first version of this matched the comment
     INSIDE `settle` that explains the old rule - the prose quotes
     `!owner || owner === uid` to say why it was wrong, and the assertion read
     that as the code still doing it. This file already records the same trap
     for the repel check: a test that forbids documenting itself is a test
     nobody keeps. */
  const src = readFileSync(new URL("../src/Boot.jsx", import.meta.url), "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const settle = code.slice(code.indexOf("async function settle"), code.indexOf("const fieldOf"));
  assert.ok(/owner === uid \? read\(SAVE_KEY\)/.test(settle),
    "settle no longer requires the cache to belong to this account");
  assert.ok(!/!owner \|\| owner === uid/.test(settle),
    "settle is adopting unowned local data again - that is the production bug");
  console.log("cache ownership ok — only a cache this account wrote is ever adopted");
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
  assert.ok(/if \(now !== was\) \{ pulled = false; lost = false; \}/.test(cloud),
    "the read/claim latches are not reset when the user changes, or are reset on every refresh");

  // Boot must act on the failed read rather than treating it as an empty save.
  const boot = bare(readFileSync(new URL("../src/Boot.jsx", import.meta.url), "utf8"));
  assert.ok(/if \(!got\.ok\) return \{ ok: false/.test(boot),
    "settle writes to localStorage on the strength of a read that failed");
  assert.ok(/await claim\(\)/.test(boot), "Boot never takes the save, so an old tab keeps writing");

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
  assert.ok(/state\.stale === "taken"\) return/.test(writes),
    "a session that lost the save still writes to localStorage, over the live tab's copy");

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

/* A SAVE WRITTEN AT FOUR TIERS MUST LOAD AT EIGHT, and CLAUDE.md's claim that
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
      assert.ok(into, `no direction for a ledge facing ${L.dx},${L.dy}`);
      const at = (x, y) => ({
        ...SAVE, areaId, xp: LEVEL_XP[24],
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

  let rode = 0, pairs = 0;
  for (const areaId of WARPED) {
  const area = AREAS[areaId];
  pairs += area.warps.length;
  const solidAt = (x, y) => !area.rows[y] || SOLID.includes(area.rows[y][x] ?? "");
  for (const [ax, ay, bx, by] of area.warps) {
    for (const [from, to] of [[[ax, ay], [bx, by]], [[bx, by], [ax, ay]]]) {
      /* Step ONTO the ladder from a neighbour rather than starting on it: a
         warp taken at boot would prove the table and not the step handler. */
      const step = DIRS.find(([dx, dy]) => !solidAt(from[0] - dx, from[1] - dy));
      if (!step) continue;
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
  assert.equal(rode, pairs * 2,
    `only ${rode} of ${pairs * 2} warp directions could be driven`);
  console.log(`warps ok — ${pairs} pairs across ${WARPED.length} areas ` +
    `(${WARPED.join(", ")}), every one ridden both ways`);
}

console.log("play ok — the frame loop never stopped");
