/* The game engine. Deliberately outside React: it owns the state, runs its own
   requestAnimationFrame loop and draws straight to the canvas. React never
   re-renders per frame — the engine calls onChange() only when something the
   UI actually shows has changed (a step, a dex entry, an encounter phase). */

import { SPECIES } from "../data/dex.js";
import {
  AREAS, AREA_IDS, areaOf, walkable, rideable, SURFABLE, label, LEDGE, MINI, MINI_UNKNOWN,
} from "./map.js";
import {
  biomeFor, tableFor, bornLevel, areaOpen, speciesById, dexIndex, layoutIds,
  levelFromXp, xpForCatch,
  rodTable, rodBite,
  rollVariant, pityBoost, TIERS, TIER_TELL, isLegendary,
  lockedTiers, wildBand, rollSize, BIOMES, ENCOUNTER_RATE,
} from "./biomes.js";
import {
  emptyStats, canSpend, catchMult, weighted, stepScale,
  pricedAt, valuedAt, xpScale, freePoints,
} from "./trainer.js";
import {
  TILE, loadArt, drawTile, drawPlayer, drawOverhangs, drawOverlays, drawBobber, fishFrame,
} from "./tileset.js";
import { resolveThrow, GUARANTEED } from "../catch.js";
import { nextStep, settlePhase, nextCast } from "./phases.js";
import { isNight, phaseAt } from "./clock.js";
import { medalsFor, milestoneAt } from "./medals.js";
import {
  ballById, liveMult, itemById, forSale, sellValue, candyValue, CANDY_PRICE,
  evolveState, evoLevel, startingState, dexBonus, catchBounty, levelReward,
  evolutionRow, bestRod, holding, canRun, canSurf, KEY_ITEMS,
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
/* THE BICYCLE IS GONE, and Running Shoes is the whole speed story now. Two key
   items doing the same job is one too many: the bike was a TOGGLE and the shoes
   are HELD, so the pair meant two different mental models for "go faster", the
   bike silently won whenever both were on, and it cost a face button on a pad
   that only has four. A save that still carries `bicycle` in its bag keeps a
   key nothing reads - harmless, and cheaper than a migration. */
const RUN_SCALE = 0.7;        // Running Shoes: quicker than walking
/* KEY ITEMS A SAVE HAS EARNED BUT NEVER RECEIVED, handed over on load.

   Running was a level check before it was an item, so a save written then is
   past Lv 15 with an empty shoe slot and would silently LOSE the ability to
   run - the one change a player feels immediately. Surf arrived later still.
   Both are the same migration, so it is written once: anything in `KEY_ITEMS`
   whose level you are past and whose slot is empty. A third one costs nothing.

   It is deliberately NOT a general "give me everything I qualify for" for the
   bag at large - only key items, which are earned by levelling and never
   spent. */
function grantKeys(bag, level) {
  let out = bag;
  for (const k of KEY_ITEMS) {
    if (level >= k.level && !holding(out, k.id)) out = { ...out, [k.id]: 1 };
  }
  return out;
}

/* Per step, anywhere you can walk. Every walkable tile spawns - there is no
   "safe" ground - so this is far lower than a grass-only rate would be, and the
   two work out to a similar number of encounters per minute of walking. */
/* ENCOUNTER_RATE moved to biomes.js - see the note there. */

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
  SAVE_KEY, BACKUP_KEY, BROKEN_KEY, OTHER_KEY, CHOSEN_KEY, WRITER_KEY, OWNER_KEY,
  read, write, keep, mirror, scoped,
} from "./store.js";

/* A recovery copy belongs to whoever this browser is playing as - see
   `scoped`. Read at the moment of use rather than once, because `settle` is
   what writes the owner and it runs before any engine exists. */
const mine = (key) => scoped(key, read(OWNER_KEY));
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
    running: false,
    encounter: null,
    evolution: null,
    fishing: null,
    /* Things worth stopping to say. A queue, because a catch can fill the last
       slot of a milestone and level you up in the same instant. */
    cheers: [],
    /* And things worth MENTIONING, which is not the same thing. A field
       effect running out is not a celebration - no sparks, no hold on the
       screen - but it is the one moment the player has no way to notice on
       their own: the card in the corner simply stops being there, and the
       next four hundred steps quietly cost what they always did. Also a
       queue: a repel and a honey bought together run out together. */
    worn: [],
    colRev: 0,                 // bumps when the COLLECTION moves, not the feet
    ask: null,                 // a press that wants confirming - never saved
  };
}

/* WHAT A SESSION IS, AS OPPOSED TO WHAT A SAVE IS - written once.

   `save()` and `exportSave()` each kept their own list of fields to leave out,
   and the two had drifted: the export still carried `stale`, `worn`, `hint`,
   `colRev` and `ask`. The one that mattered was `stale`. Export a save while
   the session had been taken over, import that file, and `loadState` spread
   `stale: "taken"` straight back into the new state - and `save()` returns
   early on "taken", so that save could never be written again by anything.
   One list, read by both, and `loadState` resets every one of them. */
const VOLATILE = ["encounter", "evolution", "fishing", "running", "cheers",
  "worn", "ask", "rev", "colRev", "stale", "hint"];
const persisted = (s) => {
  const out = { ...s };
  for (const k of VOLATILE) delete out[k];
  return out;
};

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
    const backup = read(mine(BACKUP_KEY));
    const broken = read(mine(BROKEN_KEY));
    const other = read(mine(OTHER_KEY));
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
        return {
          caught: Number(o.caught) || 0,
          box: Array.isArray(o.box) ? o.box.length : 0,
          money: Number(o.money) || 0,
        };
      } catch { return { unreadable: true }; }
    };
    return {
      backup: summarise(backup), broken: summarise(broken), other: summarise(other),
    };
  } catch { return { backup: null, broken: null, other: null }; }
}

/* RETURNS `[state, verdict]`, AND THE VERDICT IS WHAT KEEPS A BAD LOAD LOCAL.

   A save this build cannot load falls back to a fresh game, which is right,
   and BROKEN keeps the text - on THIS browser. Signed in, the fresh game was
   then mirrored to the account fifteen seconds later, and the account's copy
   was the save that had failed: it had been pulled down a moment earlier by
   `settle`. So the one place the real save still existed was overwritten by an
   empty one, and BROKEN only ever helped on the device that failed.

   It does not need a bug. **A save from a NEWER build is longer than this
   build's dex**, and every Vercel preview URL stays live forever on whatever
   commit it was built from, all pointed at the same database: open an old
   preview after the forms landed and it rejects your 1,303-entry save, deals a
   fresh game, and uploads it. `verdict` is null for a clean load, "outdated"
   for that case and "unreadable" for everything else, and either one stops the
   session reaching the account. */
function loadState() {
  const raw = read(SAVE_KEY);
  try {
    if (!raw) return [freshState(), null];
    const s = JSON.parse(raw);
    /* ANYTHING THAT FAILS IS KEPT BEFORE WE WALK AWAY FROM IT. `freshState()`
       here used to be the last moment that save existed. */
    if (!Array.isArray(s.dex)) {
      keep(mine(BROKEN_KEY), raw);
      return [freshState(), "unreadable"];
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
      keep(mine(BROKEN_KEY), raw);
      return [freshState(), "outdated"];
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
    keep(mine(BACKUP_KEY), raw);

    const rows = Object.fromEntries(TIERS.map((t) => [t,
      remap(s[t], SPECIES.length, (v) => (v ? 1 : 0))
        ?? normalise(s[t], SPECIES.length)]));

    /* A BOX ENTRY THIS BUILD CANNOT USE IS SET ASIDE, NEVER DELETED. The box
       came straight off `...s`, so one entry naming a species this dex does
       not hold - a hand-edited import, or a save from a build that shipped
       forms and was then rolled back - blanked the BOX tab on every boot:
       `sellValue(undefined)` throws inside a memo, and the save that caused
       it is the save that loads next time. `limbo` holds them in the save
       itself, and it is read back into the pool every load, so an entry that
       becomes usable again (the forms ship a second time) walks straight back
       into the box. A repeated uid is renumbered for the same reason: every
       action in the Box names ONE uid, and two Pokemon answering to it means
       evolving one mutates the other. */
    const pool = [...(Array.isArray(s.box) ? s.box : []),
      ...(Array.isArray(s.limbo) ? s.limbo : [])];
    const sound = (m) => m && typeof m === "object" && Number.isInteger(m.uid)
      && Number.isFinite(m.level) && Boolean(speciesById(m.species));
    /* Past every uid in the POOL, limbo included, so an entry that walks back
       out of limbo never meets a catch wearing its number. A reduce, not
       `Math.max(...pool)`: a spread is one argument per Pokemon. */
    let nextUid = pool.reduce((n, m) => (Number.isInteger(m?.uid) ? Math.max(n, m.uid + 1) : n),
      Math.max(1, Math.floor(Number(s.nextUid)) || 1));
    const seen = new Set();
    const box = pool.filter(sound).map((m) => {
      if (!seen.has(m.uid)) { seen.add(m.uid); return m; }
      return { ...m, uid: nextUid++ };
    });

    const fresh = freshState();
    return [{
      ...fresh, ...s,
      box, nextUid,
      limbo: pool.filter((m) => !sound(m)),
      money: Math.max(0, Number(s.money) || 0),
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
      /* Surf is the same story one level ladder later: a save already past
         Lv 20 earned it before it existed, and a key item nobody can be given
         retroactively is a key item half the players never get. */
      bag: grantKeys(s.bag, levelFromXp(s.xp ?? 0)),
      /* Every field that belongs to a SESSION comes back fresh, whatever the
         file said - see `VOLATILE`. Last, so nothing above can put one back. */
      ...Object.fromEntries(VOLATILE.map((k) => [k, fresh[k] ?? null])),
    }, null];
  } catch {
    keep(mine(BROKEN_KEY), raw);
    return [freshState(), "unreadable"];
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
/* AND A CAP, BECAUSE THE MINIMAP SIZES ITSELF TO THE MAP. Three pixels a tile
   with nothing bounding it means the box grows with whatever is drawn, and
   Cinderpeak is 40x109 - a tall narrow mountain - which came out 120x327
   against a 480x352 viewport: 93% of the screen height, floor to ceiling down
   the left edge. Every other map sits at 76% or less, so nothing had said so.

   A map that does not fit draws at fewer pixels a tile rather than being
   clipped or scrolled: the minimap's whole job is to show the WHOLE map at
   once. At these bounds only Cinderpeak moves, to 2px and 80x218. */
const MINI_MAX_W = 360;
const MINI_MAX_H = 270;
const miniScale = (w, h) => Math.max(1, Math.min(
  MINI_TILE, Math.floor(MINI_MAX_W / w), Math.floor(MINI_MAX_H / h)));

export function createEngine(canvas, onChange, mini = null) {
  const ctx = canvas.getContext("2d");
  // setTransform, not scale: scale() compounds if the engine is ever remounted
  // (React StrictMode mounts effects twice in dev), silently doubling the zoom.
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  // Pixel art upscaled 2x: smoothing samples neighbouring metatiles out of the
  // atlas and draws a seam along every tile edge.
  ctx.imageSmoothingEnabled = false;

  const [state, verdict] = loadState();
  /* OUTDATED IS THE ONE VERDICT WORTH STOPPING FOR. The save is fine - it is
     from a newer build than this page - so a fresh game here would be
     pointless play that the next real load throws away, and writing anything
     at all risks the copy that is correct. Latched like "taken", with a
     dialog that says to reload. "unreadable" plays on: that save really is
     damaged, BROKEN holds it, and the YOU panel offers it back. */
  if (verdict === "outdated") state.stale = "outdated";
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
  /* THE LADDERS, FOR A MAP WITH MORE THAN ONE FLOOR. Mt Moon is 1F, B1F and
     B2F laid out as quadrants of one grid, each sealed in its own rock, and
     these pairs are the only way between them - the real cave's own warps,
     read out of the decomp. Built as a lookup rather than searched per step,
     and rebuilt beside `bakeMini()` for the same reason: `rows` changing
     without this changing would leave the ladders of the map you just left. */
  const warpMap = (area) => {
    const m = new Map();
    for (const [ax, ay, bx, by] of area.warps ?? []) {
      m.set(`${ax},${ay}`, [bx, by]);
      m.set(`${bx},${by}`, [ax, ay]);     // both ways; a one-way ladder is a trap
    }
    return m;
  };
  let warps = warpMap(areaOf(state.areaId));
  const at = (x, y) => (rows[y] ? rows[y][x] ?? "" : "");

  // How many pixels a tile the minimap is drawing at - see `miniScale`.
  let miniTile = MINI_TILE;
  /* The baked terrain and the context that blits it. Both are rebuilt by
     `bakeMini()` whenever `rows` changes, which is only ever `travel()`. */
  let miniCtx = null;
  let miniArt = null;

  function bakeMini() {
    if (!mini) return;
    miniTile = miniScale(MAP_W, MAP_H);
    const w = MAP_W * miniTile;
    const h = MAP_H * miniTile;
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
        b.fillRect(x * miniTile, y * miniTile, miniTile, miniTile);
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
    const k = miniTile / TILE;           // world pixels -> minimap pixels
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
    const px = wx * k + miniTile / 2;
    const py = wy * k + miniTile / 2;
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
    /* `hop` is the LEDGE hop and moves two tiles; `leap` is one tile and is
       purely how it looks - getting onto the water and back off it. Both draw
       the jump pose on an arc, and keeping them separate is what stops a
       mount from also vaulting a tile into the lake. */
    startedAt: 0, ms: STEP_MS, hop: false, leap: false,
  };
  let art = { atlas: null, player: null };
  let walkFrame = 0;
  let raf = 0;
  let saveTimer = null;
  /* Set only by `chosen` - see it. Declared here, beside the timer, rather
     than beside its user, so no call to `save()` during start-up can ever
     reach it inside its temporal dead zone. */
  let halted = false;

  /* The engine mutates its state in place and tells React to re-render, which
     works for anything read during render but silently breaks useMemo: after a
     catch, state.box is the same array object, so a memo keyed on it never
     recomputes and the BOX tab shows the box as it was. Every change bumps this
     instead, and panels put it in their dependency list. */
  /* How long one step takes right now. Stride shortens it and running shortens
     it again, so the two stack instead of one hiding the other. Read fresh
     every step rather than cached, because either can change mid-walk. */
  const stepMs = () =>
    STEP_MS * stepScale(state.stats) * (state.running ? RUN_SCALE : 1);

  /* TWO COUNTERS, AND THE SECOND ONE IS WHY WALKING IS NOT LAGGY ANY MORE.

     Reported as the trainer walking badly whenever the Dex or Box tab is open,
     and measured it is exactly that: `onArrive` calls `changed()` on EVERY
     step - about seven a second - `rev` bumps, `App` re-renders, and the Dex
     panel reconciles **1,215 cells** plus eight `SPECIES.filter` passes for
     its mark counts. Nothing about a step changes any of that. The position
     moved; the collection did not.

     `colRev` IS THE COLLECTION, and the INVERSION is the whole safety of it.
     The obvious shape - bump a second counter at every place that touches the
     box, the bag, the dex or the wallet - is seven call sites and a stale
     panel the day somebody adds an eighth, which is precisely the failure
     `rev` itself exists to prevent. So the DEFAULT bumps both, and only the
     one hot path opts out: `stepped()` is called from exactly one place, the
     end of `onArrive`, and every other mutation in this file keeps the
     behaviour it always had by doing nothing. The dangerous default became the
     safe one - the same argument `genOpen` records for treating a missing
     generation as open.

     `rev` still bumps on every step, so the top bar, the step counter and the
     money float are untouched. It is only the two heavy panels that read
     `colRev`. */
  const changed = () => {
    state.colRev++;
    state.rev++;
    onChange();
  };

  /* A step moved the trainer and nothing else. The ONE caller is the end of
     `onArrive`; anything there that DID touch the collection - a parcel of
     balls and its wage - calls `changed()` instead, which is why that line is
     a ternary rather than a plain call. */
  const stepped = () => {
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
    if (halted || state.stale === "taken" || state.stale === "outdated") return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 400);
  }

  /* THE DEBOUNCED BODY, callable on its own - because a debounce is a promise
     to write LATER, and there are two moments when there is no later: logging
     out, where the next thing Boot does is unmount this engine (whose
     `destroy()` cancels the timer), and the tab going away, where the timer
     simply never fires. Either way the last thing you did in the final 400ms
     was the thing that was lost. */
  function writeNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (halted || state.stale === "taken" || state.stale === "outdated") return;
    /* `write` reports whether it stuck rather than throwing - which cause it
       was is its business, not this file's. What happens NEXT is this file's:
       play on either way, and latch it so the top bar can say NOT SAVING. */
    const raw = JSON.stringify(persisted(state));
    const got = write(SAVE_KEY, raw);
    if (got.ok) {
      if (state.stale) { state.stale = null; changed(); }
    } else if (state.stale !== got.why) {
      state.stale = got.why;
      changed();
    }
    /* AND UPWARD, on its own clock. Local is what the next frame reads, so it
       is never waited on; the account's copy trails it by a few seconds. With
       no account configured this is a no-op - see cloud.js.

       NEVER after a load that was rejected - see `loadState`. The session this
       started as is a fresh game standing in for a save that could not be
       read, and the account's copy IS that save. */
    if (!verdict) mirror(raw, pushCloud);
  }
  const pending = () => saveTimer != null;

  /* A SAVE PICKED BY HAND - restored or imported - and the one path both take.
     The old game must not save over it on the way out, so the debounce dies
     first; the marker tells the next `settle` that this local save wins over
     the account's whatever the step counts say, and keeps the account's copy
     as OTHER so the choice can itself be undone. Reloads, because the engine
     closes over the map rows and a reload is the one path certainly
     consistent. */
  /* HALTED, NOT `stale`. The first version set `stale = "taken"`, which would
     have flashed the "playing somewhere else" dialog on any render before the
     reload landed - and this is also what the `pagehide` listener below has to
     respect, or the reload's own pagehide writes the OLD game straight back
     over the save that was just chosen. */
  function chosen(raw) {
    halted = true;
    clearTimeout(saveTimer);
    saveTimer = null;
    write(SAVE_KEY, raw);
    write(CHOSEN_KEY, "1");
    location.reload();
  }

  /* ONE WRITER PER BROWSER, AND THE NEWEST TAB IS IT.

     Two tabs share one localStorage key. Signed in, `claim()` stops the older
     one - but only at its next upload, which is up to a whole sync window of
     both of them writing over each other; and in local mode nothing stopped it
     at all, so an idle tab left open behind a live one could put an hour-old
     save back the next time anything in it changed. The newest tab stamps its
     id here, and every OTHER tab is told by the browser - `storage` fires in
     the documents that did not write - and stops exactly as a lost claim does,
     under the same dialog. */
  const TAB = globalThis.crypto?.randomUUID?.() ?? `t${Math.random()}`;
  if (verdict !== "outdated") write(WRITER_KEY, TAB);
  const rival = (ev) => {
    if (ev.key !== WRITER_KEY || !ev.newValue || ev.newValue === TAB) return;
    if (state.stale === "taken" || state.stale === "outdated") return;
    clearTimeout(saveTimer);
    saveTimer = null;
    state.stale = "taken";
    changed();
  };
  /* AND A TAB THAT IS LEAVING WRITES WHAT IT HAS. Registered here rather than
     in store.js because only the engine knows there is a debounce in flight;
     store's own listener, registered later, then flushes what this puts in
     `pending` - listeners run in the order they were added. */
  const leaving = () => { if (pending()) writeNow(); };
  const hidden = () => { if (globalThis.document?.visibilityState !== "visible") leaving(); };
  globalThis.addEventListener?.("storage", rival);
  globalThis.addEventListener?.("pagehide", leaving);
  globalThis.addEventListener?.("visibilitychange", hidden);

  loadArt().then((loaded) => { art = loaded; });

  // ------------------------------------------------------------ movement

  function tryStep(dir) {
    const p = state.player;
    p.dir = dir;
    const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    let nx = p.x + dx;
    let ny = p.y + dy;

    /* Ledges are one-way, and WHICH way is the character's - `L` is hopped
       going south, `J` going east. Walking into one ALONG ITS OWN DIRECTION
       hops it and lands you on the far side, so a terrace is quick to leave
       and slow to get back onto, which is the whole reason a mountainside has
       them. From any other direction a ledge is simply a wall, which
       `walkable` already reports. */
    const face = LEDGE[at(nx, ny)];
    const hop = !!face && face[0] === dx && face[1] === dy
      && walkable(rows, nx + dx, ny + dy);
    /* OFF THE RIDE IS ALWAYS ALLOWED, ONTO IT NEVER IS. While you are on the
       water you may cross to more water or step ashore; from the bank the only
       way out is `surf()`, which is what the key item gates. So this asks
       where you ARE rather than what you hold - the permission was checked
       when you mounted and cannot have changed since. */
    const riding = rideable(rows, p.x, p.y);
    if (hop) { nx += dx; ny += dy; }
    else if (!walkable(rows, nx, ny) && !(riding && rideable(rows, nx, ny))) return;

    move.fromX = p.x;
    move.fromY = p.y;
    move.active = true;
    move.startedAt = performance.now();
    // A hop covers two tiles, so give it longer or it reads as a teleport.
    move.ms = stepMs() * (hop ? 1.7 : 1);
    move.hop = hop;
    /* STEPPING ASHORE IS A HOP, because it is one in every game that has ever
       drawn it and because the alternative reads as sliding out of the water
       onto dry land. Only at the boundary: crossing open water is paddling. */
    move.leap = riding && !rideable(rows, nx, ny);
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

  /* Monotonic, and that is the point: the notice is keyed on it, so wearing
     out the same item twice is two notices rather than one that never
     restarts - the same reason `e.ate` counts instead of flagging. */
  let wornSeq = 0;

  function onArrive() {
    /* A LADDER MOVES YOU BEFORE ANYTHING ELSE LOOKS AT WHERE YOU ARE. Taken
       here, at the end of the step, rather than in `tryStep`: the walk has to
       finish and the tile has to be arrived at, or the trainer slides to a
       place he never reached. `move` is dragged along with him so the next
       frame interpolates from the new tile instead of gliding across the map,
       and an encounter rolls on the floor he came out on, which is the one he
       is standing in. */
    const who = state.player;
    const hop = warps.get(`${who.x},${who.y}`);
    if (hop) {
      [who.x, who.y] = hop;
      move.fromX = who.x;
      move.fromY = who.y;
      move.active = false;
    }
    walkFrame++;
    state.steps++;
    teach({ kind: "step", steps: state.steps });
    noteDaily({ steps: 1 });
    /* One step off every running effect; the slot empties when it runs out,
       and says so on the way. Announced HERE rather than by the panel noticing
       the slot is empty, because only this line knows the difference between
       an effect that expired and one that was cancelled by starting another -
       and telling somebody their repel wore off when they replaced it with a
       Max Repel is worse than saying nothing. */
    for (const fam of FAMILIES) {
      const run = state.field[fam];
      if (run && --run.steps <= 0) {
        state.field[fam] = null;
        state.worn.push({ id: run.id, n: ++wornSeq });
      }
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
      /* AND IT PAYS CASH, which is the one income here that does not need a
         catch. `pay()` is not used: it cheers unconditionally, and an
         ordinary parcel is deliberately quiet - the top bar's floating delta
         is what shows this one. */
      state.money += parcel.money;
      if (parcel.haul) {
        cheer({
          kind: "steps",
          money: parcel.money,
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
    /* WHAT LIVES IN WHAT YOU ARE RIDING, and neither half needed a new table.

       On water it is the rod's pool - the same species a line reaches, which
       is what water in this game has always meant and is already balanced. On
       LAVA it is the map's own table, because the only lava here is Ember
       Caldera and every resident of Ember is a Fire type; a separate lava list
       would be that list written twice.

       A rod is granted at Lv 4 and Surf at Lv 20, so `bestRod` always answers
       by the time anyone can be out here. It falls back to the map anyway,
       because a table that comes back empty should thin the encounters out
       rather than stop them. */
    const ride = surfing() ? at(state.player.x, state.player.y) : null;
    /* REPEL IS ITS OWN AXIS. It changes how OFTEN an encounter happens and
       never what it is - which is what keeps it off the table the White Flute
       and Fortune are already moving, and is the honest reading of what a
       repel is for: crossing a map you have already farmed. */
    const rate = ENCOUNTER_RATE * (running("repel")?.rate ?? 1);
    if (biome && !state.evolution && Math.random() < rate) {
      /* The level is part of the table, not a modifier on the roll: past Lv 8
         a map starts turning up the evolved forms of what already lives there.
         `tableFor` caches, because this is asked on every step that spawns. */
      const here = tableFor(biome, levelFromXp(state.xp));
      if (ride && ride !== "V") {
        const rod = bestRod(state.bag);
        const pool = rod && rodTable(rod.id);
        startEncounter(pool && pool.length ? pool : here, "surf");
      } else {
        startEncounter(here, ride ? "surf" : undefined);
      }
    }
    save();
    /* A parcel hands over balls and cash, which the Box and the shop both
       show; a plain step hands over nothing. */
    if (parcel) changed(); else stepped();
  }

  /* NOBODY IS LEFT AFLOAT WITHOUT THE MEANS TO BE. Surfing is derived from the
     tile, which is what makes it unable to disagree with itself - but it also
     means a save standing on water while missing the item would be stuck
     there, unable to step onto land only because `rideable` says the step off
     is a ride. It cannot happen from play (the item is never taken away) and a
     hand-edited or half-migrated save should still open, so: if you are afloat
     and cannot surf, you are put back on the nearest bank.

     The same shape as `loadState` sending a save home from a map it has not
     earned - a save that is somewhere impossible is moved, never refused. */
  function ashore() {
    const p = state.player;
    if (!rideable(rows, p.x, p.y)) return;
    if (canSurf(levelFromXp(state.xp), state.bag)) return;
    for (let r = 1; r < 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (walkable(rows, p.x + dx, p.y + dy)) {
            p.x += dx; p.y += dy;
            return;
          }
        }
      }
    }
  }

  function travel(areaId) {
    if (!AREAS[areaId] || state.encounter || state.evolution) return false;
    // The gate, enforced where the move actually happens rather than only in
    // the panel that offers it.
    if (!areaOpen(areaId, levelFromXp(state.xp))) return false;
    state.areaId = areaId;
    rows = areaOf(areaId).rows;
    fixed = areaOf(areaId).tiles ?? null;
    warps = warpMap(areaOf(areaId));
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
       see `lockedTiers` - which is now only "is there artwork", the earn-it
       gate having gone. It is passed in rather than checked inside the roll
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
      lockedTiers(sp.id),
      pityBoost(state.dry) * (honey && !honey.tier ? honey.lift : 1),
      honey?.tier ? { tier: honey.tier, mult: honey.lift } : null);
    state.dry = variant ? 0 : (state.dry ?? 0) + 1;

    /* WHETHER YOU HAVE THIS FORM, which is a different question from whether
       you have the species - and the badge was answering the wrong one.
       Reported from play: an ordinary Pikachu was caught, and every Holo,
       Shiny and Astral Pikachu afterwards wore a Poke Ball saying it was
       already in the dex. It was not; a tier is its own row in the collection
       and its own square in the FORMS strip.

       `known` is untouched and still means the SPECIES, because that is what
       the Repeat Ball is worth something against - it is the fact the ball was
       priced on, and making it per-form would quietly halve a ball nobody
       asked to retune. Two different questions, two fields, both frozen here
       for the same reason `known` always was. */
    const knownForm = variant
      ? (state[variant]?.[at] ?? 0) === 1
      : known;

    state.encounter = {
      speciesId: sp.id,
      name: label(sp).toUpperCase(),
      types: sp.types,
      known,
      knownForm,
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

  /* SURFING IS NOT A FLAG, IT IS WHERE YOU ARE STANDING.

     The obvious shape for this is `state.surfing`, saved and toggled, and it
     is the wrong one: a boolean and a position can disagree, and every way
     they can is a bug with no floor under it. A save written mid-ride that
     loses the flag strands you on water you cannot leave; one that keeps a
     stale flag walks you onto land still riding. Neither needs to exist.

     A liquid tile is impassable on foot - that is what `SOLID` means and it
     has not changed - so BEING on one is proof you rode there, and it is the
     only proof needed. No new save field, nothing to migrate, and a save from
     before Surf existed loads correctly by construction because its player is
     standing on ground. */
  const surfing = () => rideable(rows, state.player.x, state.player.y);

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
    /* NOT FROM THE WATER. Casting while sitting on it would put the bobber a
       tile away from a trainer who is already in the pool, and the rod set is
       drawn standing on a bank. Ride ashore to fish. */
    if (surfing()) return null;
    return bestRod(state.bag);
  }

  /* Can you ride the tile you are facing? The same shape as `castable`, and it
     answers for the prompt as well as for the key. */
  function surfable() {
    if (state.encounter || state.evolution || state.fishing || move.active) return null;
    if (surfing()) return null;                       // already out there
    if (!canSurf(levelFromXp(state.xp), state.bag)) return null;
    const [fx, fy] = facingXY();
    return rideable(rows, fx, fy) ? at(fx, fy) : null;
  }

  /* Step off the bank onto the water. A ride is a MOVE rather than a state
     change, so it animates like every other step and `onArrive` rolls for an
     encounter the moment you are out there - which is what makes the first
     tile of water feel like a place rather than a mode. */
  function surf() {
    if (!surfable()) return false;
    const [fx, fy] = facingXY();
    const p = state.player;
    move.fromX = p.x;
    move.fromY = p.y;
    move.active = true;
    move.startedAt = performance.now();
    move.ms = stepMs() * 1.4;      // pushing off is slower than a pace
    move.hop = false;
    /* AND GETTING ON IS A HOP TOO. It was an instant slide onto the water -
       reported as needing the jump before and after rather than a teleport,
       which is right: you are stepping off a bank onto something that floats,
       and the sprite sheet has the pose for it. */
    move.leap = true;
    move.leap = false;
    p.x = fx;
    p.y = fy;
    changed();
    return true;
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

  /* TWO PRESSES IN THIS GAME CANNOT BE TAKEN BACK, and both were one tap.

     Reported from play: a Master Ball thrown by accident, and a legendary run
     from by reflex. A Master Ball is 1 in 12,500 steps of walking or ¥50,000,
     it ENDS the encounter, and `defaultBall` already refuses to let a bare
     throw reach one - which is the same worry solved for the press that does
     not name it, leaving the press that does. A legendary is 1 in 3,760
     encounters and RUN sits under the thumb that throws.

     **THE GATE IS IN THE ENGINE, NOT AT THE CALL SITES.** There are five
     throws and three flees - the key handler, the bag sheet, the rail, the
     encounter's own button and the pad's two - and this file already records
     what guarding each one costs: *"a rule enforced in one of two places is
     not a rule"*, which is how a shiny came to be protected from one bulk
     action and not its sibling. `keeper()` lives in the engine for exactly
     this reason. Gated here, `Pad.jsx` needed no change at all and a sixth
     call site is covered on the day it is written.

     `state.ask` is what the press WANTED, so confirming re-runs the original
     function rather than reaching into its middle - every guard above runs
     again, and an encounter that ended while the dialog was open simply does
     nothing. Never saved, for the reason `worn` is not: it is a question
     about this moment. */
  function ask(kind, run, title, body) {
    state.ask = { kind, title, body, run };
    changed();
  }

  // Answering re-runs the press. Cancelling is the default and costs nothing.
  function answerAsk(yes) {
    const pending = state.ask;
    state.ask = null;
    if (yes && pending) pending.run();
    else changed();
  }

  function throwBall(ballId = "poke-ball", confirmed = false) {
    const e = state.encounter;
    if (!e || e.phase !== "idle") return;

    const ball = ballById(ballId);
    if (!ball || (state.bag[ball.id] ?? 0) <= 0) return;

    /* On the MULT, not on the id - the same predicate `defaultBall` refuses a
       bare throw with, so a second ball that cannot fail is covered the day it
       ships. AFTER the bag check, because confirming a ball you do not hold is
       a dialog about nothing. */
    if (!confirmed && ball.mult >= GUARANTEED) {
      ask("master", () => throwBall(ballId, true),
        `Throw your ${ball.name}?`,
        `It cannot fail, and you have ${state.bag[ball.id]}. ` +
        `${e.name} is ${isLegendary(e.speciesId) ? "a legendary" : "not a legendary"}.`);
      return;
    }
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
  /* How much of the dex is done. Read by the milestones and by `dexBonus`,
     which pays MORE the fuller the dex is - so it has to be the same number
     in both places or the bonus climbs on a different curve from the one the
     milestones are celebrating. */
  const caughtSpecies = () => state.dex.reduce((n, v) => n + (v === 2 ? 1 : 0), 0);

  function checkDexRewards(speciesId) {
    for (const medal of medalsFor(speciesId, state.dex, state.medals)) {
      state.medals.push(medal.id);
      pay(medal.money, medal.items, {
        kind: "medal", title: medal.name, sub: medal.sub,
      });
    }

    const caught = caughtSpecies();
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
        /* DERIVED FROM `TIER_TELL`, because this table knew FOUR tiers of
           eight - written when there were four - so meeting a Glitched or a
           Showdown raised the banner with no line under it at all. Exactly
           the fault `Cheer.jsx`'s own `KIND` table had, in the file that
           feeds it, and a missing key in a lookup is a sentence nobody
           notices is absent. */
        cheer({
          kind: roll,
          title: e.name,
          sub: `${TIER_TELL[roll]} — never sold, never fed.`,
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

      /* WHAT A CATCH PAYS, AND IT USED TO BE A FLAT ¥100 OR NOTHING.

         The bounty is on EVERY variant catch and not only the first of its
         kind - `newVariant` gates the banner, deliberately, because a second
         Holo Pikachu is not an occasion. It is still a 1-in-18 event and
         still the renewable income the late game was missing, so gating the
         money on it too would have left the stream one-off exactly like the
         dex bonus it is there to replace. */
      const bounty = catchBounty(sp, e.variant);
      const entry = e.isNew ? dexBonus(caughtSpecies(), SPECIES.length) : 0;
      state.money += bounty + entry;

      /* ONE FIGURE, BECAUSE THE TEXTBOX IS SIZED AND THE SIZE IS LOAD-BEARING.
         Both sums itemised reads `+¥25200 showdown  +¥1000 new entry`, which
         on the longest name in the dex is **78 characters against the 59 the
         layout was measured at** - and `.ballwrap.fighting` stops at
         `var(--tb-h)`, so a textbox that wraps past its `min-height` puts the
         ball rail back on top of the message. Measured before it was changed,
         which is the same discipline `--tb-h` was set with.

         Nothing is lost by totalling: the nameplate already carries the tier
         chip, a NEW variant raises its own banner, and the top bar floats the
         delta. The word survives only where it is the only thing being paid
         for, which is also the case that stays short. */
      const tail = bounty
        ? `  +¥${bounty + entry}`
        : entry ? `  +¥${entry} new entry` : "";
      e.msg = `Gotcha! ${e.name} was caught!${tail}`;
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
      state.ask = null;          // a question about an encounter dies with it
      changed();
      return;
    }
    Object.assign(e, step);
    changed();
  }

  function flee(confirmed = false) {
    const e = state.encounter;
    if (!e || e.phase !== "idle") return;

    /* ASKED THE SAME WAY THE NAMEPLATE ASKS IT - `isLegendary(enc.speciesId)`
       is what `Encounter.jsx` draws the mark from, and `speciesId` is frozen
       at spawn, so the dialog and the badge cannot disagree. A second
       `legendary` field on the encounter would be a copy with nothing to gain:
       the derivation is pure and its input is already frozen. */
    if (!confirmed && isLegendary(e.speciesId)) {
      ask("flee", () => flee(true),
        `Run from ${e.name}?`,
        "A legendary. There is no telling when you will meet another.");
      return;
    }
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
    /* What the tile pass actually drew, for the handful of tiles the player
       covers - see `drawOverlays`. Collected here rather than worked out again
       afterwards, because which tile a rule picked is `drawTile`'s to know.

       THE BOX IS THE SPRITE'S OWN RECT. `drawPlayer` draws at `py + TILE - h`
       with h = 2 tiles, so the trainer occupies his feet tile and the one
       ABOVE it and nothing else. The first version padded a row below him as
       well, which can only ever repaint ground he is standing in front of.
       One column either side, because the 32-wide sets (fishing, surfing) and
       a stride between tiles both reach sideways, and one extra row above for
       a hop's lift. */
    const px = Math.round(wx / TILE);
    const py = Math.round(wy / TILE);
    const over = [];
    for (let y = y0; y <= y0 + VIEW_H; y++) {
      for (let x = x0; x <= x0 + VIEW_W; x++) {
        // Off the map draws as tree so the void reads as forest, but neighbour
        // lookups get "" there - otherwise the tree depth walk never ends.
        const ch = at(x, y) || rows[0][0];
        const id = drawTile(ctx, art.atlas, ch,
                            Math.round(x * TILE - camX), Math.round(y * TILE - camY),
                            x, y, at, fixed ? fixed[y * MAP_W + x] : -1);
        /* AND ONLY WHERE HE COULD BE STANDING. An overhang is something you
           walk BEHIND, so it has to be somewhere you can walk: a solid tile is
           one you are always in FRONT of, and repainting its upper half over
           the trainer is the bug that put the Power Plant's outer wall across
           his head. Read off the cell rather than baked into the tile, because
           collision belongs to the map - five of that map's metatiles are laid
           both walkable and solid in different places. */
        if (x >= px - 1 && x <= px + 1 && y >= py - 2 && y <= py
            && walkable(rows, x, y)) over.push([x, y, id]);
      }
    }

    /* A hop has its own mid-air pose - legs tucked, one frame per facing - and
       the renderer still puts it on an arc and leaves the shadow behind.
       Running is its own three frames; a cast is its own four, held by phase. */
    const cast = state.fishing;
    /* Either kind of hop draws the same way: the mid-air pose and an arc. */
    const airborne = move.active && (move.hop || move.leap);
    drawPlayer(
      ctx, art.player, Math.round(wx - camX), Math.round(wy - camY),
      p.dir, walkFrame, move.active, t,
      {
        /* THE HOP OUTRANKS THE RIDE, and the order is the whole fix. During a
           mount the player's coordinates are ALREADY the water tile - that is
           what `surfing()` reads - so with the ride first the jump never drew
           and getting on was an instant slide. Airborne first, and both ends
           of the ride arc properly.

           Otherwise riding beats everything, including running: the shoes do
           not help on water, and a trainer striding across a lake is the one
           thing here that would look like a bug rather than a feature. */
        set: airborne ? "jump"
          : surfing() ? "surf"
          : cast ? "fish"
          : state.running && move.active ? "run" : "walk",
        frame: cast ? fishFrame(p.dir, cast.phase) : undefined,
        lift: airborne ? Math.sin(Math.PI * t) * 11 : 0,
        // Which trainer. A row offset into the same strip - see drawPlayer.
        char: state.char,
      },
    );

    drawBobber(ctx, state.fishing, now, camX, camY);

    drawOverhangs(ctx, art.atlas, x0, y0, VIEW_W, VIEW_H, camX, camY, at,
                  (x, y) => (fixed ? fixed[y * MAP_W + x] : -1));
    drawOverlays(ctx, art.atlas, over, camX, camY);

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

  /* Before the first frame, so nobody ever SEES themselves stuck afloat. */
  ashore();
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
      state.money += dexBonus(caughtSpecies(), SPECIES.length);
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
    surf,
    surfable,
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
      // "outdated" is the same kind of end - see `loadState`.
      if (state.stale === "taken" || state.stale === "outdated") return;
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
    dropWorn() {
      state.worn.shift();
      changed();
    },
    press: (dir) => held.add(dir),
    release: (dir) => held.delete(dir),
    clearHeld: () => held.clear(),
    throwBall,
    flee,
    answerAsk,
    skip,
    reset() {
      /* Halted first, or the reload's own `pagehide` writes the game straight
         back into the key this has just cleared - see `chosen`. */
      halted = true;
      clearTimeout(saveTimer);
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
      const key = which === "broken" ? BROKEN_KEY
        : which === "other" ? OTHER_KEY : BACKUP_KEY;
      const raw = read(mine(key));
      if (!raw) return false;
      /* BROKEN IS RAW TEXT AND MAY NOT BE JSON AT ALL - that is why it was
         kept. Parsing it outside a try here would throw out of the click that
         was trying to recover from it. */
      let obj;
      try { obj = JSON.parse(raw); } catch { return false; }
      if (saveProblem(obj)) return false;
      chosen(raw);
      return true;
    },
    recoverable,

    exportSave() {
      return { ...persisted(state), savedAt: new Date().toISOString(), species: SPECIES.length };
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
      chosen(JSON.stringify(obj));
      return null;
    },
    /* Everything waiting in the debounce, now - see `writeNow`. */
    saveNow() { if (pending()) writeNow(); },

    /* A DESTROYED ENGINE NEVER WRITES AGAIN. Boot destroys it before clearing
       the browser's copy on log out and on delete, and a debounce or a
       `pagehide` landing after that would put the cleared save straight back. */
    destroy() {
      halted = true;
      cancelAnimationFrame(raf);
      clearTimeout(saveTimer);
      globalThis.removeEventListener?.("storage", rival);
      globalThis.removeEventListener?.("pagehide", leaving);
      globalThis.removeEventListener?.("visibilitychange", hidden);
    },
  };
}
