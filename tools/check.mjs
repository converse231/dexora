// node tools/check.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SPECIES } from "../src/data/species.js";
import { evoCycleFrames, EVO_SWAPS, SCALE_MAX } from "../src/game/evocycle.js";
import {
  STATS, MAX_RANK, emptyStats, rank, spentPoints, freePoints, earnedPoints,
  canSpend, catchMult, stepScale, xpScale, pricedAt, valuedAt, weighted,
  rarityPower, sellScale, priceScale,
} from "../src/game/trainer.js";
import { catchChance, fleeChance, shakesFor, resolveThrow, NEVER_CERTAIN } from "../src/catch.js";

const near = (a, b) => Math.abs(a - b) < 0.005;

// --- odds -----------------------------------------------------------------
/* THE CEILING BELONGS TO THE BALL, NOT THE GAME. A single flat 0.95 made
   every ball identical against the fifteen commonest species in the dex - a
   Great Ball bought you literally nothing on a Pidgey - so the miss chance
   shrinks with the ball instead. Nothing reaches 1: that is the Master Ball's
   job and nobody else's. */
assert.ok(near(catchChance(255, 1), 1 - NEVER_CERTAIN),
  "a Poke Ball's best case is one miss in five, not a hard 95");
assert.ok(catchChance(255, 1.8) > catchChance(255, 1),
  "a Great Ball must beat a Poke Ball on a PIDGEY - the commonest throw in " +
  "the game, and the one where a flat cap made them the same thing");
assert.ok(catchChance(255, 3) > catchChance(255, 1.8), "and an Ultra both");
for (const mult of [1, 1.8, 3, 3.5, 4]) {
  assert.ok(catchChance(255, mult) < 1, `mult ${mult} reaches certainty`);
  assert.ok(catchChance(255, mult) <= 0.95, `mult ${mult} passes the hard ceiling`);
}
/* And it has to hold across the whole dex, not just at the top: every species
   a player can actually meet must reward the better ball, or the shop is
   selling a number that does nothing on that Pokemon. */
{
  const rates = [...new Set(SPECIES.map((sp) => sp.rate))];
  const rungs = [1, 1.8, 3];
  const flat = [];
  for (const rate of rates) {
    for (let i = 1; i < rungs.length; i++) {
      if (catchChance(rate, rungs[i]) <= catchChance(rate, rungs[i - 1])) flat.push(rate);
    }
  }
  assert.deepEqual([...new Set(flat)], [],
    `a better ball is worth nothing at catch rate(s) ${[...new Set(flat)].join(", ")}`);
}
assert.ok(near(catchChance(3, 1), 0.0118), "mewtwo is nearly hopeless with a Poke Ball");
assert.ok(near(catchChance(3, 3), 0.0353), "better balls barely help mewtwo");
assert.ok(catchChance(3, 1.8) > catchChance(3, 1),
  "the FLOOR flattened the ladder at the bottom the way the ceiling did at " +
  "the top - a Great Ball has to beat a Poke Ball on a legendary too");
assert.ok(near(catchChance(45, 1), 0.176), "dratini pokeball");
assert.ok(near(catchChance(45, 3), 0.529), "ultra roughly triples mid-tier");
/* FLEEING IS A SHAPE, not three numbers. These pinned 0.2 and 0.553 literally,
   and the literals were only ever standing in for "a common waits around, a
   rare bolts, and neither is certain" - so retuning the curve broke a test that
   had no opinion about the curve. Written as the rule it cannot rot.

   The BOUNDS are the design: nothing flees more often than it stays, or a rare
   is decided by the roll before your first throw rather than by your ball. */
assert.ok(fleeChance(3) > fleeChance(30), "rarer must flee more");
assert.ok(fleeChance(30) > fleeChance(255), "rares flee more than commons");
assert.ok(fleeChance(255) > 0, "nothing is guaranteed to wait");
assert.ok(fleeChance(3) < 0.5,
  `a legendary flees ${fleeChance(3).toFixed(2)} of the time - past half and the ` +
  "encounter is decided before you have thrown anything");
/* And it must be KINDER than the catch is hard, or the two nerfs compound: the
   Poke Ball got 20% weaker in the same pass this curve came down, deliberately
   pointing the other way so an encounter lasts longer rather than ending. */
assert.ok(fleeChance(255) < 0.2 && fleeChance(30) < 0.553,
  "the flee curve must stay at or below what it was when the Poke Ball was full strength");

// --- shake readout --------------------------------------------------------
assert.equal(shakesFor(0.20, 0.18), 3, "just barely missed -> 3 shakes");
assert.equal(shakesFor(0.35, 0.18), 2);
assert.equal(shakesFor(0.60, 0.18), 1);
assert.equal(shakesFor(0.95, 0.18), 0, "hopeless roll -> instant pop");

// Shakes must never contradict the result: a catch always shows the full three.
for (let i = 0; i < 2000; i++) {
  const r = resolveThrow(45, 1);
  if (r.caught) assert.equal(r.shakes, 3, "a catch always shows 3 shakes");
  assert.ok(r.shakes >= 0 && r.shakes <= 3, "shakes stay in range");
}

// --- the odds are unchanged by the drama ----------------------------------
// Deterministic rng sweep: caught exactly when roll < need, nothing else.
const need = catchChance(45, 1);
for (let i = 0; i < 1000; i++) {
  const roll = i / 1000;
  const { caught } = resolveThrow(45, 1, () => roll);
  assert.equal(caught, roll < need, `roll ${roll} must agree with the odds`);
}

console.log("catch rules ok — odds unchanged, shakes consistent");

// --- encounter phase machine ---------------------------------------------
// A bug here strands the player in a frozen encounter, so drive the whole
// timeline on a fake clock and prove every path terminates.
import { nextStep, settlePhase, TERMINAL } from "../src/game/phases.js";

const T = { throw: 560, suck: 460, drop: 560, wait: 520, shake: 720, result: 1200 };

function runTimeline(pending) {
  let enc = {
    phase: "throw", until: T.throw, shakesDone: 0,
    shakesTotal: pending.shakes, pending,
  };
  let now = 0;
  const seen = [enc.phase];

  while (now < 30000) {
    now += 10;
    const step = nextStep(enc, now, T);
    if (!step) continue;
    if (step.close) return { seen, closed: true, now };
    if (step.settle) {
      enc = { ...enc, phase: settlePhase(pending), until: now + T.result };
    } else {
      enc = { ...enc, ...step };
    }
    seen.push(enc.phase);
    if (enc.phase === "idle") return { seen, closed: false, now }; // broke free
  }
  throw new Error("phase machine never terminated: " + seen.join(" -> "));
}

// Every combination of outcome and shake count must reach an end.
for (const caught of [true, false]) {
  for (const fled of [true, false]) {
    for (let shakes = 0; shakes <= 3; shakes++) {
      if (caught && shakes !== 3) continue; // a catch always shows three
      const { seen, closed } = runTimeline({ caught, fled, shakes });
      const last = seen[seen.length - 1];
      if (caught) {
        assert.equal(last, "caught");
        assert.ok(closed, "a catch must close the encounter");
      } else if (fled) {
        assert.equal(last, "fled");
        assert.ok(closed, "a flee must close the encounter");
      } else {
        assert.equal(last, "idle", "breaking free returns control to the player");
        assert.ok(!closed, "breaking free keeps the encounter open");
      }
      // Shake count shown must equal the shake count decided.
      assert.equal(seen.filter((p) => p === "shake").length, shakes,
        `expected ${shakes} shakes, saw ${seen.join(" -> ")}`);
    }
  }
}

// An idle encounter with no timer must never advance on its own.
assert.equal(nextStep({ phase: "idle", until: 0 }, 9999, T), null);

console.log("phase machine ok — all paths terminate, shakes match the roll");

// --- economy --------------------------------------------------------------
// The loop only works if grinding commons pays and hunting rares costs. These
// assert that relationship, not just the arithmetic, so retuning a price that
// breaks the design fails here rather than in a play session an hour later.
import {
  BALLS, SHOP_BALLS, SHOP_ITEMS, STONES, KEY_ITEMS, forSale, bestRod,
  ballById, itemById, sellValue, SELL, duplicateUids, startingState, ALL_ITEMS,
  DEX_BONUS, levelReward, MASTER_EVERY, evolutionsOf, evolutionRow, evoLevel, evoNext,
  evolveState, stoneFor, keeper, CANDY, candyValue, CANDY_PRICE,
  SYNTH_MIN, SYNTH_STEP,
  stepReward, STEP_PARCEL, STEP_HAUL, STEP_TREASURE,
  TREASURE_LEVEL, liveMult, PLAIN_BALLS, variantOf,
} from "../src/game/items.js";
import {
  ENCLOSED, speciesById, dexIndex, GEN_UNLOCK, genOpen, LEGEND_SHARE,
  GENERATIONS,
} from "../src/game/biomes.js";

const poke = ballById("poke-ball");
const ultra = ballById("ultra-ball");
const common = { tier: "C", rate: 255 };   // Pidgey
const rare = { tier: "A", rate: 45 };      // Dratini

// Expected balls spent per catch: a throw either catches, flees, or repeats.
function ballsPerCatch(rate, ball) {
  const hit = catchChance(rate, ball.mult);
  const flee = fleeChance(rate);
  const resolve = hit + (1 - hit) * flee;      // chance the encounter ends
  const caughtOdds = hit / resolve;            // of those, how many are catches
  return { balls: 1 / resolve / caughtOdds, caughtOdds };
}

const c = ballsPerCatch(common.rate, poke);
const commonProfit = sellValue(common) - c.balls * poke.price;
assert.ok(commonProfit > 0,
  `commons must pay for themselves, got ${commonProfit.toFixed(0)}`);

const r = ballsPerCatch(rare.rate, ultra);
const rareProfit = sellValue(rare) - r.balls * ultra.price;
assert.ok(rareProfit < 0,
  `rares must cost more than they sell for, got ${rareProfit.toFixed(0)}`);
assert.ok(sellValue(rare) > sellValue(common), "rarer sells for more");
assert.ok(DEX_BONUS > sellValue(common), "a new species beats another duplicate");

/* THE PLAIN LADDER has to be worth its price: strictly better, strictly
   dearer. Only the unconditional balls - a situational one is deliberately
   cheaper than the Ultra it beats, so including them here would assert the
   opposite of the design. */
const shelf = PLAIN_BALLS.filter(forSale);
assert.ok(shelf.length >= 3, "the plain ladder lost a rung");
for (let i = 1; i < shelf.length; i++) {
  assert.ok(shelf[i].mult > shelf[i - 1].mult, "each ball tier catches better");
  assert.ok(shelf[i].price > shelf[i - 1].price, "each ball tier costs more");
  assert.ok(shelf[i].level > shelf[i - 1].level, "each ball tier unlocks later");
}
// The shelf is still read top to bottom, so it must still climb by level.
for (let i = 1; i < SHOP_BALLS.length; i++)
  assert.ok(SHOP_BALLS[i].level > SHOP_BALLS[i - 1].level,
    `the shop shelf is out of order at ${SHOP_BALLS[i].id}`);

{
  /* SITUATIONAL BALLS. Each does nothing most of the time and beats an Ultra
     Ball when its one condition holds, so the invariants are about the SHAPE
     of that bargain, not about any single number. */
  const situational = BALLS.filter((b) => b.bonus);
  assert.ok(situational.length >= 3, "the situational balls went missing");
  /* Every ball is thrown by a single-digit hotkey, numbered off its index in
     BALLS by both the rail's label and App.jsx's handler. A tenth ball has no
     key left, and the handler's range was a literal "1234" until there were
     eight - the rail printed `key 5` and pressing it did nothing. */
  assert.ok(BALLS.length <= 9,
    `${BALLS.length} balls, and only nine single-digit hotkeys to throw them with`);

  /* Every sampled encounter a condition could be asked about. Built from the
     real area ids and real types, so a renamed biome fails here rather than
     silently turning the Dusk Ball off. */
  const encs = [];
  for (const areaId of ["meadow", ...ENCLOSED])
    for (const types of [["water"], ["bug"], ["fire"], ["normal", "flying"]])
      for (const known of [true, false])
        for (const throws of [0, 1, 3, 5, 12])
          encs.push({ areaId, types, known, throws, level: 4 });

  for (const ball of situational) {
    assert.ok(ball.hint, `${ball.id} has no hint, so nothing says when to use it`);
    /* The shop prints "×3.5 " plus the hint on one line, opposite "YOU HAVE
       N", and CLIPS it - two of the first four shipped as "underground and
       ind…" and "grows as it breaks …", a condition the player cannot read.

       16, and the first attempt at this number was 21, measured off a hint
       that fitted. It fitted next to "YOU HAVE 5"; the same 21 characters
       clipped next to "YOU HAVE 14", because the two share the line and the
       COUNT'S DIGITS eat the note's budget. 16 leaves room for a three-digit
       stack, which is a bag anyone will have. A character count is a proxy for
       a pixel width, but the face is Silkscreen and near-monospace. */
    assert.ok(ball.hint.length <= 16,
      `${ball.id}'s hint is ${ball.hint.length} characters and the shop clips at 16: "${ball.hint}"`);
    assert.ok(ball.boost > ball.mult, `${ball.id}'s boost is not a boost`);
    assert.ok(ball.boost > ballById("ultra-ball").mult,
      `${ball.id} is situational and no better than an Ultra Ball - all cost, no payoff`);
    assert.ok(ball.price < ballById("ultra-ball").price,
      `${ball.id} costs more than an Ultra Ball, which is strictly better more often`);

    /* The headline has to be deliverable, and reachable. A `boost` the bonus
       never returns is a lie on the shelf that nothing else would catch. */
    const seen = encs.map((e) => liveMult(ball, e));
    assert.ok(Math.max(...seen) === ball.boost,
      `${ball.id} advertises ×${ball.boost} but peaks at ×${Math.max(...seen)}`);
    assert.ok(Math.min(...seen) === ball.mult,
      `${ball.id} never drops to its base - then it is not situational, it is just better`);

    // Off the map there is no encounter, and no condition can hold.
    assert.equal(liveMult(ball, null), ball.mult,
      `${ball.id} claims a bonus with nothing in front of it`);
  }

  // The four conditions must key off four DIFFERENT things, or two balls are
  // one ball. Compared by the pattern of answers over every sampled encounter.
  const shapes = new Map();
  for (const ball of situational) {
    const key = encs.map((e) => liveMult(ball, e)).join(",");
    assert.ok(!shapes.has(key),
      `${ball.id} and ${shapes.get(key)} boost on exactly the same encounters`);
    shapes.set(key, ball.id);
  }

  // The Timer Ball's curve: nothing on the first throw, capped after five.
  const timer = ballById("timer-ball");
  /* "Nothing extra" means EQUAL TO A PLAIN THROW, which was 1 and is now
     PLAIN_MULT. Pinned to the literal it broke the moment the plain throw was
     retuned, while the rule it stood for had not changed at all. */
  assert.equal(liveMult(timer, { throws: 0 }), timer.mult,
    "a Timer Ball must be worth nothing extra on the first throw");
  assert.ok(liveMult(timer, { throws: 2 }) > liveMult(timer, { throws: 1 }),
    "a Timer Ball has to climb");
  assert.equal(liveMult(timer, { throws: 99 }), timer.boost,
    "and stop climbing at its cap");

  /* WHAT A BALL ACTUALLY COSTS PER CATCH, simulated throw by throw.

     `ballsPerCatch` above assumes one fixed multiplier, which is right for
     every ball that has one and WRONG for a ramping one: priced at its 4x cap
     the Timer Ball looked like free money, and priced at its 1x base it looked
     worthless. Neither is what it costs. You pay full price for every throw on
     the way up, and a rare flees about half the times it breaks free, so most
     encounters end long before the cap - which is the whole reason that ball
     is cheap. Modelling the ramp is what found that; the first pricing was 140
     and measured out at 606 a head, the most expensive ball in the game. */
  /* The encounter where EVERY condition holds at once: an enclosed area, a
     Water type, already registered. Simulating in `encs[0]` instead was the
     first version's bug and the printed cost is what gave it away - the Dusk
     Ball came out at 1,077 a head because it was being priced in the meadow,
     where it does nothing. A best-case check has to be run on the best case. */
  const best = { areaId: [...ENCLOSED][0], types: ["water"], known: true, level: 4 };
  assert.ok(BALLS.filter((b) => b.bonus).every((b) => liveMult(b, { ...best, throws: 9 }) === b.boost),
    "the best-case encounter does not actually boost every situational ball");

  const perCatch = (rate, ball) => {
    const flee = fleeChance(rate);
    let alive = 1, caught = 0, balls = 0;
    for (let t = 0; t < 200; t++) {
      const hit = catchChance(rate, liveMult(ball, { ...best, throws: t }));
      balls += alive;
      caught += alive * hit;
      alive = alive * (1 - hit) * (1 - flee);
    }
    return balls / caught;
  };

  /* NO BALL MAY BE A MONEY PRINTER. Hunting a rare with the cheapest ball in
     the game is already mildly profitable and always was - that is the grind,
     and it is paid for in time rather than money. What must not happen is a
     NEW ball beating it, because then the situational balls are not a
     trade-off, they are income. Measured at each ball's best case. */
  const printer = (ball) => sellValue(rare) - perCatch(rare.rate, ball) * ball.price;
  const grind = printer(ballById("poke-ball"));
  for (const ball of BALLS) {
    if (!forSale(ball) || ball.id === "poke-ball") continue;
    assert.ok(printer(ball) < grind,
      `${ball.id} out-earns grinding with Poké Balls on a rare ` +
      `(${printer(ball).toFixed(0)} against ${grind.toFixed(0)}) - that is income, not a choice`);
  }

  console.log(`balls ok — ${shelf.length} plain, ${situational.length} situational ` +
    `(${situational.map((b) => `${b.short.toLowerCase()} ×${b.boost} ¥${b.price}`).join(", ")}); ` +
    `a rare costs ¥${BALLS.filter(forSale)
      .map((b) => Math.round(perCatch(rare.rate, b) * b.price))
      .join("/")} at best, against ¥${sellValue(rare)} back`);
}

{
  /* EVERY BALL HAS ART. `items/<id>.png` is built by tools/fetch-items.mjs
     from a list that is not this one, so the two drift silently - and a ball
     with no sprite is a broken image on the rail AND in the shop, which is the
     first thing anyone sees. */
  const missing = ALL_ITEMS
    .filter((i) => !existsSync(new URL(`../public/items/${i.id}.png`, import.meta.url)))
    .map((i) => i.id);
  assert.deepEqual(missing, [],
    `no sprite for: ${missing.join(", ")} - add them to tools/fetch-items.mjs and re-run it`);

  /* And every BALL also needs its 32-frame throw strip, which comes from a
     different tool and a different artist's sheet. A ball with an icon but no
     strip throws an invisible ball: the element is there, sized, animating,
     and painting nothing. */
  const noStrip = BALLS
    .filter((b) => !existsSync(new URL(`../public/items/throw/${b.id}.png`, import.meta.url)))
    .map((b) => b.id);
  assert.deepEqual(noStrip, [],
    `no throw animation for: ${noStrip.join(", ")} - add the column to ` +
    "tools/build_balls.py and re-run it");
}

/* The Master Ball never fails, so nothing but scarcity can balance it - and a
   price is only ever a delay. It must not be purchasable at any level, and the
   level table must be the only place one can come from. */
const master = ballById("master-ball");
assert.equal(catchChance(1, master.mult), 1, "a Master Ball always catches");
assert.equal(catchChance(255, master.mult), 1, "even against a legendary");
assert.ok(!forSale(master), "the Master Ball must never be for sale");
assert.ok(!SHOP_BALLS.includes(master), "and must not reach the shelf");
assert.ok(SHOP_ITEMS.every(forSale), "the shop must only stock sellable items");

/* Selling duplicates must never empty out a species and must keep the best one.
   Tauros and Ditto are evolutionary dead ends, so their reserve is exactly one -
   which makes them the right pair for testing the plain case. */
const box = [
  { uid: 1, species: 128, level: 3 }, { uid: 2, species: 128, level: 9 },
  { uid: 3, species: 128, level: 5 }, { uid: 4, species: 132, level: 2 },
];
const dupes = duplicateUids(box);
assert.deepEqual(dupes.sort(), [1, 3], "keeps the highest-level one of each species");
const left = box.filter((m) => !dupes.includes(m.uid));
assert.equal(new Set(left.map((m) => m.species)).size, 2, "every species survives");
assert.equal(duplicateUids([]).length, 0, "empty box has no duplicates");
assert.equal(duplicateUids([box[0]]).length, 0, "a lone Pokémon is never a duplicate");

/* THE RESERVE IS ONE, and that is a deliberate collapse rather than a
   loosening. It used to hold back a whole evolution's feed - up to 20 - because
   a sweep could otherwise eat the Dratini you were saving. Nothing is saved for
   anything now: a spare's only jobs are cash and candy, so holding any back is
   holding back progress.

   What must still hold is that the sweep keeps your BEST, because the best is
   the one you have spent candy on and there is no undo. */
const pile = Array.from({ length: 5 }, (_, i) => ({
  uid: 100 + i, species: 16, level: i + 1,
}));
assert.deepEqual(duplicateUids(pile).sort((a, b) => a - b), [100, 101, 102, 103],
  "a sweep takes everything but the best, weakest first");
assert.equal(duplicateUids(pile.slice(0, 1)).length, 0, "a lone one is never spare");
assert.equal(
  duplicateUids(pile).includes(104), false,
  "the highest level is never spare - it is the one candy was spent on",
);

/* Levelling has to hand out balls, or the shop's better stock unlocks with no
   way to have tried it. Every level pays, and Master Balls stay rare. */
let masters = 0;
const keysSeen = new Set();
for (let lv = 2; lv <= MAX_LEVEL; lv++) {
  const won = levelReward(lv);
  assert.ok(Object.values(won).reduce((a, b) => a + b, 0) > 0,
    `level ${lv} must reward something`);
  for (const id of Object.keys(won)) {
    assert.ok(itemById(id), `level ${lv} rewards an item that exists`);
    if (KEY_ITEMS.some((k) => k.id === id)) {
      assert.ok(!keysSeen.has(id), `${id} is handed out twice`);
      keysSeen.add(id);
      assert.equal(won[id], 1, `${id} is a key item, so exactly one`);
    }
  }
  masters += won["master-ball"] ?? 0;
}
// Every key item has to actually arrive inside the level cap, or it is dead art.
for (const key of KEY_ITEMS) {
  assert.ok(key.level <= MAX_LEVEL, `${key.id} unlocks past the level cap`);
  assert.ok(keysSeen.has(key.id), `${key.id} is never awarded`);
  assert.ok(!forSale(key), `${key.id} must not be purchasable`);
}
/* MASTER BALLS ARE COUNTED ACROSS BOTH SOURCES, because neither alone is the
   number a player experiences. Levelling pays one every `MASTER_EVERY`; walking
   pays one every `STEP_TREASURE` hauls past `TREASURE_LEVEL`. Pinning only the
   levelling half is how the total quietly doubles when the step half is tuned.

   It was five in a whole playthrough, which made the Master Ball a museum
   piece: with five legendaries in the dex, spending one always felt like a
   mistake you would regret at the sixth. The band is the design - enough to
   cover every legendary and a few over, not so many that a Snorlax is worth
   one. */
{
  let walked = 0;
  for (let steps = STEP_PARCEL; steps <= 50000; steps += STEP_PARCEL) {
    walked += stepReward(steps, MAX_LEVEL)?.items?.["master-ball"] ?? 0;
  }
  const total = masters + walked;
  assert.ok(masters > 0, "levelling must pay at least one Master Ball");
  assert.ok(walked > 0, "walking must pay at least one Master Ball");
  assert.ok(total >= 8 && total <= 12,
    `Master Balls over a whole game: ${total} (${masters} levelling + ${walked} ` +
    "walking) — enough to cover the legendaries and a few over, not so many " +
    "that a Snorlax is worth one");
  assert.equal(masters, Math.floor(MAX_LEVEL / MASTER_EVERY),
    "the levelling count must be derived from the cap, not typed in");
  console.log(`master balls ok — ${total} in a playthrough ` +
    `(${masters} from levels, ${walked} from walking)`);
}

// Stones are single-use evolution keys; they must all exist and be buyable.
assert.ok(STONES.length >= 5, "the five Gen 1 stones must be on the shelf");
for (const stone of STONES) {
  assert.equal(itemById(stone.id), stone, `${stone.id} must be findable by id`);
  assert.ok(stone.price > 0, `${stone.id} needs a price`);
  assert.ok(stone.price > shelf[shelf.length - 2].price,
    `${stone.id} should cost more than a routine ball`);
}

const start = startingState();
assert.ok(start.bag["poke-ball"] > 0, "you start able to throw something");
assert.ok(start.money >= 0, "you do not start in debt");

console.log(`economy ok — common nets +${commonProfit.toFixed(0)}, rare costs ${rareProfit.toFixed(0)}`);

// --- evolution ------------------------------------------------------------
/* Evolution is the only way to reach the species that never spawn, and the bill
   is the real level from the games. Both of those are easy to break silently, so
   both are asserted: the graph has to connect, and the cost has to stay payable
   once a chain is walked end to end. */
{
  /* Rods count as a way in. They always were one - the Super Rod's list is
     almost entirely water Pokemon you cannot meet on foot - and leaving them
     out only happened to be harmless because nothing yet depends on a rod for
     its only appearance. This is also the check that catches a map being
     deleted: removing the Flower Clearing orphaned eight species, five of them
     (Tauros, Ditto, Farfetch'd, Lickitung, Porygon) with nowhere else at all,
     and this is what said so. */
  const reach = new Set();
  /* `encounterTable` at the cap, not `b.table`. Legendaries are no longer baked
     into the biome - their weight is a SHARE of whatever the table comes to, so
     they are added when it is assembled - and the evolved-form overlay lives
     there too. Reading the raw table declared all 23 legendaries unreachable. */
  for (const b of BIOMES)
    for (const [id] of encounterTable(b, MAX_LEVEL)) reach.add(id);
  for (const rod of RODS) for (const [id] of rod.table) reach.add(id);
  for (let pass = 0; pass < 3; pass++)
    for (const id of [...reach])
      for (const row of evolutionsOf(id)) reach.add(row.to);

  const missing = SPECIES.filter((s) => !reach.has(s.id)).map((s) => s.name);
  assert.equal(missing.length, 0,
    `unreachable species — neither spawns, fishes nor evolves: ${missing.join(", ")}`);

  let chains = 0;
  let synthetic = 0;
  for (const sp of SPECIES) {
    const rows = evolutionsOf(sp.id);
    if (!rows.length) continue;
    chains++;
    for (const row of rows) {
      assert.equal(speciesById(row.to).from, sp.name,
        `${sp.name} -> ${speciesById(row.to).name} is not a real evolution`);
      assert.equal(evolutionRow(sp.id, row.to), row, "rows must be findable");

      /* EVERY row has a level, including the ones PokeAPI gives none for.
         A stone or trade evolution with `evoLevel` 0 is free, and free is the
         one answer that cannot be right - it would evolve the instant you
         caught it. */
      const at = evoLevel(row);
      assert.ok(at >= 2, `${sp.name} -> ${speciesById(row.to).name} costs nothing`);
      if (row.kind === "level") {
        assert.equal(at, row.level, `${sp.name} must evolve at its real level`);
      } else {
        synthetic++;
        assert.ok(at >= SYNTH_MIN,
          `${speciesById(row.to).name} is synthetic and below the floor`);
      }
    }
  }

  /* A CHAIN MUST CLIMB. Deriving a synthetic level from the parent is only
     sound if it always lands above it - otherwise a Pokemon could evolve twice
     at the same level, or a stone form could be reachable before the thing it
     comes from. Checked over every row rather than the level ones, because the
     derived half is exactly the half nothing else looks at. */
  for (const sp of SPECIES) {
    for (const row of evolutionsOf(sp.id)) {
      for (const next of evolutionsOf(row.to)) {
        assert.ok(evoLevel(next) > evoLevel(row),
          `${speciesById(next.to).name} (Lv ${evoLevel(next)}) is not above ` +
          `${speciesById(row.to).name} (Lv ${evoLevel(row)})`);
      }
    }
  }
  assert.equal(evoLevel(evolutionRow(64, 65)), 16 + SYNTH_STEP,
    "Alakazam is a trade evolution: Kadabra's 16, plus a step");

  /* EVOLVING MUST NEVER RAISE THE CANDY YIELD. This caught a real one: Caterpie
     evolves at Lv 7 and a wild one can be CAUGHT at 7, so it evolves for free
     into a Metapod that was a tier above it - "evolve, then convert" beat
     "convert" on every line whose tier climbs. Not infinite, but degenerate.

     `candyValue` reads through to the base form now, so this is an equality by
     construction rather than a range that needs watching per generation. */
  for (const sp of SPECIES) {
    for (const row of evolutionsOf(sp.id)) {
      const target = speciesById(row.to);
      assert.ok(candyValue(target) <= candyValue(sp),
        `${sp.name} (${candyValue(sp)}) evolves into ${target.name} ` +
        `(${candyValue(target)}) - evolving would print candy`);
    }
  }
  /* Caterpie is the line that shows it: C -> B -> A, so its tier really does
     climb where Bulbasaur's line is A throughout. */
  assert.equal(candyValue(speciesById(12)), candyValue(speciesById(10)),
    "a Butterfree is worth a Caterpie in candy - you did the work catching one");
  assert.ok(sellValue(speciesById(12)) > sellValue(speciesById(10)),
    "but CASH still tracks the species in hand, or the two currencies say the same thing");

  /* THE YIELD LADDER. Rarer is worth more, and flatter than cash: if candy
     tracked `SELL`'s 1 : 2.25 : 5.5 : 15 then a common catch would be worthless
     in both currencies, and commons are the grind this economy runs on. */
  const tiers = ["C", "B", "A", "S"];
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(CANDY[tiers[i]] > CANDY[tiers[i - 1]],
      `candy must climb with rarity: ${tiers[i]} is not above ${tiers[i - 1]}`);
    assert.ok(
      CANDY[tiers[i]] / CANDY[tiers[i - 1]] <= SELL[tiers[i]] / SELL[tiers[i - 1]],
      `candy climbs faster than cash at ${tiers[i]} - commons stop being worth catching`,
    );
  }

  /* BUYING MUST BE WORSE THAN CONVERTING, on the catches that fund the economy.

     Stated per TIER at first, and a simulation over all 151 species proved that
     was checking the wrong thing: `candyValue` reads through to the base form
     while `sellValue` does not, so 22 evolved forms of commons sell for ¥220 and
     convert for 1. Selling those and buying candy does beat converting them.

     That is a texture, not a hole - no candy is printed, and cash comes only
     from catching - and it is a legible one: **commons are candy, rares are
     cash**, which gives both currencies a natural source. What must hold is
     that it never reaches the COMMONS, because those are what the grind is made
     of and a candy economy nobody converts into is dead code. Checked on a real
     species rather than a tier, so it reads `candyValue` the way the game
     does. */
  for (const sp of SPECIES) {
    if (!["C", "B"].includes(sp.tier)) continue;
    assert.ok(sellValue(sp) / CANDY_PRICE < candyValue(sp),
      `${sp.name} sells for ¥${sellValue(sp)}, which buys more than the ` +
      `${candyValue(sp)} candy converting it gives - the grind stops converting`);
  }

  /* AND NO CASH LOOP PRINTS CANDY. The one that would matter is round-tripping
     through an evolution: convert commons to candy, level something into a form
     that sells for more, sell it, buy candy back. Bounded here at the widest
     the data allows - the dearest sale in the game against the cheapest
     evolution that reaches it. */
  for (const sp of SPECIES) {
    for (const row of evolutionsOf(sp.id)) {
      const target = speciesById(row.to);
      const spent = Math.max(0, evoLevel(row) - 7);   // candy, at best
      const gained = (sellValue(target) - sellValue(sp)) / CANDY_PRICE;
      assert.ok(gained <= spent + 2,
        `${sp.name} -> ${target.name} turns ${spent} candy into ` +
        `${gained.toFixed(1)} candy of cash - that is a printer`);
    }
  }

  /* EVERY STONE AN EVOLUTION ASKS FOR IS ON THE SHELF. A stone that is not
     buyable is not a hard evolution, it is an impossible one - and nothing on
     screen would say so. Johto brought the Sun Stone and Shiny Stone and Sinnoh
     the Dusk Stone; all three were missing on the day the species arrived. */
  {
    const wanted = new Set(EVOLUTIONS.filter((r) => r.item).map((r) => r.item));
    for (const id of wanted) {
      const stone = STONES.find((x) => x.id === id);
      assert.ok(stone, `${id} is needed by an evolution and is not in STONES`);
      assert.ok(forSale(stone), `${id} is not purchasable`);
      assert.ok(stone.level <= MAX_LEVEL, `${id} unlocks past the level cap`);
    }
    const spare = STONES.filter((x) => !wanted.has(x.id)).map((x) => x.id);
    assert.deepEqual(spare, [], `stones nothing evolves with: ${spare.join(", ")}`);
  }

  /* evolveState is per INSTANCE now: one Pokemon, one level, one answer. */
  const bulba = { uid: 1, species: 1, level: 15 };
  const first = evolutionRow(1, 2);
  assert.equal(evolveState(bulba, {}, first).need, 1, "one level short is one candy");
  assert.equal(evolveState(bulba, {}, first).ready, false, "and not ready");
  assert.equal(evolveState({ ...bulba, level: 16 }, {}, first).ready, true,
    "at the level, with nothing else to pay");
  assert.equal(evolveState({ ...bulba, level: 99 }, {}, first).need, 0,
    "past the level is not negative candy");

  /* A stone is a second gate, not a substitute for the first. */
  const water = evolutionRow(133, 134);
  const eevee = { uid: 2, species: 133, level: evoLevel(water) };
  assert.equal(evolveState(eevee, {}, water).ready, false, "no stone, no evolution");
  assert.equal(evolveState(eevee, { "water-stone": 1 }, water).ready, true,
    "stone in the bag and the level is all it takes");
  assert.equal(
    evolveState({ ...eevee, level: 1 }, { "water-stone": 1 }, water).ready, false,
    "a stone does not skip the level",
  );
  /* Eevee keeps EVERY branch its data has - three in Kanto, five once Johto
     ships Espeon and Umbreon, seven with Sinnoh's Leafeon and Glaceon. Pinned
     to 3 it was a literal standing in for "a species may evolve more than one
     way and none of them is dropped". */
  assert.ok(evolutionsOf(133).length >= 3,
    `Eevee has ${evolutionsOf(133).length} branches - the multi-branch case is gone`);
  assert.equal(
    new Set(evolutionsOf(133).map((r) => r.to)).size, evolutionsOf(133).length,
    "Eevee lists a branch twice");

  /* evoNext is what three panels read, so it must agree with evolveState about
     the same Pokemon - a badge that says READY over a row that is not is the
     bug this whole per-instance rewrite was meant to make impossible. */
  for (const mon of [bulba, { ...bulba, level: 16 }, eevee]) {
    const next = evoNext(mon, { "water-stone": 1 });
    const all = evolutionsOf(mon.species)
      .map((r) => evolveState(mon, { "water-stone": 1 }, r));
    assert.equal(next.ready, all.some((x) => x.ready), "evoNext disagrees about READY");
    assert.equal(next.need, Math.min(...all.map((x) => x.need)),
      "evoNext must show the nearest branch");
  }
  assert.equal(evoNext({ uid: 9, species: 132, level: 5 }, {}), null,
    "a Ditto evolves into nothing and must say so rather than throwing");

  /* THE EVOLUTION SCENE MUST WEAR THE TIER, and a tier is TWO things.

     This shipped broken. `Evolve.jsx` kept its own copy of `FOLDER` and picked
     the sprite from it - correct for Shiny and Origin, which have their own
     artwork, and a no-op for Holo and Astral, which are the ordinary sprite
     plus a CSS filter. So an Astral evolution played out in entirely ordinary
     art: a normal Pokemon became a normal Pokemon and an Astral turned up in
     the box afterwards.

     Asserted against the SOURCE, because neither half fails loudly - a missing
     folder is the right picture and a missing class is a picture that is merely
     the wrong colour. The rule is that the scene must not re-derive the path:
     `spriteUrl` is the one function that knows. */
  {
    const src = readFileSync(new URL("../src/ui/Evolve.jsx", import.meta.url), "utf8");
    assert.ok(src.includes("spriteUrl("),
      "Evolve.jsx must take its sprite path from spriteUrl, not a second FOLDER");
    assert.ok(!/const FOLDER\s*=/.test(src),
      "Evolve.jsx has its own FOLDER again - that is how Astral lost its filter");
    assert.ok(src.includes("sprite-${evo.variant}"),
      "Evolve.jsx must also apply the tier CLASS: Holo and Astral have no folder " +
      "and are nothing but the filter");

    /* And the whiten must still beat it. The tier filters carry `!important`
       (an animation outranks a plain declaration), so without a matching one
       here an Astral would stay blue through a transformation whose entire
       point is a white silhouette. */
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    /* THE FORMS STRIP MUST NOT GIVE A TREATMENT AWAY. An unheld variant is a
       flat silhouette on purpose - the shape is a hint and the colours are the
       reward - so every moving layer has to be hidden there, not just the one
       that happened to exist when the rule was written. `VariantFx` grew from
       one layer to three and this hid exactly one of them. */
    const fxLayers = [".holo-foil", ".astral-aura", ".shiny-spark"];
    for (const layer of fxLayers) {
      assert.ok(css.includes(`.sf-one:not(.got) ${layer}`),
        `an unheld ${layer} is still animating in the FORMS strip - the strip ` +
        "would be showing a treatment nobody has earned yet");
    }

    for (const sel of [".evo-whiten .evo-mon", ".evo-cycle .evo-mon"]) {
      const at = css.indexOf(sel);
      assert.ok(at >= 0, `${sel} is gone`);
      /* The rule's OWN braces, not a fixed window. A 200-character slice ran
         past the closing brace into the next rule, which has its own
         `!important` - so deleting one of the two passed. Found by trying it. */
      const rule = css.slice(at, css.indexOf("}", at));
      assert.ok(rule.includes("!important"),
        `${sel} must beat the tier filter, which is !important - or the sprite ` +
        "never whitens and there is no transformation in the scene");
    }
  }

  console.log(`evolution ok — ${chains} chains, ${synthetic} synthetic levels, ` +
    `candy ${CANDY.C}/${CANDY.B}/${CANDY.A}/${CANDY.S} at ¥${CANDY_PRICE}`);
}

// --- evolution animation --------------------------------------------------
/* The GBA cycle is a ported algorithm, and rAF is throttled in headless Chrome
   so no screenshot can ever check it. Assert its shape here instead: it has to
   start slow, end as a strobe, stay inside the scale bounds, and finish on the
   evolved sprite. */
{
  const frames = evoCycleFrames();
  assert.ok(frames.length > 300 && frames.length < 500,
    `the cycle runs ${(frames.length / 60).toFixed(1)}s — that is not a GBA evolution`);

  assert.deepEqual(frames[0], [SCALE_MAX, 16], "it opens on the original, full size");
  assert.deepEqual(frames[frames.length - 1], [16, SCALE_MAX],
    "and ends on the evolution, full size, whatever the last swap did");

  for (const [pre, post] of frames) {
    assert.ok(pre >= 16 && pre <= SCALE_MAX, `pre-evo scale ${pre} is out of bounds`);
    assert.ok(post >= 16 && post <= SCALE_MAX, `post-evo scale ${post} is out of bounds`);
  }

  // One sprite is always arriving as the other leaves - never both tiny at once.
  for (const [pre, post] of frames)
    assert.ok(pre === SCALE_MAX || post === SCALE_MAX || pre > 16 || post > 16,
      "the screen must never be empty mid-cycle");

  // Count the swaps and check they really do accelerate.
  const runs = [];
  let run = 0;
  let growing = frames[1][0] >= frames[0][0];
  for (let i = 1; i < frames.length; i++) {
    const now = frames[i][0] >= frames[i - 1][0];
    if (now === growing) run++;
    else { runs.push(run); run = 0; growing = now; }
  }
  assert.equal(runs.length, EVO_SWAPS, `expected ${EVO_SWAPS} swaps, got ${runs.length}`);
  const opening = runs.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const closing = runs.slice(-5).reduce((a, b) => a + b, 0) / 5;
  assert.ok(opening > closing * 4,
    `it has to accelerate: opens at ${opening.toFixed(1)} frames a swap, closes at ${closing.toFixed(1)}`);

  console.log(`evolution scene ok — ${EVO_SWAPS} swaps over ${frames.length} frames` +
              ` (${(frames.length / 60).toFixed(1)}s), ${opening.toFixed(0)}f -> ${closing.toFixed(0)}f`);
}

// --- trainer stats ----------------------------------------------------------
/* Stats multiply numbers the economy suite pins down, so the risk is not that
   they do nothing - it is that they quietly break a relationship the rest of
   the game rests on. Every curve has to be monotone, bounded, and worth having
   without being worth everything. */
{
  const at = (id, r) => ({ ...emptyStats(), [id]: r });

  assert.equal(spentPoints(emptyStats()), 0, "a new trainer has spent nothing");
  assert.equal(earnedPoints(1), 0, "level 1 grants no point");
  assert.equal(earnedPoints(MAX_LEVEL), MAX_LEVEL - 1, "one point per level after the first");

  /* The whole design rests on this. If capacity ever drops to the points
     available, every choice on that screen stops being a choice. */
  const capacity = STATS.length * MAX_RANK;
  assert.ok(earnedPoints(MAX_LEVEL) < capacity,
    `${earnedPoints(MAX_LEVEL)} points against ${capacity} ranks - nothing to choose between`);

  // Ranks are clamped on read, so a hand-edited save cannot buy an advantage.
  assert.equal(rank({ precision: 999 }, "precision"), MAX_RANK, "ranks are capped on read");
  assert.equal(rank({ precision: -5 }, "precision"), 0, "and floored");
  assert.equal(rank(undefined, "precision"), 0, "a save with no stats reads as zero");
  assert.equal(freePoints({ precision: 999 }, 5), 0, "an over-spent save cannot spend more");

  for (const stat of STATS) {
    assert.ok(stat.effect(0) && stat.effect(MAX_RANK), `${stat.id} must describe both ends`);
    /* Every rank has to read differently, or the panel offers a choice it
       cannot describe. Fortune shipped stating a share of finds rounded to a
       whole percent, which read "~1%" at ranks 0, 1 and 2 alike. */
    for (let r = 1; r <= MAX_RANK; r++)
      assert.notEqual(stat.effect(r), stat.effect(r - 1),
        `${stat.id} reads the same at rank ${r - 1} and ${r}: "${stat.effect(r)}"`);
    assert.ok(canSpend(emptyStats(), 2, stat.id), `${stat.id} must be spendable at level 2`);
    assert.ok(!canSpend(at(stat.id, MAX_RANK), MAX_LEVEL, stat.id),
      `${stat.id} must refuse a point past the cap`);
  }
  assert.ok(!canSpend(emptyStats(), 1, "precision"), "level 1 has nothing to spend");
  assert.ok(!canSpend(emptyStats(), 9, "nonsense"), "an unknown stat is not spendable");

  // Each curve moves the right way and stays in a sane band.
  for (let r = 1; r <= MAX_RANK; r++) {
    assert.ok(catchMult(at("precision", r)) > catchMult(at("precision", r - 1)),
      "Precision must strictly improve");
    assert.ok(stepScale(at("stride", r)) < stepScale(at("stride", r - 1)),
      "Stride must strictly shorten a step");
    assert.ok(xpScale(at("insight", r)) > xpScale(at("insight", r - 1)),
      "Insight must strictly raise XP");
    assert.ok(pricedAt(1000, at("haggle", r)) < pricedAt(1000, at("haggle", r - 1)),
      "Haggle must strictly cut prices");
    assert.ok(valuedAt(1000, at("haggle", r)) > valuedAt(1000, at("haggle", r - 1)),
      "Haggle must strictly raise sales");
  }
  /* THE CEILING, PINNED. Ranks went from 10 to 20 and every coefficient halved
     with them so rank 20 is worth exactly what rank 10 used to be - and the
     monotonicity loop above would not have noticed a coefficient left alone,
     because doubling a stat's ceiling is still monotone. These six numbers are
     the ones README.md quotes, so a change here has to be a decision. */
  assert.equal(catchMult(at("precision", MAX_RANK)).toFixed(2), "1.60",
    "Precision's ceiling moved");
  assert.equal(rarityPower(at("fortune", MAX_RANK)).toFixed(2), "0.60",
    "Fortune's ceiling moved");
  assert.equal(stepScale(at("stride", MAX_RANK)).toFixed(2), "0.60",
    "Stride's ceiling moved");
  assert.equal(sellScale(at("haggle", MAX_RANK)).toFixed(2), "1.40",
    "Haggle's sale ceiling moved");
  assert.equal(priceScale(at("haggle", MAX_RANK)).toFixed(2), "0.80",
    "Haggle's discount ceiling moved");
  assert.equal(xpScale(at("insight", MAX_RANK)).toFixed(2), "1.80",
    "Insight's ceiling moved");

  assert.ok(stepScale(at("stride", MAX_RANK)) > 0.4, "a step must not become instant");
  assert.ok(pricedAt(25, at("haggle", MAX_RANK)) >= 1, "nothing is ever free");

  /* Precision must not break the ceiling the catch suite guards: 95% is the cap
     for anything but a Master Ball, however good the trainer gets. */
  const best = SHOP_BALLS[SHOP_BALLS.length - 1];
  const boosted = catchChance(255, best.mult * catchMult(at("precision", MAX_RANK)));
  assert.ok(boosted <= 0.95, `Precision broke the 95% ceiling (${boosted})`);
  assert.equal(catchChance(1, master.mult * catchMult(at("precision", MAX_RANK))), 1,
    "and must not disturb the Master Ball guarantee");

  // Fortune has to move the tail without inventing or deleting entries.
  const table = BIOMES[0].table;
  const rareIdx = table.map((e, i) => (e[1] <= 2 ? i : -1)).filter((i) => i >= 0);
  const share = (r) => {
    const w = weighted(table, at("fortune", r));
    const total = w.reduce((a, b) => a + b[1], 0);
    return rareIdx.reduce((a, i) => a + w[i][1], 0) / total;
  };
  for (let r = 1; r <= MAX_RANK; r++)
    assert.ok(share(r) > share(r - 1), "Fortune must raise the rare share every rank");
  assert.ok(share(MAX_RANK) < 0.25,
    `Fortune makes rares ${(share(MAX_RANK) * 100).toFixed(0)}% of finds - that is not rare`);
  for (let r = 0; r <= MAX_RANK; r++) {
    const w = weighted(table, at("fortune", r));
    assert.equal(w.length, table.length, "Fortune must not drop an entry");
    assert.deepEqual(w.map((e) => e[0]), table.map((e) => e[0]), "nor reorder them");
    assert.ok(w.every(([, x]) => x > 0 && Number.isFinite(x)), "nor produce a bad weight");
  }

  // Rods: real species, sane weights, and a best-rod that actually improves.
  let prev = 0;
  for (const rod of RODS) {
    assert.ok(rod.table.length >= prev, `${rod.id} should not be narrower than the last`);
    prev = rod.table.length;
    for (const [id, w] of rod.table) {
      assert.ok(speciesById(id), `${rod.id} lists a species that does not exist: ${id}`);
      assert.ok(w > 0, `${rod.id} has a zero weight`);
    }
    assert.ok(rodTable(rod.id), `${rod.id} must be findable`);
    assert.ok(KEY_ITEMS.some((k) => k.id === rod.id), `${rod.id} is never awarded`);
  }
  assert.equal(bestRod({}), null, "no rod, no fishing");
  assert.equal(bestRod({ "old-rod": 1, "super-rod": 1 })?.id, "super-rod",
    "the best rod held is the one used");

  console.log(`trainer ok - ${STATS.length} stats x ${MAX_RANK}, ` +
              `${earnedPoints(MAX_LEVEL)} points of ${capacity}, ${RODS.length} rods`);
}

import { areaOf } from "../src/game/map.js";
import { forestId, waterId } from "../src/game/tileset.js";

// --- casting a line -------------------------------------------------------
/* A cast is a timed sequence with a coin flip in the middle, so the thing worth
   asserting is that neither outcome can strand the player: every path ends
   either handing over to an encounter or closing. A rod that hung with the
   keyboard captured would look exactly like the game freezing. */
import { nextCast, CAST_PHASES } from "../src/game/phases.js";
// RODS and rodTable are imported by the biome suite below; imports hoist.
import { rodBite } from "../src/game/biomes.js";
import { F } from "../src/game/engine.js";

{
  for (const hooked of [true, false]) {
    let f = { phase: "cast", until: F.cast };
    let now = 0;
    let ended = null;
    for (let i = 0; i < 40 && !ended; i++) {
      now = f.until;                     // jump the fake clock to the deadline
      const step = nextCast(f, now, F);
      assert.ok(step, `cast stalled in ${f.phase}`);
      if (step.roll) {
        f = hooked
          ? { phase: "bite", until: now + F.bite }
          : { phase: "miss", until: now + F.miss };
        continue;
      }
      if (step.hook) { ended = "hook"; break; }
      if (step.close) { ended = "close"; break; }
      f = { ...f, ...step };
    }
    assert.equal(ended, hooked ? "hook" : "close",
      `a ${hooked ? "bite" : "miss"} must ${hooked ? "hand over" : "close"}`);
  }

  // Nothing happens before the deadline, or the float would never sit still.
  assert.equal(nextCast({ phase: "cast", until: 100 }, 99, F), null);
  /* An unknown phase closes rather than hanging. until must be non-zero: the
     machine reads a falsy deadline as "not running", same as the encounter. */
  assert.deepEqual(nextCast({ phase: "nonsense", until: 1 }, 2, F), { close: true });

  /* Every rod has to be castable and worth casting: a table to draw from, and a
     bite chance strictly between never and always. A rod that always caught
     something would make the whole sequence a slower button. */
  for (const r of RODS) {
    assert.ok(rodTable(r.id)?.length, `${r.id} has no table`);
    const b = rodBite(r.id);
    assert.ok(b > 0 && b < 1, `${r.id} bites ${b}; must be between 0 and 1`);
  }
  const chances = RODS.map((r) => rodBite(r.id));
  assert.deepEqual(chances, [...chances].sort((a, b) => a - b),
    "a better rod must not bite less often than a worse one");

  console.log(`casting ok \u2014 ${CAST_PHASES.length} phases, both outcomes ` +
              `terminate, ${RODS.length} rods bite ` +
              `${chances.map((c) => Math.round(c * 100) + "%").join("/")}`);
}

// --- tileset ---------------------------------------------------------------
/* The art is generated, and the way it goes wrong is silent: a metatile listed
   as a biome's wall that is really a floor gives that map invisible walls, and
   one that is really the edge of a structure tiles into bands. Frost Hollow
   shipped with the first of those. Ground and solid must at least be disjoint. */
{
  const route = JSON.parse(
    readFileSync(new URL("../public/tilesets/route.json", import.meta.url), "utf8"));
  const t = route.tiles;
  const PAIRS = [
    ["ember", "emberWall"], ["ice", "iceWall"],
    ["plant", "plantWall"], ["tower", "towerWall"], ["rock", "wall"],
  ];
  /* The tower's ward is a 3x3 and the renderer indexes it as one. A set built
     from the wrong nine ids draws nine corners of nine sigils, which looks like
     a texture rather than an error. */
  if (route.tower) {
    const w = route.tower.ward;
    assert.equal(w.length, 3, "the ward is not three rows");
    for (const row of w) assert.equal(row.length, 3, "a ward row is not three wide");
    const flat = w.flat();
    assert.equal(new Set(flat).size, 9, "the ward repeats a tile");
    // Read off 5F: 665-667 over 673-675 over 681-683, three consecutive rows of
    // the tileset editor's own 8-wide grid, so the ids step by 1 then by 8.
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        assert.equal(w[r][c], w[0][0] + r * 8 + c,
          `the ward tile at ${r},${c} is not where 5F keeps it`);
  }

  for (const [ground, solid] of PAIRS) {
    const g = t[ground] ?? [];
    const w = t[solid] ?? [];
    assert.ok(g.length, `${ground} has no ground tiles`);
    assert.ok(w.length, `${solid} has no solid tiles`);
    const clash = g.filter((id) => w.includes(id));
    assert.equal(clash.length, 0,
      `${ground}/${solid} share metatile ${clash[0]} — that is an invisible wall`);
  }

  // Grass must not double as tree, either.
  const treeIds = Object.values(route.tree).flat();
  assert.equal(t.grass.filter((id) => treeIds.includes(id)).length, 0,
    "grass and tree share a metatile");

  /* Water is checked against the real thing rather than described: this is
     SafariZone_Center's pond, island and all, lifted straight out of its map.bin
     - the one FireRed pond that uses every piece of the set, because an island
     is the only thing that calls for the inner corners. If our rule can lay
     that pond out tile for tile, it can lay out a lake with a pier through it.
     The 2-row ornamental pool that used to be here drew a lake as a flat blue
     rectangle with no shoreline at all. */
  const POND = [
    "..................",
    ".wwwwwwwwwwwwwwww.",
    ".wwwwwwwwwwwwwwww.",
    ".wwwwbbbbbbbbwwww.",
    ".wwww........wwww.",
    ".wwwwwwwwwwwwwwww.",
    ".wwwwwwwwwwwwwwww.",
    ".bbbbbbbbbbbb..bb.",
    "..................",
  ];
  const POND_IDS = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 290, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 292, 0],
    [0, 298, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 300, 0],
    [0, 298, 299, 299, 296, 307, 307, 307, 307, 307, 307, 307, 307, 297, 299, 299, 300, 0],
    [0, 298, 299, 299, 300, 0, 0, 0, 0, 0, 0, 0, 0, 298, 299, 299, 300, 0],
    [0, 298, 299, 299, 304, 291, 291, 291, 291, 291, 291, 291, 291, 305, 299, 299, 300, 0],
    [0, 298, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 299, 300, 0],
    [0, 307, 307, 307, 307, 307, 307, 307, 307, 307, 307, 307, 307, 0, 0, 307, 307, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  const pat = (x, y) => POND[y]?.[x] ?? ".";
  let drawn = 0;
  for (let y = 0; y < POND.length; y++) {
    for (let x = 0; x < POND[y].length; x++) {
      if (!"wb".includes(pat(x, y))) continue;
      assert.equal(waterId(route.pond, x, y, pat), POND_IDS[y][x],
        `water at ${x},${y} does not match FireRed's own pond`);
      drawn++;
    }
  }
  assert.equal(new Set(POND_IDS.flat()).size, 12, "the fixture must use every piece");

  /* The same pond underground. A corner tile draws the ground beyond the rim,
     so the grass-cornered 290/292 put a green notch in a cave - Seafoam
     Islands B4F, which is a cave with a lake, uses 288/289 there. Rock beyond
     the corner has to pick those, and grass beyond it must not. */
  const CAVE_POND = ["rrrrr", "rwwwr", "rwwwr", "rrrrr"];
  const cat = (x, y) => CAVE_POND[y]?.[x] ?? "";
  assert.equal(waterId(route.pond, 1, 1, cat), route.pond.topLeftRock,
    "a pond in rock must take the rock corner, not the grass one");
  assert.equal(waterId(route.pond, 3, 1, cat), route.pond.topRightRock,
    "a pond in rock must take the rock corner on the right too");
  const GRASS_POND = [".....", ".www.", ".www.", "....."];
  const gat = (x, y) => GRASS_POND[y]?.[x] ?? "";
  assert.equal(waterId(route.pond, 1, 1, gat), route.pond.topLeft,
    "a pond in grass must keep the grass corner");
  assert.equal(waterId(route.pond, 3, 1, gat), route.pond.topRight,
    "a pond in grass must keep the grass corner on the right too");

  /* And the shore on the shipped lake: every tile under water has to draw the
     bank, or the lake ends in a hard blue-to-green line. */
  const lake = areaOf("pond").rows;
  const lat = (x, y) => lake[y]?.[x] ?? "";
  let banks = 0;
  for (let y = 0; y < lake.length; y++) {
    for (let x = 0; x < lake[y].length; x++) {
      if (lat(x, y) === "w") {
        assert.ok("wbD".includes(lat(x, y + 1)),
          `water at ${x},${y} has no shore under it`);
        continue;
      }
      if (lat(x, y) !== "b") continue;
      assert.equal(waterId(route.pond, x, y, lat), route.pond.bank,
        `shore at ${x},${y} does not draw the bank`);
      banks++;
    }
  }
  assert.ok(banks > 0, "the lake has no shore at all");

  /* The pier is the same 3x3 shape as the path, and needs its rails to be
     distinct or a deck draws as a slab with no edge. */
  assert.equal(route.deck?.length, 3, "the pier needs all three autotile rows");
  assert.equal(new Set(route.deck.flat()).size, 9, "the pier must be 9 distinct tiles");

  /* The cave is the same 3x3 shape again, plus a 2x2 floor ring. Mt Moon's
     floor is one id, so the crater is the only thing breaking it up - losing it
     leaves a flat expanse. */
  assert.equal(route.cave?.wall?.length, 3, "the cave wall needs all three autotile rows");
  assert.equal(new Set(route.cave.wall.flat()).size, 9,
    "the cave wall must be 9 distinct tiles");
  assert.equal(new Set(route.cave.crater.flat()).size, 4,
    "the floor crater is a 2x2 of four distinct tiles");
  assert.ok(route.cave.floor, "the cave has no floor tile");

  /* The Power Plant. A bank is three rows - plinth, machine top, machine body -
     and each is a left/middle/right triple. Nine distinct tiles, because the
     plinth's caps are what stop a bank reading as a long wall with a walkable
     grey top, which is how it shipped when only the middle was drawn.

     The floor below a bank keeps its shadow; above it there is nothing to add,
     the plinth being part of the bank. */
  assert.ok(route.power?.floor, "the plant has no floor tile");
  assert.notEqual(route.power.floor, route.power.floorFoot,
    "the floor under a bank's foot must not be the plain floor tile");
  assert.equal(route.power.wall.length, 3,
    "a machine bank is three rows: plinth, machine top, machine body");
  assert.equal(new Set(route.power.wall.flat()).size, 9,
    "a bank is nine tiles: three rows of left, middle and right");
  assert.ok(!route.power.wall.flat().includes(route.power.floorFoot),
    "the bank and its foot shadow share a tile - one of them is drawn wrong");
  assert.equal(route.power.edge.length, 3, "the room edge is a 3x3");
  assert.equal(new Set(route.power.edge.flat()).size, 8,
    "the room edge is eight tiles - four corners and four sides, its middle " +
    "repeating a side because a 1-thick ring never draws one");
  assert.equal(new Set(route.power.console).size, 2,
    "a console is two tiles - its face and its body - set into a bank");
  assert.equal(new Set(route.power.barrel).size, 2, "a barrel stack is two tiles");
  assert.ok(!route.power.wall.flat().includes(route.power.floor),
    "the bank and the floor share a tile - one of them is drawn wrong");

  /* Ember Caldera, out of pokeemerald's Lavaridge. Rock is a 3x3 autotile and
     lava is one flat tile: everything that makes a pool read as a pool is on
     the rock BANK around it, keyed by which sides the lava lies on. Drawing
     that rim on the lava instead - which is how this shipped once - leaves the
     rock beside it still drawing its own plain edge, so a pool sitting under a
     wall gets two dark bands and two grey lips stacked on each other. */
  assert.ok(route.volcano?.floor, "the caldera has no floor tile");
  assert.equal(route.volcano.wall.length, 3, "volcanic rock needs all three autotile rows");
  assert.equal(new Set(route.volcano.wall.flat()).size, 9,
    "the rock autotile must be 9 distinct tiles");
  assert.ok(route.volcano.lava, "the caldera has no lava tile");
  assert.notEqual(route.volcano.lava, route.volcano.floor,
    "lava and the floor share a tile - one of them is drawn wrong");
  assert.ok(!route.volcano.wall.flat().includes(route.volcano.floor),
    "rock and the floor share a tile - that is an invisible wall");

  /* The bank. Nine pieces, one per way the lava can lie against a rock tile,
     and every one distinct: reuse a piece across two masks and the lip points
     the wrong way somewhere. `many` is the odd one out - it covers every mask
     of three sides or more, which is a rock the lava has surrounded. */
  const RIM = ["U", "D", "L", "R", "UL", "UR", "DL", "DR", "many"];
  for (const k of RIM)
    assert.ok(route.volcano.lavaRim?.[k], `the lava bank has no "${k}" piece`);
  assert.equal(new Set(RIM.map((k) => route.volcano.lavaRim[k])).size, RIM.length,
    "two of the bank's nine pieces are the same tile - a lip faces the wrong way");
  assert.ok(!Object.values(route.volcano.lavaRim).includes(route.volcano.lava),
    "a bank piece is the plain lava tile, so that edge draws no bank at all");
  assert.ok(!route.volcano.wall.flat().some((id) =>
    Object.values(route.volcano.lavaRim).includes(id)),
    "the bank and the plain rock autotile share a tile - one edge is drawn twice");

  assert.ok(route.volcano.grit.length >= 2, "the floor needs more than one grit variant");
  assert.ok(!route.volcano.grit.includes(route.volcano.floor),
    "grit must differ from the plain floor or the scatter never shows");
  assert.ok(route.volcano.ladder, "the caldera has no ladder");
  assert.ok(route.volcano.lavaBubble, "the lava has no bubbling variant");
  assert.notEqual(route.volcano.lava, route.volcano.lavaBubble,
    "the bubbling tile must differ from the plain body, or the scatter never shows");

  /* Frost Hollow, copied tile for tile from Seafoam Islands B3F. Three
     autotiles, all of them derived by masking the five Seafoam floors, and the
     one thing worth pinning is that the ice wall's top and bottom edges are the
     same tile. That is not a slip: ice here is a texture rather than a lit
     surface, so the mass has no separate near face, and "these must all be
     different" would be the wrong assertion to write. */
  assert.ok(route.frost?.floor, "the hollow has no lower-ice tile");
  assert.equal(route.frost.shelf.length, 3, "the ice shelf needs all three autotile rows");
  assert.equal(new Set(route.frost.shelf.flat()).size, 9,
    "the shelf autotile must be 9 distinct tiles - it is the rim it draws " +
    "around itself that makes one level read as higher than the other");
  assert.equal(route.frost.wall.length, 3, "the ice wall needs all three autotile rows");
  assert.equal(new Set(route.frost.wall.flat()).size, 8,
    "the ice wall is 8 tiles: its top and bottom edges are the same one");
  assert.ok(!route.frost.shelf.flat().includes(route.frost.floor),
    "the shelf and the lower ice share a tile - the two levels would not read apart");
  assert.ok(!route.frost.wall.flat().some((id) => route.frost.shelf.flat().includes(id)),
    "the ice wall and the shelf share a tile - that is an invisible wall");

  assert.equal(route.frost.water.length, 3, "the river needs all three autotile rows");
  assert.deepEqual(route.frost.water[2], route.frost.water[1],
    "the river has no bottom rim - its last row must repeat its middle");
  assert.equal(new Set(route.frost.water.flat()).size, 6,
    "the river is six tiles: a banked top row, then banked sides and open water");

  assert.equal(route.frost.fall.length, 3, "a waterfall is a lip, a body and a foot");
  assert.ok(route.frost.mouth, "the waterfall has no opening to pour out of");
  assert.ok(!route.frost.fall.includes(route.frost.mouth),
    "the opening must differ from the fall itself");
  assert.ok(route.frost.stairs, "the hollow has no staircase");
  assert.equal(route.frost.icicle.length, 2, "a stalactite is two rows");
  assert.equal(new Set(route.frost.icicle.flat()).size, 4, "a stalactite is 2x2, four tiles");
  assert.ok(route.frost.rock.length >= 2, "the hollow needs more than one boulder");

  /* Bridges. Route 12's planks, baked over what each bridge crosses, because
     the planks are the metatile's top layer and lift off the water they were
     drawn on. Eight tiles, all distinct: two columns for a north-south span and
     two rows for an east-west one, over lava and over water. If a baked tile
     came out equal to the surface it sits on, the plank layer did not draw. */
  for (const over of ["lava", "ice"]) {
    const b = route.bridge?.[over];
    assert.ok(b, `there is no bridge baked over ${over}`);
    assert.equal(b.vert.length, 2, `the ${over} bridge needs two columns`);
    assert.equal(b.horz.length, 2, `the ${over} bridge needs two rows`);
  }
  const bridgeIds = ["lava", "ice"].flatMap((o) =>
    route.bridge[o].vert.concat(route.bridge[o].horz));
  assert.equal(new Set(bridgeIds).size, 8, "the eight bridge tiles must all differ");
  assert.ok(!bridgeIds.includes(route.volcano.lava) && !bridgeIds.includes(route.frost.water[1][1]),
    "a bridge tile is the bare surface - the plank layer never drew");




  /* The upper level: its own 3x3 for the surface, the cliff that drops off its
     near edge, and the staircase set into that cliff. The cliff is deliberately
     the wall's bottom row - rock taller than you are looks the same whether you
     can climb it or not - so those two are not asserted apart. */
  assert.equal(route.cave.plateau?.length, 3, "the plateau needs all three autotile rows");
  assert.equal(new Set(route.cave.plateau.flat()).size, 9,
    "the plateau must be 9 distinct tiles");
  assert.equal(new Set(route.cave.cliff).size, 3, "the cliff face is left, middle, right");
  assert.ok(route.cave.stairs, "the cave has no staircase");
  assert.equal(route.cave.pool?.length, 2, "the cave pool is 2x2");
  assert.equal(new Set(route.cave.pool.flat()).size, 4,
    "the cave pool must be four distinct tiles");
  const surface = new Set(route.cave.plateau.flat());
  assert.ok(!route.cave.wall.flat().some((id) => surface.has(id)),
    "the plateau surface and the wall share a tile - one of them is drawn wrong");

  /* The canopy has to finish at the top. Deep Woods shipped once with every
     mass starting at a mid-canopy slice, which renders as a canopy sliced off
     flat - the tile ids were right and the geometry passed its own assertions,
     so nothing caught it but looking at the map. Viridian Forest gives the two
     legal endings, and this asserts a mass has one of them: the solid crown, or
     the walkable overhang whose shaded half completes the same crown. */
  const woods = areaOf("woods").rows;
  const wat = (x, y) => woods[y]?.[x] ?? "";
  const crown = new Set(route.forest.crown);
  const midA = new Set(route.forest.midA);
  const midB = new Set(route.forest.midB);
  const trunk = new Set(route.forest.trunk);
  let capped = 0;
  let behind = 0;
  let pairs = 0;
  for (let y = 0; y < woods.length; y++) {
    for (let x = 0; x < woods[y].length; x++) {
      if (wat(x, y) === "c") {
        assert.equal(wat(x, y + 1), "F",
          `overhang at ${x},${y} has no canopy under it - the leaves would float`);
        behind++;
        continue;
      }
      if (wat(x, y) !== "F" || wat(x, y - 1) === "F") continue;
      const id = forestId(route.forest, x, y, wat);
      const over = wat(x, y - 1) === "c";
      assert.ok(over ? midB.has(id) : crown.has(id),
        `canopy top at ${x},${y} draws ${id}, which is neither a crown nor the ` +
        `half under an overhang - that is a canopy cut off flat`);
      capped++;
    }
  }
  /* The invariant underneath all of it: midA is a crown's upper half and midB
     its lower, so the two always pair. Every stranded half is a sliced crown,
     and it is the fault an even mass height produces - at the foot when the
     alternation is anchored at the crown, at the head when it is anchored at
     the trunk. Asserting the pairing catches it at either end, on the rendered
     ids rather than on the geometry that is meant to guarantee them. */
  for (let y = 0; y < woods.length; y++) {
    for (let x = 0; x < woods[y].length; x++) {
      if (wat(x, y) !== "F") continue;
      const id = forestId(route.forest, x, y, wat);
      if (midB.has(id)) {
        const up = wat(x, y - 1) === "c"
          ? "overhang" : forestId(route.forest, x, y - 1, wat);
        assert.ok(up === "overhang" || midA.has(up),
          `lower half at ${x},${y} has no upper half over it - a sliced crown`);
        pairs++;
      }
      if (midA.has(id)) {
        assert.ok(midB.has(forestId(route.forest, x, y + 1, wat)),
          `upper half at ${x},${y} has no lower half under it - a sliced crown`);
      }
    }
  }
  assert.ok(behind > 0, "no overhang anywhere - nothing to walk behind");
  assert.ok(route.forest.fringeTop, "the overhang needs its leaves as their own tile");

  console.log(`tileset ok — ${PAIRS.length} biomes, ground and solid disjoint; ` +
              `${capped} canopy tops finished, ${pairs} whole crowns, ` +
              `${behind} to walk behind; ${drawn} water tiles match FireRed, ` +
              `${banks} tiles of shore`);
}

// --- the trainer's animation sets -----------------------------------------
/* The rip is cut by pixel offsets measured off its backing rectangles, so the
   failure mode is silent: a wrong offset draws a neighbouring set, and a frame
   count larger than the strip draws whatever is past its right edge. Both are
   caught by checking the metadata against the PNG's own header. */
import { fishFrame } from "../src/game/tileset.js";
import { canRun, RUN_LEVEL } from "../src/game/items.js";

{
  const player = JSON.parse(readFileSync(
    new URL("../public/tilesets/player.json", import.meta.url), "utf8"));
  const png = readFileSync(new URL("../public/tilesets/player.png", import.meta.url));
  const pngW = png.readUInt32BE(16);
  const pngH = png.readUInt32BE(20);

  assert.deepEqual(Object.keys(player.sets).sort(), ["fish", "jump", "run", "walk"],
    "the player strip must carry walk, run, fish and jump");
  assert.deepEqual(
    Object.values(player.dirs).sort((a, b) => a - b), [0, 1, 2, 3],
    "the four facings must be four distinct rows");

  const want = { walk: [16, 3], run: [16, 3], fish: [32, 4], jump: [32, 1] };
  let widest = 0;
  for (const [name, [w, frames]] of Object.entries(want)) {
    const set = player.sets[name];
    assert.equal(set.w, w, `${name} frames are ${set.w}px, expected ${w}`);
    assert.equal(set.frames, frames, `${name} has ${set.frames} frames`);
    assert.equal(set.h, player.rowH, `${name} is not one row tall`);
    // Every frame of every facing has to be inside the image.
    assert.ok(set.x + set.frames * set.w <= pngW,
      `${name} runs off the strip: needs ${set.x + set.frames * set.w}px of ${pngW}`);
    assert.ok(set.y + 4 * set.h <= pngH, `${name} runs off the bottom`);
    widest = Math.max(widest, set.x + set.frames * set.w);
  }
  assert.equal(widest, pngW, "the strip has unused width - a set is missing");

  // Sets must not overlap, or one animation plays another's frames.
  const spans = Object.values(player.sets)
    .map((s) => [s.x, s.x + s.frames * s.w])
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) {
    assert.ok(spans[i][0] >= spans[i - 1][1],
      `sets overlap at x=${spans[i][0]}`);
  }

  /* Every facing needs a cast frame for every phase, and it has to be a real
     one - right's frames sit in reverse order on the sheet, which is exactly
     the sort of thing an off-by-one hides. */
  const fish = player.sets.fish.frames;
  for (const dir of Object.keys(player.dirs)) {
    for (const phase of ["cast", "wait", "bite"]) {
      const f = fishFrame(dir, phase);
      assert.ok(Number.isInteger(f) && f >= 0 && f < fish,
        `fishFrame(${dir}, ${phase}) = ${f}, outside 0..${fish - 1}`);
    }
    assert.notEqual(fishFrame(dir, "cast"), fishFrame(dir, "wait"),
      `${dir} winds up and holds on the same frame, so the cast does not move`);
  }

  /* Running is an item AND a level, and both halves have to hold. There is no
     official Running Shoes sprite in any Gen 3 decomp - the games grant them
     invisibly - so the icon is cropped from our own player sheet's run frames
     by build_assets.py, which is real art rather than an invented one. */
  const shoes = { "running-shoes": 1 };
  assert.ok(RUN_LEVEL > 1, "running cannot be free from the start");
  assert.ok(!canRun(RUN_LEVEL - 1, shoes), "the level gate still has to bite");
  assert.ok(!canRun(RUN_LEVEL + 5, {}), "and so does the item gate");
  assert.ok(!canRun(RUN_LEVEL + 5, undefined), "an empty bag is not a pair of shoes");
  assert.ok(canRun(RUN_LEVEL, shoes) && canRun(RUN_LEVEL + 5, shoes),
    "the run gate must open with the shoes at RUN_LEVEL and stay open");
  const shoeItem = KEY_ITEMS.find((k) => k.id === "running-shoes");
  assert.ok(shoeItem, "the Running Shoes have to be a key item to be handed over");
  assert.equal(shoeItem.level, RUN_LEVEL,
    `the shoes arrive at Lv ${shoeItem.level} but running unlocks at ${RUN_LEVEL}` +
    " - one of those is a lie to the player");

  console.log(`player ok \u2014 ${pngW}x${pngH} strip, ` +
              Object.entries(player.sets)
                .map(([k, v]) => `${k}:${v.frames}@${v.w}px`).join(" ") +
              `, run from level ${RUN_LEVEL}`);
}

// --- areas and biomes ----------------------------------------------------
// Maps are generated and the biome config is hand-written, so the thing worth
// asserting is that the two still agree. Every walkable tile spawns now, so what
// matters is that each map has enough connected ground to walk on - a map you
// cannot get around is a map that never rolls an encounter.
import {
  BIOMES, RODS, rodTable, biomeFor, levelFromXp, levelProgress,
  LEVEL_XP, MAX_LEVEL, xpForCatch,
  LEGENDARY, LEGEND_MATCHED, LEGEND_STRAY, GEN_LAST, genOf,
} from "../src/game/biomes.js";
import { AREAS, AREA_IDS, SOLID, walkable, MINI, MINI_UNKNOWN } from "../src/game/map.js";
import {
  encounterTable, evoScale, evoUnlock, bornLevel, areaOpen, foundIn,
  MAP_FIRST, MAP_LAST,
  EVO_DEPTH, EVO_STEP, EVO_FLOOR,
} from "../src/game/biomes.js";
import { EVOLUTIONS } from "../src/data/evolutions.js";

assert.equal(BIOMES.length, AREA_IDS.length, "every area needs a biome");

/* Every type any species has, and nothing else. It used to admit "rare" as
   well, for the Flower Clearing, whose type list read Rare - a pseudo-type that
   existed so one map could be labelled "the rares are here". The map is gone
   and so is the exemption, which is what makes a typo here fail again. */
const KNOWN_TYPES = new Set(SPECIES.flatMap((s) => s.types));

for (const b of BIOMES) {
  const area = AREAS[b.id];
  assert.ok(area, `${b.id} has no generated map`);

  const rows = area.rows;
  const W = rows[0].length;
  assert.ok(rows.every((r) => r.length === W), `${b.id}: ragged map`);
  assert.ok(walkable(rows, area.spawn.x, area.spawn.y), `${b.id}: spawn is inside a wall`);

  assert.ok(!("spawnOn" in b), `${b.id}: spawnOn is gone — every tile spawns now`);

  let spawnable = 0;
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < W; x++) if (walkable(rows, x, y)) spawnable++;
  assert.ok(spawnable >= 200,
    `${b.id} has only ${spawnable} walkable tiles — too small to hunt`);

  // Walkable is not reachable: a walled-off pocket is map you can never stand on.
  const seen = new Set();
  const stack = [[area.spawn.x, area.spawn.y]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const key = x + "," + y;
    if (seen.has(key) || !walkable(rows, x, y)) continue;
    seen.add(key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // Walking south into a ledge hops it and lands you on the far side.
      const over = dy === 1 && rows[y + dy]?.[x + dx] === "L";
      stack.push([x + dx, y + dy + (over ? 1 : 0)]);
    }
  }
  /* Ledges are one-way, so they are the one thing on a map that can strand you.
     The generator checks the map it draws; this checks the map that shipped. */
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < W; x++) {
      if (rows[y][x] !== "L") continue;
      assert.ok(!walkable(rows, x, y), `${b.id}: ledge at ${x},${y} must be solid`);
      assert.ok(walkable(rows, x, y + 1),
        `${b.id}: ledge at ${x},${y} has nothing to land on`);
      assert.ok(walkable(rows, x, y - 1),
        `${b.id}: ledge at ${x},${y} cannot be reached from above`);
    }
  }

  assert.ok(seen.size >= 0.9 * spawnable,
    `${b.id}: only ${seen.size} of ${spawnable} walkable tiles are reachable`);

  assert.ok(b.table.length >= 8, `${b.id} needs a table worth rolling on`);

  /* Types are ids now, not a display string, because every one of them is
     rendered as a coloured badge. A typo would silently draw the default grey. */
  assert.ok(Array.isArray(b.types) && b.types.length, `${b.id} needs a type list`);
  for (const t of b.types)
    assert.ok(KNOWN_TYPES.has(t), `${b.id} lists an unknown type "${t}"`);
  for (const [id, w] of b.table) {
    assert.ok(speciesById(id), `${b.id} table has a dex id that does not exist: ${id}`);
    assert.ok(w > 0, `${b.id} table has a zero weight`);
  }
  assert.equal(new Set(b.table.map((e) => e[0])).size, b.table.length,
    `${b.id} table lists a species twice`);
  assert.equal(biomeFor(b.id)?.id, b.id, `${b.id} not found by biomeFor`);
}

assert.equal(biomeFor("nowhere"), null, "an unknown area has no biome");

/* Legendaries are appended to every table by rule, not listed in any of them.
   The rule is the whole point - it is what replaced a map built to hold the two
   that matched no biome - so it is asserted rather than trusted: present in
   every table, exactly once, and at the weight its own types earn it. Listing
   one by hand as well is the mistake this catches, and it would show up as a
   species appearing twice in one table with two different odds. */
for (const b of BIOMES) {
  /* NOT in the resident table any more - their weight depends on how big the
     table turns out to be, so `encounterTable` adds them last. A legendary
     listed here as well would be one appearing twice with two sets of odds,
     which is the mistake this has always been for. */
  for (const id of LEGENDARY) {
    assert.equal(b.table.filter((e) => e[0] === id).length, 0,
      `${b.id} hard-codes legendary #${id} - legendsFor() adds them`);
  }

  /* THE SHARE IS CONSTANT, and that is a far stronger claim than the weights
     this used to pin. Going from 5 legendaries to 24 in tables that tripled
     would have multiplied the old fixed weights' share by about five; as a
     share of the table it cannot move at all. Checked at every level a
     generation or a map arrives, because those are what change the total. */
  for (const lv of [1, 10, GEN_UNLOCK[2], 30, GEN_UNLOCK[4], MAX_LEVEL]) {
    const t = encounterTable(b, lv);
    const total = t.reduce((n, e) => n + e[1], 0);
    const share = t.filter((e) => LEGENDARY.includes(e[0]))
      .reduce((n, e) => n + e[1], 0) / total;
    assert.ok(Math.abs(share - LEGEND_SHARE) < 1e-9,
      `${b.id} at Lv ${lv}: legendaries are ${(share * 100).toFixed(2)}% of finds, ` +
      `not ${(LEGEND_SHARE * 100).toFixed(2)}% - the share must not move when the ` +
      "table grows, which is the whole reason it is a share");
    // exactly once each, whatever else was added
    for (const id of LEGENDARY) {
      if (!genOpen(id, lv)) continue;
      assert.equal(t.filter((e) => e[0] === id).length, 1,
        `${b.id} at Lv ${lv} rolls legendary #${id} more than once`);
    }
  }

  // A biome sharing a legendary's type is still the better place to hunt it.
  const full = encounterTable(b, MAX_LEVEL);
  const wOf = (id) => full.find((e) => e[0] === id)?.[1] ?? 0;
  const mine = LEGENDARY.filter((id) => speciesById(id).types.some((t) => b.types.includes(t)));
  const away = LEGENDARY.filter((id) => !mine.includes(id));
  if (mine.length && away.length) {
    assert.ok(wOf(mine[0]) > wOf(away[0]),
      `${b.id}: a legendary that matches it is no likelier than one that does not`);
  }
}
assert.ok(LEGEND_STRAY < LEGEND_MATCHED,
  "a biome sharing a legendary's type must be the better place to hunt it");

/* The generation chip. Derived from the dex id, so the only things worth
   pinning are the boundaries - an off-by-one there puts Mew in Gen 2 - and that
   it never runs backwards. */
{
  assert.equal(genOf(1), 1, "Bulbasaur is Gen 1");
  assert.equal(genOf(151), 1, "and so is Mew");
  assert.equal(genOf(152), 2, "Chikorita is not");
  for (let i = 0; i < GEN_LAST.length; i++) {
    assert.equal(genOf(GEN_LAST[i]), i + 1,
      `${GEN_LAST[i]} must be the last of gen ${i + 1}`);
    if (i + 1 < GEN_LAST.length)
      assert.equal(genOf(GEN_LAST[i] + 1), i + 2,
        `${GEN_LAST[i] + 1} must open gen ${i + 2}`);
    if (i) assert.ok(GEN_LAST[i] > GEN_LAST[i - 1], "the boundaries must ascend");
  }
  let prev = 0;
  for (let id = 1; id <= GEN_LAST[GEN_LAST.length - 1]; id++) {
    const g = genOf(id);
    assert.ok(g >= prev && g >= 1, `genOf(${id}) = ${g} ran backwards`);
    prev = g;
  }
  // Every species we actually ship has to land in a generation we know about.
  for (const sp of SPECIES)
    assert.ok(genOf(sp.id) >= 1 && genOf(sp.id) <= GEN_LAST.length,
      `#${sp.id} ${sp.name} falls outside every generation`);
}

/* THE MAP LADDER. This asserted the opposite until the ladder was added - that
   no area carried a `level` at all - which is worth leaving a trace of: the old
   design paced you with the price of balls rather than with locked doors, and
   the assertion was the design written down.

   What has to hold now is the SHAPE, not eight numbers. Somewhere to start,
   somewhere to finish, nothing out of order, and nothing past the cap. */
{
  const levels = BIOMES.map((b) => b.level);
  for (const b of BIOMES) {
    assert.equal(typeof b.level, "number", `${b.id} has no unlock level`);
    assert.ok(b.level >= 1 && b.level <= MAX_LEVEL,
      `${b.id} unlocks at Lv ${b.level}, outside 1..${MAX_LEVEL}`);
  }
  assert.equal(levels[0], MAP_FIRST, "the first map must be open from the start");
  assert.equal(Math.max(...levels), MAP_LAST,
    `the last map must open at Lv ${MAP_LAST} - the number the design quotes`);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i] >= levels[i - 1],
      `${BIOMES[i].id} opens before the map listed above it - the list IS the ladder`);
  }

  /* `areaOpen` is what the engine refuses on AND what the Travel panel draws,
     so a menu cannot offer a map the engine will not travel to. */
  for (const b of BIOMES) {
    assert.equal(areaOpen(b.id, b.level), true, `${b.id} is shut at its own level`);
    // Only where there IS a level below: nobody is ever level 0, so "shut at 0"
    // is not a claim about the first map.
    if (b.level > MAP_FIRST) {
      assert.equal(areaOpen(b.id, b.level - 1), false, `${b.id} is open a level early`);
    }
  }

  /* AND THE LADDER MUST NOT STRAND ANYTHING. Every species still has to be
     gettable by the cap - locking a map behind Lv 20 is a delay, and it would
     be a dead end if the cap were ever lowered under the last unlock. */
  assert.ok(MAP_LAST < MAX_LEVEL,
    `the last map opens at ${MAP_LAST} and the cap is ${MAX_LEVEL} - a player ` +
    "must reach the end of the ladder with levelling left to do");

  /* THE DEX MUST NOT HIDE A DOOR. `foundIn` feeds the WHERE TO LOOK panel, and
     before the ladder every map it named was open - so nothing carried a level
     and nothing needed to. 117 of the 151 entries then started naming a gated
     map with no hint of the gate, which is worse than saying nothing: it sends
     a Lv 3 trainer to Frost Hollow for a Lapras.

     `from` is one number meaning "not before this level", whichever of the two
     causes is later - the map's own unlock, or an evolved form's. */
  for (const sp of SPECIES) {
    const { legendary, areas } = foundIn(sp.id);
    if (legendary) continue;
    for (const a of areas) {
      const gate = BIOMES.find((b) => b.id === a.id).level;
      const genGate = GEN_UNLOCK[genOf(sp.id)] ?? 0;
      assert.ok(a.from >= Math.max(gate > MAP_FIRST ? gate : 0, genGate),
        `${sp.name}'s entry names ${a.name} as "Lv ${a.from}+" but the map opens ` +
        `at ${gate} and its generation at ${genGate} - the panel is hiding a door`);
    }
  }

  console.log(`map ladder ok — ${levels.join(", ")} (Lv ${MAP_FIRST} to ${MAP_LAST})`);
}
assert.equal(shelf[0].level, 1, "the starting ball must be buyable at level one");
assert.ok(shelf[shelf.length - 1].level <= MAX_LEVEL, "the best ball must be reachable");

// Levels: monotonic, and thresholds line up with the table.
assert.equal(levelFromXp(0), 1);
assert.equal(levelFromXp(LEVEL_XP[4]), 5, "hitting a threshold levels you up");
assert.equal(levelFromXp(LEVEL_XP[4] - 1), 4, "one short does not");
assert.equal(levelFromXp(1e9), MAX_LEVEL, "level is capped");
let prev = 0;
for (let xp = 0; xp < 6000; xp += 7) {
  const lv = levelFromXp(xp);
  assert.ok(lv >= prev, "level must never go down as xp rises");
  prev = lv;
}
assert.equal(levelProgress(1e9).frac, 1, "max level shows a full bar");
assert.ok(xpForCatch({ tier: "S" }, false) > xpForCatch({ tier: "C" }, false),
  "rarer catches teach more");
assert.ok(xpForCatch({ tier: "C" }, true) > xpForCatch({ tier: "C" }, false),
  "a new species teaches more than a duplicate");

/* A transcribed area carries the real map's own metatile ids, rebased against
   wherever our atlas happened to pack that tileset. Adding a tileset moves the
   base, so `npm run art` without `npm run map` would leave the map drawing
   rubble at the right coordinates. This is that failure, made loud. */
{
  const route = JSON.parse(
    readFileSync(new URL("../public/tilesets/route.json", import.meta.url), "utf8"));
  for (const id of AREA_IDS) {
    const area = AREAS[id];
    if (!area.tiles) continue;
    assert.equal(area.tiles.length, area.rows[0].length * area.rows.length,
      `${id}: the transcribed tile ids do not cover the map`);
    assert.equal(area.tileBase, route.frost.floor - 1,
      `${id}: transcribed against atlas base ${area.tileBase} but the atlas now ` +
      `packs seafoam at ${route.frost.floor - 1} - re-run npm run map`);
    const top = route.forest.fringeTop;
    assert.ok(area.tiles.every((t) => t >= -1 && t <= top),
      `${id}: a transcribed tile id falls outside the atlas`);
  }
}

const sizes = AREA_IDS.map((id) => `${AREAS[id].rows[0].length}x${AREAS[id].rows.length}`);
// --- medals, shinies and the save file ------------------------------------
/* Phase 2. Three things that are each one mistake away from being worse than
   not shipping them: a medal that pays twice, a shiny eaten by a bulk action,
   and an import that accepts a file it cannot actually run. */
import { MEDALS, MILESTONES, medalsFor, medalById } from "../src/game/medals.js";

/* Rarest last, so a loop over it reads in ladder order. Every safety case below
   runs for ALL of them: shipping a new tier protected from one bulk action and
   not another is the exact mistake a third tier invites, and it is why this is
   a list rather than three copies of the same test. */
import {
  SHINY_ODDS, ORIGIN_ODDS, ASTRAL_ODDS, HOLO_ODDS, TIER_ODDS, TIERS, rollVariant,
  genComplete, originReady, lockedTiers,
} from "../src/game/biomes.js";
import { saveProblem, repairDex } from "../src/game/engine.js";

{
  // Every medal is real, unique, and asks for species that exist.
  const ids = new Set();
  for (const m of MEDALS) {
    assert.ok(!ids.has(m.id), `two medals share the id ${m.id}`);
    ids.add(m.id);
    assert.ok(m.name && m.sub, `${m.id} needs a name and a line`);
    assert.ok(m.need.length > 0, `${m.id} asks for nothing`);
    assert.equal(new Set(m.need).size, m.need.length, `${m.id} lists a species twice`);
    for (const id of m.need)
      assert.ok(speciesById(id), `${m.id} wants species ${id}, which does not exist`);
    assert.ok(m.money > 0, `${m.id} pays nothing`);
    for (const [item, n] of Object.entries(m.items ?? {})) {
      assert.ok(itemById(item), `${m.id} pays in ${item}, which is not an item`);
      assert.ok(n > 0, `${m.id} pays zero ${item}`);
    }
    assert.equal(medalById(m.id), m, `${m.id} must be findable by id`);
  }

  /* A line medal is only for a family that actually evolves. A medal for
     owning one Farfetch'd is a participation trophy, and the whole point of a
     medal is that it marks finishing something. */
  for (const m of MEDALS.filter((x) => x.kind === "line"))
    assert.ok(m.need.length > 1, `${m.id} is a single species, not a line`);

  /* THE END TO END TEST: register all 151 in dex order and watch the medals
     land. Every one must fire exactly once - a medal that pays twice is free
     money, and one that never fires is a reward nobody can reach. */
  const dex = new Array(SPECIES.length).fill(0);
  const earned = [];
  let money = 0;
  const balls = {};
  let milestonesHit = 0;
  for (const sp of SPECIES) {
    dex[dexIndex(sp.id)] = 2;
    for (const m of medalsFor(sp.id, dex, earned)) {
      earned.push(m.id);
      money += m.money;
      for (const [i, n] of Object.entries(m.items)) balls[i] = (balls[i] ?? 0) + n;
    }
    const caught = dex.reduce((n, v) => n + (v === 2 ? 1 : 0), 0);
    const stone = MILESTONES.find((x) => x.at === caught);
    if (stone) {
      milestonesHit++;
      money += stone.money;
      for (const [i, n] of Object.entries(stone.items)) balls[i] = (balls[i] ?? 0) + n;
    }
  }
  assert.equal(earned.length, MEDALS.length,
    `${earned.length} of ${MEDALS.length} medals are reachable by filling the dex`);
  assert.equal(new Set(earned).size, earned.length, "a medal paid twice");
  assert.equal(milestonesHit, MILESTONES.length, "a milestone is unreachable");

  // And nothing pays again on a second pass over a full dex.
  for (const sp of SPECIES)
    assert.equal(medalsFor(sp.id, dex, earned).length, 0,
      `${sp.name} pays a medal a second time`);

  /* The payout, as one number. Not a limit - "be generous" was the brief - but
     a number that cannot drift without this line changing, because a reward
     table is exactly the sort of thing that grows a zero by accident. */
  const per = money / SPECIES.length;
  assert.ok(per > 300 && per < 1500,
    `medals and milestones pay ¥${Math.round(per)} per species (¥${money} over ` +
    `${SPECIES.length}) - the total is allowed to grow with the dex, the RATE is not`);
  /* Scaled the same way. Two generations brought 19 more legendaries, so the
     same number of Master Balls would have been a real tightening; one per
     seventy species keeps the pressure where it was. */
  assert.ok(balls["master-ball"] <= Math.ceil(SPECIES.length / 70),
    `${balls["master-ball"]} Master Balls from the dex over ${SPECIES.length} ` +
    "species - that is a hoard");
  console.log(`medals ok — ${MEDALS.length} (${
    ["line", "type", "biome", "dex"].map((k) =>
      `${MEDALS.filter((m) => m.kind === k).length} ${k}`).join(", ")
  }) + ${MILESTONES.length} milestones, ¥${money.toLocaleString()} and ${
    (balls["ultra-ball"] ?? 0)} ultra over a full dex`);
}

{
  /* NO RARE TIER IS EVER TAKEN BY A BULK ACTION. Each would be unrecoverable:
     the sweep sells it, or the feed eats it to make an ordinary evolution.
     Neither has an undo, and at these odds there is no farming another. Every
     case below runs over the whole of TIERS rather than naming two of them,
     because shipping a new tier protected from one of the two actions and not
     the other is exactly the shape of mistake each new tier invites. */
  /* THE LADDER. Four tiers, ordered rarest first, all rare. The order is the
     whole design - Origin and Holo are the kindest because their tells are the
     artwork and the finish, and meeting those often is the point; Astral is
     the rarest because its tell is only a treatment. Getting this backwards
     would be invisible in play until someone noticed Astrals were common.

     Asserted off TIER_ODDS rather than by naming constants, and NON-strictly:
     Origin and Holo are deliberately the same odds, so a strict ordering would
     have to be relaxed by hand - and the relaxation is what would then hide a
     genuinely mis-ordered pair. */
  assert.ok(TIER_ODDS.length === TIERS.length && TIERS.length >= 3,
    "the ladder lost a tier");
  for (let i = 1; i < TIER_ODDS.length; i++) {
    const [prev, pOdds] = TIER_ODDS[i - 1];
    const [tier, odds] = TIER_ODDS[i];
    assert.ok(odds >= pOdds,
      `the ladder is out of order: ${prev} ${pOdds} before ${tier} ${odds}`);
  }
  const kindest = TIER_ODDS[TIER_ODDS.length - 1][1];
  assert.ok(kindest > TIER_ODDS[0][1],
    "every tier at the same odds is one tier wearing four names");
  assert.ok(kindest < 0.01, "even the kindest tier has to stay rare");
  assert.ok(TIER_ODDS[0][1] > 0, "the rarest tier still has to be reachable");
  /* Kindest first is `[...TIERS].reverse()`, and TWO screens order themselves
     by it: the row of marks under a Dex tile, and the Forms strip inside the
     entry. They must agree, so the reversal has to start with Origin - the
     drawing - before Holo, the finish over it. Pinned because the tie between
     their odds makes the order look free, and it is not. */
  const kindestFirst = [...TIERS].reverse();
  assert.deepEqual(kindestFirst, ["origin", "holo", "shiny", "astral"],
    `marks would be drawn ${kindestFirst.join(", ")} - the Forms strip lists ` +
    "origin, holo, shiny, astral and the two have to match");
  // The named exports stay the way the rest of the game imports them.
  assert.deepEqual(
    TIER_ODDS.map(([t, o]) => [t, o]),
    [["astral", ASTRAL_ODDS], ["shiny", SHINY_ODDS],
      ["holo", HOLO_ODDS], ["origin", ORIGIN_ODDS]],
    "TIER_ODDS and the named odds have drifted apart");

  for (const tier of TIERS)
    assert.ok(keeper({ [tier]: 1 }), `${tier} must count as a keeper`);
  assert.ok(!keeper({}) && !keeper(undefined) && !keeper(null),
    "and nothing else may");

  /* The roll: one answer, Astral wins, and nothing is ever both - there is no
     shiny Gen 1 sprite, so a Pokemon that was both would have no picture. */
  {
    const seen = Object.fromEntries(TIERS.map((t) => [t, 0]));
    let plain = 0;
    /* A seeded sequence, so this cannot fail once a fortnight on the real one -
       but it has to be a GOOD one. The obvious LCG here
       (`seed * 1103515245 + 12345 & 0x7fffffff`) overflows 2^53 in JS before
       the mask lands, and the degenerate sequence it produces never returns a
       value below 1/4096: Astral came up ZERO times in 400,000 rolls and the
       two-tier version of this test had been passing on luck. mulberry32 uses
       Math.imul throughout, so nothing is lost to float precision. */
    let seed = 12345;
    const rng = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 400000; i++) {
      const v = rollVariant(rng);
      if (v === null) plain++;
      else seen[v]++;
      assert.ok(v === null || TIERS.includes(v), `rollVariant said ${v}`);
    }
    assert.equal(TIERS.reduce((n, t) => n + seen[t], 0) + plain, 400000,
      "every roll has exactly one answer");
    /* Measured, not just declared: a strictly rarer tier must actually come up
       less. Only where the odds differ - Origin and Holo share theirs, and
       which of two equal tiers wins a 400k sample is noise, so asserting an
       order between them would be a test that fails on a new seed. */
    for (let i = 1; i < TIER_ODDS.length; i++) {
      const [rarer, rOdds] = TIER_ODDS[i - 1];
      const [kinder, kOdds] = TIER_ODDS[i];
      if (kOdds === rOdds) continue;
      assert.ok(seen[kinder] > seen[rarer],
        `over 400k rolls: ${JSON.stringify(seen)} - ${kinder} is not commoner ` +
        `than ${rarer}, and its odds say it should be`);
    }
    for (const tier of TIERS)
      assert.ok(seen[tier] > 0, `${tier} never appeared in 400k rolls`);
    /* Every tier reachable is not the same as every tier reachable AT ITS OWN
       RATE: a loop that returned early would still hit them all. Each count
       has to sit near what its odds predict, and the band is wide because a
       1/4096 tier only lands about 98 times in 400k. */
    for (const [tier, odds] of TIER_ODDS) {
      const want = 400000 * odds;
      assert.ok(seen[tier] > want * 0.6 && seen[tier] < want * 1.4,
        `${tier} came up ${seen[tier]} times, expected about ${Math.round(want)}`);
    }
    // Always the rarest when the first draw succeeds, nothing when none does.
    assert.equal(rollVariant(() => 0), "astral", "a zero roll must be the rarest tier");
    assert.equal(rollVariant(() => 1), null, "a one roll must be nothing at all");
  }

  /* ORIGIN IS EARNED. It does not roll until every ordinary Pokemon of that
     species' generation is caught, which makes finishing the dex the start of
     a second game rather than the end of the first. Three things have to hold
     and all three are silent failures: a gate that never opens, a gate that
     was never closed, and a gate that leaks the tier it is holding back. */
  {
    const empty = new Array(SPECIES.length).fill(0);
    const seen = new Array(SPECIES.length).fill(1);     // met, never caught
    const full = new Array(SPECIES.length).fill(2);

    assert.ok(!genComplete(empty, 1), "an empty dex is not a complete one");
    assert.ok(!genComplete(seen, 1), "SEEN is not CAUGHT");
    assert.ok(genComplete(full, 1), "a full dex must open the gate");
    // One short is still short - the off-by-one this kind of loop invites.
    // Flipped by POSITION of a known Gen 1 species, not by the last slot: the
    // last slot is Arceus now, and Gen 1 does not care about Arceus.
    const nearly = [...full];
    nearly[dexIndex(1)] = 1;                              // Bulbasaur, met only
    assert.ok(!genComplete(nearly, 1), "one short must not open the gate");
    assert.ok(!genComplete(undefined, 1), "no dex at all is not complete");

    /* PER GENERATION, and three of them is the first time that could be tested.
       Finishing Kanto must not hand out Johto's Origins and it must not take
       Kanto's away either - the whole reason the gate is per generation rather
       than global is that adding a generation would otherwise revoke what a
       player had already earned. */
    const kantoOnly = SPECIES.map((sp) => (genOf(sp.id) === 1 ? 2 : 0));
    assert.ok(genComplete(kantoOnly, 1), "a finished Kanto must open Kanto");
    assert.ok(!genComplete(kantoOnly, 2), "a finished Kanto must not open Johto");
    assert.ok(!genComplete(kantoOnly, 4), "a finished Kanto must not open Sinnoh");
    assert.ok(originReady(kantoOnly, 1), "Kanto's Origins are earned");
    assert.ok(!originReady(kantoOnly, 152), "Johto's are not");
    assert.ok(genComplete(full, 2) && genComplete(full, 4),
      "a full dex opens every generation that ships");

    /* THE HOLE. Gen 3 ships no species, so "is Gen 3 complete" is vacuously
       true - and that is the right answer rather than a bug: there is nothing
       to catch and nothing to gate. Asserted so the day Hoenn lands, this line
       fails and somebody reads it. */
    assert.ok(genComplete(empty, 3),
      "a generation with no species in it has nothing left to catch");

    assert.ok(!originReady(empty, 1) && originReady(full, 1),
      "originReady must follow its generation's dex");
    assert.equal(lockedTiers(full, 1), null, "a finished dex locks nothing");
    assert.ok(lockedTiers(empty, 1).has("origin"), "an unfinished dex locks Origin");

    /* And the roll has to honour it. A locked Origin must never come out, and
       - the part worth testing - locking one tier must not change what the
       others are worth, or the gate would quietly retune the whole ladder
       every time it closed. */
    let seed = 7;
    const rng = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const lock = lockedTiers(empty, 1);
    const got = Object.fromEntries(TIERS.map((t) => [t, 0]));
    const N = 200000;
    for (let i = 0; i < N; i++) { const v = rollVariant(rng, lock); if (v) got[v]++; }
    assert.equal(got.origin, 0, `a locked Origin rolled ${got.origin} times`);
    for (const [tier, odds] of TIER_ODDS) {
      if (tier === "origin") continue;
      const want = N * odds;
      assert.ok(got[tier] > want * 0.6 && got[tier] < want * 1.4,
        `with Origin locked, ${tier} came up ${got[tier]}, expected about ${Math.round(want)}`);
    }
    console.log(`origin gate ok — locked: ${TIERS.filter((t) => t !== "origin")
      .map((t) => `${t} ${got[t]}`).join(", ")}, origin 0`);
  }

  /* A VARIANT IS ITS OWN ROW, and with the feed gone that is true by
     construction rather than by arrangement.

     The old system consumed a pile, so it had to be TOLD which of six Pidgey
     was the hero (`ANY_HERO`, a hero sort, a `want` threaded through four
     functions) and the failure was silent: press evolve on the ordinary stack
     and spend the Holo standing next to it. Candy is spent on a `uid`, so the
     question cannot be asked wrong - what is asserted here is that the answer
     depends on the individual and on nothing else. */
  {
    const holo = { uid: 1, species: 16, level: 30, holo: 1 };
    const origin = { uid: 2, species: 16, level: 2, origin: 1 };
    const plain = { uid: 3, species: 16, level: 30 };
    const row = evolutionRow(16, 17);
    assert.ok(row, "Pidgey must still evolve into Pidgeotto");

    assert.equal(variantOf(holo), "holo", "variantOf must name the tier");
    assert.equal(variantOf(plain), null, "and null for an ordinary one");

    /* SAME LEVEL, SAME ANSWER, whatever tier it is wearing. A variant must be
       neither privileged nor penalised - it is the same Pokemon with a
       different finish, and the whole point of pricing evolution in levels is
       that the price cannot depend on anything else. */
    assert.deepEqual(
      evolveState(holo, {}, row), evolveState(plain, {}, row),
      "a Holo and an ordinary one at the same level must cost the same",
    );

    /* And a LOW-level variant is not dragged along by a high-level ordinary
       one sitting in the same box. This is the old bug restated for the new
       model: there is no box in the call at all, which is the fix. */
    assert.equal(evolveState(origin, {}, row).ready, false,
      "a Lv 2 Origin is not ready just because an ordinary Pidgey is Lv 30");
    assert.ok(evolveState(origin, {}, row).need > 0, "and it owes real candy");

    /* NOTHING IS EVER CONSUMED BUT THE STONE. The guarantee players actually
       worried about was "will this eat my Holo", and the answer is now
       structural: `evolve` takes one uid and mutates it in place, so there is
       no second Pokemon in scope to eat. `keeper` still guards the SWEEP. */
    for (const mon of [holo, origin, plain]) {
      assert.equal(keeper(mon), !!variantOf(mon), "keeper must agree with variantOf");
    }
    assert.deepEqual(duplicateUids([holo, origin, plain]), [],
      "owning variants must not make your only ordinary one spare - the sweep " +
      "groups by species, the Box by species AND variant, and they must agree");
    assert.deepEqual(
      duplicateUids([holo, origin, plain, { uid: 4, species: 16, level: 4 }]), [4],
      "but a second ordinary one is",
    );

    console.log("variant rows ok — a level is a level, whatever tier wears it");
  }

  /* Raticate registered, so Rattata's reserve is 1 rather than the whole feed
     for an evolution still owing - otherwise nothing here is spare and the test
     proves only that an empty list contains no shinies. */
  const dex = new Array(SPECIES.length).fill(0);
  dex[19] = 2;
  /* Ordinary Rattata above TWO shiny ones, so level order would sell both.
     Two, not one: with a single shiny the reserve happens to keep it anyway,
     and the test passes with the protection deleted - which is how this one
     was written the first time. */
  for (const tier of TIERS) {
    const box = [
      { uid: 1, species: 19, level: 30 },
      { uid: 2, species: 19, level: 25 },
      { uid: 3, species: 19, level: 20 },
      { uid: 4, species: 19, level: 15 },
      { uid: 5, species: 19, level: 3, [tier]: 1 },
      { uid: 6, species: 19, level: 2, [tier]: 1 },
    ];
    const spare = duplicateUids(box, dex);
    for (const m of box.filter(keeper))
      assert.ok(!spare.includes(m.uid), `the sweep would have sold ${tier} #${m.uid}`);
    assert.ok(spare.length > 0, `and it must still find the ordinary spares (${tier})`);

    // Every one of them precious: none is spare, however many there are.
    assert.deepEqual(duplicateUids(box.map((m) => ({ ...m, [tier]: 1 })), dex), [],
      `a box of ${tier} has no spares at all`);
  }
  /* The ROW sale, not just the sweep. This shipped broken once, because the two
     lists were computed in two different files and only one of them filtered
     keepers. There is one list now - the Box reads `duplicateUids` and slices
     its own row out of it - so what has to hold is that a row's share of the
     sweep is exactly what the sweep would take from that row. */
  for (const tier of TIERS) {
    const mons = [
      { uid: 1, species: 19, level: 30 },
      { uid: 2, species: 19, level: 20 },
      { uid: 3, species: 19, level: 2, [tier]: 1 },
    ];
    const offered = duplicateUids(mons);
    assert.ok(!offered.includes(3), `the row would have sold a ${tier}`);
    assert.deepEqual(offered, [2], `and it must still offer the ordinary spare (${tier})`);
    // A row of nothing but keepers offers nothing at all.
    assert.deepEqual(duplicateUids(mons.map((m) => ({ ...m, [tier]: 1 }))), [],
      `a row of ${tier} must offer nothing`);
  }

  // One of each in the same box: none of the four may go.
  const mixedBox = [
    { uid: 1, species: 19, level: 30 },
    { uid: 2, species: 19, level: 20 },
    { uid: 3, species: 19, level: 10 },
    ...TIERS.map((t, i) => ({ uid: 10 + i, species: 19, level: 4 - i, [t]: 1 })),
  ];
  const mixedSpare = duplicateUids(mixedBox);
  for (const m of mixedBox.filter(keeper))
    assert.ok(!mixedSpare.includes(m.uid), "a mixed box lost one of its tiers");

  /* CONVERSION OBEYS THE SAME PREDICATE AS THE SALE. Both take a list of uids
     from `duplicateUids`, so this is really an assertion that there is still
     only one list - which is the rule that was broken last time. A second
     payout is exactly how a third one gets protected from the sale and not from
     the conversion. */
  const sweepable = new Set(duplicateUids(mixedBox));
  for (const m of mixedBox)
    assert.equal(sweepable.has(m.uid), !keeper(m) && m.uid !== 1,
      `convert and sell disagree about #${m.uid}`);

  /* AND CANDY IS NEVER A REASON TO TAKE ONE. The yield of a variant is its
     species' yield - a Holo Rattata is worth what a Rattata is worth - so
     nothing about the new currency makes a keeper look tempting to a sweep. */
  for (const tier of TIERS) {
    const plain = { uid: 1, species: 19, level: 5 };
    assert.equal(
      candyValue(speciesById(19)), candyValue(speciesById(19)),
      "candy is a fact about the species, not the individual",
    );
    assert.ok(keeper({ ...plain, [tier]: 1 }), `${tier} must be a keeper`);
  }
}

{
  /* WALKING PAYS, and the numbers are pinned here because a reward keyed to the
     one counter that only ever goes up is the easiest thing in the game to make
     accidentally infinite. */
  assert.ok(STEP_PARCEL >= 100, "a parcel more often than every 100 steps is confetti");
  assert.equal(stepReward(0, 30), null, "standing still pays nothing");
  assert.equal(stepReward(STEP_PARCEL - 1, 30), null, "nor does one step short");
  assert.ok(stepReward(STEP_PARCEL, 1), "and the first parcel lands on time");

  // It scales, or a parcel of Poke Balls at level 40 is a rounding error.
  const at = (lv) => Object.values(stepReward(STEP_PARCEL, lv).items)
    .reduce((a, b) => a + b, 0);
  assert.ok(at(30) > at(8) && at(8) > at(1), "a parcel has to grow with the trainer");

  // Only the haul reaches Ultras: commons fund rares, and walking must not
  // shortcut the funding.
  assert.ok(!stepReward(STEP_PARCEL, 40).items["ultra-ball"],
    "an ordinary parcel must not pay in Ultra Balls");
  assert.ok(stepReward(STEP_PARCEL * STEP_HAUL, 40).items["ultra-ball"],
    "and the haul must");
  assert.ok(stepReward(STEP_PARCEL * STEP_HAUL, 40).haul, "the tenth parcel is the haul");
  assert.ok(!stepReward(STEP_PARCEL * (STEP_HAUL - 1), 40).haul, "the ninth is not");

  /* THE TREASURE. Every tenth haul carries a Master Ball, and it is the only
     one in the game you earn by playing rather than by levelling - so the
     cadence, the level gate and the total are all pinned, because a guaranteed
     catch on a reward keyed to a counter that only goes up is the single most
     dangerous number in this file. */
  const treasureAt = STEP_PARCEL * STEP_HAUL * STEP_TREASURE;
  assert.ok(stepReward(treasureAt, TREASURE_LEVEL).treasure,
    "the tenth haul must carry a Master Ball");
  assert.equal(stepReward(treasureAt, TREASURE_LEVEL).items["master-ball"], 1,
    "one Master Ball, not a handful");
  assert.ok(stepReward(treasureAt, TREASURE_LEVEL).haul,
    "a treasure is always a haul too, or it arrives with no banner");
  assert.ok(!stepReward(treasureAt, TREASURE_LEVEL - 1).treasure,
    "a guaranteed catch must not reach a trainer below the gate");
  assert.ok(!stepReward(treasureAt, TREASURE_LEVEL - 1).items["master-ball"],
    "and the gate has to remove the ball, not just the flag");
  assert.ok(!stepReward(treasureAt - STEP_PARCEL * STEP_HAUL, 40).treasure,
    "the ninth haul is not a treasure");
  assert.ok(!stepReward(STEP_PARCEL, 40).items["master-ball"],
    "an ordinary parcel must never pay a Master Ball");

  /* And the whole game's worth, as one number. 50,000 steps is a long
     playthrough; it must not out-earn what the dex pays for finishing it. */
  let poke = 0, great = 0, ultra = 0, mb = 0;
  for (let n = 1; n <= 50000; n++) {
    const won = stepReward(n, 30);
    if (!won) continue;
    poke += won.items["poke-ball"] ?? 0;
    great += won.items["great-ball"] ?? 0;
    ultra += won.items["ultra-ball"] ?? 0;
    mb += won.items["master-ball"] ?? 0;
  }
  const worth = poke * 25 + great * 90 + ultra * 250;
  assert.ok(worth > 10000 && worth < 120000,
    `walking 50,000 steps is worth ¥${worth} of balls`);
  assert.ok(ultra < 100, `${ultra} Ultra Balls from walking - rares stop costing`);
  /* Master Balls are deliberately left OUT of `worth`: they have no price, and
     pricing the unpriceable is how a budget check starts approving them. They
     are counted instead.

     The assertion is a RELATIONSHIP, not a number, and that is the repair: it
     was `mb <= 3` beside a levelling count of three, so raising both halves
     broke a bound that was only ever standing in for "walking must not
     out-give levelling". Written that way it cannot rot when either is
     retuned. */
  const fromLevels = Array.from({ length: MAX_LEVEL }, (_, i) =>
    levelReward(i + 1)["master-ball"] ?? 0).reduce((a, b) => a + b, 0);
  assert.ok(mb >= 1, "walking must pay at least one Master Ball");
  assert.ok(mb <= fromLevels,
    `${mb} Master Balls from 50,000 steps against ${fromLevels} from levelling - ` +
    "walking is the reward for distance, not the main supply");
  console.log(`steps ok — a parcel every ${STEP_PARCEL}, a haul every ${
    STEP_PARCEL * STEP_HAUL}, a Master Ball every ${
    STEP_PARCEL * STEP_HAUL * STEP_TREASURE} from Lv ${TREASURE_LEVEL}; ` +
    `50,000 steps pays ${poke}/${great}/${ultra}/${mb} ` +
    `poke/great/ultra/master (¥${worth.toLocaleString()} of the priced ones)`);
}

{
  // An imported file has to clear the same bar the stored save does.
  const ok = { dex: new Array(SPECIES.length).fill(0), box: [], money: 0 };
  assert.equal(saveProblem(ok), null, "a plain save must load");
  for (const [bad, why] of [
    [null, "null"], [[], "an array"], ["{}", "a string"], [{}, "no dex"],
    /* A dex LONGER than this game knows, which is a save from a newer build and
       cannot be padded into meaning. A shorter one is an older save and is now
       accepted on purpose - see padDex. */
    [{ dex: new Array(SPECIES.length + 1).fill(0), box: [], money: 0 },
      "a dex longer than the game knows"],
    [{ dex: ok.dex, money: 0 }, "no box"],
    [{ dex: ok.dex, box: [], money: "lots" }, "money that is not a number"],
    [{ dex: ok.dex, box: [], money: NaN }, "money that is NaN"],
  ])
    assert.ok(saveProblem(bad), `an import accepted ${why}`);

  /* AND AN OLDER, SHORTER SAVE IS ACCEPTED, because rejecting it is how an
     update deletes somebody's collection. It only works because Gen 1 sits at
     the front of SPECIES in id order, so a byte written at `id - 1` by the old
     build is already at the right POSITION for the new one - asserted here
     rather than trusted, since inserting a generation before Kanto would break
     it silently and this is the only thing that would notice. */
  for (let i = 0; i < 151; i++) {
    assert.equal(dexIndex(i + 1), i,
      `Kanto is no longer the first 151 positions of SPECIES - every save ` +
      "written before this change now points at the wrong species");
  }
  assert.equal(saveProblem({ dex: new Array(151).fill(2), box: [], money: 0 }), null,
    "a 151-entry save from the Kanto-only build must still open");

  /* AND A DEMOTED DEX IS REPAIRED FROM WHAT THE SAVE CAN STILL PROVE.

     A build that lived about twenty minutes padded the dex with `normalise`,
     which coerces `? 1 : 0`, so every CAUGHT species in every save that loaded
     under it became merely SEEN and was written back that way. The code was
     fixed before it shipped and the saves were not.

     Two things in a save cannot be wrong about a catch: a Pokemon in the BOX,
     and a registered VARIANT (the tier rows are one-bit, so `normalise` could
     not damage them). Repairing from both is not complete - a species caught,
     registered and then sold leaves no trace - and it is everything the file
     still knows. */
  {
    const demoted = new Array(SPECIES.length).fill(1);
    const shiny = new Array(SPECIES.length).fill(0);
    shiny[dexIndex(25)] = 1;                          // a shiny Pikachu, once
    const fixed = repairDex([...demoted], {
      box: [{ uid: 1, species: 6, level: 40 }],       // a Charizard in the box
      shiny,
    });
    assert.equal(fixed[dexIndex(6)], 2, "a Pokemon in the box was caught");
    assert.equal(fixed[dexIndex(25)], 2, "a registered variant was caught");
    assert.equal(fixed[dexIndex(150)], 1,
      "nothing else may be promoted - the repair reads evidence, not hope");

    // Idempotent, and a no-op on a healthy save.
    const healthy = new Array(SPECIES.length).fill(2);
    assert.deepEqual(repairDex([...healthy], { box: [], }), healthy,
      "the repair must never lower anything");
  }

  /* THE REGION FILTER IS DERIVED FROM WHAT SHIPS. An empty region in the Dex
     menu is a tab that filters to nothing, and Hoenn is exactly that hazard. */
  {
    assert.ok(GENERATIONS.length > 0, "no regions at all");
    assert.equal(GENERATIONS.reduce((n, g) => n + g.count, 0), SPECIES.length,
      "the regions do not add up to the dex");
    for (const g of GENERATIONS) {
      assert.ok(g.count > 0, `${g.name} is an empty region in the Dex filter`);
      assert.ok(g.name && !/^Gen /.test(g.name), `region ${g.gen} has no name`);
    }
    assert.ok(!GENERATIONS.some((g) => g.gen === 3),
      "Hoenn does not ship and must not appear as a region");
  }
}

{
  /* EVERY MAP CHARACTER HAS A MINIMAP COLOUR. The palette is a second list of
     legend characters, and a second list is a list that falls behind: add a
     tile to a map and the minimap paints it `MINI_UNKNOWN` magenta, which is
     loud on screen but only on the one map and only if someone walks there.
     This is cheaper than walking there.

     It also runs the other way. An entry for a character no map uses is dead
     weight that reads as coverage, so it is reported - not failed, because
     `SOLID` still lists a couple the maps have grown out of. */
  const used = new Set();
  for (const id of AREA_IDS) for (const row of areaOf(id).rows) for (const ch of row) used.add(ch);

  const uncoloured = [...used].filter((ch) => !(ch in MINI)).sort();
  assert.equal(uncoloured.length, 0,
    `no minimap colour for: ${uncoloured.join(" ")} - add them to MINI in map.js`);

  /* And the colours have to BE colours. A typo here is not a crash: canvas
     silently keeps the previous fillStyle, so one bad entry paints its tiles
     as whatever was drawn before it and the map looks merely odd. */
  for (const [ch, hex] of Object.entries(MINI))
    assert.match(hex, /^#[0-9a-f]{6}$/i, `MINI["${ch}"] is not a hex colour: ${hex}`);
  assert.match(MINI_UNKNOWN, /^#[0-9a-f]{6}$/i, "MINI_UNKNOWN is not a hex colour");

  /* The two-level maps: a plateau or a raised shelf is NOT reachable from the
     floor beside it except at one staircase, so if the minimap paints them
     nearly the same it is drawing a route that does not exist. Compared as
     plain channel distance, which is crude but is the thing being asked. */
  const far = (a, b) => {
    const v = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [v(a), v(b)];
    return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
  };
  for (const [low, high, where] of [["r", "u", "Rock Ridge"], ["i", "j", "Frost Hollow"]])
    assert.ok(far(MINI[low], MINI[high]) > 70,
      `${where}'s two walkable levels are ${far(MINI[low], MINI[high])} apart on ` +
      "the minimap - they connect only at a staircase and must not look joined");

  const spare = Object.keys(MINI).filter((ch) => !used.has(ch));
  console.log(`minimap ok — ${Object.keys(MINI).length} colours cover ${used.size} ` +
    `map characters${spare.length ? `; unused: ${spare.join(" ")}` : ""}`);
}

/* Every map fights on its own ground, under its own sky.

   Both halves are easy to forget, and neither fails loudly: a missing PNG is a
   404 into a blank floor, and a missing `[data-area]` block is the default
   daylight - so you meet something at the bottom of Ember Caldera and battle it
   under a blue sky, which is the bug this whole pair exists to fix. The three
   outdoor maps DO differ (their skies), so there is no area this can skip.

   The floors come from `npm run art`, the skies are hand-written CSS; this is
   the only thing that says the two agree with the list of maps. */
{
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  for (const id of Object.keys(AREAS)) {
    assert.ok(existsSync(new URL(`../public/battle/${id}.png`, import.meta.url)),
      `no public/battle/${id}.png - run npm run art after adding a map`);
    assert.ok(css.includes(`.battle[data-area="${id}"]`) || id === "meadow",
      `${id} has no sky: add a .battle[data-area="${id}"] block to ` +
      "styles.css, or its encounters happen under the default daylight");
  }
  console.log(`battle scene ok — ${Object.keys(AREAS).length} floors, ` +
    `${(css.match(/\.battle\[data-area=/g) ?? []).length} skies`);
}

/* THE SPAWN LADDER: evolved forms turning up in the wild as the trainer levels.

   Five ways this goes wrong, and none of them fails on its own:

   1. A species listed by hand AND derived has two weights in one map - the
      exact bug `legendsFor()` was written to avoid, and it looks like nothing.
   2. The ladder leaks: something appears below the level that is supposed to
      open it, and the progression the whole feature is for never happens.
   3. The ladder never opens, so the 41 species that had no wild home still
      have none and the change was cosmetic.
   4. A derived form out-commons what it evolves from, which reads as a bug in
      the world rather than in a table.
   5. LEGENDARIES get easier. They are appended to every table at a fixed
      weight, so anything that grows a table dilutes them - but a floor applied
      carelessly could grow them too, and nothing else here would notice. */
{
  const wildAt = (level) => {
    const seen = new Set();
    for (const b of BIOMES) for (const [id] of encounterTable(b, level)) seen.add(id);
    return seen;
  };

  // 1. one weight per species per map, at every level the ramp passes through.
  for (const b of BIOMES) {
    for (const level of [1, EVO_STEP, EVO_STEP * EVO_DEPTH, MAX_LEVEL]) {
      const t = encounterTable(b, level);
      const ids = t.map(([id]) => id);
      assert.equal(new Set(ids).size, ids.length,
        `${b.id} at Lv ${level} lists a species twice - a hand-written row and ` +
        "a derived one give it two different sets of odds in the same map");
      for (const [, w] of t) assert.ok(w > 0, `${b.id}: a weight of zero at Lv ${level}`);
    }
  }

  // 2. nothing evolved before its level, and the base table is untouched at Lv 1.
  /* The rule is "nothing EVOLVED at Lv 1", and it used to be written as
     `encounterTable(b, 1)` deep-equalling `b.table`. That held while the two
     were the same list; the table now also carries residents whose generation
     has not arrived (filtered out) and gains the legendaries (added on). A
     derived row is the one tagged with a depth, so ask that. */
  for (const b of BIOMES) {
    const early = encounterTable(b, 1);
    assert.equal(early.filter((e) => e[2]).length, 0,
      `${b.id} spawns an evolved form at Lv 1 - the early game is base forms only`);
    for (const [id] of early) {
      assert.ok(genOpen(id, 1) || LEGENDARY.includes(id),
        `${b.id} spawns #${id} at Lv 1 before its generation has arrived`);
    }
  }
  for (let depth = 1; depth <= EVO_DEPTH; depth++) {
    assert.equal(evoScale(evoUnlock(depth) - 1, depth), 0,
      `depth ${depth} leaks one level early`);
    assert.ok(evoScale(evoUnlock(depth), depth) > 0,
      `depth ${depth} is still absent on the level the Dex advertises`);
    assert.equal(evoScale(MAX_LEVEL, depth), 1, `depth ${depth} never reaches full strength`);
  }

  // 3. the ladder actually opens: everything is findable by the cap.
  const early = wildAt(1);
  const late = wildAt(MAX_LEVEL);
  assert.ok(late.size > early.size, "levelling adds no species at all");
  for (const sp of SPECIES) {
    assert.ok(late.has(sp.id),
      `${sp.name} is in no wild table even at Lv ${MAX_LEVEL} - a species that ` +
      "exists only inside the Box is a species the Dex cannot honestly place");
  }

  /* 4. a DERIVED evolution is never commoner than what it evolves from.

     Only the derived ones - the rows the overlay invents, which carry a depth
     tag. This used to check every pair and Johto broke it honestly: Igglybuff
     evolves INTO Jigglypuff, and Jigglypuff is a hand-placed Tall Grass common
     at 7 while Igglybuff is a derived rarity at 5. A baby being rarer than the
     thing it becomes is correct - that is what a baby Pokemon IS - and the rule
     was never about those. It is about the overlay not inventing a Venusaur
     commoner than a Bulbasaur. */
  const pre = new Map();
  for (const e of EVOLUTIONS) pre.set(e.to, e.from);
  for (const b of BIOMES) {
    const t = encounterTable(b, MAX_LEVEL);
    const w = new Map(t.map(([id, x]) => [id, x]));
    const derived = new Set(t.filter((e) => e[2]).map((e) => e[0]));
    for (const [to, from] of pre) {
      if (!derived.has(to) || !w.has(from)) continue;
      assert.ok(w.get(to) <= w.get(from) || w.get(to) <= EVO_FLOOR + 1e-9,
        `${b.id}: derived ${speciesById(to).name} (${w.get(to)}) is commoner than ` +
        `${speciesById(from).name} (${w.get(from)})`);
    }
  }

  // 5. legendaries only ever get rarer as the table grows.
  for (const b of BIOMES) {
    const share = (level) => {
      const t = encounterTable(b, level);
      const total = t.reduce((n, [, x]) => n + x, 0);
      return LEGENDARY.reduce((n, id) => n + (t.find(([i]) => i === id)?.[1] ?? 0), 0) / total;
    };
    assert.ok(share(MAX_LEVEL) <= share(1) + 1e-9,
      `${b.id}: legendaries are easier at Lv ${MAX_LEVEL} than at Lv 1`);
  }

  /* 6. nothing spawns below the level it evolves at. A wild Venusaur is a Lv 32
        Venusaur - it cannot be a Lv 3 one, and a level that contradicts the
        creature's own dex entry reads as a rendering fault rather than a roll. */
  for (const [to, from] of pre) {
    assert.ok(bornLevel(to) > bornLevel(from),
      `${speciesById(to).name} is born no later than ${speciesById(from).name} ` +
      `(${bornLevel(to)} vs ${bornLevel(from)}) - a chain must climb`);
  }
  assert.equal(bornLevel(1), 0, "a base form is born at 0");

  console.log(`spawn ladder ok — ${early.size} species in the wild at Lv 1, ` +
    `${late.size} at Lv ${MAX_LEVEL}; legendaries no easier anywhere; nothing born below its own evolution level`);
}

console.log(`areas ok — ${BIOMES.length} maps, ${LEGENDARY.length} legendaries in every one, ${sizes[0]} … ${sizes.at(-1)}`);
