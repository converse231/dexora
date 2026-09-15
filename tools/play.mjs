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
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
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

/* A BERRY MUST NOT BREAK THE THROW. Each of the three touches a different roll
   and any of them could throw inside the frame loop; the suite in check.mjs
   proves the arithmetic, and this proves the machine survives it. */
{
  for (const berry of ["razz-berry", "nanab-berry", "pinap-berry"]) {
    const { e } = boot(SAVE);
    assert.ok(walkToEncounter(e), `met nothing while testing ${berry}`);
    assert.equal(e.useBerry(berry), true, `${berry} refused to be fed`);
    assert.equal(e.state.encounter.berry?.id, berry, `${berry} did not land on the encounter`);
    assert.equal(e.state.encounter.berry.stage, 1, `${berry} landed at the wrong depth`);
    /* FEEDING THE SAME ONE AGAIN either deepens it or is refused outright, and
       which of the two is a fact about the berry - never "spent and ignored". */
    const cap = berryById(berry).stages;
    const again = e.useBerry(berry);
    if (cap > 1) {
      assert.equal(again, true, `a second ${berry} was refused below its cap`);
      assert.equal(e.state.encounter.berry.stage, 2, `a second ${berry} did not deepen it`);
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
  assert.equal(e.useField("honey"), true, "a honey refused to start");
  assert.equal(e.state.field.variant.id, "honey", "the honey did not land in its family slot");
  assert.equal(e.useField("honey-shiny"), true, "a shiny honey refused to start");
  assert.equal(e.state.field.variant.id, "honey-shiny",
    "a second honey did not REPLACE the first - two variant tilts can run at once");
  assert.equal(e.state.field.repel?.id, "repel", "starting a honey cleared the repel");
  console.log("field ok — counts down while walking, and one per family");
}

console.log("play ok — the frame loop never stopped");
