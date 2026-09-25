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
    for (const k of ["stale", "rev", "colRev", "encounter", "ask", "cheers"]) {
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
async function savedField(name, good, bad, empty) {
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
    e.flee();
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
  assert.deepEqual(e.events(), [], "an outbreak that is over still has a card");
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

  /* A LEGENDARY: caught before its task existed, credited from the dex on
     load - and never starred, whatever the box holds. */
  const { LEGENDARY, dexIndex } = await import("../src/game/biomes.js");
  const { researchLevel, RESEARCH_MAX } = await import("../src/game/research.js");
  const leg = LEGENDARY[0];
  const dex = [...SAVE.dex]; dex[dexIndex(leg)] = 2;
  const lb = Array.from({ length: STAR_COST }, (_, i) => ({ uid: 60 + i, species: leg, level: 50, size: 100, at: 1 }));
  const le = boot({ ...SAVE, dex, box: lb, nextUid: 99 }).e;
  assert.equal(researchLevel(leg, le.state.research[leg]), RESEARCH_MAX,
    "a legendary already in the dex did not have its research credited on load");
  assert.equal(le.star(leg), false, "a legendary was offered a star");
  const no = fresh();
  no.star(id);
  no.answerAsk(false);
  assert.equal(no.state.box.length, box.length, "cancelling the star still spent the ordinary ones");
}
console.log("star ok — asks first, spends the lowest ordinary ones and never a keeper, once, only when finished");

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
    e.throwBall("poke-ball");
    until(e, (st) => !st.encounter || ["idle", "fled", "caught"].includes(st.encounter.phase),
      "the missed throw to resolve", 4000);
    assert.ok(e.state.encounter && e.state.encounter.phase === "idle",
      `an alpha that should never flee ended the throw ${e.state.encounter?.phase ?? "gone"}`);

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
    e.flee();
    until(e, (st) => !st.encounter, "the encounter to close", 4000);
  };

  // Certain at RIFT_SURE: the next step opens one, whatever the roll says.
  const { e } = boot({ ...SAVE, sinceTravel: RIFT_SURE - 1 });
  assert.ok(step(e, 0.5), "the rift test could not take a step");
  assert.deepEqual(e.state.rift, { areaId: e.state.areaId, left: RIFT_STEPS },
    "a certain rift did not open");
  assert.ok(e.state.cheers.some((c) => c.kind === "rift"), "a rift opened without a banner");
  assert.ok(e.riftHere() && e.events().some((ev) => ev.id === "rift"), "an open rift has no card or tint");
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
  assert.ok(!e.riftHere() && !e.events().some((ev) => ev.id === "rift"), "a closed rift kept its card");

  // Leaving the map closes it too, and starts the clock again.
  const t = boot({ ...SAVE, rift: { areaId: "meadow", left: 90 }, sinceTravel: 0 }).e;
  t.state.sinceTravel = 500;
  assert.ok(t.travel("woods"), "the rift test could not travel");
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
  const { AREAS, RAIL } = await import("../src/game/map.js");
  const { LEVEL_XP } = await import("../src/game/biomes.js");
  const { SURF_LEVEL } = await import("../src/game/items.js");
  const walk = (e, dir, frames = 40) => {
    const { x, y, } = e.state.player, area = e.state.areaId;
    e.press(dir);
    for (let i = 0; i < frames && !e.state.encounter; i++) tick(16);
    e.clearHeld();
    if (e.state.encounter) { until(e, (st) => st.encounter?.phase === "idle", "settle"); e.flee(); until(e, (st) => !st.encounter, "close", 4000); }
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

  const e = boot({ ...SAVE, areaId: "woods" }).e;
  const place = ([x, y]) => { e.state.player.x = x; e.state.player.y = y; };

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

  // Below the Mansion's level the door stays shut, and says why.
  const low = boot({ ...SAVE, areaId: "woods", xp: LEVEL_XP[5], paid: 6 }).e;
  low.state.player.x = dx; low.state.player.y = dy + 1;
  walk(low, "up");
  assert.equal(low.state.areaId, "woods", "a door opened onto a map the level has not reached");
  assert.ok(low.state.worn.some((w) => w.id === "door"), "a shut door said nothing");

  /* A BRIDGE IS WALKED OVER FROM A BANK AND SURFED UNDER FROM THE RIVER - the
     planks drew over a trainer standing on them. Found, not named: a plank
     with a high bank on one side and river on another. */
  const lift = AREAS.woods.lift;
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
  // River -> under the planks -> ashore on the bank -> back onto the planks.
  const b2 = boot(at2(bridge.river)).e;
  assert.ok(walk(b2, bridge.river[2]), "could not surf under the bridge");
  assert.ok(!b2.above(), "surfing under a bridge drew the trainer over its planks");
  assert.ok(walk(b2, back0[bridge.bank[2]]), "could not get ashore from under the bridge");
  assert.ok(b2.above(), "a trainer on a high bank is not above the upper layer");
  assert.ok(walk(b2, bridge.bank[2]), "could not walk from the bank onto the bridge");
  assert.ok(b2.above(), "walking onto a bridge put the trainer under its planks");
  // Still afloat under it: paddling on crosses to the river on the far side,
  // which a trainer set down on the planks on foot cannot do.
  const b3 = boot(at2(bridge.river)).e;
  walk(b3, bridge.river[2]);
  while (rows[b3.state.player.y][b3.state.player.x] === "N" && walk(b3, bridge.river[2]));
  assert.equal(rows[b3.state.player.y][b3.state.player.x], "w", "could not paddle under the bridge to the far side");
}
console.log("monsoon ok — rails need the bike, stepping off is always allowed, the door runs both ways, a shut door says so, bridges are walked over and surfed under");

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
