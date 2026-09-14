/* The game engine. Deliberately outside React: it owns the state, runs its own
   requestAnimationFrame loop and draws straight to the canvas. React never
   re-renders per frame — the engine calls onChange() only when something the
   UI actually shows has changed (a step, a dex entry, an encounter phase). */

import { SPECIES } from "../data/species.js";
import {
  AREAS, AREA_IDS, areaOf, walkable, label, MINI, MINI_UNKNOWN,
} from "./map.js";
import {
  biomeFor, tableFor, bornLevel, areaOpen, levelFromXp, xpForCatch,
  rodTable, rodBite,
  rollVariant, TIERS,
  lockedTiers, originReady,
} from "./biomes.js";
import {
  emptyStats, canSpend, catchMult, weighted, stepScale,
  pricedAt, valuedAt, xpScale,
} from "./trainer.js";
import {
  TILE, loadArt, drawTile, drawPlayer, drawOverhangs, drawBobber, fishFrame,
} from "./tileset.js";
import { resolveThrow } from "../catch.js";
import { nextStep, settlePhase, nextCast } from "./phases.js";
import { medalsFor, milestoneAt } from "./medals.js";
import {
  ballById, liveMult, itemById, forSale, sellValue, candyValue, CANDY_PRICE,
  evolveState, evoLevel, startingState, DEX_BONUS, levelReward,
  evolutionRow, bestRod, holding, canRun, RUN_LEVEL,
  stepReward,
} from "./items.js";

export const VIEW_W = 15;
export const VIEW_H = 11;
const SCALE = 2;              // canvas backing store multiplier, for crispness
const STEP_MS = 150;          // tune: lower feels snappier, higher feels heavier
const BIKE_SCALE = 0.55;      // the Bicycle, on top of whatever Stride is worth
const RUN_SCALE = 0.7;        // Running Shoes: quicker than walking, short of a bike
/* Per step, anywhere you can walk. Every walkable tile spawns - there is no
   "safe" ground - so this is far lower than a grass-only rate would be, and the
   two work out to a similar number of encounters per minute of walking. */
const ENCOUNTER_RATE = 0.07;

/* Throw animation beats, taken from pret/pokefirered's pokeball.c and converted
   from frames at 60fps: arc to target, ~10f delay then the mon shrinks, ball
   closes and falls through four decreasing bounces, 31f of dead stillness, then
   shakes. A three-shake catch runs ~5.2s there and ~5.2s here. Always skippable. */
export const T = { throw: 560, suck: 460, drop: 560, wait: 520, shake: 720, result: 1200 };

/* The cast. The float sitting there doing nothing is the point - a rod that
   resolved the instant you pressed F read as a menu, not as fishing. */
export const F = { cast: 620, wait: 1500, bite: 620, miss: 1250 };

const SAVE_KEY = "meadow-route";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const START_AREA = AREA_IDS[0];

function freshState() {
  return {
    areaId: START_AREA,
    player: { ...areaOf(START_AREA).spawn, dir: "up" },
    dex: new Array(151).fill(0), // 0 unseen, 1 seen, 2 caught
    caught: 0,
    steps: 0,
    xp: 0,
    nextUid: 1,
    ...startingState(),
    rev: 0,
    /* One byte per species: has a SHINY of this one ever been registered. A
       second array rather than a third value in `dex`, because "seen / caught"
       and "caught shiny" are independent - you can meet a shiny, fail to catch
       it, and the dex should still say seen. */
    /* One byte array per rare tier. Separate arrays rather than one array of
       tiers, because a species can be registered in all four and none of them
       replaces another in the dex - a shiny Rattata does not stop you wanting
       the Origin one. Built from `TIERS` so a new tier cannot ship with a
       working roll and nowhere to record it. */
    ...Object.fromEntries(TIERS.map((t) => [t, new Array(SPECIES.length).fill(0)])),
    // Medal ids already banked, so none can ever pay twice.
    medals: [],
    // Where the levels go. Ranks are spent, never refunded.
    stats: emptyStats(),
    biking: false,
    running: false,
    encounter: null,
    evolution: null,
    fishing: null,
    /* Things worth stopping to say. A queue, because a catch can fill the last
       slot of a milestone and level you up in the same instant. */
    cheers: [],
  };
}

/* An array of 0/1 of exactly `len`, whatever arrived. */
function normalise(arr, len) {
  const out = new Array(len).fill(0);
  if (Array.isArray(arr))
    for (let i = 0; i < len && i < arr.length; i++) out[i] = arr[i] ? 1 : 0;
  return out;
}

/* Is this object a save we could actually load?

   `loadState` already answers this for localStorage, and an imported file has
   to clear the same bar - so the test is written once, here, and both callers
   use it. It is deliberately shallow: everything past this point is repaired by
   loadState rather than rejected, because a save that is merely odd should
   still open. What cannot be repaired is a file that was never a save at all,
   and that is what this catches - along with, one day, a save from a version
   that knew more species than this one does. */
export function saveProblem(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "That is not a save file.";
  if (!Array.isArray(s.dex)) return "No Pokédex in that file.";
  if (s.dex.length !== SPECIES.length)
    return `That save holds ${s.dex.length} species; this game knows ${SPECIES.length}.`;
  if (!Array.isArray(s.box)) return "No storage box in that file.";
  if (typeof s.money !== "number" || !Number.isFinite(s.money))
    return "That save has no money in it.";
  return null;
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshState();
    const s = JSON.parse(raw);
    if (!Array.isArray(s.dex) || s.dex.length !== 151) return freshState();
    return {
      ...freshState(), ...s, rev: 0,
      /* A save from before shinies existed has neither of these, and a
         hand-edited or imported one could hold anything at all - so both are
         rebuilt to the right shape rather than trusted. */
      /* Every tier rebuilt to the right shape, including ones the save has
         never heard of: a file written before Holo existed simply has no
         `holo`, and `normalise(undefined)` is a fresh row of zeroes. That is
         what makes adding a tier a non-event for saves. */
      ...Object.fromEntries(
        TIERS.map((t) => [t, normalise(s[t], SPECIES.length)])),
      /* MIGRATION, and it has to run AFTER the line above or it is overwritten.
         `astral` used to mean the Generation I sprite - what is now called
         Origin - so a save written before the split has its Origins filed under
         the old name. They are the same Pokemon and the same artwork; only the
         word changed, so they move across rather than being dropped or silently
         promoted to the rarest tier. `origin` wins if both somehow exist. */
      origin: normalise(s.origin ?? s.astral, SPECIES.length),
      astral: normalise(s.origin ? s.astral : null, SPECIES.length),
      medals: Array.isArray(s.medals) ? s.medals.filter((m) => typeof m === "string") : [],
      // A save from before stats existed has none, and a hand-edited one could
      // hold anything; the trainer module clamps each rank as it reads it.
      stats: { ...emptyStats(), ...(s.stats ?? {}) },
      /* A save from before candy existed simply has none. No migration and no
         back-pay: the duplicates it was hoarding for the old feed are still in
         its box and convert at the same rate as anyone else's. */
      candy: Math.max(0, Math.floor(Number(s.candy) || 0)),
      /* MIGRATION. Running was a level check before it was an item, so a save
         written then is past level 15 with an empty shoe slot - and would
         have silently LOST the ability to run, which is the one change a
         player would feel immediately. Granted on sight, once. */
      bag: levelFromXp(s.xp ?? 0) >= RUN_LEVEL && !holding(s.bag, "running-shoes")
        ? { ...s.bag, "running-shoes": 1 }
        : s.bag,
      biking: !!s.biking && holding(s.bag, "bicycle"),
      encounter: null, evolution: null, cheers: [],
    };
  } catch {
    return freshState();
  }
}

/* ---- the minimap -------------------------------------------------------

   Three pixels per tile. Two was unreadable at Frost Hollow's corridor widths
   and four made a 40-row map taller than a third of the viewport; three is the
   smallest that still shows a one-tile passage as a line rather than a dot.

   It is drawn by the ENGINE, not by React, for the same reason the route is:
   the camera rectangle on it has to be the camera, and a copy of the clamp in
   `render()` computed one frame later in a component is a box that lags what
   is on screen by a frame and drifts at the map edges, where the clamp bites.

   The terrain is BAKED once per area to an offscreen canvas. An area's shape
   does not change while you stand in it, and repainting ~1,300 filled rects at
   60fps to move one dot is the most expensive thing that would be on screen.
   Per frame it costs one `drawImage`, one stroked rectangle and two arcs. */
const MINI_TILE = 3;

export function createEngine(canvas, onChange, mini = null) {
  const ctx = canvas.getContext("2d");
  // setTransform, not scale: scale() compounds if the engine is ever remounted
  // (React StrictMode mounts effects twice in dev), silently doubling the zoom.
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  // Pixel art upscaled 2x: smoothing samples neighbouring metatiles out of the
  // atlas and draws a seam along every tile edge.
  ctx.imageSmoothingEnabled = false;

  const state = loadState();
  if (!AREAS[state.areaId]) state.areaId = START_AREA;
  /* MIGRATION. Maps were all open once, so a save can be standing on one its
     trainer has not earned - and without this it would be stranded there, since
     `travel` now refuses to move it and every other map is a lock away. Sent
     home rather than granted the map: the ladder is the point. */
  if (!areaOpen(state.areaId, levelFromXp(state.xp ?? 0))) state.areaId = START_AREA;

  // The tile grid of whichever area you are standing in.
  let rows = areaOf(state.areaId).rows;
  let MAP_W = rows[0].length;
  let MAP_H = rows.length;
  // Transcribed areas carry the real map's own tile ids; the rest are drawn
  // entirely from the rules and have none.
  let fixed = areaOf(state.areaId).tiles ?? null;
  const at = (x, y) => (rows[y] ? rows[y][x] ?? "" : "");

  /* The baked terrain and the context that blits it. Both are rebuilt by
     `bakeMini()` whenever `rows` changes, which is only ever `travel()`. */
  let miniCtx = null;
  let miniArt = null;

  function bakeMini() {
    if (!mini) return;
    const w = MAP_W * MINI_TILE;
    const h = MAP_H * MINI_TILE;
    /* A 2x backing store behind a CSS size of exactly w x h, the same trick
       the route canvas uses: the dot and the camera box are drawn as vectors,
       and at 1x a 1px stroke on a 3px grid lands on half-pixels and blurs. */
    mini.width = w * 2;
    mini.height = h * 2;
    mini.style.width = `${w}px`;
    mini.style.height = `${h}px`;

    miniArt = document.createElement("canvas");
    miniArt.width = w;
    miniArt.height = h;
    const b = miniArt.getContext("2d");
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        b.fillStyle = MINI[rows[y][x]] ?? MINI_UNKNOWN;
        b.fillRect(x * MINI_TILE, y * MINI_TILE, MINI_TILE, MINI_TILE);
      }
    }
    miniCtx = mini.getContext("2d");
    miniCtx.setTransform(2, 0, 0, 2, 0, 0);
    miniCtx.imageSmoothingEnabled = false;
  }

  /* Takes the camera and the interpolated player position the route was just
     drawn with, so the two pictures are the same instant. */
  function drawMini(camX, camY, wx, wy) {
    if (!miniCtx || !miniArt) return;
    const k = MINI_TILE / TILE;          // world pixels -> minimap pixels
    miniCtx.clearRect(0, 0, miniArt.width, miniArt.height);
    miniCtx.drawImage(miniArt, 0, 0);

    /* What is on screen right now. Offset by half a pixel so a 1px stroke
       covers one pixel instead of straddling two and rendering grey. */
    miniCtx.lineWidth = 1;
    miniCtx.strokeStyle = "rgba(255, 255, 255, .85)";
    miniCtx.strokeRect(
      Math.round(camX * k) + 0.5, Math.round(camY * k) + 0.5,
      Math.round(VIEW_W * TILE * k) - 1, Math.round(VIEW_H * TILE * k) - 1,
    );

    /* You. A white ring under a red dot, and the ring is the load-bearing
       half: a red dot alone disappears into Ember Caldera's lava and a white
       one into Frost Hollow's ice, so the marker carries its own contrast
       instead of relying on whatever it happens to be standing on. */
    const px = wx * k + MINI_TILE / 2;
    const py = wy * k + MINI_TILE / 2;
    miniCtx.fillStyle = "#fff";
    miniCtx.beginPath();
    miniCtx.arc(px, py, 3, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.fillStyle = "#d8402f";
    miniCtx.beginPath();
    miniCtx.arc(px, py, 1.7, 0, Math.PI * 2);
    miniCtx.fill();
  }

  const held = new Set();
  const move = {
    active: false, fromX: state.player.x, fromY: state.player.y,
    startedAt: 0, ms: STEP_MS, hop: false,
  };
  let art = { atlas: null, player: null };
  let walkFrame = 0;
  let raf = 0;
  let saveTimer = null;

  /* The engine mutates its state in place and tells React to re-render, which
     works for anything read during render but silently breaks useMemo: after a
     catch, state.box is the same array object, so a memo keyed on it never
     recomputes and the BOX tab shows the box as it was. Every change bumps this
     instead, and panels put it in their dependency list. */
  /* How long one step takes right now. Stride shortens it and the Bicycle
     shortens it again, so the two stack instead of one hiding the other. Read
     fresh every step rather than cached, because either can change mid-walk. */
  const stepMs = () =>
    STEP_MS * stepScale(state.stats) *
    (state.biking ? BIKE_SCALE : state.running ? RUN_SCALE : 1);

  const changed = () => {
    state.rev++;
    onChange();
  };

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        // running is a held key, not a setting - restoring it true would have
        // the trainer sprinting with nothing pressed.
        const { encounter, evolution, fishing, running, cheers, rev, ...rest } = state;
        localStorage.setItem(SAVE_KEY, JSON.stringify(rest));
      } catch { /* private mode — play on, just don't persist */ }
    }, 400);
  }

  loadArt().then((loaded) => { art = loaded; });

  // ------------------------------------------------------------ movement

  function tryStep(dir) {
    const p = state.player;
    p.dir = dir;
    const nx = p.x + (dir === "left" ? -1 : dir === "right" ? 1 : 0);
    let ny = p.y + (dir === "up" ? -1 : dir === "down" ? 1 : 0);

    /* Ledges are one-way. Walking south into one hops it and lands you on the
       far side, so a terrace is quick to leave and slow to get back onto -
       which is the whole reason Route 1 has them. From any other direction a
       ledge is simply a wall, which `walkable` already reports. */
    const hop = dir === "down" && at(nx, ny) === "L" && walkable(rows, nx, ny + 1);
    if (hop) ny += 1;
    else if (!walkable(rows, nx, ny)) return;

    move.fromX = p.x;
    move.fromY = p.y;
    move.active = true;
    move.startedAt = performance.now();
    // A hop covers two tiles, so give it longer or it reads as a teleport.
    move.ms = stepMs() * (hop ? 1.7 : 1);
    move.hop = hop;
    p.x = nx;
    p.y = ny;
  }

  function onArrive() {
    walkFrame++;
    state.steps++;

    /* Walking pays. `stepReward` is pure and the panel calls it too, on the
       same step count, so the balls granted here and the +N that floats over
       the STEPS counter can never disagree - there is one function, not a
       number passed around. Only the tenth parcel is worth stopping for; the
       rest land quietly, because a banner every half minute of walking is not
       a reward, it is an interruption. */
    const parcel = stepReward(state.steps, levelFromXp(state.xp));
    if (parcel) {
      give(parcel.items);
      if (parcel.haul) {
        cheer({
          kind: "steps",
          title: `${state.steps.toLocaleString()} STEPS`,
          /* A Master Ball is not "the long way round pays" - it is the one
             thing walking gives you that nothing else in the game will, so it
             says so. The items list under the banner shows it either way; this
             is the line that makes someone look at the list. */
          sub: parcel.treasure
            ? "A Master Ball, for the distance. Nothing else pays one."
            : "The long way round pays.",
          items: parcel.items,
        });
      }
    }

    /* Every tile in an area belongs to that area's biome, and standing on a
       tile already proves it is walkable, so there is nothing left to test -
       anywhere you can put your feet, something can appear. */
    const biome = biomeFor(state.areaId);
    if (biome && !state.evolution && Math.random() < ENCOUNTER_RATE) {
      /* The level is part of the table, not a modifier on the roll: past Lv 8
         a map starts turning up the evolved forms of what already lives there.
         `tableFor` caches, because this is asked on every step that spawns. */
      startEncounter(tableFor(biome, levelFromXp(state.xp)));
    }
    save();
    changed();
  }

  function travel(areaId) {
    if (!AREAS[areaId] || state.encounter || state.evolution) return false;
    // The gate, enforced where the move actually happens rather than only in
    // the panel that offers it.
    if (!areaOpen(areaId, levelFromXp(state.xp))) return false;
    state.areaId = areaId;
    rows = areaOf(areaId).rows;
    fixed = areaOf(areaId).tiles ?? null;
    MAP_W = rows[0].length;
    MAP_H = rows.length;
    bakeMini();
    const spawn = areaOf(areaId).spawn;
    state.player = { ...spawn, dir: "down" };
    move.active = false;
    move.fromX = spawn.x;
    move.fromY = spawn.y;
    held.clear();
    save();
    changed();
    return true;
  }

  // ------------------------------------------------------------ encounters

  /* Fortune reshapes the table before the roll rather than after it, so the
     odds still sum to one and no entry can ever be dropped or invented. */
  function pickSpecies(table) {
    const rolled = weighted(table, state.stats);
    const total = rolled.reduce((n, e) => n + e[1], 0);
    let r = Math.random() * total;
    for (const [id, w] of rolled) if ((r -= w) < 0) return SPECIES[id - 1];
    return SPECIES[table[0][0] - 1];
  }

  function startEncounter(table, source = "wild") {
    held.clear();
    const sp = pickSpecies(table);
    /* Whether the dex already has this one, read BEFORE the throw can register
       it. It rides on the encounter rather than being looked up while drawing,
       because the panel would then read live state: settling a catch sets the
       dex to 2, so a brand new species would sprout a CAUGHT badge halfway
       through its own capture animation. A snapshot cannot do that. */
    const known = state.dex[sp.id - 1] === 2;
    if (state.dex[sp.id - 1] === 0) state.dex[sp.id - 1] = 1;
    /* Rolled once, here, so every screen that draws this encounter agrees -
       and so a re-render cannot roll it again into a different answer.
       `rollVariant` owns the precedence: rarest wins, and nothing is ever two
       of them, because there is no such thing as a shiny Gen 1 sprite.

       Origin is held back until this species' generation is fully caught -
       see `lockedTiers`. It is passed in rather than checked inside the roll
       so the roll stays a pure function of its arguments, which is what lets
       check.mjs drive it 400,000 times with a seeded clock. */
    const variant = rollVariant(Math.random, lockedTiers(state.dex, sp.id));

    state.encounter = {
      speciesId: sp.id,
      name: label(sp).toUpperCase(),
      types: sp.types,
      known,
      variant,
      /* The same word as four booleans, so a panel can ask `enc.holo` without
         re-deriving anything. Spread from `TIERS` rather than typed out: the
         one line that used to be three is the line a new tier gets forgotten
         in, and a forgotten `holo: false` reads as "ordinary" everywhere. */
      ...Object.fromEntries(TIERS.map((t) => [t, variant === t])),
      rate: sp.rate,
      /* Which map this happened on, so a Dusk Ball can ask. Copied onto the
         encounter rather than read off `state` when the ball rolls, for the
         same reason `known` is: everything a throw depends on is fixed at the
         moment the Pokemon appeared, and nothing that happens afterwards -
         including travelling - can change what you are looking at. */
      areaId: state.areaId,
      /* Throws already made at THIS Pokemon. The Timer Ball reads it, and it
         is why a ball that breaks free is not simply a wasted ball. */
      throws: 0,
      /* Wild levels are 2-7, EXCEPT that nothing may appear below the level
         it evolves at: a wild Venusaur is a Lv 32 Venusaur. Rolled on top of
         that floor rather than replaced by it, so a found evolution is not
         pinned to exactly its threshold. */
      level: bornLevel(sp.id) + 2 + Math.floor(Math.random() * 6),
      phase: "idle",
      shakesDone: 0,
      shakesTotal: 0,
      pending: null,
      ball: "poke-ball",
      isNew: false,
      source,
      msg: source === "fishing"
        ? `Something bit! A wild ${label(sp).toUpperCase()}!`
        : `A wild ${label(sp).toUpperCase()} appeared!`,
      until: 0,
    };
    save();
  }

  /* The tile you are facing, which is the only thing fishing cares about. */
  function facing() {
    const { x, y, dir } = state.player;
    const fx = x + (dir === "left" ? -1 : dir === "right" ? 1 : 0);
    const fy = y + (dir === "up" ? -1 : dir === "down" ? 1 : 0);
    return at(fx, fy);
  }

  /* Open water is solid, so nothing in it was ever going to walk up the bank to
     meet you - a rod is the only way to reach any of it. Returns the rod that
     would be used, or null, which is also what the UI shows the prompt from. */
  /* Where the line goes, which the bobber is drawn on. */
  function facingXY() {
    const { x, y, dir } = state.player;
    return [x + (dir === "left" ? -1 : dir === "right" ? 1 : 0),
            y + (dir === "up" ? -1 : dir === "down" ? 1 : 0)];
  }

  function castable() {
    if (state.encounter || state.evolution || state.fishing || move.active) return null;
    // Outdoor water and the pools in Rock Ridge both take a line.
    if (!"wW".includes(facing())) return null;
    return bestRod(state.bag);
  }

  function fish() {
    const rod = castable();
    if (!rod) return false;
    if (!rodTable(rod.id)) return false;
    const [fx, fy] = facingXY();
    /* `from` and `castMs` are here so the lure can be drawn in the air. The
       float used to appear in the water on the first frame of the cast, while
       the trainer was still winding up - the rod animation played over a line
       that had already landed, which read as the whole cast being fake. */
    state.fishing = {
      phase: "cast", until: performance.now() + F.cast, castMs: F.cast,
      rod: rod.id, name: rod.name, x: fx, y: fy,
      fromX: state.player.x, fromY: state.player.y,
    };
    changed();
    return true;
  }

  function toggleBike() {
    if (!holding(state.bag, "bicycle")) return false;
    state.biking = !state.biking;
    save();
    changed();
    return state.biking;
  }

  /* Spending a point is one-way. The trainer module owns the rules; this only
     applies them, so the panel and the engine can never disagree about whether
     a point was available. */
  function spend(statId) {
    if (!canSpend(state.stats, levelFromXp(state.xp), statId)) return false;
    state.stats = { ...state.stats, [statId]: (state.stats[statId] ?? 0) + 1 };
    save();
    changed();
    return true;
  }

  function throwBall(ballId = "poke-ball") {
    const e = state.encounter;
    if (!e || e.phase !== "idle") return;

    const ball = ballById(ballId);
    if (!ball || (state.bag[ball.id] ?? 0) <= 0) return;
    state.bag[ball.id] -= 1;
    e.ball = ball.id;

    /* The roll happens here, once. Everything after is a readout of it.
       Precision multiplies the ball rather than replacing it, so a better ball
       is still better; the Master Ball is already past certain, so scaling it
       changes nothing.

       `liveMult` rather than `ball.mult`: a situational ball is worth what its
       condition says right now, and the rail draws the same number from the
       same function - so what you were shown is what was rolled. Read BEFORE
       the throw is counted, because the Timer Ball's step is "throws that have
       already failed" and counting this one first would pay it a turn early. */
    const result = resolveThrow(e.rate, liveMult(ball, e) * catchMult(state.stats));
    e.throws += 1;
    e.pending = result;
    e.shakesTotal = result.shakes;
    e.shakesDone = 0;
    e.phase = "throw";
    e.msg = "";
    e.until = performance.now() + T.throw;
    changed();
  }

  function cheer(entry) {
    state.cheers.push(entry);
  }

  /* Pay a reward and say so. Money and balls both land here, so there is one
     place where a payout can be wrong rather than four. */
  function give(items) {
    for (const [id, n] of Object.entries(items ?? {}))
      state.bag[id] = (state.bag[id] ?? 0) + n;
  }

  function pay(money, items, entry) {
    if (money) state.money += money;
    give(items);
    cheer({ ...entry, money, items });
  }

  /* Called after any dex entry is filled, by a catch or by an evolution.

     Two kinds of reward, and both were missing: filling the dex paid ¥100 per
     first catch and nothing whatever for finishing a line, a type, a map or the
     whole thing. `medalsFor` only looks at the medals that mention this species
     - the index is built once - so this stays a couple of short scans however
     many medals there are. */
  function checkDexRewards(speciesId) {
    for (const medal of medalsFor(speciesId, state.dex, state.medals)) {
      state.medals.push(medal.id);
      pay(medal.money, medal.items, {
        kind: "medal", title: medal.name, sub: medal.sub,
      });
    }

    const caught = state.dex.reduce((n, v) => n + (v === 2 ? 1 : 0), 0);
    const stone = milestoneAt(caught);
    if (stone) {
      pay(stone.money, stone.items, {
        kind: "dex",
        title: `${caught} SPECIES`,
        /* Completing the dex is the moment Origins start appearing in the
           wild, and a reward nobody is told about is not a reward. This is
           the only place that can say so at the moment it becomes true. */
        sub: caught === SPECIES.length
          ? "Complete. Origin Pokémon now appear in the wild."
          : `${SPECIES.length - caught} left to find.`,
      });
    }
  }

  /* Levelling hands out balls. Returns what was won, or null, so the caller can
     say so in whatever message it is already showing. */
  function gainXp(amount) {
    const before = levelFromXp(state.xp);
    state.xp += Math.max(1, Math.round(amount * xpScale(state.stats)));
    const after = levelFromXp(state.xp);
    if (after <= before) return null;

    const won = {};
    for (let lv = before + 1; lv <= after; lv++) {
      for (const [id, n] of Object.entries(levelReward(lv))) {
        state.bag[id] = (state.bag[id] ?? 0) + n;
        won[id] = (won[id] ?? 0) + n;
      }
    }
    /* The Running Shoes used to be announced by hand here, because they were
       a bare level check with no item behind them. They are a key item now,
       so `levelReward` hands them over with the rods and the Bicycle and the
       banner lists them like anything else - this line goes back to being
       about the shop. */
    const sub = "New stock in the shop.";
    cheer({ kind: "level", title: `TRAINER LEVEL ${after}`, sub, items: won });
    return { level: after, items: won };
  }

  function settle(now) {
    const e = state.encounter;
    const phase = settlePhase(e.pending);

    if (phase === "caught") {
      e.isNew = state.dex[e.speciesId - 1] !== 2;
      state.dex[e.speciesId - 1] = 2;
      state.caught++;
      /* A first shiny - or a first Astral - of a species is its own event, even
         for one you already had. That is most of the point of both. */
      const roll = e.variant;
      e.newVariant = !!roll && !state[roll][e.speciesId - 1];
      if (roll) state[roll][e.speciesId - 1] = 1;
      state.box.push({
        uid: state.nextUid++,
        species: e.speciesId,
        level: e.level,
        ...(roll ? { [roll]: 1 } : {}),
        at: Date.now(),
      });
      if (e.newVariant) {
        /* The species is the headline, not the word SHINY - the kind label
           above it already names the tier, and saying it twice was the
           first thing that looked wrong when this was drawn. The line under it
           spends itself on what you actually want to know at that moment:
           nothing can take this one off you by accident. */
        cheer({
          kind: roll,
          title: e.name,
          sub: {
            origin: "Drawn the way it was in 1996. Never sold, never fed.",
            shiny: "A shiny. Never sold as a spare, never eaten as feed.",
            holo: "The same picture, pressed in foil. Never sold, never fed.",
            astral: "The rarest thing there is. Never sold, never fed.",
          }[roll],
        });
      }
      // After the box push, so a medal cheer queues behind the shiny one.
      if (e.isNew) checkDexRewards(e.speciesId);
      const sp = SPECIES[e.speciesId - 1];
      const gained = gainXp(xpForCatch(sp, e.isNew));

      if (e.isNew) {
        state.money += DEX_BONUS;
        e.msg = `Gotcha! ${e.name} was caught!  +¥${DEX_BONUS} new entry`;
      } else {
        e.msg = `Gotcha! ${e.name} was caught!`;
      }
      if (gained) {
        e.levelUp = gained.level;
        e.reward = gained.items;
      }
      save();
    } else if (phase === "fled") {
      e.msg = `${e.name} fled!`;
    } else {
      e.msg = "It broke free!";
    }
    e.phase = phase;
    e.until = now + T.result;
    changed();
  }

  function advance(now) {
    const f = state.fishing;
    if (f) {
      const cast = nextCast(f, now, F);
      if (cast) {
        if (cast.roll) {
          // One roll, here, so the machine itself stays pure and testable.
          const hooked = Math.random() < rodBite(f.rod);
          Object.assign(f, hooked
            ? { phase: "bite", until: now + F.bite }
            : { phase: "miss", until: now + F.miss });
        } else if (cast.hook) {
          const table = rodTable(f.rod);
          state.fishing = null;
          startEncounter(table, "fishing");
        } else if (cast.close) {
          state.fishing = null;
        } else {
          Object.assign(f, cast);
        }
        changed();
      }
      return;   // no encounter can be running while a line is out
    }

    const e = state.encounter;
    if (!e) return;

    const step = nextStep(e, now, T);
    if (!step) return;
    if (step.settle) return settle(now);
    if (step.close) {
      state.encounter = null;
      changed();
      return;
    }
    Object.assign(e, step);
    changed();
  }

  function flee() {
    const e = state.encounter;
    if (!e || e.phase !== "idle") return;
    e.phase = "ran";
    e.msg = "Got away safely.";
    e.until = performance.now() + 450;
    changed();
  }

  // Skip straight to the result. In a game with hundreds of throws, waiting out
  // the drama every time stops being drama.
  function skip() {
    const e = state.encounter;
    if (!e || !e.pending) return;
    if (["throw", "suck", "drop", "wait", "shake"].includes(e.phase)) {
      settle(performance.now());
    }
  }

  // ------------------------------------------------------------ render

  function render(now) {
    const p = state.player;
    const t = move.active ? clamp((now - move.startedAt) / move.ms, 0, 1) : 1;
    const wx = (move.fromX + (p.x - move.fromX) * t) * TILE;
    const wy = (move.fromY + (p.y - move.fromY) * t) * TILE;

    const camX = clamp(wx + TILE / 2 - (VIEW_W * TILE) / 2, 0, MAP_W * TILE - VIEW_W * TILE);
    const camY = clamp(wy + TILE / 2 - (VIEW_H * TILE) / 2, 0, MAP_H * TILE - VIEW_H * TILE);

    const x0 = Math.floor(camX / TILE);
    const y0 = Math.floor(camY / TILE);
    for (let y = y0; y <= y0 + VIEW_H; y++) {
      for (let x = x0; x <= x0 + VIEW_W; x++) {
        // Off the map draws as tree so the void reads as forest, but neighbour
        // lookups get "" there - otherwise the tree depth walk never ends.
        const ch = at(x, y) || rows[0][0];
        drawTile(ctx, art.atlas, ch, Math.round(x * TILE - camX), Math.round(y * TILE - camY),
                 x, y, at, fixed ? fixed[y * MAP_W + x] : -1);
      }
    }

    /* A hop has its own mid-air pose - legs tucked, one frame per facing - and
       the renderer still puts it on an arc and leaves the shadow behind.
       Running is its own three frames; a cast is its own four, held by phase. */
    const cast = state.fishing;
    const hopping = move.active && move.hop;
    drawPlayer(
      ctx, art.player, Math.round(wx - camX), Math.round(wy - camY),
      p.dir, walkFrame, move.active, t,
      {
        set: cast ? "fish"
          : hopping ? "jump"
          : state.running && move.active ? "run" : "walk",
        frame: cast ? fishFrame(p.dir, cast.phase) : undefined,
        lift: hopping ? Math.sin(Math.PI * t) * 11 : 0,
      },
    );

    drawBobber(ctx, state.fishing, now, camX, camY);

    drawOverhangs(ctx, art.atlas, x0, y0, VIEW_W, VIEW_H, camX, camY, at);

    drawMini(camX, camY, wx, wy);
  }

  /* WHAT COUNTS AS A STALL. A real frame is 16ms, a janky one 100, a slow
     asset decode maybe 250. Anything past this is not a frame, it is the tab
     coming back. Pushing deadlines forward on a merely slow frame would cost a
     few milliseconds of encounter timer and nothing else, so the threshold is
     deliberately generous. */
  const STALL = 400;
  let lastFrame = performance.now();

  function frame() {
    const now = performance.now();

    /* THE GAP, FROM ANY CAUSE - and "any cause" is the fix.

       This was a `visibilitychange` listener, which handles exactly one of the
       ways the clock runs on without us: a hidden TAB. It does not fire when
       you alt-tab to another window, or when the window is merely occluded by
       another one, and Chrome throttles or stops rAF in both of those - so the
       engine came back to a `now` far past every deadline with no compensation
       at all, and the phase machine fired one step per frame until it caught
       up. A throw left mid-air resolved in six frames. That is what "the game
       stops when I switch windows" actually was: it did not stop, it
       fast-forwarded the moment you came back.

       Measured in the loop instead, so it needs no event and cannot miss one.
       A debugger pause, a sleeping laptop and a backgrounded window all look
       the same from here, because they are the same thing. */
    const gap = now - lastFrame;
    lastFrame = now;
    if (gap > STALL) {
      if (move.active) move.startedAt += gap;
      if (state.encounter?.until) state.encounter.until += gap;
      if (state.fishing?.until) state.fishing.until += gap;
      /* Keys are dropped because a keyup fired while we were away never
         reached us, and a held direction would walk the trainer on his own.
         `running` with it, or the rail shows RUN over somebody standing still.
         `changed()` because React has been told nothing for however long. */
      held.clear();
      state.running = false;
      changed();
    }

    if (move.active && now - move.startedAt >= move.ms) {
      move.active = false;
      move.fromX = state.player.x;
      move.fromY = state.player.y;
      onArrive();
    }
    if (!move.active && !state.encounter && !state.evolution && !state.fishing && held.size) {
      tryStep([...held][held.size - 1]); // most recently pressed direction wins
    }
    advance(now);
    render(now);
    raf = requestAnimationFrame(frame);
  }
  /* ---- a hidden tab pauses, it does not fast-forward -------------------
     `requestAnimationFrame` stops being called when the page is hidden, so
     the game freezes on its own - that part is the browser and is fine. What
     is NOT fine is coming back: every deadline in here is an absolute
     `performance.now()` stamp, so after two minutes in another window the
     first frame back finds `now` far past all of them and the phase machine
     fires one step per frame. A throw you left mid-air resolves in six
     frames, the ball shakes, and something is caught or gone before you have
     focused the window.

     So the gap is measured and every live deadline is pushed forward by it.
     There are exactly three - a walk in progress, the encounter's phase, and
     a cast - and they are all here rather than scattered, which is the only
     reason this is three lines instead of an audit.

     Held keys are dropped too. `blur` in App.jsx already does that for a
     window switch, but moving to another TAB in the same window does not
     always blur, and a key held through that would walk the trainer the
     moment you returned. */

  bakeMini();
  raf = requestAnimationFrame(frame);

  /* Haggle's two halves. The UI has to price things the same way the engine
     charges for them, so both go through here and the engine hands them out. */
  const priceOf = (item) => pricedAt(item.price, state.stats);
  const valueOf = (sp) => valuedAt(sellValue(sp), state.stats);

  function buy(itemId, qty = 1) {
    const item = itemById(itemId);
    // Key items and the Master Ball have no price; without this they would be
    // free, since the cost of qty x 0 is 0.
    if (!item || !forSale(item) || qty < 1) return false;
    const cost = priceOf(item) * qty;
    if (state.money < cost) return false;
    state.money -= cost;
    state.bag[item.id] = (state.bag[item.id] ?? 0) + qty;
    save();
    changed();
    return true;
  }

  /* Evolve ONE Pokemon, named by uid.

     It used to take (speciesId, targetId, whichVariant) and consume a pile, and
     every hard part of it was a consequence of that: which of six Pidgey is the
     hero, does the Holo get spent to make an ordinary Pidgeotto, does the panel
     agree with the selection about how many are available. A uid has none of
     those questions in it. The Pokemon that goes in is the Pokemon that comes
     out, carrying its own level and its own tier.

     The animation stays cosmetic - the state change has already happened by the
     time it plays, so a tab closed mid-flash has nothing half-applied. */
  function evolve(uid, targetId) {
    if (state.encounter || state.evolution) return null;

    const mon = state.box.find((m) => m.uid === uid);
    if (!mon) return null;
    const row = evolutionRow(mon.species, targetId);
    if (!row) return null;
    const st = evolveState(mon, state.bag, row);
    if (!st.ready) return null;

    if (st.stone) state.bag[st.stone] -= 1;

    const target = SPECIES[targetId - 1];
    const isNew = state.dex[targetId - 1] !== 2;
    state.dex[targetId - 1] = 2;
    state.caught++;

    /* The tier travels with the creature, because it IS the creature - rarest
       first so a hand-edited save carrying two is described by its best. */
    const roll = TIERS.find((t) => mon[t]) ?? null;
    if (roll) state[roll][targetId - 1] = 1;

    /* Mutated in place rather than removed and re-pushed. The uid survives an
       evolution, which is what makes it a Pokemon rather than a slot - and it
       is what a future trade or battle log would need to refer to. */
    mon.species = targetId;
    mon.at = Date.now();

    if (isNew) {
      checkDexRewards(targetId);
      state.money += DEX_BONUS;
    }
    const gained = gainXp(xpForCatch(target, isNew));

    state.evolution = {
      from: row.from,
      to: targetId,
      fromName: label(SPECIES[row.from - 1]).toUpperCase(),
      toName: label(target).toUpperCase(),
      level: mon.level,
      /* The scene has to wear the tier too. Without it you level a shiny
         Charmander, watch an ordinary one become an ordinary Charmeleon, and
         then find a shiny Charmeleon in the box - the one moment the game
         shows you the change is the one moment it showed the wrong sprite. */
      variant: roll,
      at: evoLevel(row),
      isNew,
      levelUp: gained?.level ?? null,
      reward: gained?.items ?? null,
    };
    save();
    changed();
    return state.evolution;
  }

  function closeEvolution() {
    if (!state.evolution) return;
    state.evolution = null;
    held.clear();
    changed();
  }

  /* The other half of a sale. Deliberately a near-twin of `sell` rather than a
     shared helper with a flag: they differ only in which number goes up, and
     one function that sometimes pays cash and sometimes pays candy is one
     `if` away from paying both. Neither is affected by Haggle - that stat
     prices cash, and candy is not cash. */
  function convert(uids) {
    const wanted = new Set(uids);
    if (!wanted.size) return 0;
    let got = 0;
    state.box = state.box.filter((mon) => {
      if (!wanted.has(mon.uid)) return true;
      got += candyValue(SPECIES[mon.species - 1]);
      return false;
    });
    state.candy += got;
    save();
    changed();
    return got;
  }

  /* Candy into levels, on ONE named Pokemon. 1 candy = 1 level.

     `n` is clamped to what is actually held rather than refused, so the Box can
     offer "raise it as far as this will go" without doing the sum twice and
     disagreeing with the engine about the answer. Returns the levels bought, so
     0 reads as "nothing happened" at every call site. */
  function levelUp(uid, n = 1) {
    const mon = state.box.find((m) => m.uid === uid);
    const spend = Math.min(Math.floor(n), state.candy);
    if (!mon || spend < 1) return 0;
    state.candy -= spend;
    mon.level += spend;
    save();
    changed();
    return spend;
  }

  /* Cash into candy. Priced through `priceOf` like everything else in the shop,
     so Haggle discounts it - candy is bought with money, and the stat that
     makes money go further has to make it go further here too or the shop has
     two rules. */
  function buyCandy(qty = 1) {
    const cost = pricedAt(CANDY_PRICE, state.stats) * Math.max(1, Math.floor(qty));
    if (qty < 1 || state.money < cost) return false;
    state.money -= cost;
    state.candy += Math.floor(qty);
    save();
    changed();
    return true;
  }

  function sell(uids) {
    const wanted = new Set(uids);
    if (!wanted.size) return 0;
    let earned = 0;
    state.box = state.box.filter((mon) => {
      if (!wanted.has(mon.uid)) return true;
      earned += valueOf(SPECIES[mon.species - 1]);
      return false;
    });
    state.money += earned;
    save();
    changed();
    return earned;
  }

  return {
    state,
    travel,
    buy,
    buyCandy,
    sell,
    convert,
    levelUp,
    spend,
    fish,
    toggleBike,
    // Read by the UI every render: what a cast would use, and what things cost.
    castable,
    /* Shift is held, not toggled, so this is driven from keydown and keyup and
       cleared on blur. Gated on the BAG now as well as the level - the shoes
       are a real item. */
    setRunning(on) {
      const want = Boolean(on) && canRun(levelFromXp(state.xp), state.bag);
      if (want === state.running) return;
      state.running = want;
      changed();
    },
    priceOf,
    valueOf,
    evolve,
    closeEvolution,
    // The UI shows one at a time and drops it when its moment is over.
    dropCheer() {
      state.cheers.shift();
      changed();
    },
    press: (dir) => held.add(dir),
    release: (dir) => held.delete(dir),
    clearHeld: () => held.clear(),
    throwBall,
    flee,
    skip,
    reset() {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    },

    /* The save, as a plain object, for writing to a file. Everything that is
       excluded from the on-disk save is excluded here too - an encounter or a
       half-played cheer is not part of who you are - so what comes out is
       exactly what goes back in. */
    exportSave() {
      const { encounter, evolution, fishing, running, cheers, rev, ...rest } = state;
      return { ...rest, savedAt: new Date().toISOString(), species: SPECIES.length };
    },

    /* A summary of a file being offered, so the confirm step can show what is
       about to replace what rather than asking "are you sure" about nothing.
       Returns { problem } or { caught, rare, level, money, box, savedAt }.

       `rare` counts EVERY tier, not shinies. This is the last screen before a
       file replaces the one you are playing, and "12 caught, 1 shiny" over a
       save holding three Origins and a Holo is the wrong number in the one
       place a wrong number costs you the save you had. */
    inspectSave(obj) {
      const problem = saveProblem(obj);
      if (problem) return { problem };
      const registered = (a) =>
        (Array.isArray(a) ? a.reduce((n, v) => n + (v ? 1 : 0), 0) : 0);
      return {
        caught: obj.dex.reduce((n, v) => n + (v === 2 ? 1 : 0), 0),
        rare: TIERS.reduce((n, t) => n + registered(obj[t]), 0),
        level: levelFromXp(obj.xp ?? 0),
        money: obj.money,
        candy: obj.candy ?? 0,
        box: obj.box.length,
        savedAt: obj.savedAt ?? null,
      };
    },

    /* Replace the running game with a file. Writes and reloads rather than
       swapping state in place: the engine holds the map rows, its dimensions
       and a pile of closures over them, and reloading is the one path that is
       certainly consistent - and it is already how reset() works. */
    importSave(obj) {
      const problem = saveProblem(obj);
      if (problem) return problem;
      clearTimeout(saveTimer);          // do not let the old game save over it
      localStorage.setItem(SAVE_KEY, JSON.stringify(obj));
      location.reload();
      return null;
    },
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(saveTimer);
    },
  };
}
