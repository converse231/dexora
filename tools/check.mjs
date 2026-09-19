// node tools/check.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { SPECIES, isForm } from "../src/data/dex.js";
import { evoCycleFrames, EVO_SWAPS, SCALE_MAX } from "../src/game/evocycle.js";
import {
  STATS, MAX_RANK, emptyStats, rank, spentPoints, freePoints, earnedPoints,
  canSpend, catchMult, stepScale, xpScale, pricedAt, valuedAt, weighted,
  rarityPower, sellScale, priceScale, RARITY_FLOOR,
} from "../src/game/trainer.js";
import {
  catchChance, fleeChance, shakesFor, resolveThrow, NEVER_CERTAIN, GUARANTEED,
  NEVER_HOPELESS,
} from "../src/catch.js";
import {
  DAY_STEPS, PHASES, hourAt, phaseAt, isNight, intoPhase, timeLabel,
} from "../src/game/clock.js";

const near = (a, b) => Math.abs(a - b) < 0.005;

/* SOURCE-READING ASSERTIONS STRIP COMMENTS FIRST, always. The rule is
   about what the CODE does; the prose absolutely should name the thing
   being forbidden, and the repel assertion below failed on the comment
   explaining itself the first time it was written. A test that forbids
   documenting itself is a test nobody keeps. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* How many characters the shop's description slot actually holds. Measured in
   a rendered shop at the tightest the row ever gets (169px, next to "you have
   12"), not estimated - the same mistake the 21-character ball hint made, and
   for the same reason: the COUNT'S DIGITS share the line. */
const BLURB_FITS = 27;

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
  TREASURE_LEVEL, liveMult, PLAIN_BALLS, variantOf, PLAIN_MULT,
  ballOrder, promoteBall, defaultBall,
  FIELD, FAMILIES, fieldById, BERRIES, berryById, artOf,
  berryCatch, berryCalm, berryXp, berryRoom, HONEY_MEETS,
} from "../src/game/items.js";
import {
  dailyFor, describe, advance, isYesterday, streakMult, reward,
  QUEST_TYPES, QUEST_SHARE, GOALS, STREAK_CAP,
} from "../src/game/daily.js";
import {
  ENCLOSED, speciesById, dexIndex, GEN_UNLOCK, genOpen, LEGEND_SHARE,
  LEGEND_EACH, LEGEND_CEIL,
  GENERATIONS, pityBoost, PITY_AFTER, PITY_RAMP, PITY_CAP,
  LIFT_CEILING, hasOrigin, tiersFor, ART_GEN, baseArtGen, bandFor,
  LEGEND_HOME, LEGEND_HAUNT, legendTier, LAYOUTS, layoutIds,
  GEN_FIRST, GEN_STEP,
  wildBand, WILD_SPAN, WILD_STEP, rollSize, sizeOf, sizeTag, measured,
  SIZE_MIN, SIZE_MAX, ENCOUNTER_RATE,
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

  /* WHICH BALL EACH NUMBER KEY THROWS IS THE PLAYER'S, and the whole feature
     is three pure functions, so this is where it can be pinned rather than
     poked at through a rendered rail.

     `ballOrder` is a PREFERENCE applied to the shipped list, not a ranking of
     every ball - so it has to come back complete and unduplicated whatever it
     is handed, because it is handed a `localStorage` string that anyone can
     edit and a half-written value can truncate. A bad entry there taking a
     key away from a real ball is the failure being bought off here. */
  {
    const ids = (list) => list.map((b) => b.id);
    const junk = [
      undefined, null, "poke-ball", [], {}, [null, 7, {}],
      ["not-a-ball", "poke-ball", "poke-ball"],
      ["timer-ball", "timer-ball", "great-ball"],
    ];
    for (const bad of junk) {
      const got = ballOrder(bad);
      assert.deepEqual([...ids(got)].sort(), [...ids(BALLS)].sort(),
        `ballOrder(${JSON.stringify(bad)}) did not return every ball exactly once`);
    }
    assert.deepEqual(ballOrder([]), BALLS, "an empty preference is not the shipped order");

    /* PROMOTING MOVES ONE BALL AND NOTHING ELSE. That is what makes repeated
       presses able to reach any arrangement at all - if the rest resorted,
       the chip would be a shuffle rather than a control. */
    for (const ball of BALLS) {
      const after = ballOrder(promoteBall([], ball.id));
      assert.equal(after[0], ball, `promoting ${ball.id} did not put it first`);
      assert.deepEqual(ids(after.slice(1)), ids(BALLS.filter((b) => b !== ball)),
        `promoting ${ball.id} reordered the balls behind it`);
    }
    // And promoting twice is promoting once - no drift, nothing accumulated.
    const twice = promoteBall(promoteBall([], "timer-ball"), "timer-ball");
    assert.deepEqual(ballOrder(twice), ballOrder(promoteBall([], "timer-ball")),
      "promoting the same ball twice is not the same as promoting it once");

    /* WHAT A BARE THROW PICKS UP. Space and the pad's A call this one
       function, so the two cannot drift - which is the only reason the pad is
       allowed to have an action the keyboard has. */
    const held = { "poke-ball": 5, "timer-ball": 3, "master-ball": 2 };
    assert.equal(defaultBall(held, [])?.id, "poke-ball",
      "with no preference a bare throw stopped using the cheapest ball held");
    assert.equal(defaultBall(held, ["timer-ball"])?.id, "timer-ball",
      "a bare throw ignored the ball on key 1");
    assert.equal(defaultBall({ "poke-ball": 5 }, ["timer-ball"])?.id, "poke-ball",
      "a bare throw reached for a key-1 ball the player does not hold");
    assert.equal(defaultBall({}, ["timer-ball"]), null,
      "an empty bag produced a ball to throw");

    /* AND NEVER A BALL THAT CANNOT FAIL. Throwing a Master Ball ENDS the
       encounter, so it is the one press in the game that cannot be taken
       back - and the arrangement is now settable by tapping a tile on a
       phone. The first version of this rule said `forSale`, which does
       nothing, because the shop sells Master Balls; this assertion is what
       said so. It is still reachable deliberately, and the fallback still
       finds it when there is genuinely nothing else in the bag. */
    assert.equal(defaultBall(held, ["master-ball"])?.id, "poke-ball",
      "the Master Ball became the ball a bare throw uses - one stray tap and " +
      "the rarest item in the game is gone");
    assert.equal(defaultBall({ "master-ball": 1 }, [])?.id, "master-ball",
      "with nothing else in the bag a Master Ball is not throwable at all");

    /* THREE SCREENS, ONE ANSWER. The rail prints the key, the key handler
       throws on it, and the pad and the touch sheet draw the default - and a
       rail that advertises key 3 over a key that throws something else is
       unfalsifiable from the outside. Asserted against the source because
       nothing fails at runtime when one of them re-derives it. */
    const reads = {
      "App.jsx": ["ballOrder", "defaultBall"],
      "ui/BallRail.jsx": ["ballOrder"],
      "ui/Pad.jsx": ["defaultBall"],
      "ui/Bag.jsx": ["ballOrder"],
    };
    for (const [f, wants] of Object.entries(reads)) {
      const src = stripComments(
        readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8"));
      for (const fn of wants) {
        assert.ok(src.includes(fn), `${f} no longer goes through ${fn}`);
      }
      assert.ok(!/BALLS\.indexOf/.test(src),
        `${f} indexes the SHIPPED ball list again - that is everybody's order, ` +
        `not this player's`);
    }
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
  /* `artOf`, not `i.id`: the three coloured honeys share the one honey jar on
     purpose - a Holo Honey is that picture wearing the foil a Holo Pokemon
     wears - so asking for `honey-holo.png` would fail on art that is correct
     and complete. Everything else is still its own id. */
  const missing = ALL_ITEMS
    .filter((i) => !existsSync(new URL(`../public/items/${artOf(i)}.png`, import.meta.url)))
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

/* THE MASTER BALL IS BUYABLE, AND THE PRICE IS THE ONLY THING BALANCING IT.
   It never fails, so it cannot be balanced by odds; it used to be balanced by
   being unbuyable at all. Now it is balanced by costing more than any other way
   of getting the same result, and that is a claim about two numbers that move
   whenever the economy is retuned - so both are measured here rather than
   asserted as literals.

   FLOOR: the cheapest honest route to a rate-3 legendary. Whatever the shelf
   costs to grind a legendary out of, the Master Ball has to cost a large
   multiple of it - at or below that price it is simply the efficient way to
   catch a legendary and the entire ball ladder inverts. */
const master = ballById("master-ball");
assert.equal(catchChance(1, master.mult), 1, "a Master Ball always catches");
assert.equal(catchChance(255, master.mult), 1, "even against a legendary");
{
  // Each conditional ball at its best case, the way the ball suite prices them.
  const best = { areaId: [...ENCLOSED][0], types: ["water"], known: true, level: 4, throws: 9 };
  let cheapest = Infinity, via = null;
  for (const b of SHOP_BALLS) {
    if (b === master) continue;
    const hit = catchChance(3, liveMult(b, best));
    const flee = fleeChance(3);
    const resolve = hit + (1 - hit) * flee;
    const money = (1 / resolve / (hit / resolve)) * b.price;
    if (money < cheapest) { cheapest = money; via = b.short; }
  }
  const over = master.price / cheapest;
  assert.ok(over > 10,
    `a Master Ball is only ${over.toFixed(1)}x the cheapest route to a legendary ` +
    `(${via}, ¥${Math.round(cheapest)}) - at that price it IS the cheap route`);

  /* CEILING: it still has to be reachable. Priced against what the game
     actually pays, not against the other balls - the best map nets `perEnc` a
     head and a whole playthrough is STEP_TOTAL steps at ENCOUNTER_RATE. A ball
     nobody can afford is the unbuyable one again, wearing a number. */
  /* IMPORTED, NOT RE-DECLARED. This was `const ENCOUNTER_RATE = 0.07` under a
     comment reading "engine.js; the only copy that matters" - true when it was
     written, and false from the day the constant moved to biomes.js and was
     exported. A second copy of the number that decides how often the world
     stops you, in the file whose whole job is catching second copies, and the
     one the Master Ball is priced against. */
  let perEnc = 0;
  for (const b of BIOMES) {
    let tot = 0, w = 0;
    for (const [id, weight] of encounterTable(b, MAX_LEVEL)) {
      const sp = speciesById(id);
      if (!sp) continue;
      const hit = catchChance(sp.rate, PLAIN_MULT);
      const flee = fleeChance(sp.rate);
      const resolve = hit + (1 - hit) * flee;
      tot += weight * ((hit / resolve) * sellValue(sp) - (1 / resolve) * poke.price);
      w += weight;
    }
    perEnc = Math.max(perEnc, tot / w);
  }
  const lifetime = 50000 * ENCOUNTER_RATE * perEnc;
  const share = master.price / lifetime;
  assert.ok(share < 0.5,
    `a Master Ball costs ${(share * 100).toFixed(0)}% of everything a whole ` +
    `playthrough earns (¥${Math.round(lifetime)}) - that is not expensive, that is unbuyable`);
  console.log(`master ball price ok — ¥${master.price} is ${over.toFixed(0)}x the ` +
    `cheapest route to a legendary (${via}, ¥${Math.round(cheapest)}) and ` +
    `${(share * 100).toFixed(0)}% of a playthrough's income`);
}
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

    /* THE FORMS STRIP MUST NOT GIVE A TREATMENT AWAY, AND IT MUST NOT DO IT
       BY NAME. An unheld variant is a flat silhouette on purpose - the shape
       is the hint and the colour is the reward - and twice now that has been
       written as a list of the classes that happened to exist on the day:

         .sf-one:not(.got) .holo-foil { display: none }
         .sf-one:not(.got) .sprite-astral, .sf-one:not(.got) .sprite-holo { ... }

       The first missed the aura and the sparks when `VariantFx` grew from one
       layer to three. The second missed Vivid, Noir and Glitched when the
       ladder went from four tiers to eight - and because every tier's filter
       carries `!important`, those three beat the plain base rule and rendered
       in FULL COLOUR on species nobody had caught. Reported from play.

       So this asserts the SHAPE of the fix rather than its contents, which is
       the only form of it that survives a ninth tier: the strip covers unheld
       art with one rule that names no tier and no layer. Checking the three
       cases that are wrong catches every list, however long. */
    {
      /* Every selector in the file that speaks for an unheld cell. */
      const unheld = [...css.matchAll(/\.sf-one:not\(\.got\)[^,{]*/g)].map((m) => m[0]);

      /* 1. NONE OF THEM MAY NAME A TIER. `sprite-<tier>` is the class the
            enumeration used; a tier's mark class would do the same damage. */
      for (const sel of unheld) {
        assert.ok(!/\.(sprite|mark)-/.test(sel),
          `"${sel.trim()}" names a tier - that list is complete on the day it ` +
          "is written and silently short every day after. One rule, no names");
      }

      /* 2. NOR A LAYER, and the layer names are read out of the component so
            this cannot fall behind it either. */
      const fx = readFileSync(new URL("../src/ui/Sprite.jsx", import.meta.url), "utf8");
      const layers = [...fx.matchAll(/className="([a-z-]+)"/g)].map((m) => m[1])
        .filter((c) => c !== "mark" && !c.startsWith("sprite"));
      assert.ok(layers.length >= 3, "VariantFx's layers are not where this expects them");
      for (const sel of unheld) {
        assert.ok(!layers.some((l) => sel.includes(`.${l}`)),
          `"${sel.trim()}" hides one named layer - VariantFx has ${layers.length}`);
      }
      assert.ok(unheld.some((sel) => /\.sf-art\s*>\s*span\s*$/.test(sel)),
        "nothing hides an unheld cell's effect layers structurally - a Holo " +
        "silhouette would have a rainbow travelling over it");

      /* 3. AND THE SILHOUETTE MUST OUTRANK THE TIER. Every tier declares its
            filter `!important` (an animation outranks a plain declaration, so
            `mon-appear`'s `filter: none` would erase it), so a base rule
            without one loses to all of them - which is exactly how three
            tiers came to show their real colours here. */
      const art = css.indexOf(".sf-one:not(.got) .sf-art img:not(.mark)");
      assert.ok(art >= 0, "the FORMS strip no longer greys out what you do not hold");
      const rule = css.slice(art, css.indexOf("}", art));
      assert.ok(/filter:[^;]*!important/.test(rule),
        "the silhouette's filter is not !important - every tier's is, so every " +
        "tier wins and an uncaught variant shows its real colours");
      assert.ok(/animation:\s*none\s*!important/.test(rule),
        "a Glitched silhouette will stutter in a cell nobody has earned");

      /* 4. NOTHING FETCHES ITS ART OVER THE NETWORK. This used to assert that
            exactly ONE tier did - Showdown, off PokeAPI's CDN - and that the
            FORMS strip guarded against asking for an unheld one, because doing
            so pulled a 67KB GIF per sheet purely to paint it black.

            Showdown ships now, as an 8-frame strip (see build_showdown.py for
            the measurement that chose the format), so the count is zero and
            the old assertion fired on its own success. What replaces it is the
            thing worth keeping: a game that plays with no network should not
            grow a runtime dependency by accident, and a sprite path is exactly
            where one creeps in. */
      const sprite = readFileSync(new URL("../src/ui/Sprite.jsx", import.meta.url), "utf8");
      /* THE RAW SOURCE, AND NOT `stripComments` - which is the usual rule here
         and is wrong for exactly this one check. That helper deletes from `//`
         to end of line, so it eats the `//` of every URL it is pointed at:
         inserting `const CDN = "https://example.com/"` to prove this assertion
         fires left `const CDN = "https:` behind and the assertion passed. A
         comment naming a host in prose is fine; one containing a URL would
         trip this, and that is a trade worth making for a check whose whole
         job is to find a URL. */
      assert.ok(!/https?:\/\//.test(sprite),
        "Sprite.jsx fetches art from a URL - every sprite this game draws is " +
        "in the repo, and local mode is the game rather than a fallback");

      /* AND AN UNHELD SHOWDOWN STILL DRAWS THE ORDINARY SPRITE. The reason
         changed rather than went away: it was about the round trip, and it is
         now about the ANIMATION. A strip renders as a span with `steps()`
         walking it, so the `animation: none` that stops a Glitched silhouette
         stuttering - which names `img` - cannot reach it, and an entry nobody
         has caught would have a black shape idling in it. */
      const sheet = readFileSync(new URL("../src/ui/DexSheet.jsx", import.meta.url), "utf8");
      assert.ok(sheet.includes('t === "showdown" && !got(t) ? null : t'),
        "the FORMS strip asks for an unheld Showdown - a strip animates, so " +
        "the silhouette would idle in a cell nobody has earned");

      /* 5. A MARK IS PROOF OF OWNERSHIP, NEVER A GREYED-OUT LABEL. The strip
            drew all nine marks and desaturated the ones you did not hold
            (`opacity: .35; filter: grayscale(1)`), and four of them came back
            as bug reports - "holo glitched astral and showdown icons are
            broken image".

            They were not broken. Those four marks are FILLED SOLIDS whose
            identity is their colour - a rainbow hexagon, a blue crystal, a
            purple bolt, a blue cone - so greyscale leaves a featureless grey
            blob, which is what a failed image load looks like. The four that
            survived are the ones whose identity is a SILHOUETTE: a ring, a
            four-point star, an eight-point star, and Noir, which is
            achromatic to begin with.

            So the rule is not "make the grey darker" - that only holds until
            the next tier that is a coloured solid. It is that an unheld cell
            draws NO mark: it already names its tier underneath, and a badge
            that appears on every cell says nothing anyway. Asserted from both
            ends, because either alone can be undone. */
      assert.ok(/\{t && got\(t\) && <Mark/.test(sheet),
        "the FORMS strip draws a mark on cells you do not hold - four of the " +
        "eight are coloured solids and grey out into something that reads as " +
        "a broken image");
      assert.ok(!/\.sf-one:not\(\.got\)[^{]*\.sf-badge/.test(css),
        "something is styling the badge on an unheld cell again - there is no " +
        "badge there to style, and a rule for one invites drawing one");
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
  /* The best ball that is not the guaranteed one - the Master Ball is on the
     shelf now, and asking whether IT breaks a 95% ceiling is asking whether it
     still works. */
  const plain = SHOP_BALLS.filter((b) => b.mult < GUARANTEED);
  const best = plain[plain.length - 1];
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

  /* THE TWO ATLASES ARE ONE COORDINATE SYSTEM. `route_top.png` is the upper
     layer of every metatile at the SAME id, which is the whole reason the
     overlay pass needs no lookup table - and it holds only while the two
     images are the same size. Let one gain a row the other does not and every
     id past that point paints somebody else's leaves over the player, which is
     a wrong picture rather than a crash. Compared as bytes here because the
     PNG header is the one place both numbers are written down. */
  {
    const dims = (p) => {
      const b = readFileSync(new URL(p, import.meta.url));
      return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;   // IHDR
    };
    assert.equal(dims("../public/tilesets/route_top.png"),
      dims("../public/tilesets/route.png"),
      "route_top.png is a different size from route.png - the overlay ids no " +
      "longer line up with the atlas; re-run npm run art");
  }

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

  /* EVERY SET THE RENDERER CAN ASK FOR, READ OUT OF THE RENDERER. This was
     `deepEqual(keys, ["fish", "jump", "run", "walk"])` - a typed list of the
     four sets that existed - and it failed the day a fifth was cut from the
     sheet, which is the day it had nothing to say. The rule it was reaching
     for is that the strip carries whatever `drawPlayer` is handed: a set the
     engine names and the sheet lacks falls back to `walk`, so a surfing
     trainer would silently stride across the water. */
  {
    const eng = readFileSync(new URL("../src/game/engine.js", import.meta.url), "utf8");
    const pick = eng.slice(eng.indexOf("set: "), eng.indexOf("frame:"));
    const asked = [...new Set([...pick.matchAll(/"([a-z]+)"/g)].map((m) => m[1]))];
    assert.ok(asked.length >= 4, `only found ${asked.length} sets named in the draw call`);
    for (const name of asked) {
      assert.ok(player.sets[name],
        `the engine draws the "${name}" set and the strip has no such set - ` +
        "drawPlayer falls back to `walk`, so it would look like nothing is wrong");
    }
    assert.deepEqual(Object.keys(player.sets).sort(), [...asked].sort(),
      "the strip carries a set nothing draws, or is missing one that is drawn");
  }
  assert.deepEqual(
    Object.values(player.dirs).sort((a, b) => a - b), [0, 1, 2, 3],
    "the four facings must be four distinct rows");

  /* THE CSS KNOWS THE SHEET'S SIZE AND CANNOT READ IT. `.gate-art` draws the
     trainer for the account gate and the settings picker by scaling the whole
     strip and windowing one frame out of it, so `background-size` has to be
     the strip's real dimensions. It said 256x256, which was true until a fifth
     set was cut from the rip and the strip went to 320 wide - and a background
     scaled to 256 draws everything at 0.8x, so the 16px window showed a
     squashed stand plus four pixels of the next frame. Reported as clipped
     sprites, and nothing failed.

     Two copies of one number, so they are asserted against each other - the
     same reason `tileBase` is checked against `route.json`. */
  {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    const at = css.indexOf(".gate-art {");
    assert.ok(at >= 0, ".gate-art is gone - the trainer picker draws nothing");
    const rule = css.slice(at, css.indexOf("}", at));
    /* `[^)]*` stopped at the inner `var(--z)` paren and never reached the
       second calc. Non-greedy across the lot instead. */
    const size = rule.match(/background-size:\s*calc\((\d+)px[\s\S]*?calc\((\d+)px/);
    assert.ok(size, ".gate-art's background-size is not two calc()s of the sheet");
    assert.equal(Number(size[1]), pngW,
      `.gate-art scales the strip to ${size[1]}px wide and it is ${pngW}px - ` +
      "every frame is drawn at the wrong scale and windows onto the next one");
    assert.equal(Number(size[2]), pngH,
      `.gate-art scales the strip to ${size[2]}px tall and it is ${pngH}px`);
  }

  /* WIDTH AND FRAME COUNT PER SET, measured off the rip's own backing
     rectangles - see build_player. Surf is two poses because it is a paddle
     and not a stride. */
  const want = {
    walk: [16, 3], run: [16, 3], fish: [32, 4], surf: [32, 2], jump: [32, 1],
  };
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
import { AREAS, AREA_IDS, SOLID, LEDGE, walkable, MINI, MINI_UNKNOWN } from "../src/game/map.js";
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
  /* AND A LADDER IS A WAY THROUGH. Mt Moon is three floors sharing one grid,
     sealed from each other in rock and joined only by the real cave's own
     warps - so a fill that only walks reports 1,157 of its 2,391 tiles cut
     off, which is true about walking and false about the map. Both ends of
     every pair, because the engine walks them both ways. */
  const hop = new Map();
  for (const [ax, ay, bx, by] of area.warps ?? []) {
    hop.set(`${ax},${ay}`, [bx, by]);
    hop.set(`${bx},${by}`, [ax, ay]);
  }
  const seen = new Set();
  const stack = [[area.spawn.x, area.spawn.y]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const key = x + "," + y;
    if (seen.has(key) || !walkable(rows, x, y)) continue;
    seen.add(key);
    if (hop.has(key)) stack.push(hop.get(key));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      /* Walking into a ledge ALONG ITS OWN DIRECTION hops it and lands you on
         the far side - `L` going south, `J` going east. From any other side it
         is a wall, which `walkable` already reports. */
      const face = LEDGE[rows[y + dy]?.[x + dx]];
      const over = !!face && face[0] === dx && face[1] === dy;
      stack.push([x + dx * (over ? 2 : 1), y + dy * (over ? 2 : 1)]);
    }
  }
  /* Ledges are one-way, so they are the one thing on a map that can strand you.
     The generator checks the map it draws; this checks the map that shipped. */
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < W; x++) {
      const face = LEDGE[rows[y][x]];
      if (!face) continue;
      const [dx, dy] = face;
      assert.ok(!walkable(rows, x, y), `${b.id}: ledge at ${x},${y} must be solid`);
      assert.ok(walkable(rows, x + dx, y + dy),
        `${b.id}: ledge at ${x},${y} has nothing to land on`);
      /* AN APPROACH IS A RULE FOR A LEDGE WE PLACED. A copied one can run out
         under the treeline - four of the Safari Zone's thirty-six do, the tail
         of a run Emerald drew into a tree mass - and that is decoration rather
         than a trap: nobody can stand above them, so nobody hops them, and the
         rest of the run works. The LANDING above stays unconditional, because
         a ledge with nothing under it is a hop into a wall. */
      assert.ok(area.tiles || walkable(rows, x - dx, y - dy),
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

  /* WHAT ONE LEGENDARY IS WORTH CANNOT DEPEND ON HOW MANY OTHERS EXIST.

     This used to pin the TOTAL share to a constant, which is the right claim
     against a growing TABLE and the wrong one against a growing ROSTER: one
     percent split among everybody means each one's odds fall linearly, so a
     named legendary went from 1 in 3,400 encounters to 1 in 9,000 at a full
     National Dex - more steps than a whole playthrough, for one creature you
     are meant to be able to hunt.

     The equation below is the rule and it carries both halves: the share is
     independent of how big the TABLE got (the original claim, still true) AND
     proportional to how many legendaries are actually OPEN, so per-head odds
     hold. Above `LEGEND_CEIL` it saturates and everything scales down together,
     which is the other failure - 90 legendaries at a fixed per-head share is
     one encounter in 37, and a world that full has none in it. */
  for (const lv of [1, 10, GEN_UNLOCK[2], 30, GEN_UNLOCK[4], MAX_LEVEL]) {
    const t = encounterTable(b, lv);
    const total = t.reduce((n, e) => n + e[1], 0);
    const share = t.filter((e) => LEGENDARY.includes(e[0]))
      .reduce((n, e) => n + e[1], 0) / total;
    const open = LEGENDARY.filter((id) => genOpen(id, lv)).length;
    const want = Math.min(LEGEND_CEIL, LEGEND_EACH * open);
    assert.ok(Math.abs(share - want) < 1e-9,
      `${b.id} at Lv ${lv}: legendaries are ${(share * 100).toFixed(2)}% of finds ` +
      `over ${open} open, not the ${(want * 100).toFixed(2)}% the per-head rule asks`);
    assert.ok(share <= LEGEND_CEIL + 1e-9,
      `${b.id} at Lv ${lv}: legendaries are ${(share * 100).toFixed(2)}% of every ` +
      "encounter - past the ceiling there is nothing rare about one");
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

  /* EVERY SCREEN THAT OFFERS TRAVEL ASKS `areaOpen`, and there are three of
     them now: the engine's own refusal, the Travel panel's padlock, and the Dex
     sheet's WHERE TO LOOK - which became a way to GO there rather than only a
     place name. A menu that offers a map the engine will refuse is worse than
     no menu, and the failure is silent: the button is there, it is pressed,
     and nothing happens. */
  for (const f of ["ui/Travel.jsx", "ui/DexSheet.jsx", "game/engine.js"]) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(/areaOpen\(/.test(src),
      `${f} offers or performs travel without asking areaOpen`);
  }

  console.log(`map ladder ok — ${levels.join(", ")} (Lv ${MAP_FIRST} to ${MAP_LAST}), ` +
    "three screens through one gate");
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
  /* WHAT EACH TRANSCRIPTION WAS REBASED AGAINST, and it is per map rather than
     one number, which is what Route 1 corrected. This asserted every copied map
     against seafoam's base, because for a while Frost Hollow was the only copy
     there was. A map built entirely out of PRIMARY metatiles needs no rebasing
     at all - Route 1 is 49 of its 50, ids unchanged - so it records 0, and 0 is
     a real answer here rather than a missing one. */
  const BASE = {
    frost: () => route.frost.floor - 1,       // seafoam_islands local 1 is the ice
    power: () => route.power.floor - 31,      // power_plant local 31 is the floor
    ridge: () => route.cave.floor - 1,        // Mt Moon: cave local 1 is the floor
    safari: () => route.safari.general,       // Emerald's General, not FireRed's
    cinder: () => route.safari.general,       // the same primary, and lavaridge
    // The first map drawn against a pokefirered primary that is not
    // General, so its base is that primary's own block rather than a
    // secondary's - 748 of its metatiles are `building` ids.
    mansion: () => route.mansion.building,
  };
  /* The ceiling is the highest id the atlas actually hands out, read off the
     manifest rather than named. It used to be `forest.fringeTop` because that
     was the last tile baked; baking the conifer crowns after it made that bound
     wrong by two, and a bound that quietly stops being the top is worse than no
     bound - it passes everything. */
  const top = Math.max(...JSON.stringify(route).match(/\d+/g).map(Number));
  for (const id of AREA_IDS) {
    const area = AREAS[id];
    if (!area.tiles) continue;
    assert.equal(area.tiles.length, area.rows[0].length * area.rows.length,
      `${id}: the transcribed tile ids do not cover the map`);
    assert.ok(BASE[id], `${id} is transcribed but no expected atlas base is ` +
      `recorded for it - add one beside frost and power`);
    assert.equal(area.tileBase, BASE[id](),
      `${id}: transcribed against atlas base ${area.tileBase} but the atlas now ` +
      `wants ${BASE[id]()} - re-run npm run map`);
    assert.ok(area.tiles.every((t) => t >= -1 && t <= top),
      `${id}: a transcribed tile id falls outside the atlas`);
  }
}

/* SORTED, because the print reads as a range. It was AREA_IDS order and
   showed the first and last map, so "64x80 ... 120x80" hid a 40x109 and a
   49x40 between them - a log line that states something untrue is worse
   than one that states nothing. */
const sizes = AREA_IDS
  .map((id) => AREAS[id].rows)
  .sort((a, b) => a.length * a[0].length - b.length * b[0].length)
  .map((r) => `${r[0].length}x${r.length}`);
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
  lockedTiers, ROSETTE_NEED, TIER_TELL,
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
  /* A LITERAL IN AN ASSERTION IS NOT A RULE, and this one was four tier names
     typed out - so it failed the day the ladder grew, which is the one day it
     had nothing to say. What it actually guards is two things.

     ONE: Origin and Holo tie on odds, so the order between them looks free and
     is not - Origin is the DRAWING and Holo is the finish over it, and a row
     that reads as progress has to put the drawing first.

     TWO: both screens that show a row of tiers must take their order from
     `TIERS` rather than listing them. The Forms strip had its own copy and it
     drifted exactly as predicted: four tiers missing and an `origin`-by-name
     filter that knew about no other absent artwork. */
  const kindestFirst = [...TIERS].reverse();
  assert.ok(kindestFirst.indexOf("origin") < kindestFirst.indexOf("holo"),
    "Holo is drawn before Origin - the finish cannot come before the drawing it sits on");
  /* THREE SCREENS NOW. `Variants.jsx` is the rare-forms dialog, which
     draws every tier at once and is the only place in the game that reads
     the odds out loud - so it is the one with the most to get wrong. */
  for (const f of ["Dex.jsx", "DexSheet.jsx", "Variants.jsx"]) {
    const body = readFileSync(new URL(`../src/ui/${f}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(/\[\.\.\.(TIERS|tiersFor\(id\))\]\.reverse\(\)/.test(body),
      `${f} no longer takes its tier order from TIERS - it will drift`);
  }
  /* THE TABLE QUOTES THE CONSTANTS, and that is the rule - not which four
     constants they happened to be. This was a typed-out list of the tiers as
     they stood, so the day a fifth arrived it failed for the one reason that
     is not a bug. What matters is that no row carries a bare number: the
     named exports are what the rest of the game imports, and a literal in
     the table is a second place the odds live. */
  {
    const src = readFileSync(new URL("../src/game/biomes.js", import.meta.url), "utf8");
    const table = src.slice(src.indexOf("export const TIER_ODDS = ["));
    const rows = table.slice(0, table.indexOf("];") + 2)
      .split("\n").filter((l) => l.includes("[") && l.includes(","));
    assert.equal(rows.length, TIER_ODDS.length,
      `TIER_ODDS has ${TIER_ODDS.length} tiers but ${rows.length} readable rows`);
    for (const row of rows) {
      assert.ok(/\[\s*"[a-z]+",\s*[A-Z_]+_ODDS\s*\]/.test(row.trim()),
        `a TIER_ODDS row carries a bare number instead of its named constant: ${row.trim()}`);
    }
    // And every named constant is actually reachable from the table.
    for (const [tier] of TIER_ODDS) {
      assert.ok(rows.some((r) => r.includes(`"${tier}"`)),
        `${tier} is in TIER_ODDS at runtime but not in the source table`);
    }
  }

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
    // Named by POSITION, not by tier: "astral" was typed here and stopped
    // being the rarest the day two rarer ones arrived.
    assert.equal(rollVariant(() => 0), TIERS[0], "a zero roll must be the rarest tier");
    assert.equal(rollVariant(() => 1), null, "a one roll must be nothing at all");
  }

  /* THE ORIGIN GATE IS GONE, and this suite is what is left of the one that
     guarded it. It used to assert three silent failures - a gate that never
     opened, one that was never closed, and one that leaked the tier it held
     back. There is no gate now: Origin rolls like every other tier.

     ASSERTED AS AN ABSENCE, because that is the only way to state "nobody
     brought it back". `lockedTiers` still exists and still locks, but only on
     whether the ARTWORK is there - so its signature is the test: a second
     argument would mean somebody had reattached it to the dex. */
  {
    const src = readFileSync(new URL("../src/game/biomes.js", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    assert.ok(!/genComplete|originReady/.test(src),
      "the Origin gate is back in biomes.js - Origin is meant to roll like any other tier");
    assert.ok(/function lockedTiers\(speciesId\)/.test(src),
      "lockedTiers takes a dex again, which means the earn-it gate has returned");

    /* AND THE ROLL REALLY DOES HAND IT OUT. An unreachable tier is the exact
       failure the old suite existed for, pointing the other way. */
    let seed = 7;
    const rng = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let origins = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) if (rollVariant(rng) === "origin") origins++;
    const want = N * ORIGIN_ODDS;
    assert.ok(origins > want * 0.6 && origins < want * 1.4,
      `Origin came up ${origins} times in ${N} ungated rolls, expected about ${Math.round(want)}`);

    /* THE ROSETTE IS ANY FOUR, NOT ALL OF THEM. At eight tiers "every one"
       measured 18,039 encounters for a single species against 8,905 at four -
       not a harder mark, a deleted one. Four is 2,374. The number is asserted
       as a BOUND with its reason: below four the mark stops meaning "go wide",
       and at the full count it stops being reachable. */
    assert.ok(ROSETTE_NEED >= 3 && ROSETTE_NEED < TIERS.length,
      `the rosette wants ${ROSETTE_NEED} of ${TIERS.length} tiers - at the full count nobody finishes it`);
    const dex = readFileSync(new URL("../src/ui/Dex.jsx", import.meta.url), "utf8");
    assert.ok(/>= ROSETTE_NEED/.test(dex),
      "the Dex grid is not using ROSETTE_NEED - the rosette and the rule can now disagree");
    console.log(`origin ok — ungated, ${origins} in ${N} rolls; the rosette wants ` +
      `any ${ROSETTE_NEED} of ${TIERS.length}`);
  }

    /* ORIGIN NEEDS AN OLDER DRAWING, AND A THIRD OF THE DEX HAS NONE.

   The tier's tell is the ARTWORK, which only works while the ordinary sprite
   is a LATER drawing than the debut one. Kanto and Johto ship FireRed art over
   a Gen I/II debut and the gap is real - measured, a Kanto Origin drops from 13
   colours to 4, which is the Game Boy palette. Sinnoh ships HeartGold art over
   a Diamond/Pearl debut: same era, 13 colours against 14, and it was reported
   from play as "the Gen 4 Origins look the same as the normal ones".

   These assertions exist because that failure was invisible from inside the
   game: the tier rolled, the sprite loaded, the mark appeared, and the only
   thing wrong was that the picture was the same one. */
{
  const originIds = SPECIES.filter((sp) => hasOrigin(sp.id)).map((sp) => sp.id);
  const withoutIds = SPECIES.filter((sp) => !hasOrigin(sp.id)).map((sp) => sp.id);
  assert.ok(originIds.length && withoutIds.length,
    "either every species can wear Origin or none can - neither is this design");

  /* THE RULE MUST MATCH THE ART ON DISK. build_origin.py writes a file only
     for a generation whose debut art is genuinely older, so the set of files
     IS the answer - and if the two ever disagree, one side is handing out a
     tier whose picture does not exist or withholding one that does. */
  const drawn = (id) =>
    existsSync(new URL(`../public/sprites/origin/${id}.png`, import.meta.url));
  const missing = originIds.filter((id) => !drawn(id));
  const spare = withoutIds.filter((id) => drawn(id));
  assert.deepEqual(missing, [],
    `hasOrigin says yes but there is no art: ${missing.slice(0, 5).join(", ")} - run npm run assets`);
  assert.deepEqual(spare, [],
    `art exists for species that cannot wear Origin: ${spare.slice(0, 5).join(", ")} - ` +
    "build_origin.py should have deleted these");

  /* AND `ART_GEN` MUST MATCH WHERE THE BASE SPRITES ACTUALLY COME FROM.
     `hasOrigin` compares a species' debut generation against the generation of
     its ordinary art, and the second half of that is a fact about
     fetch-species.mjs. Two copies of it would drift the day a base-art set
     changes, and the symptom would be Origins that are the same picture. */
  {
    const src = readFileSync(new URL("../tools/fetch-species.mjs", import.meta.url), "utf8");
    /* EVERY BOUNDARY THE FETCHER DRAWS MUST BE A BOUNDARY HERE. It used to pin
       one literal ternary, which broke the moment a third art set arrived.
       `ART_GEN` legitimately has MORE rows than `artFor` has sources - Kalos
       through Paldea all come from PokeAPI's default render, but each species
       is drawn in its OWN generation there, so they need a row each and share a
       source. What must agree is the other direction: wherever the fetcher
       CHANGES source, this table must change generation. */
    const sources = [...src.matchAll(/id <= (\d+) \?/g)].map((m) => Number(m[1]));
    assert.ok(sources.length >= 3,
      `found ${sources.length} art-source splits in fetch-species.mjs - the scan is broken`);
    const rows = new Set(ART_GEN.map(([hi]) => hi));
    for (const at of sources) {
      assert.ok(rows.has(at),
        `fetch-species.mjs changes art source at #${at} and ART_GEN does not - ` +
        "one of them is wrong, and the symptom is Origins that are the same picture");
    }
    // And the three named sets still say what they are.
    assert.ok(/generation-iii\/firered-leafgreen/.test(src) && baseArtGen(1) === 3,
      "ART_GEN says Gen III art for Kanto; the fetcher disagrees");
    assert.ok(/generation-iv\/heartgold-soulsilver/.test(src) && baseArtGen(400) === 4,
      "ART_GEN says Gen IV art for Sinnoh; the fetcher disagrees");
    assert.ok(/generation-v\/black-white/.test(src) && baseArtGen(500) === 5,
      "ART_GEN says Gen V art for Unova; the fetcher disagrees");
  }

  /* The rule itself, stated rather than sampled: an OLDER debut than the art,
     and not a form. `genOf` reads a form through to what it evolves from, so a
     Mega Charizard answers "Gen 1" against Gen IV art and would otherwise
     qualify - and there is no 1996 drawing of a Mega Charizard, because Mega
     Evolution was invented in 2013. A form has exactly one drawing. */
  for (const sp of SPECIES) {
    assert.equal(hasOrigin(sp.id), !isForm(sp.id) && genOf(sp.id) < baseArtGen(sp.id),
      `#${sp.id} disagrees with its own rule`);
  }

  /* THE ROSETTE MUST STAY REACHABLE, and that is now a number rather than a
     feeling. Completion is "caught plus any ROSETTE_NEED variants", so the
     rule is simply that every species can wear at least that many - the
     moment one cannot, the mark is impossible for it rather than hard, which
     is the one badge in the game meant to be earnable by playing long enough.

     It used to read `>= TIERS.length - 1`, which assumed a species could only
     ever be missing ONE tier. A form is missing two (no 1996 drawing, no
     Showdown animation), so that bound failed for the right reason and the
     wrong cause. `tiersFor` is what both the Dex grid and the sheet count
     through. */
  for (const sp of SPECIES) {
    const mine = tiersFor(sp.id);
    assert.ok(mine.length >= ROSETTE_NEED,
      `#${sp.id} can wear only ${mine.length} tiers - the rosette wants ${ROSETTE_NEED}`);
    assert.ok(mine.length <= TIERS.length, `#${sp.id} claims more tiers than exist`);
    assert.ok(mine.every((t) => TIERS.includes(t)), `#${sp.id} claims a tier that is not one`);
    assert.equal(mine.includes("origin"), hasOrigin(sp.id),
      `#${sp.id} disagrees with itself about Origin`);
  }
  assert.ok(tiersFor(withoutIds[0]).length > 0,
    "a species with no Origin must still have tiers to collect");

  /* AND THE ROLL MUST HONOUR IT - `lockedTiers` is what `rollVariant` is
     handed, so this is the only thing standing between a Sinnoh player and an
     Origin that is the ordinary picture. It is an ART check now and nothing
     else; the earn-it gate it used to also carry is gone. */
  {
    assert.ok(!lockedTiers(originIds[0])?.has("origin"),
      "a species WITH an older drawing is being refused Origin");
    assert.ok(lockedTiers(withoutIds[0])?.has("origin"),
      "a species with no older art is being offered Origin anyway");
    const rolled = new Set();
    const rng = (() => { let t = 5; return () => {
      t |= 0; t = (t + 0x6D2B79F5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    }; })();
    for (let i = 0; i < 200000; i++) {
      const got = rollVariant(rng, lockedTiers(withoutIds[0]));
      if (got) rolled.add(got);
    }
    assert.ok(!rolled.has("origin"),
      "Origin rolled for a species that has no older drawing to show");
    /* Locking one tier must not cost any other. `withoutIds[0]` is an
       ordinary species with no older art rather than a form, so Origin is the
       only thing missing - a form would legitimately lose Showdown too. */
    const alsoOff = lockedTiers(withoutIds[0]).size - 1;
    assert.equal(alsoOff, 0, `the species under test also has ${alsoOff} other tier(s) locked`);
    assert.ok(rolled.size >= TIERS.length - 1,
      `locking Origin also took ${TIERS.length - 1 - rolled.size} other tier(s) with it`);
  }

  console.log(`origin art ok — ${originIds.length} species have an older drawing, ` +
    `${withoutIds.length} do not (Gen ${genOf(withoutIds[0])} art is Gen ` +
    `${baseArtGen(withoutIds[0])} on both sides); the rosette stays reachable for all`);
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

  /* IT SCALES BY WHAT IT IS WORTH, NOT BY HOW MANY THINGS ARE IN IT.

     This summed the item COUNT, which read correctly only while every parcel
     was mostly Poke Balls. The plain ball tapers as better ones unlock now (see
     `plainShare`), so a late parcel holds FEWER things and more valuable ones -
     3 Poke Balls at Lv 1 against 1 Poke and 2 Great at Lv 30, which is three
     items either way and 75 against 205 in money. Counting units said the
     reward had stopped growing; it had changed denomination.

     Priced through `itemById` so it cannot drift from the shop. */
  const at = (lv) => Object.entries(stepReward(STEP_PARCEL, lv).items)
    .reduce((n, [id, qty]) => n + (itemById(id)?.price ?? 0) * qty, 0);
  assert.ok(at(30) > at(8) && at(8) > at(1),
    `a parcel has to grow with the trainer: ¥${at(1)} -> ¥${at(8)} -> ¥${at(30)}`);

  /* AND THE CHEAPEST BALL TAPERS, or it is a dead resource and the shop loses
     its entry-level customer. Flat grants meant a Lv 30 trainer holding 122
     Poke Balls they were never going to throw, because by then everything worth
     catching is worth an Ultra. Asserted from BOTH payers, since a taper
     applied in one of two places is the same pile-up at half speed - and as a
     RELATIONSHIP, so retuning the amounts cannot quietly flatten it. */
  const plainAt = (lv) => levelReward(lv)["poke-ball"]
    + (stepReward(STEP_PARCEL, lv)?.items?.["poke-ball"] ?? 0);
  assert.ok(plainAt(1) > plainAt(8) && plainAt(8) > plainAt(30),
    `the plain ball grant is flat across the ladder (${plainAt(1)} / ${plainAt(8)} ` +
    `/ ${plainAt(30)}) - it banks up unspent and nobody buys the cheap ball`);
  assert.ok(plainAt(MAX_LEVEL) >= 2,
    "the plain ball grant reached zero - it is the floor of the economy, not a " +
    "retired ball");

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
      /* `region` is the place; `name` is the menu label, "Gen 1 (Kanto)". This
         tested `name` for a "Gen " prefix as the sign of the unnamed fallback,
         and the label legitimately starts that way now - so it asks `region`,
         which is the field that actually falls back. */
      assert.ok(g.region && !/^\d+$/.test(g.region),
        `region ${g.gen} has no name of its own`);
      assert.equal(g.name, `Gen ${g.gen} (${g.region})`,
        `region ${g.gen}'s menu label must name both the number and the place`);
    }
    /* THE WHOLE NATIONAL DEX SHIPS NOW. `GENERATIONS` is derived from
       `SPECIES`, so each region arrived in the Dex's filter the day its species
       were fetched and nothing here had to be edited to put it there - which is
       what that derivation is for. This line has now asserted "no Hoenn", then
       "4 generations", and is written as a RELATIONSHIP so it stops needing a
       rewrite every time the dex grows: one region per entry in `GEN_LAST`,
       each named, each holding real species. */
    assert.equal(GENERATIONS.length, GEN_LAST.length,
      `${GENERATIONS.length} regions against ${GEN_LAST.length} generations in ` +
      "GEN_LAST - a generation appeared or vanished");
    for (const g of GENERATIONS) {
      assert.ok(g.count > 50, `${g.region} shipped only ${g.count} species`);
    }
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

  /* AND THE GENERATOR AGREES ABOUT WHICH WAY A LEDGE FACES. `LEDGE` is in
     map.js and in build_map.py, exactly as `SOLID` is, and the two decide
     different things with it: the generator decides whether a map SHIPS with
     a terrace nobody can leave, the engine decides whether you can leave it.
     Disagree and the build passes a map the game traps you on - silently,
     because both halves are individually correct.

     Read out of the source rather than imported, since Python is not. */
  {
    const py = readFileSync(new URL("./build_map.py", import.meta.url), "utf8");
    const row = py.match(/^LEDGE = \{(.*)\}$/m);
    assert.ok(row, "build_map.py has no LEDGE table");
    const theirs = {};
    for (const m of row[1].matchAll(/"(.)": \((-?\d+), (-?\d+)\)/g))
      theirs[m[1]] = [Number(m[2]), Number(m[3])];
    assert.deepEqual(theirs, LEDGE,
      `the two LEDGE tables disagree: build_map.py ${JSON.stringify(theirs)} ` +
      `against map.js ${JSON.stringify(LEDGE)}`);
    for (const ch of Object.keys(LEDGE))
      assert.ok(SOLID.includes(ch),
        `ledge "${ch}" is not in SOLID - it would be ordinary ground from every side`);
  }

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

  /* AND THE BOX HAS TO FIT ON THE SCREEN. The minimap sizes itself to the map
     - three pixels a tile, nothing bounding it - so it grows with whatever is
     drawn, and Cinderpeak at 40x109 came out 327px tall against a 352px
     viewport: floor to ceiling down the left edge, while every other map sat
     at 76% or less and so nothing had ever said so. `miniScale` drops the
     pixels-a-tile for a map that will not fit; this is what proves it did. */
  {
    const eng = readFileSync(new URL("../src/game/engine.js", import.meta.url), "utf8");
    const num = (name) => {
      const m = eng.match(new RegExp("const " + name + " = ([0-9]+)"));
      assert.ok(m, `engine.js no longer defines ${name} - the minimap cap is gone`);
      return Number(m[1]);
    };
    const [T, MW, MH] = [num("MINI_TILE"), num("MINI_MAX_W"), num("MINI_MAX_H")];
    /* MEASURED AGAINST THE SCREEN, not against the cap. Comparing the scaled
       size to MINI_MAX_* is nearly a tautology - `miniScale` derives the scale
       FROM those - so raising the cap to 999 would pass while the box grew off
       the viewport. The viewport is what the rule is about. 0.8 is a bound
       with a reason rather than a target: the widest today is Deep Woods at
       0.76 of the height, and a minimap past four fifths of the screen has
       stopped being an inset and become the view. */
    const VW = num("VIEW_W") * 32, VH = num("VIEW_H") * 32;
    for (const id of AREA_IDS) {
      const rows = areaOf(id).rows;
      const w = rows[0].length, h = rows.length;
      const s = Math.max(1, Math.min(T, Math.floor(MW / w), Math.floor(MH / h)));
      assert.ok(w * s <= VW * 0.8 && h * s <= VH * 0.8,
        `${id}'s minimap is ${w * s}x${h * s} against a ${VW}x${VH} viewport - ` +
        "past four fifths of the screen it covers the map it is a picture of");
    }
  }

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

  /* 3b. AND EVERY FORM IS REACHABLE FROM SOMETHING THAT IS. A form that no
      shipped species evolves into is a dex entry nobody can ever fill, which is
      worse than not shipping it - the rosette and the region count both include
      it. Checked against the assembled tables, not against RESIDENTS. */
  const formCheck = () => {
    const wild = wildAt(MAX_LEVEL);
    for (const sp of SPECIES) {
      if (!isForm(sp.id)) continue;
      const rows = EVOLUTIONS.filter((e) => e.to === sp.id);
      assert.ok(rows.length, `${sp.name} is a form nothing evolves into`);
      assert.ok(rows.some((e) => wild.has(e.from)),
        `${sp.name} only evolves from something you cannot find in the wild`);
      for (const e of rows) {
        assert.equal(evoLevel(e), 100,
          `${sp.name} evolves at Lv ${evoLevel(e)}, not the 100 a form costs`);
      }
    }
  };

  // 3. the ladder actually opens: everything is findable by the cap.
  const early = wildAt(1);
  const late = wildAt(MAX_LEVEL);
  assert.ok(late.size > early.size, "levelling adds no species at all");
  formCheck();
  for (const sp of SPECIES) {
    /* A FORM IS REACHED, NEVER MET. Mega, Primal and Gigantamax are deliberately
       excluded from every wild table - being able to CATCH a Mega Charizard is
       the thing they exist to make you work for, handed over for a Poke Ball -
       so "findable in the wild" is the wrong test for them. Theirs is below:
       every form must be the target of an evolution FROM a species that is
       itself wild-findable, which is the same reachability claim one step on. */
    if (isForm(sp.id)) continue;
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

  /* 5. A NAMED LEGENDARY MUST NOT GET EASIER AS YOU LEVEL - measured per head,
        not over the pool.

        This compared the POOL's share at Lv 1 against Lv 50, which was the
        right reading while every legendary was open from the start and only
        the table grew. It is the wrong reading now: legendaries arrive on
        `GEN_UNLOCK` like everything else, so the pool's share climbs from
        0.15% (five Kanto legendaries at Lv 1) to 1.02% simply because there
        are more of them to meet - which is content arriving, not the rate
        being farmed.

        What must not move is what ONE of them is worth. Levelling buys you
        more legendaries to hunt, never a cheaper hunt for the one you are
        already after. */
  for (const b of BIOMES) {
    const perHead = (level) => {
      const t = encounterTable(b, level);
      const total = t.reduce((n, [, x]) => n + x, 0);
      const open = LEGENDARY.filter((id) => genOpen(id, level));
      if (!open.length) return 0;
      const pool = open.reduce((n, id) => n + (t.find(([i]) => i === id)?.[1] ?? 0), 0);
      return pool / total / open.length;
    };
    assert.ok(perHead(MAX_LEVEL) <= perHead(1) + 1e-9,
      `${b.id}: one named legendary is easier to find at Lv ${MAX_LEVEL} than at ` +
      "Lv 1 - levelling must buy more of them to hunt, not a cheaper hunt");
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

  /* NO GENERATION IS COMMONER THAN ANY OTHER, and this is the suite that did
     not exist while it was wildly false.

     Reported from play - Gen 1 felt far commoner than everything else - and it
     was. Measured at Lv 50 with all nine open, against a fair 11.1%: Gen 1 took
     23.3% of Tall Grass, 41.8% of the Haunted Tower, 57.8% of the Power Plant
     and 63.6% of Frost Hollow, and Gen 6 took 0.0% of the Power Plant. Two
     separate causes, and neither would have been caught by the other's fix:
     `DERIVED_WEIGHT` sits at 8/5/3/1 against Gen 1 commons hand-tuned at 22,
     and `derivedHomes` sends a species to ONE best-matching map, so the
     narrow-typed maps had generations with no residents at all - which no
     amount of reweighting can give a share to.

     A BOUND WITH A MEASUREMENT BEHIND IT. Swept over all eight maps at every
     level from 1 to 50, the worst deviation is 24.7% - Ember's Gen 2 at 31.2%
     against a fair 25% at Lv 20 - and every other map at every other level is
     inside 15%. Ember is the narrowest map in the game (fire alone) and at
     Lv 20 only four generations are open, so the four are competing over a
     handful of residents in a mix that `BAND_SHAPE` is holding still; the fit
     cannot make both exact and the band mix is the one that is asserted. 40%
     is the bound, which leaves room for a ninth generation without leaving
     room for the five-fold skew this replaced.

     PRESENCE IS SEPARATE AND ABSOLUTE. A generation with nothing living in a
     map is a different failure from one that is merely thin, it is the one
     that reweighting cannot reach, and it is worth its own assertion. */
  {
    const gens = GEN_LAST.map((_, i) => i + 1);
    let worst = 0, worstAt = "";
    for (let lv = 1; lv <= MAX_LEVEL; lv++) {
      for (const b of BIOMES) {
        if (lv < (b.level ?? 1)) continue;
        const open = gens.filter((g) => lv >= (GEN_UNLOCK[g] ?? 0));
        const rows = encounterTable(b, lv).filter((r) => !LEGENDARY.includes(r[0]));
        const total = rows.reduce((n, r) => n + r[1], 0);
        const by = new Map();
        for (const r of rows) by.set(genOf(r[0]), (by.get(genOf(r[0])) ?? 0) + r[1]);
        for (const g of open) {
          const share = (by.get(g) ?? 0) / total;
          assert.ok(share > 0,
            `${b.id} has no generation ${g} at Lv ${lv} - a generation that ` +
            "does not live in a map cannot be given a share of it by any weight");
          const off = Math.abs(share - 1 / open.length) * open.length;
          if (off > worst) {
            worst = off;
            worstAt = `${b.id} gen ${g} at Lv ${lv} (${(share * 100).toFixed(1)}%` +
              ` against a fair ${(100 / open.length).toFixed(1)}%)`;
          }
        }
      }
    }
    assert.ok(worst < 0.40,
      `a generation is ${(worst * 100).toFixed(0)}% off its fair share - ${worstAt}`);
    console.log(`gen share ok — every one within ${(worst * 100).toFixed(0)}% of ` +
      `fair in all ${BIOMES.length} maps, worst is ${worstAt}`);
  }

  /* BAND BUDGETS: a map's rarity mix must not move when content is added.

     Measured before this existed and the drift was the opposite of the
     expected one - adding two generations TRIPLED Tall Grass's rare band,
     5.1% to 15.4%, because newcomers arrive on a flat tier-derived weight
     while the Gen 1 commons that hold a route together are hand-tuned at 22.
     The gentlest map in the game quietly became a third rare.

     Frozen PER MAP from its own hand-written table, because a single global
     mix would flatten Tall Grass (78/13/5) and the Haunted Tower (18/51/30)
     into the same map and that difference is the design. */
  {
    const bandOf = (id) =>
      (LEGENDARY.includes(id) ? "L" : speciesById(id).tier);
    for (const b of BIOMES) {
      /* RESIDENTS ONLY, by their OWN tier. Two halves of that matter.

         Own tier, because `balance` bands a derived evolution with its PARENT
         and a check that reads the same field is only `balance` agreeing with
         itself.

         Residents only, because the guarantee is about who LIVES here. The
         evolved-form overlay is supposed to enrich a map as you level - that
         is the whole point of it - and counting it here would assert that the
         feature does not work. Measured: meadow's residents hold 79.0/13.6/
         5.1/2.3 at Lv 1 and 78.5/13.8/5.3/2.4 at Lv 35, while the same map
         WITH the overlay drifts to 69.8/18.2/9.6. The first is the promise;
         the second is progression. Before band budgets the rare band went
         5.1% -> 15.4%, and that was neither. */
      const mix = (lv) => {
        const t = encounterTable(b, lv)
          .filter((e) => !e[2] && !LEGENDARY.includes(e[0]));
        const total = t.reduce((n, e) => n + e[1], 0);
        const acc = {};
        for (const [id, w] of t) acc[bandOf(id)] = (acc[bandOf(id)] ?? 0) + w / total;
        return acc;
      };
      const base = mix(1);
      for (const lv of [GEN_UNLOCK[2], GEN_UNLOCK[4], MAX_LEVEL]) {
        const now = mix(lv);
        for (const k of new Set([...Object.keys(base), ...Object.keys(now)])) {
          const drift = Math.abs((now[k] ?? 0) - (base[k] ?? 0));
          /* 2.5 POINTS, AND IT IS A BOUND WITH A MEASUREMENT BEHIND IT rather
             than a tolerance that got widened until the build passed. The dex
             went from 493 to 1145 and the drift was re-measured across all
             eight maps: meadow 0.65, tower 1.58, ember 1.57, ridge 1.60, pond
             1.62, woods 1.64, power 2.07, frost 2.30. The two that moved most
             are the maps with the narrowest type lists, which is where
             type-homed newcomers concentrate.
             What this is guarding has not changed: before band budgets existed
             the rare band went 5.1% -> 15.4%, ten points and climbing with
             every generation. Two and a half at more than double the dex is the
             mechanism working. Re-measure it if the dex grows again - if this
             ever needs 4, the homing is what to look at, not this number. */
          assert.ok(drift < 0.025,
            `${b.id}: the ${k} band moved ${(drift * 100).toFixed(1)} points ` +
            `between Lv 1 and Lv ${lv} (${((base[k] ?? 0) * 100).toFixed(1)}% -> ` +
            `${((now[k] ?? 0) * 100).toFixed(1)}%) - a map's rarity mix is a ` +
            "property of the map and adding content must not resize it");
        }
      }

      /* And the overlay's own enrichment has to stay enrichment. It is allowed
         to move the mix; it is not allowed to turn a gentle map into a rare
         one, which is the failure that started this. */
      const withEvo = (lv) => {
        const t = encounterTable(b, lv).filter((e) => !LEGENDARY.includes(e[0]));
        const total = t.reduce((n, e) => n + e[1], 0);
        return t.filter((e) => ["A", "S"].includes(bandOf(e[0])))
          .reduce((n, e) => n + e[1], 0) / total;
      };
      assert.ok(withEvo(MAX_LEVEL) < withEvo(1) * 2.2 + 0.02,
        `${b.id}: the rare share goes ${(withEvo(1) * 100).toFixed(1)}% -> ` +
        `${(withEvo(MAX_LEVEL) * 100).toFixed(1)}% once everything has arrived - ` +
        "the overlay is meant to enrich a map, not re-rank it");

      /* AND A BAND WITH MEMBERS IS NEVER WORTH NOTHING. Rock Ridge has no
         S-tier resident, so its frozen S share is zero - without the floor a
         Sinnoh S-tier landing there would inherit a zero weight and be
         unreachable, which `every species is gettable` would catch only
         because it happens to look at the same table. */
      const t = encounterTable(b, MAX_LEVEL);
      for (const [id, w] of t) {
        assert.ok(w > 0, `${b.id}: #${id} is in the table at weight zero`);
      }
    }
    console.log("band budgets ok — every map holds its own rarity mix at every level");
  }

  /* PITY: a drought ends, and nothing else moves.

     Three silent failures, and the middle one is the reason this is capped:
     a ramp that never opens, a ramp that boosts before it should, and a ramp
     that keeps climbing - park at 3,000 dry encounters and every throw is a
     variant, which is a farm rather than a mercy. */
  {
    assert.equal(pityBoost(0), 1, "pity must not help on the first encounter");
    assert.equal(pityBoost(PITY_AFTER), 1, "pity must not open early");
    assert.ok(pityBoost(PITY_AFTER + PITY_RAMP) > 1, "pity must open at all");
    assert.equal(pityBoost(1e9), PITY_CAP, "pity must be capped");
    for (let d = 0; d < 5000; d += 137) {
      assert.ok(pityBoost(d) >= pityBoost(Math.max(0, d - 137)),
        "pity must never go backwards");
    }

    /* The ladder keeps its ORDER under the boost. It is a multiplier on the
       whole thing for exactly this reason: boosting one tier alone would
       re-sort `TIER_ODDS`, which is walked rarest-first. */
    for (const boost of [1, 2, PITY_CAP]) {
      let seed = 99;
      const rng = () => {
        seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        seed = (seed + Math.imul(seed ^ (seed >>> 7), 61 | seed)) ^ seed;
        return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
      };
      const hit = {};
      for (let i = 0; i < 200000; i++) {
        const t = rollVariant(rng, null, boost);
        if (t) hit[t] = (hit[t] ?? 0) + 1;
      }
      const rarest = TIER_ODDS[0][0];
      const commonest = TIER_ODDS[TIER_ODDS.length - 1][0];
      assert.ok((hit[rarest] ?? 0) < (hit[commonest] ?? 0),
        `at ${boost}x the ladder re-sorted: ${rarest} ${hit[rarest]} vs ` +
        `${commonest} ${hit[commonest]}`);
    }

    // And a long enough drought really does end.
    let seed = 5;
    const rng = () => {
      seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      seed = (seed + Math.imul(seed ^ (seed >>> 7), 61 | seed)) ^ seed;
      return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
    };
    let dry = 0, got = 0;
    for (let i = 0; i < 20000; i++) {
      if (rollVariant(rng, null, pityBoost(dry))) { got++; dry = 0; } else dry++;
    }
    assert.ok(dry < 900,
      `a drought reached ${dry} encounters with pity on - it is not ending them`);
    assert.ok(got > 0, "pity produced no variants at all over 20,000 encounters");
    console.log(`pity ok — opens at ${PITY_AFTER}, caps at ${PITY_CAP}x, ` +
      "ladder keeps its order");
  }

  /* TODAY'S QUEST. Everything in daily.js is pure and takes the day as an
     argument, which is the only way to test something keyed on the date
     without waiting a day - and the reason it is written that way.

     Four things have to hold, and three of them are silent: a quest nobody can
     finish, a quest that rerolls when you reload, a streak that survives a gap
     it should not, and a streak that pays forever. */
  {
    /* COMPLETABLE. This is the one that shipped wrong: the type pool was the
       union of every biome's `types` list, and a biome lists "dragon" because
       legendaries match against it, not because dragons live there. There are
       TWO Dragon-type species in every table in the game. Asserted against the
       starting map, which is the only place open to every player. */
    const start = BIOMES[0];
    const total = start.table.reduce((n, [, w]) => n + w, 0);
    for (const t of QUEST_TYPES) {
      const share = start.table
        .filter(([id]) => speciesById(id).types.includes(t))
        .reduce((n, [, w]) => n + w, 0) / total;
      assert.ok(share >= QUEST_SHARE,
        `a daily can ask for ${t} but it is ${(share * 100).toFixed(1)}% of the ` +
        "starting map - that is a quest nobody can finish today");
    }
    assert.ok(QUEST_TYPES.length >= 3,
      `only ${QUEST_TYPES.length} askable types - the type quest is always the same`);

    /* DETERMINISTIC, or two tabs open at midnight write two different quests
       and the second overwrites the first's progress. */
    for (const key of ["20260101", "20260915", "20271231"]) {
      assert.deepEqual(dailyFor(key), dailyFor(key), `${key} rerolls`);
      const g = dailyFor(key);
      assert.ok(g.need > 0 && describe(g), `${key} produced no readable goal`);
    }
    // And it is not the same quest every day.
    const kinds = new Set(Array.from({ length: 60 }, (_, i) =>
      dailyFor(String(20260101 + i)).kind));
    assert.ok(kinds.size > 1, "every day draws the same kind of quest");

    /* PROGRESS counts only what the goal asked for. */
    const water = { kind: "type", need: 4, type: "water" };
    assert.equal(advance(water, { species: { types: ["water"] } }), 1, "a match counts");
    assert.equal(advance(water, { species: { types: ["fire"] } }), 0, "a miss does not");
    assert.equal(advance(water, { steps: 50 }), 0, "steps do not advance a catch quest");
    assert.equal(advance({ kind: "walk", need: 10 }, { steps: 7 }), 7, "steps count");
    assert.equal(advance(null, { steps: 7 }), 0, "no goal, no progress");

    /* THE STREAK survives exactly one day's gap - including across a month
       boundary, which is why both keys go through a real Date rather than
       being subtracted as numbers. */
    assert.equal(isYesterday("20260914", "20260915"), true, "a day apart");
    assert.equal(isYesterday("20260831", "20260901"), true, "across a month");
    assert.equal(isYesterday("20261231", "20270101"), true, "across a year");
    assert.equal(isYesterday("20260913", "20260915"), false, "two days is a reset");
    assert.equal(isYesterday("20260915", "20260915"), false, "today is not yesterday");
    assert.equal(isYesterday(null, "20260915"), false, "no history is not a streak");

    /* AND IT STOPS PAYING. Uncapped, day sixty is worth more than the first
       fifty together and missing one leaves nothing to come back for. */
    assert.equal(streakMult(0), 1, "day one multiplies nothing");
    assert.ok(streakMult(STREAK_CAP) > streakMult(0), "a streak must be worth something");
    assert.equal(streakMult(STREAK_CAP), streakMult(9999), "the streak must cap");
    const low = reward(dailyFor("20260101"), 0);
    const high = reward(dailyFor("20260101"), 9999);
    assert.ok(high.money > low.money && high.money < low.money * 3,
      `a maxed streak pays ¥${high.money} against ¥${low.money} - that is not a bonus`);
    assert.ok(low.money > 0 && low.candy > 0, "a claim must pay something on day one");

    console.log(`daily ok — ${GOALS.length} kinds, ${QUEST_TYPES.length} askable types, ` +
      `streak caps at ${STREAK_CAP} (×${streakMult(STREAK_CAP).toFixed(2)})`);
  }


  /* FIELD ITEMS, and the whole suite is about the collision they were nearly
     built into. Fortune, the band budgets and a lure all want to reshape one
     encounter table, and three transforms on one table is a mix nobody chose.

     The answer was three FAMILIES pulling three different levers, so the
     assertions are mostly about that separation holding. */
  {
    const maxed = { ...emptyStats(), fortune: MAX_RANK };
    const LEVERS = ["rate", "tilt", "lift"];

    /* ONE FAMILY, ONE LEVER, and no two families sharing one. Two families on
       the same lever would be one family with two names, and the whole point
       of the split is that a repel, a flute and a honey cannot collide. */
    {
      const byFamily = new Map();
      for (const f of FIELD) {
        const mine = LEVERS.filter((k) => f[k] !== undefined);
        assert.equal(mine.length, 1,
          `${f.id} pulls ${mine.length} levers (${mine.join(", ")}) - it must pull exactly one`);
        const seen = byFamily.get(f.family);
        assert.ok(seen === undefined || seen === mine[0],
          `family ${f.family} pulls both ${seen} and ${mine[0]}`);
        byFamily.set(f.family, mine[0]);
      }
      assert.equal(new Set(byFamily.values()).size, byFamily.size,
        "two families pull the same lever - then they are one family");
      assert.deepEqual([...byFamily.keys()].sort(), [...FAMILIES].sort(),
        "FAMILIES must be exactly the families the items declare");
    }

    /* A TIER MUST BEAT THE ONE BELOW IT, on duration AND on effect AND on
       price. A Super Repel that costs more and does no more is a price with no
       product, and nothing else in the suite would say so. */
    for (const fam of FAMILIES) {
      const line = FIELD.filter((f) => f.family === fam);
      for (let k = 1; k < line.length; k++) {
        const lo = line[k - 1], hi = line[k];
        assert.ok(hi.price > lo.price, `${hi.id} costs no more than ${lo.id}`);
        assert.ok(hi.level >= lo.level, `${hi.id} unlocks before ${lo.id}`);
        /* A REPEL IS TOTAL, so its tiers are DURATION and nothing else. It
           used to scale the rate to 0.55/0.35/0.20 and the tier test asked for
           a smaller number each rung; "mostly stops encounters" is the one
           thing a repel must not be, because the whole reason to carry one is
           crossing farmed ground without being stopped. What you pay more for
           is how far it gets you. */
        if (hi.rate !== undefined) {
          assert.equal(hi.rate, 0, `${hi.id} lets something through`);
          assert.ok(hi.steps > lo.steps, `${hi.id} runs no longer than ${lo.id}`);
        }
        if (hi.lift !== undefined) {
          assert.ok(hi.lift > lo.lift || hi.tier,
            `${hi.id} lifts no harder than ${lo.id} and favours nothing`);
        }
      }
    }

    /* ONE EXPONENT, and this is what says so without a literal in it: if a
       flute's tilt IS Fortune's exponent, what it is worth cannot depend on
       your Fortune rank. A second transform stacked on the first would
       compound. Checked at every rank; the floor is the only thing allowed to
       break it. */
    const flute = FIELD.find((f) => f.family === "rarity");
    const tiltAt = (r) => rarityPower({ ...emptyStats(), fortune: r }, 0)
      - rarityPower({ ...emptyStats(), fortune: r }, flute.tilt);
    for (let r = 0; r <= MAX_RANK; r++) {
      assert.ok(near(tiltAt(r), tiltAt(0)),
        `the flute is worth ${tiltAt(r).toFixed(3)} at Fortune ${r} against ` +
        `${tiltAt(0).toFixed(3)} at nothing - it is compounding, not composing`);
      assert.ok(rarityPower({ ...emptyStats(), fortune: r }, flute.tilt) >= RARITY_FLOOR,
        `Fortune ${r} with a flute running sank under the floor`);
    }
    const ranks = flute.tilt / (rarityPower(emptyStats()) - rarityPower({ ...emptyStats(), fortune: 1 }));
    assert.ok(ranks > 0 && ranks < MAX_RANK,
      `the flute is worth ${ranks.toFixed(1)} Fortune ranks against a track of ` +
      `${MAX_RANK} - a consumable must not out-buy the whole investment`);

    /* THE FLOOR IS WHY THERE IS A FLOOR. At exponent 0 every row is worth the
       same and rarity stops existing, so the worst case in the game - maxed
       Fortune with a flute running - still has to sort a common above a rare.
       And the floor has to do that job whatever the coefficients above it are
       later retuned to, which is why the second assertion is on the CONSTANT:
       it does not bind today, and what it exists to catch is somebody moving
       the numbers above it. */
    {
      const p = rarityPower(maxed, flute.tilt);
      assert.ok(22 ** p > 2 * 1 ** p,
        `at exponent ${p.toFixed(2)} a weight-22 Pidgey is not even twice a ` +
        "weight-1 Snorlax - the table has flattened into noise");
      assert.ok(22 ** RARITY_FLOOR > 2 * 1 ** RARITY_FLOOR,
        `a floor of ${RARITY_FLOOR} does not keep a common ahead of a rare`);
    }

    /* MEASURED ON A REAL TABLE, and exactly, because `weighted` returns the
       reweighted rows rather than a pick: the flute must raise what the rare
       rows get and lower what the commons do, at BOTH ends of Fortune. */
    {
      const table = [["common", 22], ["mid", 8], ["rare", 3], ["legend", 0.5]];
      const shares = (stats, tilt) => {
        const rows = weighted(table, stats, tilt);
        const sum = rows.reduce((t, [, w]) => t + w, 0);
        return Object.fromEntries(rows.map(([id, w]) => [id, w / sum]));
      };
      for (const [what, stats] of [["a new trainer", emptyStats()], ["a maxed one", maxed]]) {
        const off = shares(stats, 0), on = shares(stats, flute.tilt);
        assert.ok(on.legend > off.legend && on.rare > off.rare,
          `the flute did nothing for the rare rows for ${what}`);
        assert.ok(on.common < off.common,
          `the commonest row has to give the ground back, for ${what}`);
      }
    }

    /* REPEL IS ITS OWN AXIS, and this is what keeps it there: nothing in the
       two files that decide WHAT you meet may know the word. */
    for (const f of ["trainer.js", "biomes.js"]) {
      /* COMMENTS STRIPPED FIRST. The rule is that no CODE in these two files
         knows about repel; the prose absolutely should, and the first version
         of this assertion failed on the comment that explains the rule. A test
         that forbids documenting itself is a test nobody keeps. */
      const src = stripComments(
        readFileSync(new URL(`../src/game/${f}`, import.meta.url), "utf8"));
      assert.ok(!/repel/i.test(src),
        `${f} has repel in its CODE - a repel that reshapes the table is the ` +
        "pile-up this design exists to avoid");
    }
    {
      const eng = readFileSync(new URL("../src/game/engine.js", import.meta.url), "utf8");
      /* Each family has to reach its own lever and only its own. Three source
         assertions because there is no way to drive the engine headlessly, and
         each of the three failures is silent: an item you bought that does
         nothing looks exactly like bad luck. */
      assert.ok(/ENCOUNTER_RATE \* \(running\("repel"\)\?\.rate \?\? 1\)/.test(eng),
        "Repel must scale the encounter RATE, which is the only thing it does");
      assert.ok(/weighted\(table, state\.stats, running\("rarity"\)\?\.tilt \?\? 0\)/.test(eng),
        "the flute must reach the table through rarityPower's own exponent");
      assert.ok(/running\("variant"\)/.test(eng) && /honey\?\.tier/.test(eng),
        "a honey must reach the variant roll, and a coloured one must name its tier");
      // Using one spends a BAG item; it must not charge money a second time.
      assert.ok(/state\.bag\[item\.id\] -= 1;/.test(eng) && !/function useField[\s\S]{0,400}state\.money/.test(eng),
        "useField must spend from the bag - these are bought in the shop now");
      assert.ok(/state\.field\[item\.family\] = \{ id: item\.id, steps: item\.steps \};/.test(eng),
        "a field item must be written to its FAMILY slot, or two honeys can run at once");
    }

    /* THE SHELF. All of them bought, all of them gated, all of them drawn. */
    for (const f of FIELD) {
      assert.ok(forSale(f), `${f.id} is not buyable`);
      assert.ok(f.level > 1 && f.level < MAX_LEVEL, `${f.id} is gated off the ladder`);
      assert.ok(f.steps > 100, `${f.id} runs out before you have walked anywhere`);
      /* MEASURED, not chosen: the shop's description slot is 169px and fits
         27 characters at that font, taken off the rendered row rather than
         estimated. A stone's blurb is a list of species names and overruns it
         by design - that is what the tooltip is for - but a blurb we WRITE
         should fit the box it is printed in. */
      assert.ok(f.blurb.length <= BLURB_FITS,
        `${f.id}'s blurb is ${f.blurb.length} chars and the row fits ${BLURB_FITS}`);
      assert.ok(pricedAt(f.price, { ...emptyStats(), haggle: MAX_RANK }) < f.price,
        `${f.id} ignores Haggle`);
    }
    assert.equal(fieldById("nope"), null, "an unknown id is null, not undefined");

    /* THE COLOURED HONEYS. Each names a real tier, each is drawn from the one
       jar, and no two name the same tier - two Shiny Honeys at two prices is
       the same bug as two weights for one species. */
    {
      const honeys = FIELD.filter((f) => f.tier);
      const named = honeys.map((h) => h.tier);
      assert.equal(new Set(named).size, named.length, "two honeys favour one tier");
      for (const h of honeys) {
        assert.ok(TIERS.includes(h.tier), `${h.id} favours "${h.tier}", which is not a tier`);
        assert.equal(artOf(h), "honey", `${h.id} should be drawn from the one jar`);
        assert.ok(h.lift > 1, `${h.id} favours a tier by a factor of ${h.lift}`);
      }
      /* A HONEY IS MEASURED IN WHAT IT HANDS YOU, NOT IN WHETHER IT FIRES.

         This asserted P(at least one) between 0.5 and 0.95, which is the
         design `HONEY_LANDS` encoded: three-in-four over the run. The trouble
         with that bound is the other quarter - a jar you paid for up front
         that does nothing at all, one time in four, which is a lottery ticket
         rather than an item and is why these read as not worth buying.

         `HONEY_MEETS` is a COUNT now, so the assertion is on the count: every
         jar hands you about three of its own tier over its own run, whatever
         that tier's odds are, which is what makes the price about which tier
         you want rather than about which jar works. A third of a meet of slack
         each way, because `honeyLift` is an integer ceiling and the rarer
         tiers round further.

         It follows `HONEY_MEETS` rather than pinning 3, which is deliberate:
         moving that constant is a design decision and this should move with
         it. What it catches is a jar that stops agreeing with the others -
         a hand-typed lift, or a tier whose odds moved without its jar - which
         is exactly the drift that has already happened twice. Verified by
         typing a lift into one jar: 1.29 meets against a design of 3. */
      const RATE = 0.07;
      for (const h of honeys) {
        const odds = TIER_ODDS.find(([t]) => t === h.tier)[1] * h.lift;
        const met = h.steps * RATE;
        const meets = odds * met;
        assert.ok(Math.abs(meets - HONEY_MEETS) < 0.34,
          `a ${h.name} hands you ${meets.toFixed(2)} of its tier over its own ` +
          `run, against a design of ${HONEY_MEETS} - the jars are supposed to ` +
          "be equally good at their own tier, so this one is mispriced by odds");
      }

      /* AND A JAR MUST COST LESS THAN THE PLAY IT COVERS EARNS.

         The one that was missing, and its absence is how the price drifted to
         where it did. A honey runs `HONEY_STEPS`, which is about 42
         encounters; those encounters GROSS something, and at `6000 + 900 *
         rank` six of the nine jars cost more than the whole of it - the
         dearest was 168% of the richest map's take over its own run and 324%
         of the starting map's. An item that can only be funded by NOT using it
         is a price with no product, and every other assertion here passed the
         whole time because none of them knew what a run is worth. Reported
         from play as too expensive; it was measurably that.

         The gross is the mean sell value of a map's own table over the
         encounters a run meets - a ceiling rather than a forecast, since you
         catch some and keep some - so a jar that clears THIS clears the real
         thing comfortably. Measured against the starting map, because a player
         who cannot afford one at Tall Grass prices cannot afford one.

         Computed from the live tables, never typed, exactly as the Master
         Ball's floor and ceiling are: retune `SELL`, `ENCOUNTER_RATE`,
         `HONEY_STEPS` or a roster and re-read what this prints. */
      {
        const runGross = (b) => {
          const t = encounterTable(b, MAX_LEVEL);
          let w = 0, cash = 0;
          for (const [id, x] of t) {
            const sp = speciesById(id);
            if (!sp) continue;
            w += x;
            cash += x * sellValue(sp);
          }
          return (cash / w) * honeys[0].steps * ENCOUNTER_RATE;
        };
        const start = runGross(BIOMES[0]);
        const rich = Math.max(...BIOMES.map(runGross));
        const jars = FIELD.filter((f) => f.family === "variant");
        const dearest = jars.reduce((a, f) => (f.price > a.price ? f : a));
        const cheapest = jars.reduce((a, f) => (f.price < a.price ? f : a));
        /* TWO ANCHORS, EACH WHERE IT MEANS SOMETHING. The dearest jar is
           bought late and spent on the best ground open, so the richest map
           is what decides whether it can EVER pay for itself - and that is
           the test `6000 + 900 * rank` failed, at 168%. The cheapest jar is
           the one a player meets first, on the starting map's income, so
           that is the one that has to be reachable from where they are.
           Anchoring both to the starting map read 99% for the dearest and
           passed on a margin too thin to mean anything - and on a map
           nobody takes a Showdown Honey to. */
        assert.ok(dearest.price < rich,
          `a ${dearest.name} costs \u00a5${dearest.price} and the `
          + `${honeys[0].steps} steps it runs for gross \u00a5${rich.toFixed(0)} `
          + "on the richest map - a jar you can only afford by not using one "
          + "is a price with no product");
        assert.ok(cheapest.price < start,
          `the cheapest jar is a ${cheapest.name} at \u00a5${cheapest.price}, `
          + `and a run on the starting map grosses \u00a5${start.toFixed(0)} - `
          + "the first jar a player meets has to be reachable from where "
          + "they are standing");
        console.log(`    a jar runs ${(honeys[0].steps * ENCOUNTER_RATE).toFixed(0)} encounters; ` +
          `the dearest costs ${(100 * dearest.price / start).toFixed(0)}% of what that ` +
          `grosses at the start and ${(100 * dearest.price / rich).toFixed(0)}% at the richest`);
      }

      /* AND THE FORMULA MUST NOT COLLIDE WITH THE CLAMP. `LIFT_CEILING` caps
         any tier at 1 in 5 however many multipliers stack, which is what stops
         a honey plus a drought handing you a tier every encounter. If
         `HONEY_MEETS` is ever raised far enough, the clamp rather than
         `honeyLift` becomes what decides how good a jar is - and then the jars
         stop being equally good at their own tiers silently, because the
         rarest ones clamp first and nothing else says so. */
      for (const h of honeys) {
        const raw = TIER_ODDS.find(([t]) => t === h.tier)[1] * h.lift;
        assert.ok(raw < LIFT_CEILING,
          `a ${h.name} asks for ${(raw * 100).toFixed(1)}% against a ` +
          `${(LIFT_CEILING * 100).toFixed(0)}% clamp - the ceiling, not ` +
          "honeyLift, is deciding what this jar is worth");
      }

      /* A HONEY PER TIER WAS RIGHT AT FOUR TIERS AND IS BLOAT AT EIGHT.

         This used to read "every tier but Origin has one, and only those",
         which was two rules welded together. The Origin half was there
         because Origin was gated on finishing a generation and an item that
         shortcuts a gate is the gate deleted - that gate is gone, so that
         half goes with it. The other half would now put SEVEN jars on a shelf
         that already carries twenty-seven items, all at the same price band,
         for tiers most players are not hunting.

         What survives is the part that can actually go wrong: a jar that
         favours something which is not a tier, and two jars fighting over
         one. The tiers without a jar are covered by the plain Honey, which
         lifts every rare tier at once - so nothing is unreachable, it just
         does not have its own shelf slot. */
      assert.equal(new Set(named).size, named.length,
        `two honeys favour the same tier: ${named.join(", ")}`);
      const plain = FIELD.find((f) => f.family === "variant" && !f.tier);
      assert.ok(plain && plain.lift > 1,
        "there is no plain Honey, so the tiers without their own jar have nothing at all");
    }

    /* THE VARIANT ROLL, measured. A favoured honey must lift ITS tier and
       push the others DOWN - the share of what you meet is what the jar is
       sold on, and the old rule here ("leave the others where they were") was
       what let a Glitched Honey come out 61% on target. A jar that raises its
       tier and nothing else can never be more than a plurality, because "the
       others" is seven tiers and their combined odds beat any single one.

       What must still not happen is a second tier going UP: that would be a
       plain honey with a misleading name, which is the fault the old
       assertion was really guarding and the only half of it worth keeping. */
    {
      const rng = (seed) => () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const count = (favour, boost = 1) => {
        const r = rng(99);
        const seen = Object.fromEntries(TIERS.map((t) => [t, 0]));
        for (let i = 0; i < 200000; i++) {
          const got = rollVariant(r, null, boost, favour);
          if (got) seen[got]++;
        }
        return seen;
      };
      const plain = count(null);
      const shiny = count({ tier: "shiny", mult: 6 });
      assert.ok(shiny.shiny > plain.shiny * 3,
        `a x6 Shiny Honey moved shiny ${plain.shiny} -> ${shiny.shiny} - it is not working`);
      // Not one other tier may RISE. Rarest-first means some sit before shiny
      // in the walk and some after; the damp has to reach both.
      for (const t of TIERS) {
        if (t === "shiny") continue;
        assert.ok(shiny[t] <= plain[t],
          `a Shiny Honey raised ${t} ${plain[t]} -> ${shiny[t]} - it is favouring more than one tier`);
      }

      /* AND THE JAR HAS TO BE MOST OF WHAT YOU MEET. This is the number that
         was reported: 61% on target read as "it makes variants kinder across
         the board" rather than as a Glitched Honey. Measured per jar at its
         own shipped lift, so it cannot pass on a favourable test multiplier. */
      for (const h of FIELD.filter((f) => f.family === "variant" && f.tier)) {
        const run = count({ tier: h.tier, mult: h.lift });
        const tot = TIERS.reduce((n, t) => n + run[t], 0);
        const share = run[h.tier] / tot;
        assert.ok(share > 0.8,
          `a ${h.name} is only ${(share * 100).toFixed(0)}% of the variants it ` +
          "turns up - a jar named for one tier has to BE that tier, or it reads " +
          "as a general boost with a colour on it");
      }
      // And a plain honey is a boost with no favour: everything must move.
      const all = count(null, 2);
      for (const t of TIERS) {
        if (!plain[t]) continue;
        assert.ok(all[t] > plain[t], `a plain honey left ${t} at ${all[t]}`);
      }
    }

    /* NOTHING BECOMES A CERTAINTY, however the multipliers pile up - and the
       ceiling must not bind on pity alone, or it would have quietly changed
       behaviour that was already measured and shipped. */
    assert.ok(LIFT_CEILING > 0 && LIFT_CEILING < 1, "a certain tier is not a tier");
    for (const [tier, odds] of TIER_ODDS) {
      assert.ok(odds * PITY_CAP < LIFT_CEILING,
        `the ceiling binds on ${tier} at full pity - it would be changing the ` +
        "pity rates this suite already pins");
    }
    {
      const r = () => 0.0001;   // a roll that beats anything reachable
      assert.ok(rollVariant(r, null, 1e9, { tier: "astral", mult: 1e9 }),
        "an absurd lift must still roll SOMETHING rather than throwing");
    }

    console.log(`field ok — ${FAMILIES.length} families on ${FAMILIES.length} levers, ` +
      `${FIELD.length} items; the flute is ${ranks.toFixed(1)} Fortune ranks on ` +
      `the same exponent, honeys favour ${FIELD.filter((f) => f.tier).length} tiers`);
  }

  /* BERRIES. The same test the four situational balls had to pass: each must
     key off a DIFFERENT system, or two of them are one item with two prices.
     Here that is checkable directly, because `effect` names which one. */
  {
    const EFFECTS = ["catch", "flee", "xp"];
    const used = BERRIES.map((b) => b.effect);
    for (const b of BERRIES) {
      assert.ok(EFFECTS.includes(b.effect), `${b.id} has effect "${b.effect}"`);
      assert.ok(b.per > 0, `${b.id} moves its number by ${b.per}`);
      assert.ok(b.stages >= 1, `${b.id} cannot be fed at all`);
      assert.ok(forSale(b), `${b.id} is not buyable`);
      assert.ok(b.level > 1 && b.level < MAX_LEVEL, `${b.id} is gated off the ladder`);
      assert.ok(b.blurb.length <= BLURB_FITS,
        `${b.id}'s blurb is ${b.blurb.length} chars and the row fits ${BLURB_FITS}`);
    }
    assert.equal(new Set(used).size, used.length,
      "two berries move the same number - then they are one berry");
    assert.equal(berryById("nope"), null, "an unknown id is null, not undefined");

    const razz = BERRIES.find((b) => b.effect === "catch");
    const nanab = BERRIES.find((b) => b.effect === "flee");
    const pinap = BERRIES.find((b) => b.effect === "xp");
    // One slot per effect - see `berryRoom`.
    const fed = (b, stage = 1) => ({ [b.effect]: { id: b.id, stage } });

    /* NOTHING AT ALL WITHOUT A BERRY. Every one of these is a bare multiply at
       its call site, so "no berry" has to be exactly 1 or the roll moves for
       everyone. */
    for (const none of [null, undefined, { id: "nope", stage: 9 }]) {
      assert.equal(berryCatch(none), 1, "catch moved with no berry fed");
      assert.equal(berryCalm(none), 1, "flee moved with no berry fed");
      assert.equal(berryXp(none), 1, "XP moved with no berry fed");
    }
    // And a berry only moves its OWN number.
    assert.equal(berryCalm(fed(razz)), 1, "a Razz Berry touched the flee roll");
    assert.equal(berryXp(fed(razz)), 1, "a Razz Berry touched the XP award");
    assert.equal(berryCatch(fed(nanab)), 1, "a Nanab Berry touched the catch roll");

    /* FEEDING ANOTHER DEEPENS IT. This is the whole change: a second Razz used
       to replace the first and be worth exactly nothing, which is a berry you
       stop carrying - the long encounter that needs help is precisely where
       doubling down should be possible. */
    for (let n = 2; n <= razz.stages; n++) {
      assert.ok(berryCatch(fed(razz, n)) > berryCatch(fed(razz, n - 1)),
        `a ${n}-deep Razz is worth no more than a ${n - 1}-deep one`);
      assert.ok(berryXp(fed(pinap, n)) > berryXp(fed(pinap, n - 1)),
        `a ${n}-deep Pinap is worth no more than a ${n - 1}-deep one`);
    }

    /* AND IT STOPS. `berryRoom` is what both the tile greys on and `useBerry`
       refuses on, so the two cannot disagree about a berry being wasted. */
    assert.equal(berryRoom(null, razz.id), true, "an empty encounter has room");
    assert.equal(berryRoom(fed(razz, razz.stages), razz.id), false,
      "a capped Razz says there is room for another");
    assert.equal(berryRoom(fed(razz, razz.stages), nanab.id), true,
      "a capped Razz must not block a DIFFERENT berry");

    /* AND A DIFFERENT BERRY MUST NOT TAKE THE FIRST ONE AWAY. Feeding a Nanab
       to a legendary so it cannot run and then a Razz to land it used to remove
       the Nanab - reported as "Raikou ran after eating a Nanab", which is
       exactly what happened. The three move three different rolls, so there is
       no reason they cannot all be in play. */
    {
      const both = { ...fed(nanab), ...fed(razz) };
      assert.equal(berryCalm(both), 0, "a Razz took the Nanab's lock away");
      assert.ok(berryCatch(both) > 1, "a Nanab took the Razz's odds away");
      assert.equal(berryXp(both), 1, "something moved the XP award");
      const all = { ...both, ...fed(pinap) };
      assert.equal(berryCalm(all), 0, "three at once lost the lock");
      assert.ok(berryCatch(all) > 1 && berryXp(all) > 1, "three at once lost an effect");
    }
    assert.equal(berryRoom(fed(nanab), nanab.id), false,
      "a Nanab is total at one - a second one must be refused, not eaten");

    /* A NANAB IS A LOCK, NOT A DISCOUNT. It is the strongest single thing any
       item does here, so it is asserted as an absolute rather than as "lower":
       the point of it is the legendary that keeps getting away. */
    assert.equal(berryCalm(fed(nanab)), 0,
      "a Nanab Berry leaves a flee chance - it is supposed to be a lock");
    for (const rate of [3, 45, 190, 255]) {
      assert.equal(fleeChance(rate, berryCalm(fed(nanab))), 0,
        `something can still flee at rate ${rate} with a Nanab eaten`);
    }
    // Through the real roll, not just the arithmetic: nothing may flee at all.
    for (let i = 0; i < 2000; i++) {
      const r = resolveThrow(3, 0.001, () => 0.999, berryCalm(fed(nanab)));
      assert.equal(r.fled, false, "a Nanab-fed Pokémon fled");
    }
    // And with no berry the flee roll is untouched - the slope still exists.
    assert.ok(fleeChance(3) > fleeChance(255), "rarity must still flee more");

    /* PRICED AGAINST THE BALLS THEY HELP. Dearer than the cheap ball, or a
       berry is simply always correct and stops being a decision; no dearer
       than TWO Ultra Balls, or the answer is always "buy better balls". The
       Nanab sits near that ceiling on purpose - a guaranteed lock is a
       different product from a multiplier, and it is the one you reach for
       when losing the encounter outright is the alternative. */
    for (const b of BERRIES) {
      assert.ok(b.price > poke.price,
        `${b.id} costs less than a Poké Ball - then you always use one`);
      assert.ok(b.price <= ultra.price * 2,
        `${b.id} at ¥${b.price} is dearer than buying better balls`);
    }

    /* RAZZ GOES THROUGH `liveMult`, and that is load-bearing: it is the one
       function the engine rolls with and the rail prints, so a berry applied
       anywhere else would make the rail advertise a number nobody used. */
    {
      const enc = { types: ["normal"], known: false, areaId: "meadow", throws: 0 };
      for (const stage of [1, razz.stages]) {
        const wet = { ...enc, berries: fed(razz, stage) };
        for (const ball of BALLS) {
          const dry = liveMult(ball, enc), now = liveMult(ball, wet);
          if (ball.mult >= GUARANTEED) {
            assert.equal(now, dry, "a Razz Berry must not touch the Master Ball");
            continue;
          }
          assert.ok(near(now, dry * berryCatch(fed(razz, stage))),
            `${ball.id} ignored a ${stage}-deep berry`);
        }
      }
      for (const ball of BALLS) {
        assert.equal(liveMult(ball, enc), liveMult(ball, { ...enc, berries: {} }),
          `${ball.id} moved with no berry fed`);
      }
    }

    /* AND IT STILL CANNOT REACH CERTAINTY OR INVERT THE LADDER, at any depth,
       for any ball, at any catch rate the dex contains - because it multiplies
       the ball and therefore passes through `catchChance`'s own ceiling rather
       than round it. */
    {
      const rates = [...new Set(SPECIES.map((sp) => sp.rate))];
      const ladder = PLAIN_BALLS.filter((b) => b.mult < GUARANTEED);
      const deepest = berryCatch(fed(razz, razz.stages));
      for (const rate of rates) {
        for (const ball of ladder) {
          const with_ = catchChance(rate, ball.mult * deepest);
          assert.ok(with_ < 1, `${ball.id} + a full Razz is certain at rate ${rate}`);
          assert.ok(with_ >= catchChance(rate, ball.mult),
            `${ball.id} + Razz is WORSE than ${ball.id} at rate ${rate}`);
        }
        for (let k = 1; k < ladder.length; k++) {
          assert.ok(catchChance(rate, ladder[k - 1].mult * deepest)
            <= catchChance(rate, ladder[k].mult * deepest) + 1e-12,
            `a Razzed ${ladder[k - 1].id} beats a Razzed ${ladder[k].id} at rate ${rate}`);
        }
      }
    }

    {
      const eng = readFileSync(new URL("../src/game/engine.js", import.meta.url), "utf8");
      assert.ok(/xpForCatch\(sp, e\.isNew\) \* berryXp\(e\.berries\)/.test(eng),
        "the Pinap must reach the XP award");
      assert.ok(/berryCalm\(e\.berries\)/.test(eng), "the Nanab must reach the flee roll");
      assert.ok(/if \(!berryRoom\(e\.berries, id\)\) return false;/.test(eng),
        "a berry at its cap must be refused, not eaten for nothing");
      assert.ok(/e\.berries = \{ \.\.\.e\.berries, \[berry\.effect\]/.test(eng),
        "a berry must land in its own effect slot, never replace the others");
      assert.ok(/e\.ate = \(e\.ate \?\? 0\) \+ 1;/.test(eng),
        "feeding must bump a counter the UI can hang an animation off - a flag " +
        "that is already true cannot say 'again'");
    }

    console.log(`berries ok — ${BERRIES.length} on ${new Set(used).size} systems; ` +
      `Razz ×${berryCatch(fed(razz))}-×${berryCatch(fed(razz, razz.stages))}, ` +
      `Nanab locks it, Pinap ×${berryXp(fed(pinap))}-×${berryXp(fed(pinap, pinap.stages))}; ` +
      "the ball ladder survives all of them");
  }

  /* THE SENSES: a map's own level band, and a Pokémon's own size. Both are
     flavour with a tail - one of them prices every evolution bought with what
     you catch, and the other goes in every save. */
  {
    /* A LATE MAP HAS TO FEEL LATE. Non-decreasing along the ladder, and the
       last map plainly above the first - a band that climbs by one over eight
       maps is a constant with extra steps. */
    const bands = BIOMES.map((b) => wildBand(b));
    for (let i = 1; i < bands.length; i++) {
      assert.ok(bands[i][0] >= bands[i - 1][0],
        `${BIOMES[i].name} spawns lower than ${BIOMES[i - 1].name}`);
    }
    assert.ok(bands.at(-1)[0] >= bands[0][0] * 2,
      `the last map opens at Lv ${bands.at(-1)[0]} against the first's ` +
      `${bands[0][0]} - that is not a ladder`);
    for (const [i, [lo, hi]] of bands.entries()) {
      assert.equal(hi - lo + 1, WILD_SPAN,
        `${BIOMES[i].name}'s band is not ${WILD_SPAN} wide`);
      assert.ok(lo >= 2, `${BIOMES[i].name} spawns below Lv 2`);
      assert.ok(hi < MAX_LEVEL, `${BIOMES[i].name} spawns at the level cap`);
    }

    /* AND IT MUST NOT GUT THE CANDY SINK. Evolving costs `evoLevel - level`,
       so the band is a price control whether or not it was meant as one: at a
       full step per gate the late maps handed out free evolutions 45-50% of
       the time, which is the flat-candy failure seen from the other side.
       The ceiling is a BOUND with its reason - Deep Woods already sat at 7%
       and nobody objected; 45% is the economy going away. */
    const FREE_CEILING = 0.15;
    const rng = (() => { let t = 11; return () => {
      t |= 0; t = (t + 0x6D2B79F5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    }; })();
    let worst = { share: 0, name: "-" };
    let tagShare = 0;
    for (const b of BIOMES) {
      const [lo, hi] = wildBand(b);
      const table = encounterTable(b, MAX_LEVEL);
      let free = 0, n = 0;
      for (let i = 0; i < 8000; i++) {
        const [id] = table[(rng() * table.length) | 0];
        const rows = evolutionsOf(id);
        if (!rows.length) continue;
        const lv = Math.max(bornLevel(id) + 2, lo) + Math.floor(rng() * WILD_SPAN);
        n++;
        if (evoLevel(rows[0]) - lv <= 0) free++;
      }
      const share = n ? free / n : 0;
      if (share > worst.share) worst = { share, name: b.name };
    }
    assert.ok(worst.share <= FREE_CEILING,
      `${worst.name} evolves ${(worst.share * 100).toFixed(0)}% of what you catch ` +
      `there for nothing - past ${FREE_CEILING * 100}% the candy sink is gone ` +
      "in the map people spend the most time in");

    /* SIZE. In range, centred, and the tag rare enough to be worth noticing -
       a tell on every Pokémon is wallpaper. */
    {
      const seen = [];
      let tagged = 0;
      for (let i = 0; i < 40000; i++) {
        const v = rollSize(rng);
        assert.ok(v >= SIZE_MIN && v <= SIZE_MAX, `rolled a size of ${v}`);
        seen.push(v);
        if (sizeTag(v)) tagged++;
      }
      seen.sort((a, b) => a - b);
      const mid = (SIZE_MIN + SIZE_MAX) / 2;
      assert.ok(Math.abs(seen[seen.length >> 1] - mid) < 3,
        `sizes centre on ${seen[seen.length >> 1]}, not ${mid} - the average one ` +
        "should be average");
      const share = tagged / seen.length;
      tagShare = share;
      assert.ok(share > 0.02 && share < 0.25,
        `${(share * 100).toFixed(1)}% get an XS/XL tag - a tell on everything is wallpaper`);
      assert.equal(sizeTag(mid), null, "the middle of the range must be untagged");
    }

    /* A SAVE WITHOUT SIZES IS NOT A BOX OF IDENTICAL CREATURES. `sizeOf` falls
       back to a hash of the uid, which has to be stable, in range, and spread -
       a fallback that returns the same number for everyone is the thing it
       exists to avoid. */
    {
      const old = Array.from({ length: 500 }, (_, i) => ({ uid: i + 1 }));
      const got = old.map(sizeOf);
      for (const v of got) assert.ok(v >= SIZE_MIN && v <= SIZE_MAX, `hashed out of range: ${v}`);
      assert.ok(new Set(got).size > 20,
        `500 old entries hash to ${new Set(got).size} sizes - that is not a spread`);
      assert.equal(sizeOf({ uid: 7 }), sizeOf({ uid: 7 }), "the fallback must be stable");
      assert.equal(sizeOf({ uid: 7, size: 123 }), 123, "a stored size must win over the hash");
    }

    /* THE NUMBERS IT PRINTS have to be the species' own, in the units a person
       reads - PokéAPI stores decimetres and hectograms, which is why nothing
       ever printed them raw - and weight scales with the CUBE of length,
       because that is what volume does. */
    {
      const sp = speciesById(19);          // Rattata: 0.3 m, 3.5 kg
      const mid = measured(sp, 100);
      assert.ok(near(mid.m, sp.height / 10), "a size-100 Pokémon is not its own height");
      assert.ok(near(mid.kg, sp.weight / 10), "a size-100 Pokémon is not its own weight");
      const big = measured(sp, SIZE_MAX);
      assert.ok(big.m > mid.m && big.kg > mid.kg, "bigger is not bigger");
      assert.ok(big.kg / mid.kg > big.m / mid.m,
        "weight must grow faster than length - a longer animal is thicker too");
    }

    console.log(`senses ok — bands ${bands[0].join("-")} to ${bands.at(-1).join("-")} ` +
      `(${WILD_STEP} per gate, worst free evolutions ${(worst.share * 100).toFixed(0)}% ` +
      `in ${worst.name}); sizes ${SIZE_MIN}-${SIZE_MAX}, ` +
      `${(tagShare * 100).toFixed(1)}% wear an XS/XL tag`);
  }

  /* DIFFICULTY IS CHARGED ONCE, ON THE THROW.

     Reported from play as Beldum seeming uncatchable, and it was within a
     rounding error of it. Its PokeAPI capture rate is 3 - Mewtwo's rate,
     correct data and not ours to edit - so `catchChance` at a plain throw puts
     it exactly ON `NEVER_HOPELESS`. This repo's own notes claimed no species
     in the dex sat on that floor; three do, and they are one line: beldum,
     metang, metagross. Everything else down there is legendary.

     Measured before the fix, at Lv 50 with an Ultra Ball and a Nanab: Beldum
     was 0.052% of Mt Moon's table and **1,914 encounters to own, against
     Mewtwo's 1,318**. A species with no legendary mark, no `legendTier`
     homing and no "hunt where it lives" was harder to get than the hardest
     legendary in the game, because the difficulty was being charged twice -
     once on the throw and again on the spawn.

     `bandFor` drops such a species one band, so the rule is: nothing ordinary
     is both impossible to catch AND in the rarest band to meet. Derived from
     the catch math rather than from a list of dex numbers, so a tenth
     generation's pseudo-legendary is handled on the day it ships - which is
     the failure mode `LEGENDARY` itself already had once, as 34 hand-written
     numbers that missed sixty. */
  {
    const floored = SPECIES.filter((sp) => !isForm(sp.id) && !LEGENDARY.includes(sp.id)
      && catchChance(sp.rate, PLAIN_MULT) <= NEVER_HOPELESS);
    assert.ok(floored.length,
      "nothing sits on the catch floor any more - if that is real this rule is " +
      "dead code, but it is far likelier that PLAIN_MULT or NEVER_HOPELESS moved");
    const stuck = floored.filter((sp) => bandFor(sp.id) === "S");
    assert.deepEqual(stuck.map((sp) => sp.name), [],
      `${stuck.length} species are both on the catch floor and in the rarest ` +
      `band (${stuck.map((sp) => sp.name).join(", ")}) - that is the difficulty ` +
      "charged twice, and it made Beldum harder to own than Mewtwo");
    /* AND THE DROP HAS TO REACH THE DERIVED ROWS. The first version changed
       `bandOf` alone; the derived homes went on reading `sp.tier` straight and
       Beldum's share did not move a thousandth of a percent. One species-level
       answer, asked by everything. */
    for (const sp of floored) {
      assert.notEqual(bandFor(sp.id), sp.tier,
        `${sp.name} is on the catch floor and still banded ${sp.tier}`);
    }
    /* THE POINT OF ALL THAT: it must now be findable enough to be worth the
       throws. Against the legendary it shares a catch rate with, in each of
       their own best maps - a relationship, not a number, so retuning the
       bands cannot quietly undo it. */
    const share = (id) => Math.max(...BIOMES.map((b) => {
      const t = encounterTable(b, MAX_LEVEL);
      const tot = t.reduce((n, r) => n + r[1], 0);
      return (t.find(([i]) => i === id)?.[1] ?? 0) / tot;
    }));
    const hardest = LEGENDARY.filter((id) => speciesById(id)?.rate === floored[0].rate);
    const worst = Math.max(...hardest.map(share));
    assert.ok(share(floored[0].id) > worst,
      `${floored[0].name} is rarer to MEET than the commonest legendary at its ` +
      "own catch rate, so it is strictly harder to own than a legendary");
    console.log(`catch floor ok — ${floored.length} ordinary species on it ` +
      `(${floored.map((sp) => sp.name).join(", ")}), each banded one kinder`);
  }

  console.log(`spawn ladder ok — ${early.size} species in the wild at Lv 1, ` +
    `${late.size} at Lv ${MAX_LEVEL}; legendaries no easier anywhere; nothing born below its own evolution level`);
}

/* THE WORLD'S CLOCK. Pure, and driven by steps rather than by `new Date()` -
   which is what lets this walk a whole day without waiting for one, and what
   stops a player who only plays at lunch from never seeing night. */
{
  // Every phase must actually happen, and be reachable by walking.
  {
    const seen = new Map();
    for (let st = 0; st < DAY_STEPS; st++) {
      const ph = phaseAt(st);
      seen.set(ph.id, (seen.get(ph.id) ?? 0) + 1);
    }
    assert.equal(seen.size, PHASES.length,
      `${seen.size} of ${PHASES.length} phases happen in a whole day`);
    for (const [id, n] of seen) {
      assert.ok(n > DAY_STEPS * 0.05,
        `${id} lasts ${n} steps of ${DAY_STEPS} - too short to notice`);
    }
    /* NIGHT IS A CONDITION SOMETHING HANGS OFF, so it has to be a real slice of
       the day: rare enough that a Dusk Ball is situational, common enough that
       you can plan around it. */
    const night = seen.get("night") / DAY_STEPS;
    assert.ok(night > 0.2 && night < 0.5,
      `night is ${(night * 100).toFixed(0)}% of the day - a Dusk Ball is either ` +
      "useless or always on");
  }

  /* IT WRAPS, and the phase spanning midnight is the one that gets this wrong:
     `phaseAt` walks the table backwards, so hour 0 has to land on the LAST
     phase rather than falling off the front of the list. */
  assert.equal(phaseAt(0).id, PHASES.at(-1).id, "midnight is not the wrapping phase");
  assert.equal(phaseAt(0).id, phaseAt(DAY_STEPS).id, "the day does not wrap cleanly");
  assert.equal(hourAt(DAY_STEPS), hourAt(0), "the hour does not wrap");
  assert.ok(hourAt(DAY_STEPS / 2) > 11 && hourAt(DAY_STEPS / 2) < 13,
    "half a day is not midday");
  assert.equal(isNight(0), true, "midnight is not night");

  // The boundaries in the table are where the phases actually change.
  for (const ph of PHASES) {
    const at = Math.ceil((ph.from / 24) * DAY_STEPS);
    assert.equal(phaseAt(at).id, ph.id, `${ph.id} does not start at ${ph.from}:00`);
    assert.notEqual(phaseAt(at - 1).id, ph.id, `${ph.id} starts before ${ph.from}:00`);
  }

  // `intoPhase` runs 0 to 1 within a phase and never leaves it.
  for (let st = 0; st < DAY_STEPS; st += 7) {
    const t = intoPhase(st);
    assert.ok(t >= 0 && t <= 1, `intoPhase(${st}) is ${t}`);
  }
  assert.ok(/^\d\d:\d\d$/.test(timeLabel(0)), `timeLabel gave "${timeLabel(0)}"`);

  /* THE DUSK BALL KEYS OFF TWO THINGS NOW, and both must still reach its
     headline - a ball that cannot deliver its printed boost is the worst bug
     available here, because nothing about it looks wrong. */
  {
    const dusk = ballById("dusk-ball");
    const open = { types: ["normal"], known: false, areaId: "meadow", throws: 0 };
    assert.equal(liveMult(dusk, { ...open, night: false }), dusk.mult,
      "a Dusk Ball is boosted in an open field in daylight");
    assert.equal(liveMult(dusk, { ...open, night: true }), dusk.boost,
      "a Dusk Ball is NOT boosted at night - that is what it is for");
    assert.equal(liveMult(dusk, { ...open, areaId: "ridge", night: false }), dusk.boost,
      "a Dusk Ball stopped being boosted in a cave");
    /* AND THE TWO CONDITIONS MUST NOT COLLAPSE INTO ONE. A cave is dark round
       the clock, so the ball has to be boosted there in daylight too -
       otherwise "night and caves" is only "night". */
    assert.equal(liveMult(dusk, { ...open, areaId: "ridge", night: true }), dusk.boost,
      "a cave at night should still be boosted");
  }

  /* AND THE ENCOUNTER FREEZES IT. Everything a throw depends on is fixed when
     the Pokemon appears; a clock read at throw time would change a ball's value
     because you took a step mid-animation. */
  {
    const eng = readFileSync(new URL("../src/game/engine.js", import.meta.url), "utf8");
    assert.ok(/night: isNight\(state\.steps\),/.test(eng),
      "the encounter must freeze whether it is night");
    assert.ok(/phaseId: phaseAt\(state\.steps\)\.id,/.test(eng),
      "the encounter must freeze the phase for the scene");
    const src = readFileSync(new URL("../src/game/items.js", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(/enc\.night/.test(src) && !/isNight/.test(src),
      "items.js must read the FROZEN flag, never call the clock itself");
  }

  /* THE SCENE HAS A FACE FOR EVERY PHASE on the open maps. A phase with no sky
     of its own is a phase nobody can see. */
  {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    for (const ph of PHASES) {
      if (ph.id === "day") continue;    // day is the area's own sky, untinted
      assert.ok(css.includes(`[data-phase="${ph.id}"]`),
        `${ph.id} has no sky of its own in styles.css`);
    }
  }

  const nightShare = Array.from({ length: DAY_STEPS }, (_, i) => isNight(i))
    .filter(Boolean).length / DAY_STEPS;
  console.log(`clock ok — ${PHASES.length} phases over ${DAY_STEPS} steps ` +
    `(night ${(nightShare * 100).toFixed(0)}% of it); the Dusk Ball reaches its ` +
    "boost two different ways");
}

/* A LEGENDARY HAS A HOME, and matching on any type was not enough to give it
   one. Articuno is Ice/Flying and the starting map is Normal/Flying, so it was
   exactly as likely in Tall Grass as in Frost Hollow - which is the opposite of
   what "hunt where it lives" is supposed to mean. The primary type is the home;
   a later type is a haunt. */
{
  assert.ok(LEGEND_HOME > LEGEND_HAUNT && LEGEND_HAUNT > LEGEND_STRAY,
    "the three legendary tiers are not in order");

  /* ITS SHARE OF THE LEGENDARY POOL, not of the table. `LEGEND_SHARE` is a
     fixed slice of whatever the table comes to, so a map with a small table
     gives every legendary a bigger slice of ITSELF - Deep Woods has the
     smallest table in the game and made Celebi look commoner there than in its
     own home. Dividing by the pool takes the table's size out and leaves the
     only thing this rule decides: how the pool is split. */
  /* ON THE RULE, not on a finished table. A legendary's share of a table is
     confounded twice - by the size of that map's table, and by how many other
     legendaries call the same map home - and Celebi looked commoner in Deep
     Woods than in the Haunted Tower on both measures while being correctly
     weighted the whole time. `legendTier` is what the rule actually is. */
  let checked = 0;
  for (const id of LEGENDARY) {
    const sp = speciesById(id);
    const homes = BIOMES.filter((b) => b.types.includes(sp.types[0]));
    if (!homes.length) continue;
    for (const b of BIOMES) {
      const tier = legendTier(id, b.types);
      const want = homes.includes(b) ? LEGEND_HOME
        : sp.types.some((t) => b.types.includes(t)) ? LEGEND_HAUNT : LEGEND_STRAY;
      assert.equal(tier, want,
        `${sp.name} in ${b.name} is worth ${tier}, not ${want}`);
    }
    checked++;
  }
  assert.ok(checked >= 8, `only ${checked} legendaries have a home to test`);

  /* THE ONE THAT WAS WRONG, named directly: an ice bird belongs in the ice
     cave, and sharing Flying with the starting map must not make that map its
     equal. */
  const frost = BIOMES.find((b) => b.id === "frost");
  const meadow = BIOMES.find((b) => b.id === "meadow");
  assert.equal(legendTier(144, frost.types), LEGEND_HOME, "Articuno has no home");
  assert.ok(legendTier(144, meadow.types) < legendTier(144, frost.types),
    "Articuno is as likely in Tall Grass as in Frost Hollow - it shares Flying " +
    "with the meadow and Ice with the cave, and only one of those is where it lives");

  console.log(`habitat ok — ${checked} legendaries, each likeliest where its ` +
    `primary type lives (home ${LEGEND_HOME}, haunt ${LEGEND_HAUNT}, stray ${LEGEND_STRAY})`);
}

/* A GENERATION INSERTED IN THE MIDDLE MOVES EVERY POSITION AFTER IT, and a
   save is keyed on position. This is the assertion that stands between Hoenn
   and every existing collection.

   Before Hoenn, `SPECIES` was [1-251, 387-493] and position 251 was Turtwig.
   After it, position 251 is a Hoenn species - so a save loaded by position
   would show every Sinnoh Pokemon somebody has ever caught as a different one,
   silently, with no error anywhere. Padding is the right answer for a
   generation APPENDED and exactly the wrong one for a generation inserted. */
{
  const ids358 = layoutIds(358);
  assert.ok(ids358, "the 358-entry layout is not recorded - saves cannot migrate");
  assert.equal(ids358.length, 358, "the old layout is not 358 entries");
  assert.equal(ids358[0], 1, "the old layout did not start at Bulbasaur");
  assert.equal(ids358[250], 251, "position 250 was not Celebi");
  assert.equal(ids358[251], 387, "position 251 was not Turtwig - the whole point");

  // The current shape needs no migration, and an unknown one gets none.
  assert.equal(layoutIds(SPECIES.length), null, "the current layout was remapped");
  assert.equal(layoutIds(999), null, "an unknown layout was remapped anyway");

  /* AND EVERY OLD LAYOUT HAS TO BE A PREFIX-COMPATIBLE STORY. Each one is what
     `SPECIES` was at some point, so every id it lists must still exist and
     Kanto must still be the first 151 - the thing padding relied on. */
  for (const l of LAYOUTS) {
    const ids = [];
    for (const [lo, hi] of l.ranges) for (let i = lo; i <= hi; i++) ids.push(i);
    assert.equal(ids.length, l.len, `layout ${l.len} lists ${ids.length} ids`);
    for (const id of ids) {
      assert.ok(speciesById(id), `layout ${l.len} lists #${id}, which no longer ships`);
    }
    for (let i = 0; i < Math.min(151, ids.length); i++) {
      assert.equal(ids[i], i + 1, `layout ${l.len} does not start with Kanto in order`);
    }
  }

  /* THE REMAP ITSELF, on a save that looks like a real one: mark a Kanto, a
     Johto and a Sinnoh species caught in the OLD positions and check all three
     come back as themselves. */
  {
    const old = new Array(358).fill(0);
    const was = (id) => ids358.indexOf(id);
    old[was(25)] = 2;        // Pikachu
    old[was(251)] = 2;       // Celebi, the last of the old contiguous run
    old[was(387)] = 2;       // Turtwig, the first id after the hole
    old[was(493)] = 1;       // Arceus, seen but not caught

    const now = new Array(SPECIES.length).fill(0);
    for (let i = 0; i < ids358.length; i++) {
      const at = dexIndex(ids358[i]);
      if (at >= 0) now[at] = old[i];
    }
    for (const [id, want] of [[25, 2], [251, 2], [387, 2], [493, 1]]) {
      assert.equal(now[dexIndex(id)], want,
        `#${id} came back as ${now[dexIndex(id)]}, not ${want}`);
    }
    // And nothing bled into Hoenn, which nobody could have caught yet.
    const hoenn = SPECIES.filter((sp) => genOf(sp.id) === 3);
    assert.ok(hoenn.every((sp) => now[dexIndex(sp.id)] === 0),
      "a pre-Hoenn save came back with Hoenn species already registered");
    // The naive read is what this exists to prevent: position 251 is no longer
    // Turtwig, so padding would have put Turtwig's 2 on a Hoenn species.
    assert.notEqual(SPECIES[251].id, 387,
      "position 251 is still Turtwig - this migration is not needed after all");
  }

  console.log(`save migration ok — ${LAYOUTS.length} layouts recorded; a 358-entry ` +
    `save remaps onto ${SPECIES.length} by id, Sinnoh intact and Hoenn empty`);
}

/* A PROP THE COMPONENT DOES NOT TAKE IS A PROP THAT SILENTLY DOES NOTHING, and
   React will not say so. Every `<Confirm>` in the app passed `data-tip` where
   the component destructures `title` - so every confirm dialog in the game,
   including the two with no undo behind them, rendered an empty `<h3>` and an
   empty `aria-label`. It looked fine: the dialog has a headline of its own in
   `lines`, so the missing one reads as a design choice rather than a fault.
   Asserted against the source because there is nothing to catch it at runtime. */
{
  const files = ["Box.jsx", "Shop.jsx", "Trainer.jsx", "Confirm.jsx"];
  let dialogs = 0;
  for (const f of files) {
    const src = readFileSync(new URL(`../src/ui/${f}`, import.meta.url), "utf8");
    if (f === "Confirm.jsx") {
      assert.ok(/^\s*title,\s*$/m.test(src),
        "Confirm no longer takes `title` - every caller below is now wrong");
      continue;
    }
    for (const call of src.split("<Confirm").slice(1)) {
      dialogs++;
      const props = call.slice(0, call.indexOf("/>"));
      assert.ok(/(^|\s)title=/.test(props),
        `a <Confirm> in ${f} has no title - it will render an empty heading`);
      assert.ok(!/data-tip=/.test(props),
        `a <Confirm> in ${f} still passes data-tip, which Confirm ignores`);
    }
  }
  console.log(`confirm ok — all ${dialogs} dialogs pass a title Confirm actually reads`);
}

/* THE GENERATION LADDER IS DERIVED, so the thing to assert is the SHAPE - and
   the one failure that is silent. `genOpen` treats a generation with no entry
   as open from the first minute, which is the right default for a hole in the
   dex and exactly wrong for a generation nobody got round to adding a gate for:
   ship Unova that way and 156 species land in a new trainer's first hour. */
{
  assert.equal(Object.keys(GEN_UNLOCK).length, GEN_LAST.length,
    "a generation in GEN_LAST has no arrival level - it would open at Lv 1");
  assert.equal(GEN_UNLOCK[1], 1, "Gen 1 must be there from the first minute");

  let prev = 0;
  for (let g = 1; g <= GEN_LAST.length; g++) {
    assert.ok(GEN_UNLOCK[g] > prev, `generation ${g} does not arrive after ${g - 1}`);
    prev = GEN_UNLOCK[g];
  }
  /* AND THE LAST ONE HAS TO BE REACHABLE. A gate at or above the cap is a
     generation that ships and can never be met - the same shape as MAP_LAST <
     MAX_LEVEL, and it is why the step is what it is. */
  assert.ok(prev < MAX_LEVEL,
    `the last generation opens at Lv ${prev} against a cap of ${MAX_LEVEL} - ` +
    `at GEN_STEP ${GEN_STEP} the ladder has outgrown the level curve`);

  /* The mix the old levels were defending is defended by `balance()`, not by
     the gates - measured, because this is the claim that let them come down. */
  const band = (lv) => {
    const out = {}; let total = 0;
    for (const [id, w] of encounterTable(BIOMES[0], lv)) {
      const t = speciesById(id)?.tier;
      if (!t) continue;
      out[t] = (out[t] ?? 0) + w; total += w;
    }
    return { C: out.C / total, S: out.S / total };
  };
  const day1 = band(1), endgame = band(MAX_LEVEL);
  assert.ok(Math.abs(day1.C - endgame.C) < 0.12,
    `the starting map's common band moves ${((day1.C - endgame.C) * 100).toFixed(1)} ` +
    "points across the whole ladder - balance() is no longer holding the mix");
  /* AND THE GATE HAS TO BE VISIBLE SOMEWHERE. It was not, anywhere, and the
     verdict on that arrived from play as "I am level 15 and only meeting Gen 1,
     is this supposed to happen?" - a silent gate is indistinguishable from a
     bug. The Dex's REGION filter is where it says so, because that menu already
     lists every region. Asserted against the source: nothing fails at runtime
     when a label quietly stops mentioning it. */
  {
    const src = readFileSync(new URL("../src/ui/Dex.jsx", import.meta.url), "utf8");
    assert.ok(src.includes("GEN_UNLOCK"),
      "the Dex no longer reads GEN_UNLOCK - a locked region cannot say when it opens");
    assert.ok(/from Lv \$\{at\}/.test(src),
      "the region filter stopped printing the level a generation arrives at");
  }

  console.log(`generations ok — Gen 1 at 1, then every ${GEN_STEP} from ${GEN_FIRST}; ` +
    `${GEN_LAST.length} gates ending at Lv ${prev} under a cap of ${MAX_LEVEL}; ` +
    `Tall Grass commons ${(day1.C * 100).toFixed(1)}% → ${(endgame.C * 100).toFixed(1)}%`);
}

/* AN EFFECT LAYER IS SIZED BY ITS WRAPPER, so the wrapper must be the size of
   the picture. Every tier's extras are `position: absolute; inset: 0` and mask
   with `contain`, which fits the sprite to WHATEVER box they are given - so a
   wrapper that is wider than the art draws a Holo sheen with no relationship to
   the creature it travels over. `.sheet-portrait` was `display: block` around a
   fixed 108px tile, i.e. the full width of the card, and it was reported from
   play as the Holo effect being "so big not matching the sprite".

   The tell it had been seen and mistaken for a nudge: `.astral-aura` carried a
   hand-tuned `inset: -6%` there, which made ONE layer look right on ONE screen
   while the other two stayed wrong. Both halves are asserted, because fixing
   the box and leaving the nudge would over-correct that one layer instead. */
{
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const clean = stripComments(css);
  const block = css.slice(css.indexOf(".sheet-portrait {"));
  const rule = block.slice(0, block.indexOf("}"));
  assert.ok(/width:\s*\d/.test(rule) && /height:\s*\d/.test(rule),
    ".sheet-portrait has no fixed size - its effect layers will be drawn to the " +
    "width of the whole card instead of to the sprite");
  assert.ok(!/\.sheet-portrait\s+\.astral-aura\s*\{[^}]*inset/.test(css),
    "a per-layer inset nudge is back on the sheet portrait - if one layer needs " +
    "it the WRAPPER is the wrong size and the other two are wrong too");
  /* A TIER MAY NOT ANIMATE A PROPERTY IT ALSO DECLARES `!important`, and
     that is the whole of the Glitched bug expressed as a rule.

     `.sprite-glitched` set `filter` with `!important` - it has to, because
     `.mon` runs `mon-appear` whose keyframes set `filter: none` and an
     animation outranks a plain declaration - and then its own `glitch-shift`
     keyframes tried to animate `filter` too, for the channel split. An
     IMPORTANT author declaration outranks an animation, so all six of those
     keyframe filters were discarded and the tier was left as the `transform`
     jitter alone. Reported from play as "it just shakes".

     Nothing failed. The CSS was valid, the animation ran, the property was
     simply never the animation's to set - which is why this is a source
     assertion: there is no runtime symptom short of looking at it.

     Checked for every tier rather than for Glitched, because the trap is the
     `!important` that every one of them needs. */
  {
    const frames = new Map();
    for (const m of clean.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      /* Brace-count to the end of the block - keyframes nest one level, so a
         lazy `[^}]*` stops at the first inner selector. */
      let depth = 0, i = m.index + m[0].length - 1;
      for (; i < clean.length; i++) {
        if (clean[i] === "{") depth++;
        else if (clean[i] === "}" && --depth === 0) break;
      }
      frames.set(m[1], clean.slice(m.index, i));
    }
    const clashes = [];
    for (const tier of TIERS) {
      const re = new RegExp(`\\.sprite-${tier}\\s*\\{([^}]*)\\}`, "g");
      for (const rule of clean.matchAll(re)) {
        const body = rule[1];
        const loud = [...body.matchAll(/([\w-]+)\s*:[^;]*!important/g)].map((x) => x[1]);
        const anim = /animation:\s*([\w-]+)/.exec(body);
        if (!anim || !loud.length) continue;
        const kf = frames.get(anim[1]);
        if (!kf) continue;
        for (const prop of loud) {
          if (new RegExp(`[{;]\\s*${prop}\\s*:`).test(kf)) {
            clashes.push(`${tier}: @keyframes ${anim[1]} animates ${prop}, which .sprite-${tier} declares !important`);
          }
        }
      }
    }
    assert.deepEqual(clashes, [],
      `a tier animates a property its own rule makes !important, so those ` +
      `keyframes are silently discarded:\n  ${clashes.join("\n  ")}`);
  }

  /* AND GLITCHED'S LAYERS HAVE TO EXIST. The split, the tears and the noise
     are what make it corruption rather than a wobble, and they live in
     `VariantFx` so every screen draws the same four. Masked to `--art` like
     every other layer here, or they are rectangles of static over the grass
     behind the creature instead of damage to it. */
  {
    const fx = readFileSync(new URL("../src/ui/Sprite.jsx", import.meta.url), "utf8");
    const layers = ["glitch-ghost red", "glitch-ghost cyan", "glitch-tear", "glitch-blocks"];
    for (const cls of layers) {
      assert.ok(fx.includes(cls), `VariantFx no longer draws ${cls}`);
    }
    for (const cls of ["glitch-ghost", "glitch-tear", "glitch-blocks"]) {
      const at = clean.indexOf(`.${cls}`);
      assert.ok(at > 0, `.${cls} has no rule in styles.css`);
    }
    assert.ok(/\.glitch-ghost,\s*\.glitch-tear,\s*\.glitch-blocks\s*\{[^}]*mask:\s*var\(--art\)/.test(clean),
      "the glitch layers are no longer masked to --art - unmasked they are " +
      "rectangles of static over the ground, not damage to the creature");
    /* BEHIND THE SPRITE, which is what makes the split a fringe rather than a
       flood: a solid fill masked to the outline and laid on top colours the
       whole creature. */
    assert.ok(/\.glitch-ghost\s*\{[^}]*z-index:\s*0/.test(clean),
      "the channel-split silhouettes are no longer behind the sprite");
  }

  /* EVERY TIER HAS A SENTENCE, AND THERE IS ONE COPY OF IT. There were two -
     the Dex sheet's FORMS strip had all eight and the catch banner had the
     four that existed when it was written - so meeting a 1-in-400 Showdown
     raised a banner headed POKEDEX, which is the fallback for "you filled a
     dex slot". Nothing failed, because a missing key in a lookup table is a
     sentence nobody notices is absent.

     Both halves are asserted. The table must be complete, or a tier is
     nameless in two places at once; and neither screen may keep a literal of
     its own, because a second copy is what this was. */
  for (const tier of TIERS) {
    assert.ok(TIER_TELL[tier], `TIER_TELL has nothing to say about ${tier}`);
  }
  assert.deepEqual(Object.keys(TIER_TELL).sort(), [...TIERS].sort(),
    "TIER_TELL and TIERS name different sets of tiers");
  for (const f of ["DexSheet.jsx", "Cheer.jsx", "Variants.jsx"]) {
    const src = stripComments(
      readFileSync(new URL(`../src/ui/${f}`, import.meta.url), "utf8"));
    assert.ok(src.includes("TIER_TELL"), `${f} no longer reads TIER_TELL`);
    /* A literal table keyed on tier names is the shape that drifted. Two or
       more `tier: "..."` rows in one object is that shape. */
    const own = TIERS.filter((t) => new RegExp(`\\b${t}\\s*:\\s*["'\`]`).test(src));
    assert.ok(own.length < 2,
      `${f} has its own per-tier text table again (${own.join(", ")}) - ` +
      `that is the copy that shipped a banner saying POKEDEX over a Showdown`);
  }

  /* AND THE ONE SCREEN THAT SAYS THE ODDS OUT LOUD MUST COMPUTE THEM.

     `TIER_TELL` is forbidden from quoting a number, and the reason is in its
     own comment: two of its strings used to read "ONE IN A THOUSAND" and "ONE
     IN FOUR THOUSAND" and both were wrong the day the ladder was divided by
     4/3. The rare-forms dialog prints a rarity for every tier, which is the
     same hazard with more surface - eight numbers instead of two - so it has
     to read `TIER_ODDS` rather than carry a table of its own.

     A bare three-digit number in that file is what a typed rarity looks like.
     The odds today run 105 to 210, so the shape being forbidden is exactly
     the shape a hand-written one would take. */
  {
    const src = stripComments(
      readFileSync(new URL("../src/ui/Variants.jsx", import.meta.url), "utf8"));
    assert.ok(src.includes("TIER_ODDS"),
      "Variants.jsx no longer reads TIER_ODDS - its rarities are typed in");
    const typed = [...new Set(
      (src.match(/\b\d{3}\b/g) ?? []).map(Number))]
      .filter((n) => TIER_ODDS.some(([, odds]) => Math.round(1 / odds) === n));
    assert.equal(typed.length, 0,
      `Variants.jsx has a tier's odds typed into it (${typed.join(", ")}) - ` +
      "that is the second place the ladder lives, and the first one to be wrong " +
      "the next time it is retuned");
  }

  /* THE RAIL AND THE TEXTBOX SHARE ONE NUMBER, OR THEY OVERLAP.

     The rail moved to the bottom right and `.ballwrap` is `inset: 0` of the
     viewport - so in an encounter its bottom was the bottom of the BATTLE,
     which is the textbox, and the rail sat on top of "A WILD PUMPKABOO
     APPEARED". Reported with a screenshot.

     `--tb-h` is declared once on `.viewport` and read twice: the textbox sizes
     itself from it and the wrap stops its box there. The failure this guards
     is either of them going back to a literal, which is the shape that already
     cost this repo the clock printing on top of the effect card - a typed
     offset for a card that was 31px tall when it was written.

     Measured before it was believed, at 960 / 620 / 460 / 380 / 340 wide and
     with the longest message the box prints: the textbox holds at 16.2-16.4%
     of the viewport at EVERY width, so `min-height` is always what decides it
     and the content never pushes past. Clearance 23 / 15 / 11 / 8 / 7px. */
  {
    const vp = /\.viewport\s*\{([^}]*)\}/.exec(clean);
    assert.ok(vp && /--tb-h:\s*\d/.test(vp[1]),
      "`--tb-h` is not declared on .viewport - it has to be the common " +
      "ancestor, because .ballwrap is a SIBLING of .battle and a custom " +
      "property only inherits downwards");
    for (const [name, sel, prop] of [
      [".textbox", "\\.textbox", "min-height"],
      [".ballwrap.fighting", "\\.ballwrap\\.fighting", "bottom"],
    ]) {
      const rule = new RegExp(`${sel}\\s*\\{([^}]*)\\}`).exec(clean);
      assert.ok(rule, `no rule for ${name}`);
      assert.ok(new RegExp(`${prop}:\\s*var\\(--tb-h\\)`).test(rule[1]),
        `${name} sets ${prop} to something other than var(--tb-h) - the two ` +
        "have to move together or the rail lands on the textbox again");
    }
  }

  console.log("variant layers ok — the sheet portrait is sized to its art, so " +
    `every tier's layer fits it by construction; no tier animates its own ` +
    `!important property; ${TIERS.length} tiers each have one shared sentence`);
}

/* THE ART TABLE MUST NAME EVERY GENERATION, because its last row is a catch-all
   and a catch-all cannot be wrong loudly.

   `ART_GEN` is `[[386, 3], [Infinity, 4]]`: everything past Hoenn is declared to
   be drawn in Generation IV art, which is true of the four generations that
   ship and is a claim about all nine. Ship Unova against it and every Unova
   species is recorded as wearing Gen IV art when `fetch-species` actually pulls
   it from a Gen V set - and the thing that reads this is `hasOrigin`, so the
   symptom would be an Origin tier that is silently wrong for a whole region,
   which is exactly the fault that shipped for Sinnoh once already.

   This does not demand the rows exist today. It demands that the catch-all
   never covers a generation that has SHIPPED without somebody having looked:
   the highest id `ART_GEN` names explicitly must reach the end of the dex. */
{
  const named = ART_GEN.filter(([hi]) => Number.isFinite(hi));
  const top = Math.max(...named.map(([hi]) => hi));
  const last = SPECIES[SPECIES.length - 1].id;
  const tail = ART_GEN[ART_GEN.length - 1][1];
  /* Forms are not in this: they are barred from Origin outright (`hasOrigin`
     refuses them), and `genOf` reads one through to the species it evolves
     from - so a Mega of every generation lands in the catch-all and makes it
     look like it spans all nine. It spans one real art set. */
  const covered = SPECIES.filter((sp) => sp.id > top && !isForm(sp.id));
  const gens = [...new Set(covered.map((sp) => genOf(sp.id)))];
  assert.ok(gens.length <= 1,
    `ART_GEN's catch-all row claims Gen ${tail} art for ${gens.length} different ` +
    `generations (${gens.join(", ")}) - species past #${top} do not share a base ` +
    "art set, so hasOrigin() is wrong for at least one of them. Add a row.");
  assert.ok(gens.length === 0 || gens[0] >= tail,
    `ART_GEN says species past #${top} are drawn in Gen ${tail} art, but Gen ` +
    `${gens[0]} debuts after it - a species cannot predate its own artwork`);
  console.log(`art table ok — every one of ${SPECIES.length} species has a base ` +
    `art generation, the catch-all covering Gen ${gens[0] ?? tail} only (to #${last})`);
}

/* TWO SIBLINGS MUST NOT SHARE A KEY, and React does not say so - it silently
   stops reconciling them. The dex sheet's portrait gave `<Sprite>` and
   `<VariantFx>` the same `key={shown}` so the layer would remount and restart
   its animation on a swap; the duplicate meant the OLD `<img>` stayed mounted
   beside the new one, two 108px pictures in a 108px box, the second spilling
   over the FORMS strip. Reported as the preview not changing, which is exactly
   what it looks like when the stale one is drawn on top.

   The rule is narrower than "no duplicate keys": an `<img>` never needs one at
   all, because a new `src` IS the update. Only a layer carrying a CSS animation
   does. Asserted against the source, since nothing fails at runtime. */
{
  const src = readFileSync(new URL("../src/ui/DexSheet.jsx", import.meta.url), "utf8");
  const portrait = src.slice(src.indexOf("sheet-portrait"), src.indexOf("sheet-no"));
  const keys = [...portrait.matchAll(/key=\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.equal(new Set(keys).size, keys.length,
    `the dex portrait gives ${keys.length} siblings only ${new Set(keys).size} distinct ` +
    "keys - React stops reconciling them and the old sprite stays mounted");
  assert.ok(!/<Sprite[^>]*key=/s.test(portrait),
    "the portrait's <Sprite> is keyed - an image needs no key, a new src is the update");
  console.log(`dex portrait ok — ${keys.length} keyed layer(s), all distinct, image unkeyed`);
}

/* THE PICKER MUST DRAW THE SAME ART THE MAP DOES. Both trainers live in one
   strip - `build_player` stacks Red's four facings then Leaf's - so the tiles in
   the YOU panel are a background offset into `player.png` rather than separate
   images. That is the point: a second copy of the art is a second thing to
   regenerate, and it would drift silently, showing a trainer you do not play.

   So the offset is checked against the sheet's own manifest instead of trusted.
   `chars.leaf` is a row index; the CSS offset is that many rows of `rowH` at
   `scale`, negative. */
{
  const sheet = JSON.parse(readFileSync(
    new URL("../public/tilesets/player.json", import.meta.url), "utf8"));
  assert.ok(sheet.chars, "player.json has no `chars` - run npm run art");
  const names = Object.keys(sheet.chars);
  assert.ok(names.length >= 2, `player.png carries ${names.length} trainer(s)`);
  assert.equal(sheet.chars.red, 0, "Red is not the first block of rows");

  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  /* THE GAP IS WHAT CAN BE WRONG, not the origin. The tiles are cropped to the
     art rather than to the cell - a walk frame is 16x32 and the trainer only
     fills the bottom 19 of it - so both rules carry the same inset, and
     asserting an absolute offset would be asserting that crop rather than the
     thing that matters. What matters is that the two tiles are a whole
     character block apart: get that wrong and the picker shows a trainer you do
     not play, which is the failure this exists for. */
  const offsetOf = (name) => {
    const head = css.indexOf(`.gate-art.ch-${name} {`);
    assert.ok(head >= 0, `.gate-art.ch-${name} has no rule - the gate cannot draw ${name}`);
    const rule = css.slice(head, css.indexOf("}", head) + 1);
    /* IN SHEET ROWS, NOT PIXELS, and that is the whole reason this got simpler.
       The rules used to carry four hand-scaled numbers (48/57/768, -39, -423)
       that all had to agree about a 3x zoom, and the assertion had to divide
       the background-size by 256 to recover it. They are written as the real
       measurement times `--z` now - which is what lets the settings list draw
       the same art at 2x without a second copy of the rule - so the offset
       reads straight off as a row count and there is no scale to get wrong. */
    const at = Number(
      rule.match(/background-position:\s*0\s+calc\(\s*(-?\d+)px\s*\*\s*var\(--z\)/)?.[1] ?? NaN);
    assert.ok(Number.isFinite(at),
      `.gate-art.ch-${name} has no readable offset - it must be calc(-Npx * var(--z))`);
    return at;
  };

  /* Read out of `.gate-art` itself, not the first `background-size` in the
     whole stylesheet - which is what the first version did, and it matched an
     icon somewhere else and made the gap come out at 8.5px. */
  /* AND THE PICTURE HAS TO BE FETCHABLE, which nothing asked.

     Every NUMBER in `.gate-art` was checked - the offsets against
     `player.json`, the background-size against the PNG's own header - and the
     `background-image` beside them read `url("tilesets/player.png")`, a
     RELATIVE url in a stylesheet. Those resolve against the STYLESHEET, not
     the page: `/src/tilesets/player.png` under the dev server, which Vite
     answers with index.html as text/html, and `dist/assets/tilesets/player.png`
     in a build, which does not exist. The trainer never drew on the onboarding
     screen in either, and the span is `aria-hidden`, so there was not even an
     alt to go missing. Reported from play.

     Vite says so every build - "didn't resolve at build time, it will remain
     unchanged to be resolved at runtime" - and it had been scrolling past.

     THE RULE IS THE CLASS, NOT THE ASSET. `public/` is copied verbatim and is
     never resolved by Vite, so no url() in this stylesheet may name a path:
     every image arrives as a custom property built against `document.baseURI`,
     which is what `spriteUrl`, `--icon`, `--ground`, `--strip` and now
     `--trainer` all do. `url()` with nothing in it is the placeholder the
     `--ground` default uses and is the one allowed form. */
  {
    const named = [...css.matchAll(/url\(\s*(?!var\()([^)]+?)\s*\)/g)]
      .map((m) => m[1].replace(/^["']|["']$/g, ""))
      .filter((u) => u && !u.startsWith("data:"));
    assert.equal(named.length, 0,
      `styles.css names an asset path in url(): ${named.join(", ")} - a relative ` +
      "url() resolves against the stylesheet, so it is /src/ under the dev server " +
      "and dist/assets/ in a build, and public/ is neither. Build it against " +
      "document.baseURI in JS and pass it in as a custom property");
  }

  const artHead = css.indexOf(".gate-art {");
  assert.ok(artHead >= 0, ".gate-art has no rule");
  const artRule = css.slice(artHead, css.indexOf("}", artHead) + 1);

  /* THE SHEET IS NOT SQUARE ANY MORE, AND THIS ASSERTION SAID IT WAS.

     It read "the one number the rule may not get wrong is 256: the sheet is
     square" and pinned `background-size: calc(256px * var(--z))` - which was
     true of a 256x256 strip and became false the day a fifth set was cut from
     the rip and it went to 320 wide. The assertion went on passing, because it
     was checking that the CSS says 256 rather than that 256 is RIGHT: it
     locked the bug in instead of catching it. The trainer picker drew every
     frame at 0.8x with four pixels of the next one showing, and it took a bug
     report to find.

     The size is asserted against the PNG's own header in the player suite now
     - two copies of one number checked against each other, not against a
     memory of what the number used to be. What is left here is the part that
     is genuinely a property of this rule. */
  assert.ok(/--z:\s*\d+/.test(artRule),
    ".gate-art has no --z, so the settings list cannot draw it at a second size");

  for (let i = 1; i < names.length; i++) {
    const want = (sheet.chars[names[i]] - sheet.chars[names[i - 1]]) * sheet.rowH;
    const got = offsetOf(names[i - 1]) - offsetOf(names[i]);
    assert.equal(got, want,
      `${names[i - 1]} and ${names[i]} sit ${got} sheet rows apart in the ` +
      `picker, but player.json puts them ${want} apart - the gate would show ` +
      "a trainer you do not play");
  }

  console.log(`trainer art ok — ${names.join("/")} picked from one strip, ` +
    "the picker's offsets match player.json");
}

/* ONE PLACE KNOWS WHERE THE SAVE LIVES, and it is the precondition for the save
   living anywhere else. Ten bare `localStorage` calls were scattered across
   engine.js and App.jsx, each with its own try/catch and its own idea of what
   to do when storage is unavailable - the quota handling existed in one of the
   five writers and not the other four. A hosted backend cannot be slotted
   behind twelve call sites; it can be slotted behind one module.

   Asserted as an absence, which is the only way to state "nobody else does
   this": no file outside store.js may name `localStorage` except to REMOVE a
   key, which has no failure worth reporting. Comments are stripped first,
   because the prose absolutely should name it. */
{
  const files = ["src/game/engine.js", "src/App.jsx", "src/ui/Trainer.jsx", "src/ui/Rail.jsx"];
  for (const f of files) {
    const raw = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    const code = stripComments(raw);
    const hits = [...code.matchAll(/localStorage\.(\w+)/g)].map((m) => m[1])
      .filter((fn) => fn !== "removeItem");
    assert.deepEqual(hits, [],
      `${f} calls localStorage.${hits.join("/")} directly - it goes through ` +
      "store.js, or the save can never live anywhere but this browser");
  }
  const store = readFileSync(new URL("../src/game/store.js", import.meta.url), "utf8");
  assert.ok(/export const SAVE_KEY/.test(store), "store.js does not own the save key");
  assert.ok(/QuotaExceededError/.test(store),
    "store.js no longer distinguishes a full quota - it is the one cause a " +
    "player can act on");
  console.log(`storage ok — ${files.length} files go through store.js; nothing else ` +
    "names localStorage");
}

/* THE RULES RUN WITHOUT A BROWSER, and that is the whole reason a server can
   ever be trusted with them.

   Shared leaderboards and trading need the outcome of a catch decided somewhere
   a player cannot edit. That is only affordable if the rules can MOVE - if
   deciding a throw means shipping `catch.js` and `items.js` to an edge function
   rather than rewriting them in another language, against another copy of the
   tables, which would then drift from this one exactly the way every other
   second copy in this codebase has.

   Measured today: of thirteen modules in `src/game`, only three touch the
   browser at all - `engine.js` (the frame loop), `tileset.js` (drawing) and
   `store.js` (where the save lives). Everything that DECIDES anything - the
   catch roll, the tables, the economy, the evolution graph, the medals, the
   daily quest, the clock - is already pure. That was not planned for a server;
   it fell out of `tools/play.mjs` needing to drive the engine in Node and
   check.mjs needing to roll 400,000 variants without a canvas.

   So this asserts an absence, and it is the load-bearing one for that whole
   path: a `document` reference added to `biomes.js` breaks the port silently,
   months before anyone tries it. Comments are stripped first - the prose
   mentions `document` in the ordinary English sense and should be free to. */
{
  const HOST = ["engine.js", "tileset.js", "store.js"];
  const BROWSER = /\b(document|window|localStorage|sessionStorage|navigator|location|requestAnimationFrame|HTMLElement|Image)\b/;

  const dir = new URL("../src/game/", import.meta.url);
  const mods = readdirSync(dir).filter((f) => f.endsWith(".js"));
  const pure = mods.filter((f) => !HOST.includes(f));
  assert.ok(pure.length >= 8, `only ${pure.length} portable modules - the scan is broken`);

  for (const f of pure) {
    const code = stripComments(readFileSync(new URL(f, dir), "utf8"));
    const hit = code.match(BROWSER)?.[0];
    assert.ok(!hit,
      `src/game/${f} names \`${hit}\` in its CODE. Everything outside ` +
      `${HOST.join("/")} has to run in an edge function unchanged, or deciding a ` +
      "catch on the server means a second copy of these rules");
  }

  // And the three that do touch it are the three that are SUPPOSED to.
  for (const f of HOST) {
    assert.ok(mods.includes(f), `${f} is gone - update the host list`);
  }
  console.log(`portable ok — ${pure.length} of ${mods.length} rule modules are ` +
    `browser-free; only ${HOST.join(", ")} need one`);
}

/* THE ACCOUNT LAYER, and the two things about it that can quietly go wrong.

   It cannot be driven end to end from here - that needs a real project and a
   network - so what is asserted is the part that is pure and the part that is
   structural: the merge rule, and that nothing in the game requires a backend
   to exist. Both are the failures that would ship silently. */
{
  const { newer } = await import("../src/game/store.js");

  /* WHICHEVER HAS WALKED FURTHER WINS. Two devices, one account, and no way to
     ask which the player meant. `steps` is the only counter in the game that
     cannot go down, so more steps is strictly more play and taking the larger
     can only ever discard the shorter session. */
  const at = (n) => JSON.stringify({ steps: n, marker: n });
  assert.equal(newer(at(10), at(4)), at(10), "the longer local save lost");
  assert.equal(newer(at(4), at(10)), at(10), "the longer remote save lost");
  assert.equal(newer(null, at(3)), at(3), "a fresh browser did not take the account's save");
  assert.equal(newer(at(3), null), at(3), "a missing remote save discarded the local one");
  assert.equal(newer(null, null), null, "two absences produced something");
  // A tie is the same save; the account's copy is the record.
  assert.equal(newer(at(7), at(7)), at(7), "a tie did not settle on the remote");
  /* A save that will not parse never beats one that does. Stated as the
     BEHAVIOUR, because that is all this can show: `newer` scores an unreadable
     save -1 rather than 0, which is the safer sentinel, but with ties going to
     remote the two are indistinguishable from outside. Worth asserting anyway -
     this is the direction that loses a collection - and worth not pretending it
     pins the -1. */
  assert.equal(newer("{not json", at(0)), at(0),
    "an unparseable save beat a real one - that is the direction that loses a dex");

  /* NOTHING IN THE GAME REQUIRES AN ACCOUNT. `cloud.js` is the only file that
     may import the Supabase client, and with no credentials every path through
     it has to answer "no account" rather than throw - the game is playable
     offline, a dropped connection is not a dead screen, and this suite runs
     without a network. Asserted as an absence, the only way to say "nobody
     else does this". */
  const dir = new URL("../src/", import.meta.url);
  const walk = (at) => readdirSync(at, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(new URL(`${e.name}/`, at)) : [new URL(e.name, at)]);
  const offenders = walk(dir)
    .filter((u) => /\.jsx?$/.test(u.pathname) && !u.pathname.endsWith("net/cloud.js"))
    .filter((u) => /@supabase\/supabase-js/.test(readFileSync(u, "utf8")))
    .map((u) => u.pathname.split("/src/")[1]);
  assert.deepEqual(offenders, [],
    `${offenders.join(", ")} imports the Supabase client directly - it goes ` +
    "through net/cloud.js, or the game stops working without an account");

  const cloud = readFileSync(new URL("net/cloud.js", dir), "utf8");
  assert.ok(/export const CLOUD/.test(cloud), "cloud.js does not say whether it is configured");
  for (const fn of ["signUp", "signIn", "signOut", "pull", "push", "restore"]) {
    assert.ok(new RegExp(`(export async function|export function) ${fn}\\b`).test(cloud),
      `cloud.js has no ${fn} - Boot calls it`);
  }
  /* Every call has to survive being made with nothing configured. `CLOUD` is
     checked in each of them rather than once at the top, because a module that
     throws on import takes the whole game with it. */
  const guarded = cloud.split("\n").filter((l) => /!CLOUD/.test(l)).length;
  assert.ok(guarded >= 5,
    `only ${guarded} of cloud.js's entry points check CLOUD - one that does not ` +
    "throws on a build with no credentials");
  console.log("account ok — the merge takes the longer walk; nothing but " +
    "net/cloud.js needs a backend");
}

/* THE NAME RULES ARE IN TWO PLACES ON PURPOSE, and they have to agree.

   `nameProblem` runs in the form so a player is told what is wrong while they
   type instead of after a round trip. The CHECK constraint on `profiles` is the
   rule, because a form can be bypassed and a table cannot - and because
   uniqueness is not something a form can promise at all: two people typing the
   same name at the same moment both pass every check a browser can do, and
   only the unique index settles it.

   Two copies of a rule drift, which this codebase has been bitten by four
   times. So the assertion is that the pattern in the SQL and the pattern in the
   form accept and reject the same strings - not that they are written the same
   way, because one is Postgres and one is JavaScript. */
{
  const { nameProblem, NAME_MIN, NAME_MAX, ageProblem, ageOn, MIN_AGE } =
    await import("../src/game/name.js");

  const good = ["Ash", "Daniel", "red_fox", "Blue-2", "a b c", "x".repeat(NAME_MAX)];
  for (const v of good) {
    assert.equal(nameProblem(v), null, `"${v}" should be a valid name`);
  }

  const bad = [
    ["", "empty"], ["  ", "spaces only"], ["ab", "too short"],
    ["x".repeat(NAME_MAX + 1), "too long"],
    ["a<b>", "angle brackets"], ["drop;table", "semicolon"],
    ["emoji\u{1F600}", "emoji"], ["tab\there", "tab"],
  ];
  for (const [v, why] of bad) {
    assert.ok(nameProblem(v), `"${v}" (${why}) should be rejected`);
  }

  // Trimmed before measuring, or " ab " passes a length check it should fail.
  assert.equal(nameProblem(" Ash "), null, "a padded name should be trimmed and accepted");
  assert.ok(nameProblem(` ${"x".repeat(NAME_MAX)} x`), "trimming must not rescue an over-long name");

  /* AND THE DOCUMENTED SQL MUST SAY THE SAME THING. The table is created from
     SUPABASE.md on a fresh project, so a bound changed here and not there ships
     a database that disagrees with the form. */
  const doc = readFileSync(new URL("../SUPABASE.md", import.meta.url), "utf8");
  const shape = doc.match(/username ~ '\^\[([^\]]+)\]\{(\d+),(\d+)\}\$'/);
  assert.ok(shape, "SUPABASE.md no longer documents the username constraint");
  assert.equal(Number(shape[2]), NAME_MIN,
    `SQL allows names from ${shape[2]} characters, the form from ${NAME_MIN}`);
  assert.equal(Number(shape[3]), NAME_MAX,
    `SQL allows names up to ${shape[3]} characters, the form up to ${NAME_MAX}`);
  /* THE AGE GATE IS A BOUNDARY, so the test is the day either side of it
     rather than a date that is obviously too young. `ageOn` counts on the
     calendar because dividing milliseconds by 365.25 is wrong for anybody born
     on a leap day and a day out for plenty of others - and "are you 13" is not
     a question to answer with an off-by-one. */
  const at = new Date("2026-09-17T12:00:00");
  const day = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  assert.equal(ageProblem(day(2026 - MIN_AGE, 9, 17), at), null,
    `somebody turning ${MIN_AGE} today is refused`);
  assert.ok(ageProblem(day(2026 - MIN_AGE, 9, 18), at),
    `somebody who turns ${MIN_AGE} tomorrow is let in`);
  assert.ok(ageProblem("", at), "a blank date passes the gate");
  assert.ok(ageProblem(day(2030, 1, 1), at), "a date in the future passes the gate");
  assert.ok(ageProblem(day(1850, 1, 1), at), "an impossible year passes the gate");

  // A leap-day birthday counts the same as every other one.
  assert.equal(ageOn("2012-02-29", new Date("2026-02-28T12:00:00")), 13, "leap day, day before");
  assert.equal(ageOn("2012-02-29", new Date("2026-03-01T12:00:00")), 14, "leap day, day after");

  /* AND THE TABLE HOLDS ITS OWN BOUNDS, for the reason the name shape does:
     the form can be bypassed with the public key and the table cannot. It
     deliberately does NOT hold the age - `current_date` in a CHECK is
     evaluated at write time, so the constraint would mean something different
     every day and a restore could fail on rows that were always valid. */
  assert.ok(/birthdate_sane/.test(doc), "the birthdate has no bounds in the SQL");
  assert.ok(!/birthdate[^;]*current_date/.test(doc),
    "the birthdate CHECK uses current_date - it means something different tomorrow");

  console.log(`name rules ok — ${good.length} accepted, ${bad.length} refused, ` +
    `${NAME_MIN}-${NAME_MAX} matching the SQL constraint`);
  console.log(`age gate ok — ${MIN_AGE} exactly, counted on the calendar, bounded in SQL`);
}

/* THE TYPED CONFIRMATION MUST GATE THE KEYBOARD TOO. `Confirm` fires
   `onConfirm` on Enter, which went straight through the typed field the first
   time this was wired - a stray Return with the dialog open would have deleted
   the account the field exists to guard, making it decorative. Asserted
   against the source because there is no DOM here to press a key in. */
{
  const src = readFileSync(new URL("../src/ui/Confirm.jsx", import.meta.url), "utf8");
  assert.ok(/typeToConfirm/.test(src), "Confirm lost its typed confirmation");

  const onKey = src.slice(src.indexOf('e.key === "Enter"'), src.indexOf("addEventListener"));
  assert.ok(/if \(armed\)/.test(onKey),
    "Enter in Confirm is not gated on the typed word - the field is decorative");

  const yes = src.slice(src.indexOf("cf-yes"), src.indexOf("confirmLabel}"));
  assert.ok(/disabled=\{!armed\}/.test(yes),
    "the confirm button is not disabled until the word is typed");

  /* AND THERE IS EXACTLY ONE CALLER. Account deletion is the only action in
     the game that destroys something no amount of play can get back; if a
     second one appears, it wants thinking about rather than copying.

     COUNTED ACROSS THE WHOLE UI, not asserted against a named file - the first
     version read Trainer.jsx, and when the account controls moved to their own
     settings dialog the assertion failed for the one reason that is not a bug.
     A test that has to be edited every time a component moves is a test that
     gets edited without being read. */
  const ui = readdirSync(new URL("../src/ui/", import.meta.url))
    .filter((f) => f.endsWith(".jsx"))
    .map((f) => [f, readFileSync(new URL(`../src/ui/${f}`, import.meta.url), "utf8")]);
  const asks = ui.filter(([, body]) => /typeToConfirm=\{/.test(body));
  assert.equal(asks.length, 1,
    `${asks.length} dialogs ask for a typed confirmation (${asks.map(([f]) => f).join(", ")}) - there should be one, for deleting an account`);
  assert.ok(/typeToConfirm=\{account\.name\}/.test(asks[0][1]),
    "deleting an account no longer asks for the name to be typed");
  console.log(`typed confirm ok — the word gates the button AND the Enter key, in ${asks[0][0]}`);
}

console.log(`areas ok — ${BIOMES.length} maps, ${LEGENDARY.length} legendaries in every one, ${sizes[0]} … ${sizes.at(-1)}`);
