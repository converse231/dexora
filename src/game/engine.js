/* The game engine. Deliberately outside React: it owns the state, runs its own
   requestAnimationFrame loop and draws straight to the canvas. React never
   re-renders per frame — the engine calls onChange() only when something the
   UI actually shows has changed (a step, a dex entry, an encounter phase). */

import { SPECIES } from "../data/dex.js";
import {
  AREAS, AREA_IDS, areaOf, walkable, label, MINI, MINI_UNKNOWN,
} from "./map.js";
import {
  biomeFor, tableFor, bornLevel, areaOpen, speciesById, dexIndex, layoutIds,
  levelFromXp, xpForCatch,
  rodTable, rodBite,
  rollVariant, pityBoost, TIERS,
  lockedTiers, originReady, wildBand, rollSize, BIOMES,
} from "./biomes.js";
import {
  emptyStats, canSpend, catchMult, weighted, stepScale,
  pricedAt, valuedAt, xpScale, freePoints,
} from "./trainer.js";
import {
  TILE, loadArt, drawTile, drawPlayer, drawOverhangs, drawBobber, fishFrame,
} from "./tileset.js";
import { resolveThrow } from "../catch.js";
import { nextStep, settlePhase, nextCast } from "./phases.js";
import { isNight, phaseAt } from "./clock.js";
import { medalsFor, milestoneAt } from "./medals.js";
import {
  ballById, liveMult, itemById, forSale, sellValue, candyValue, CANDY_PRICE,
  evolveState, evoLevel, startingState, DEX_BONUS, levelReward,
  evolutionRow, bestRod, holding, canRun, RUN_LEVEL,
  fieldById, berryById, berryCalm, berryXp, berryRoom, FAMILIES,
  stepReward, keeper,
} from "./items.js";
/* ALIASED, and `advanceGoal` is not a style choice - it is the fix for a bug
   that froze every catch in the game. `createEngine` has its own
   `function advance(now)` driving the phase machine, declared INSIDE the
   closure, so it shadowed this import rather than colliding with it: no
   syntax error, no warning. `noteDaily` then called the phase machine instead
   of the quest counter, which called `settle`, which called `noteDaily` - and
   a catch died of a stack overflow the moment the ball stopped shaking.
   **Alias anything imported into this file whose name a local might reuse.** */
import {
  dayKey, dailyFor, advance as advanceGoal, reward as dailyReward, isYesterday,
} from "./daily.js";

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

/* The two playable trainers, in the order `build_player` stacks them into
   player.png. A string on the save indexes the art, so it is checked against
   this on load - see `loadState`. */
export const CHARS = ["red", "leaf"];

/* Where the save lives is `store.js`'s business, not this file's. */
import {
  SAVE_KEY, BACKUP_KEY, BROKEN_KEY, read, write, keep, mirror,
} from "./store.js";
import { push as pushCloud } from "../net/cloud.js";
import { nextHint, HINT_IDS } from "./hints.js";

/* THREE KEYS, AND THE OTHER TWO EXIST BECAUSE A COLLECTION WAS LOST.

   `loadState` catches everything and falls back to a fresh state, which is the
   right thing for it to do - a save that cannot be read should not stop you
   playing. What was wrong is what happened NEXT: the first step called `save()`
   and wrote the fresh state straight over the file that had failed to load. One
   bad parse and a real collection was gone, with nothing anywhere to recover
   from and no message saying so.

   It does not take a bug in this file to trigger that. A dev server hot-reloads
   a source edit the moment it is typed, so a half-applied change to the save
   shape is live in an open tab before it is finished - which this codebase has
   already recorded costing one collection, and has now cost a second.

   BACKUP is the last save that loaded cleanly, written at LOAD time rather than
   at save time - so it is always a whole previous session rather than a copy of
   whatever went wrong a moment ago. BROKEN is the raw text of anything that
   failed, kept verbatim and never parsed, because the one thing you want from a
   file you cannot read is the file. */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const START_AREA = AREA_IDS[0];

function freshState() {
  return {
    areaId: START_AREA,
    player: { ...areaOf(START_AREA).spawn, dir: "up" },
    // One byte per SHIPPED species, keyed by position - see dexIndex.
    dex: new Array(SPECIES.length).fill(0), // 0 unseen, 1 seen, 2 caught
    caught: 0,
    /* WHICH TRAINER YOU PLAY. Both are on the one sheet (see `build_player`),
       so this is a row offset rather than a second set of art, and it is the
       only cosmetic choice in the game - which is why it is a plain string on
       the save rather than anything cleverer.

       NULL MEANS NOT YET ASKED, and that is why it is not "red": a default
       indistinguishable from an answer means the question can never be asked
       once. Boot shows the trainer screen exactly while this is null, so an
       existing save is asked the first time and never again, and the renderer
       falls back to Red for the frames in between. */
    char: null,
    /* WHICH ONE-LINE TIPS HAVE ALREADY BEEN SHOWN. Ids, not a step number:
       there is no sequence to be partway through, so there is nothing to
       resume and nothing to get stuck in. Saved, so "once" means once ever. */
    hints: [],
    hint: null,
    steps: 0,
    xp: 0,
    nextUid: 1,
    dry: 0,               // encounters since the last rare tier - see pityBoost
    /* One quest a day. `key` is the local date it belongs to, so a new day is
       detected by comparing rather than by any timer having to fire. */
    daily: { key: null, done: 0, claimed: false, streak: 0, last: null },
    /* Steps left on each field item. Counted in STEPS rather than seconds so
       an effect you paid for is not burned by walking away from the keyboard. */
    /* One RUNNING field item per family, `{ id, steps }` or null. Keyed on the
       family rather than on the item id, so a Max Repel replaces a Repel by
       being written to the same slot - "only one at a time" is then structural
       rather than a rule somebody has to remember to enforce. */
    field: Object.fromEntries(FAMILIES.map((f) => [f, null])),
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

/* The dex is THREE-VALUED - 0 unseen, 1 seen, 2 caught - so it cannot go
   through `normalise`, which exists for the one-bit tier rows and coerces with
   `? 1 : 0`. Padding the dex with it would have quietly demoted every caught
   species in every save to merely seen: the whole collection still listed, and
   every entry greyed out. Same shape of function, one value apart. */
/* WHAT THE SAVE CAN STILL PROVE IT CAUGHT.

   A build that lived for about twenty minutes padded the dex with `normalise`,
   which coerces `? 1 : 0` - so every CAUGHT species in every save that loaded
   under it was demoted to merely SEEN, and then written straight back out. The
   code was fixed before it shipped; the saves were not, because a dev server
   picks up a source edit the moment it is made.

   Two things in a save cannot be wrong about this:
     - a Pokemon IN THE BOX was caught. There is no other way for it to be there.
     - a registered VARIANT was caught. `rollVariant` only ever fires on a catch,
       and the tier rows are one-bit so `normalise` could not damage them.

   So the dex is repaired from both. It is not complete - a species caught,
   registered and then sold with no variant leaves no trace - but it is
   everything the file still knows, and it is the difference between a
   collection and an empty screen.

   Idempotent and cheap: it only ever raises a 1 to a 2, so it is a no-op on a
   healthy save and runs once per load either way. */
export function repairDex(dex, s, tiers = s) {
  for (const mon of Array.isArray(s.box) ? s.box : []) {
    const at = dexIndex(mon?.species);
    if (at >= 0) dex[at] = 2;
  }
  /* THE ROWS, NOT THE SAVE. `tiers` is what `loadState` has already rebuilt -
     remapped where a generation was inserted, padded where one was appended -
     and reading `s[tier]` instead was reading OLD positions into a NEW dex. A
     shiny Turtwig at old position 251 marked whatever now sits there caught,
     which after Hoenn is Treecko. The box loop above is safe either way
     because a box entry carries its species ID. */
  for (const tier of TIERS) {
    const row = tiers?.[tier];
    if (!Array.isArray(row)) continue;
    for (let i = 0; i < row.length && i < dex.length; i++) if (row[i]) dex[i] = 2;
  }
  return dex;
}

/* Rebuild a position-keyed row from a layout we no longer use.

   Returns null when the row is already the right shape, or when its length
   matches nothing we have shipped - both of which `padDex` and `normalise`
   handle correctly on their own. Anything this DOES rebuild is placed by the
   id it belonged to, which is the only thing about a save that does not move.

   `keep` is what a value means: the dex is three-valued and a tier row is one
   bit, so the caller passes the same coercion it would have used anyway. */
function remap(arr, len, keep) {
  if (!Array.isArray(arr) || arr.length === len) return null;
  const ids = layoutIds(arr.length);
  if (!ids) return null;
  const out = new Array(len).fill(0);
  for (let i = 0; i < ids.length && i < arr.length; i++) {
    const at = dexIndex(ids[i]);
    if (at >= 0 && at < len) out[at] = keep(arr[i]);
  }
  return out;
}

function padDex(arr, len) {
  const out = new Array(len).fill(0);
  if (Array.isArray(arr))
    for (let i = 0; i < len && i < arr.length; i++) {
      out[i] = arr[i] === 2 ? 2 : arr[i] === 1 ? 1 : 0;
    }
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
  /* An older, SHORTER dex is fine - `loadState` pads it. Only a longer one is
     rejected, because that is a save from a game that knows more than this one
     does and padding cannot invent what it means. */
  if (s.dex.length > SPECIES.length)
    return `That save holds ${s.dex.length} species; this game knows ${SPECIES.length}.`;
  if (!Array.isArray(s.box)) return "No storage box in that file.";
  if (typeof s.money !== "number" || !Number.isFinite(s.money))
    return "That save has no money in it.";
  return null;
}

/* Put a save beyond the reach of the next `save()`. Never throws: it runs on
   the failure path, and a failure to preserve must not become a failure to
   start. */
/* What a player could still get back. Read by the trainer panel, so the offer
   only appears when there is something behind it. */
export function recoverable() {
  try {
    const backup = read(BACKUP_KEY);
    const broken = read(BROKEN_KEY);
    /* `summarise`, NOT `read` - AN IMPORT SHADOWED BY A LOCAL, AGAIN. This
       helper was called `read`, which was harmless while nothing else in scope
       was, and the moment `read` came in from store.js the two collided: the
       local `const` shadows the import for the WHOLE function body, so the two
       lines above it were suddenly reading a variable in its temporal dead zone.
       That throws a ReferenceError, which the `catch` below swallows, so
       `recoverable()` simply started answering "nothing to recover" - the one
       answer that makes the Trainer panel hide the offer entirely.

       This file already records the same shape freezing every catch in the game
       (`advance` from daily.js, shadowed by a local `advance`). The rule there
       was to alias the import; here the local is the one that should never have
       had a general name. */
    const summarise = (raw) => {
      if (!raw) return null;
      try {
        const o = JSON.parse(raw);
        return { caught: o.caught ?? 0, box: o.box?.length ?? 0, money: o.money ?? 0 };
      } catch { return { unreadable: true }; }
    };
    return { backup: summarise(backup), broken: summarise(broken) };
  } catch { return { backup: null, broken: null }; }
}

function loadState() {
  const raw = (() => {
    return read(SAVE_KEY);
  })();
  try {
    if (!raw) return freshState();
    const s = JSON.parse(raw);
    /* ANYTHING THAT FAILS IS KEPT BEFORE WE WALK AWAY FROM IT. `freshState()`
       here used to be the last moment that save existed. */
    if (!Array.isArray(s.dex)) {
      keep(BROKEN_KEY, raw);
      return freshState();
    }
    /* A SHORTER DEX IS AN OLDER SAVE, NOT A BROKEN ONE.

       This read `s.dex.length !== 151` and threw the whole save away - so the
       update that added Johto and Sinnoh would have silently deleted every
       collection that existed, which is the worst thing this file could do.

       Padding is exactly right rather than merely adequate, and it is worth
       saying why: `dex` is keyed by POSITION in `SPECIES`, and Gen 1 sits at
       the front of that list in id order - so position and `id - 1` agree for
       the first 151 and the old bytes land where they already were. New
       species arrive as zeroes at the end, which is what "not seen yet" is.
       check.mjs asserts that alignment rather than trusting it; if a future
       generation is ever inserted BEFORE Kanto, this stops being true and that
       assertion is what will say so. */
    if (s.dex.length > SPECIES.length) {
      keep(BROKEN_KEY, raw);
      return freshState();
    }

    /* Built once, and BEFORE the dex, because `repairDex` reads them. Every
       tier rebuilt to the right shape - remapped where a generation was
       inserted, padded where one was appended - including tiers the save has
       never heard of: a file written before Holo has no `holo`, and a fresh row
       of zeroes is what that should mean. */
    /* IT PARSED AND IT IS THE RIGHT SHAPE, so this is the last text we know
       was good. Written at LOAD time on purpose: a backup taken at save time is
       a copy of the state you are already in, which is no help at all when that
       state is the problem. */
    keep(BACKUP_KEY, raw);

    const rows = Object.fromEntries(TIERS.map((t) => [t,
      remap(s[t], SPECIES.length, (v) => (v ? 1 : 0))
        ?? normalise(s[t], SPECIES.length)]));

    return {
      ...freshState(), ...s, rev: 0,
      /* A save from before shinies existed has neither of these, and a
         hand-edited or imported one could hold anything at all - so both are
         rebuilt to the right shape rather than trusted. */
      /* Every tier rebuilt to the right shape, including ones the save has
         never heard of: a file written before Holo existed simply has no
         `holo`, and `normalise(undefined)` is a fresh row of zeroes. That is
         what makes adding a tier a non-event for saves. */
      /* REMAPPED BEFORE PADDED. Padding is right when a generation is appended
         and wrong when one is inserted in the middle - see `LAYOUTS`. Hoenn
         moved every Sinnoh position by 135, so a save written before it has to
         be rebuilt by id or a player's Sinnoh collection comes back as somebody
         else's. `remap` returns null for a save that never needs it. */
      dex: repairDex(
        remap(s.dex, SPECIES.length, (v) => (v === 2 ? 2 : v === 1 ? 1 : 0))
          ?? padDex(s.dex, SPECIES.length), s, rows),
      ...rows,
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
      /* A save from before the choice is Red, which is who it was playing.
         Validated against the sheet's own list rather than trusted: the value
         indexes into the art, and an unknown one would draw four rows off the
         end of the strip - which is empty, so the trainer would vanish. */
      char: CHARS.includes(s.char) ? s.char : null,
      /* A save from before hints gets them - it has probably seen all of these
         moments already, but a stray tip is a smaller cost than a new player
         silently getting none. Filtered to ids that still exist so a retired
         hint cannot sit in a save forever blocking its own slot. */
      hints: (Array.isArray(s.hints) ? s.hints : []).filter((h) => HINT_IDS.includes(h)),
      dry: Math.max(0, Math.floor(Number(s.dry) || 0)),
      // A save from before dailies simply has none, and gets today's.
      daily: { ...freshState().daily, ...(s.daily ?? {}) },
      /* FIELD EFFECTS CHANGED SHAPE. They were a step COUNT per item id and
         are now one running item per family, so anything that is not the new
         shape is DROPPED rather than coerced: a save can lose an effect it
         paid for, but it cannot be allowed to carry a number where the rest of
         the engine reads `.id` and `.steps`. */
      field: Object.fromEntries(FAMILIES.map((fam) => {
        const run = s.field?.[fam];
        const ok = run && typeof run === "object"
          && fieldById(run.id)?.family === fam && run.steps > 0;
        return [fam, ok ? { id: run.id, steps: run.steps } : null];
      })),
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
    keep(BROKEN_KEY, raw);
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

  /* A SAVE THAT STOPS WORKING MUST SAY SO. This swallowed every error with the
     comment "private mode - play on, just don't persist", which names one cause
     and catches all of them: a full quota, a serialisation fault, a browser
     that revoked storage mid-session. Playing on is right - losing the session
     to a failed write would be worse - but doing it SILENTLY means a player
     goes on catching for an hour with nothing being kept and no way to know.
     `state.stale` is what the top bar reads; it latches, because the warning
     belongs to the session rather than to one write. */
  function save() {
    /* AND A SESSION THAT HAS BEEN TAKEN OVER STOPS WRITING AT ALL - not just to
       the account, to localStorage too. Two tabs share one localStorage key, so
       an abandoned tab that goes on writing locally overwrites the copy the
       LIVE tab is keeping, and on the next boot `newer` can hand the resurrected
       loser back to the player. Refusing to sync while still writing locally
       would be a worse bug than the one it fixes. */
    if (state.stale === "taken") return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { encounter, evolution, fishing, running, cheers, rev, stale, hint,
        ...rest } = state;
      /* `write` reports whether it stuck rather than throwing - which cause it
         was is its business, not this file's. What happens NEXT is this file's:
         play on either way, and latch it so the top bar can say NOT SAVING. */
      const raw = JSON.stringify(rest);
      const got = write(SAVE_KEY, raw);
      if (got.ok) {
        if (state.stale) { state.stale = null; changed(); }
      } else if (state.stale !== got.why) {
        state.stale = got.why;
        changed();
      }
      /* AND UPWARD, on its own clock. Local is what the next frame reads, so it
         is never waited on; the account's copy trails it by a few seconds. With
         no account configured this is a no-op - see cloud.js. */
      mirror(raw, pushCloud);
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

  /* ROLLING OVER IS A READ, NOT A TIMER. Asked whenever anything might advance
     the quest, which is cheaper and more robust than a midnight timer: a tab
     open across midnight, a laptop asleep for a week and a first visit in
     months all take the same path.

     A streak survives exactly one day's gap. Missing two is a reset, and that
     is checked against the day the last quest was CLAIMED rather than the day
     it was set - opening the game and not finishing it is not a day played. */
  function today() {
    const key = dayKey();
    const d = state.daily;
    if (d.key === key) return d;
    d.key = key;
    d.done = 0;
    d.claimed = false;
    if (!isYesterday(d.last, key)) d.streak = 0;
    return d;
  }

  /* One funnel for both events the quest can count, so a kind added to
     `GOALS` needs no new call site. */
  function noteDaily(event) {
    const d = today();
    if (d.claimed) return;
    const goal = dailyFor(d.key);
    const add = advanceGoal(goal, event);
    if (!add) return;
    d.done = Math.min(goal.need, d.done + add);
  }

  function claimDaily() {
    const d = today();
    const goal = dailyFor(d.key);
    if (d.claimed || d.done < goal.need) return null;
    const won = dailyReward(goal, d.streak);
    d.claimed = true;
    d.streak = isYesterday(d.last, d.key) ? d.streak + 1 : 1;
    d.last = d.key;
    state.money += won.money;
    state.candy += won.candy;
    for (const [id, n] of Object.entries(won.items)) {
      state.bag[id] = (state.bag[id] ?? 0) + n;
    }
    save();
    changed();
    return { ...won, streak: d.streak };
  }

  function onArrive() {
    walkFrame++;
    state.steps++;
    teach({ kind: "step", steps: state.steps });
    noteDaily({ steps: 1 });
    // One step off every running effect; the slot empties when it runs out.
    for (const fam of FAMILIES) {
      const run = state.field[fam];
      if (run && --run.steps <= 0) state.field[fam] = null;
    }

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
    /* REPEL IS ITS OWN AXIS. It changes how OFTEN an encounter happens and
       never what it is - which is what keeps it off the table the White Flute
       and Fortune are already moving, and is the honest reading of what a
       repel is for: crossing a map you have already farmed. */
    const rate = ENCOUNTER_RATE * (running("repel")?.rate ?? 1);
    if (biome && !state.evolution && Math.random() < rate) {
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
    // The flute feeds the SAME exponent Fortune does - see `rarityPower`.
    const rolled = weighted(table, state.stats, running("rarity")?.tilt ?? 0);
    const total = rolled.reduce((n, e) => n + e[1], 0);
    let r = Math.random() * total;
    for (const [id, w] of rolled) if ((r -= w) < 0) return speciesById(id);
    return speciesById(table[0][0]);
  }

  function startEncounter(table, source = "wild") {
    held.clear();
    const sp = pickSpecies(table);
    /* Whether the dex already has this one, read BEFORE the throw can register
       it. It rides on the encounter rather than being looked up while drawing,
       because the panel would then read live state: settling a catch sets the
       dex to 2, so a brand new species would sprout a CAUGHT badge halfway
       through its own capture animation. A snapshot cannot do that. */
    const at = dexIndex(sp.id);
    const known = state.dex[at] === 2;
    if (state.dex[at] === 0) state.dex[at] = 1;
    /* Rolled once, here, so every screen that draws this encounter agrees -
       and so a re-render cannot roll it again into a different answer.
       `rollVariant` owns the precedence: rarest wins, and nothing is ever two
       of them, because there is no such thing as a shiny Gen 1 sprite.

       Origin is held back until this species' generation is fully caught -
       see `lockedTiers`. It is passed in rather than checked inside the roll
       so the roll stays a pure function of its arguments, which is what lets
       check.mjs drive it 400,000 times with a seeded clock. */
    /* PITY. `state.dry` is encounters since the last variant of any tier, and
       it resets on the ROLL rather than on the catch: the misery is not meeting
       one, and a player who met an Astral and lost it to a flee has still had
       the moment this exists to give them. */
    /* A HONEY IS A SECOND KIND OF LUCK, so it is a second argument. Plain
       Honey has no `tier` and lifts the whole ladder like pity does; a
       coloured one names the tier it is for and leaves the rest alone. */
    const honey = running("variant");
    const variant = rollVariant(
      Math.random,
      lockedTiers(state.dex, sp.id),
      pityBoost(state.dry) * (honey && !honey.tier ? honey.lift : 1),
      honey?.tier ? { tier: honey.tier, mult: honey.lift } : null);
    state.dry = variant ? 0 : (state.dry ?? 0) + 1;

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
      /* Whether it is night, frozen the same way and for the same reason as
         `areaId` below - the Dusk Ball reads it, and a throw that changed
         value because the clock ticked mid-animation would be unfalsifiable
         from the outside. */
      night: isNight(state.steps),
      // And which phase it is, for the scene. Frozen with everything else, so
      // the sky cannot change colour halfway through a throw.
      phaseId: phaseAt(state.steps).id,
      /* Which map this happened on, so a Dusk Ball can ask. Copied onto the
         encounter rather than read off `state` when the ball rolls, for the
         same reason `known` is: everything a throw depends on is fixed at the
         moment the Pokemon appeared, and nothing that happens afterwards -
         including travelling - can change what you are looking at. */
      areaId: state.areaId,
      /* Throws already made at THIS Pokemon. The Timer Ball reads it, and it
         is why a ball that breaks free is not simply a wasted ball. */
      throws: 0,
      /* The berry it is eating, if any. On the encounter and not on `state`,
         so it cannot outlive the Pokemon it was fed to. */
      /* One slot per EFFECT, so a Razz cannot take a Nanab away - see
         `berryRoom`. The three move three different rolls and nothing about
         them collides. */
      berries: {},
      /* THE MAP'S OWN BAND, so a late map feels late instead of merely
         containing later species - `wildBand` reads it off the ladder.
         Whichever is higher wins: nothing may appear below the level it
         evolves at (a wild Venusaur is a Lv 32 Venusaur wherever you meet it),
         and the `+ 2` on that floor is why a found evolution is not pinned to
         exactly its own threshold. */
      level: (() => {
        const [lo, hi] = wildBand(biomeFor(state.areaId));
        const floor = Math.max(bornLevel(sp.id) + 2, lo);
        return floor + Math.floor(Math.random() * (hi - lo + 1));
      })(),
      /* How big THIS one is, as a percentage of the species' own figures.
         Rolled here so every screen agrees and a re-render cannot change it,
         and carried onto the box entry so the Rattata you caught for being
         enormous is still enormous when you go and look at it. */
      size: rollSize(),
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
    teach({ kind: "encounter", variant });
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
    /* Every kind of water takes a line: `w` outdoors, `W` the Rock Ridge
       spring, `k` the pools in Frost Hollow.

       `k` was missing, and Frost Hollow has SIXTY-SIX tiles of it - a whole map
       where you stand at the edge of the water, press F, and nothing happens
       and nothing says why. It reads as a broken rod rather than as a rule,
       because there is no rule: the character differs only because the map was
       transcribed from Seafoam and carries its own ids.

       `K` stays out on purpose. That is the waterfall, which is falling. */
    if (!"wWk".includes(facing())) return null;
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

  /* Cosmetic and reversible, so no confirm and no cost: it is the one choice in
     the game you are allowed to change your mind about. Refuses an unknown name
     for the same reason `loadState` validates it - the string indexes the art. */
  function setChar(name) {
    if (!CHARS.includes(name) || state.char === name) return false;
    state.char = name;
    save();
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
    /* The Razz Berry is already inside `liveMult` - see there for why. Only
       the Nanab has to come through separately, because the flee roll is a
       different roll and nothing else was ever going to carry it. */
    const result = resolveThrow(
      e.rate,
      liveMult(ball, e) * catchMult(state.stats),
      Math.random,
      berryCalm(e.berries));
    e.throws += 1;
    e.pending = result;
    e.shakesTotal = result.shakes;
    e.shakesDone = 0;
    e.phase = "throw";
    e.msg = "";
    e.until = performance.now() + T.throw;
    changed();
  }

  /* ONE HINT AT A TIME, AND ONLY THE FIRST TIME. Everything that can teach
     something calls this with what just happened; `nextHint` is pure and picks
     at most one, or none. Banked immediately so a reload cannot repeat it -
     the tip is cheap and being told twice is what makes one annoying. */
  function teach(event) {
    if (state.hint) return;                 // one on screen is the whole rule
    const hit = nextHint(event, state.hints);
    if (!hit) return;
    state.hints = [...state.hints, hit.id];
    state.hint = hit;
    /* AND THE TRAINER STOPS. A tip is the only modal that opens UNPROMPTED,
       which on a touch screen means it can open mid-stride: the dialog's scrim
       covers the whole viewport, so the finger lifts onto the scrim and the
       d-pad button never receives its `pointerup`. The direction stays held and
       the trainer walks on behind the dialog. Dropping held keys here is the
       same thing the stall handler does when the tab comes back, and for the
       same reason - the release is never going to arrive. */
    held.clear();
    state.running = false;
    save();
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
    /* A level can teach two different things and they are ranked in `HINTS`: a
       spendable point, or a map that just opened. `opened` is the NAME rather
       than a flag, because the tip says which one. */
    const opened = BIOMES.find((b) => b.level > before && b.level <= after);
    teach({
      kind: "level",
      free: freePoints(state.stats, after),
      opened: opened?.name ?? null,
    });
    return { level: after, items: won };
  }

  function settle(now) {
    const e = state.encounter;
    const phase = settlePhase(e.pending);

    if (phase === "caught") {
      const at = dexIndex(e.speciesId);
      e.isNew = state.dex[at] !== 2;
      state.dex[at] = 2;
      noteDaily({ species: speciesById(e.speciesId) });
      state.caught++;
      /* A first shiny - or a first Astral - of a species is its own event, even
         for one you already had. That is most of the point of both. */
      const roll = e.variant;
      e.newVariant = !!roll && !state[roll][at];
      if (roll) state[roll][at] = 1;
      /* BEFORE the push, so "do I already hold one" is about the ones that were
         there first rather than about the one being added. */
      const dupe = state.box.some((m) => m.species === e.speciesId);
      state.box.push({
        uid: state.nextUid++,
        species: e.speciesId,
        level: e.level,
        size: e.size,
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
      const sp = speciesById(e.speciesId);
      /* And the Pinap pays here, on the third of the three rolls a berry can
         reach. Rounded, because XP is whole and a half-point that only ever
         appears with a berry in play is a rounding difference nobody can
         explain. */
      teach({ kind: "caught", duplicate: dupe });
      const gained = gainXp(Math.round(xpForCatch(sp, e.isNew) * berryXp(e.berries)));

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
      teach({ kind: "fled" });
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
        // Which trainer. A row offset into the same strip - see drawPlayer.
        char: state.char,
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

    const target = speciesById(targetId);
    const at = dexIndex(targetId);
    const isNew = state.dex[at] !== 2;
    state.dex[at] = 2;
    /* NO `state.caught++` HERE, and it used to be. That counter renders in the
       top bar under the word CAUGHT, where it means throws that landed - and
       an evolution is not a throw. It was incremented unconditionally, so it
       also counted re-evolving a species already owned. The DEX slot above is
       right to fill either way: evolving into something does register it. */

    /* The tier travels with the creature, because it IS the creature - rarest
       first so a hand-edited save carrying two is described by its best. */
    const roll = TIERS.find((t) => mon[t]) ?? null;
    if (roll) state[roll][at] = 1;

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
      fromName: label(speciesById(row.from)).toUpperCase(),
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
  /* `keeper()` IS CHECKED HERE, not only in the list the caller built.

     `duplicateUids` already refuses to offer a variant, and that was the whole
     protection: a rule living in one of two places, which this codebase has
     already watched fail once - the Box computed a SECOND list (`held`) that
     sorted by level and offered a Lv 2 shiny as the single thing to sell. Both
     of these are one click with no undo, and at 1/480 an Astral cannot be
     farmed again, so the engine refuses rather than trusting its callers. */
  function convert(uids) {
    const wanted = new Set(uids);
    if (!wanted.size) return 0;
    let got = 0;
    state.box = state.box.filter((mon) => {
      if (!wanted.has(mon.uid) || keeper(mon)) return true;
      got += candyValue(speciesById(mon.species));
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
  /* BOUGHT IS USED. There is no bag screen for these and no reason for one:
     only one of each can run at a time, so stockpiling a consumable you cannot
     stack is an inventory for nothing. Buying starts the clock, and buying
     again while one is running REPLACES it rather than adding - otherwise the
     price of a long effect is just the price of a short one typed twice. */
  /* WHAT IS RUNNING IN THIS FAMILY, as the item row rather than as a save
     record - so every reader asks for the thing it actually wants (`.rate`,
     `.tilt`, `.lift`) and none of them has to look the id up itself. One
     function, because three copies of that lookup is three places for a
     retired item id to survive in a save and read as `undefined`. */
  function running(family) {
    const run = state.field[family];
    return run ? fieldById(run.id) : null;
  }

  /* USING one is spending one out of the bag. These used to be bought-and-
     started in a single click with no inventory at all, which was right while
     there were two of them and wrong the moment there were eight: you cannot
     carry a Max Repel for the cave you are about to enter if buying it starts
     it in the field you are standing in. They are ordinary bag items now, sold
     by the same shelf as the balls and used from the same floating rail.

     Starting one while another of its FAMILY runs replaces it, and the steps
     on the old one are lost - the slot is the family, and a player who wants
     both effects can have a repel and a honey, just not two honeys. */
  function useField(id) {
    const item = fieldById(id);
    if (!item || (state.bag[item.id] ?? 0) <= 0) return false;
    state.bag[item.id] -= 1;
    /* A REPEL IS EXCLUSIVE; THE OTHER TWO STACK - and this is narrower than the
       rule it replaces, deliberately.

       "One effect at a time, whatever family" was right about exactly one pair.
       A repel is total: it stops every encounter, so a honey burning its 600
       steps underneath one is paying for odds on encounters that cannot happen.
       That is a contradiction a player can buy, and it stays blocked.

       It is NOT true of the other two. The White Flute moves WHICH SPECIES and
       a honey moves WHICH TIER - different levers, by construction (see THREE
       FIELD FAMILIES in CLAUDE.md), so running both is "a rarer species, and a
       better chance it is a variant", which is a coherent thing to want and the
       obvious reason to own both. Blocking it made the dearest two items in the
       shop mutually exclusive for no reason anybody could act on.

       The family slot still stops two of the SAME kind - a Max Repel replaces a
       Repel by being written to the same key - so nothing about that changed. */
    if (item.family === "repel") {
      for (const fam of FAMILIES) state.field[fam] = null;
    } else if (state.field.repel) {
      state.field.repel = null;
    }
    state.field[item.family] = { id: item.id, steps: item.steps };
    save();
    changed();
    return true;
  }

  /* FEEDING one is the same shape, on the encounter instead of the map. One
     berry at a time and feeding another replaces it, so the three are a choice
     rather than a checklist you work through before every throw. It costs no
     turn and risks nothing: a berry that could scare the Pokemon off would be
     a berry nobody uses on the rare they bought it for. */
  function useBerry(id) {
    const e = state.encounter;
    const berry = berryById(id);
    if (!e || e.phase !== "idle") return false;
    if (!berry || (state.bag[berry.id] ?? 0) <= 0) return false;
    /* A BERRY AT ITS CAP IS NOT EATEN. Feeding a fourth Razz used to spend one
       and change nothing; "cannot stack" should cost a click, not a berry. */
    if (!berryRoom(e.berries, id)) return false;
    state.bag[berry.id] -= 1;
    // Same berry deepens; a different one of the SAME EFFECT replaces it; one
    // of a different effect joins it.
    const held = e.berries[berry.effect];
    const stage = held?.id === id ? (held.stage ?? 1) + 1 : 1;
    e.berries = { ...e.berries, [berry.effect]: { id, stage } };
    /* The one frame the UI hangs the "it was used" animation off. Bumped every
       feed, so a second Razz replays it - a counter, not a flag, because a flag
       that is already true cannot say "again". */
    e.ate = (e.ate ?? 0) + 1;
    e.lastAte = id;      // which one to draw tossing in
    e.msg = stage > 1
      ? `${e.name} is eating another ${berry.name}!`
      : `${e.name} is eating the ${berry.name}.`;
    save();
    changed();
    return true;
  }

  function buyCandy(qty = 1) {
    const cost = pricedAt(CANDY_PRICE, state.stats) * Math.max(1, Math.floor(qty));
    if (qty < 1 || state.money < cost) return false;
    state.money -= cost;
    state.candy += Math.floor(qty);
    save();
    changed();
    return true;
  }

  // Same backstop as `convert` - see the note there.
  function sell(uids) {
    const wanted = new Set(uids);
    if (!wanted.size) return 0;
    let earned = 0;
    state.box = state.box.filter((mon) => {
      if (!wanted.has(mon.uid) || keeper(mon)) return true;
      earned += valueOf(speciesById(mon.species));
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
    useField,
    useBerry,
    claimDaily,
    /* Read by the rail every render, so it is a function rather than a field:
       the day can turn over between two renders and a field would not know. */
    daily: () => {
      const d = today();
      const goal = dailyFor(d.key);
      return { goal, done: d.done, claimed: d.claimed, streak: d.streak };
    },
    sell,
    convert,
    levelUp,
    spend,
    fish,
    toggleBike,
    setChar,
    /* Dismissing is not the same as banking it - the id went into `hints` the
       moment it was shown, so closing it is only about the screen. It can never
       come back, which is the point. */
    /* THE ACCOUNT'S COPY IS BEHIND, which is not the same failure as the local
       write dying and must not shout as loudly. A local failure means this
       session is at risk right now; this one means it is safe on the machine
       and has not reached the server yet. Local always wins the slot: it is the
       worse news, and showing the milder one over it would hide it. */
    syncTrouble(why) {
      /* ONE OF THESE IS NOT A DEGREE OF THE OTHERS. "full" and "blocked" are
         local failures and outrank a sync failure, because this session is at
         risk right now where that one is merely behind. "taken" outranks every
         one of them and never clears: the account is being played somewhere
         else, nothing this session does from here can be kept, and a warning
         that could be cleared by the next successful local write would be a
         lie about that. */
      if (state.stale === "taken") return;
      if (why === "taken") { state.stale = "taken"; changed(); return; }
      const soft = why ? "offline" : null;
      if (state.stale === "full" || state.stale === "blocked") return;
      if (state.stale === soft) return;
      state.stale = soft;
      changed();
    },

    clearHint() {
      if (!state.hint) return;
      state.hint = null;
      changed();
    },
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
    /* The world's clock, read by the top bar and the encounter scene. A
       function rather than a field: it moves every step, and a field would be
       a second copy of `state.steps` that could disagree with the first. */
    clock: () => phaseAt(state.steps),
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
      try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
      location.reload();
    },

    /* The save, as a plain object, for writing to a file. Everything that is
       excluded from the on-disk save is excluded here too - an encounter or a
       half-played cheer is not part of who you are - so what comes out is
       exactly what goes back in. */
    /* PUT BACK WHATEVER SURVIVED. `which` is "backup" or "broken" - the last
       clean load, or the raw text of the thing that failed. Writes and reloads
       rather than swapping state in place, for the same reason `importSave`
       does: the engine closes over the map rows and their dimensions, and a
       reload is the one path that is certainly consistent. */
    restore(which = "backup") {
      const key = which === "broken" ? BROKEN_KEY : BACKUP_KEY;
      const raw = read(key);
      if (!raw) return false;
      /* BROKEN IS RAW TEXT AND MAY NOT BE JSON AT ALL - that is why it was
         kept. Parsing it outside a try here would throw out of the click that
         was trying to recover from it. */
      let obj;
      try { obj = JSON.parse(raw); } catch { return false; }
      if (saveProblem(obj)) return false;
      write(SAVE_KEY, raw);
      location.reload();
      return true;
    },
    recoverable,

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
      write(SAVE_KEY, JSON.stringify(obj));
      location.reload();
      return null;
    },
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(saveTimer);
    },
  };
}
