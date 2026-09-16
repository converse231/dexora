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
import { readFileSync } from "node:fs";

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
  console.log("field ok — counts down while walking; rarity and variant stack, repel is exclusive");
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
  assert.equal(e.state.dex.length, (await import("../src/data/species.js")).SPECIES.length,
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
  console.log(`pad ok — ${new Set(called).size} engine calls behind the touch controls all exist`);
}

console.log("play ok — the frame loop never stopped");
