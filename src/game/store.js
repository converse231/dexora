/* WHERE THE SAVE LIVES, and the only place that knows.

   Every one of these was a bare `localStorage` call scattered through
   `engine.js` and `App.jsx` - ten of them - each with its own `try/catch` and
   its own idea of what to do when storage is unavailable. That was fine while
   there was one answer to "where does the save live". It stops being fine the
   moment there is a second: a hosted database, another tab, a different device.

   So this is the seam, and it is deliberately NOT an abstraction over a backend
   that does not exist yet. There is no adapter interface, no driver registry
   and no async wrapper around a synchronous API - those are the shapes you
   build when you are guessing. It is the same behaviour the engine already had,
   collected into one module, which is the precondition for any of it and is
   worth having on its own: the quota handling below existed in one of the five
   writers and not the other four.

   WHAT A HOSTED BACKEND WILL ACTUALLY NEED, so it is written down rather than
   half-built: `read` becomes async, which makes `loadState` async, which makes
   `createEngine` async - the engine closes over the map rows at construction,
   so a save that arrives later cannot be applied in place, and boot has to
   await the save before the engine exists. That is a change to `main.jsx`'s
   startup order and nothing else. `write` is already fire-and-forget behind a
   debounce and becomes async for free.

   THE KEYS ARE NAMESPACED BY THE GAME, not by the player. One account with one
   save is what a personal game is; the day that stops being true, the key gains
   a user id and `SAVE_KEY` becomes a function of one. Nothing outside this file
   builds a key. */

export const SAVE_KEY = "meadow-route";

/* THE OTHER TWO EXIST BECAUSE A COLLECTION WAS LOST - twice. BACKUP is the last
   save that loaded cleanly, written at LOAD time so it is always a whole
   previous session; BROKEN is the raw text of anything that failed to parse,
   kept verbatim and never re-serialised, because the one thing you want from a
   file you cannot read is the file. See `loadState` and `recoverable`. */
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export const BROKEN_KEY = `${SAVE_KEY}.broken`;

/* And one preference that is not the save: which way the ball rail was left.
   Namespaced under the same prefix so clearing the game clears all of it. */
export const RAIL_KEY = `${SAVE_KEY}:balls`;

/* WHOSE SAVE THIS BROWSER IS HOLDING, and it is not a nicety.

   Without it a brand-new account adopts whatever was already in the browser:
   `newer(local, null)` returns the local save, so signing up after playing
   offline drops you straight into the game with a trainer already chosen and
   the onboarding skipped - which is what was reported. The worse version of the
   same bug is signing up on somebody else's machine and inheriting their dex.

   An unowned save is one made before there were accounts, or in local mode, and
   it is still adopted - that is somebody's real offline progress. A save owned
   by a DIFFERENT account is not. */
export const OWNER_KEY = `${SAVE_KEY}:owner`;

/* Reading never throws. A private window, cleared site data, or a browser that
   has revoked storage all arrive here as "no save", which is the same thing a
   new player is - and starting a fresh game is a better answer than a blank
   screen. */
export function read(key = SAVE_KEY) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/* WRITING REPORTS WHETHER IT STUCK, and that is the whole reason this returns
   anything. It used to swallow every error under a comment naming only private
   mode, so a full quota meant an hour of play went nowhere in silence. The
   caller decides what to do about it - the engine latches `state.stale` and the
   top bar says NOT SAVING - but it cannot decide anything if it is not told.

   Quota is the one cause worth naming separately, because it is the only one a
   player can act on: sell some spares, or export and start fresh. */
export function write(key, raw) {
  try {
    localStorage.setItem(key, raw);
    return { ok: true };
  } catch (err) {
    const full = err?.name === "QuotaExceededError"
      || err?.name === "NS_ERROR_DOM_QUOTA_REACHED";
    return { ok: false, why: full ? "full" : "blocked" };
  }
}

/* Forget a key. Used when the browser's copy belongs to somebody else, and on
   logging out - the account has it, and leaving it behind is handing the next
   person at this machine a dex that is not theirs. */
export function drop(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to clear */ }
}

/* Put a save beyond the reach of the next write. Never throws and never
   reports: it runs on the failure path, where a failure to preserve must not
   become a failure to start. */
export function keep(key, raw) {
  if (raw) write(key, raw);
}

/* ------------------------------------------------------- the account's copy */

/* LOCAL FIRST, CLOUD AFTER, and never the other way round.

   The game writes on every step. Waiting for a round trip before the next frame
   would put the network in the middle of the walk cycle, and a dropped
   connection would stop the game rather than stop the sync. So `write` above
   stays synchronous and local, and this mirrors it upward on its own clock.

   The push is coalesced to one every `SYNC_MS` rather than debounced, and the
   difference matters: a debounce that resets on every write never fires while
   somebody is walking, which is exactly when there is most to lose. A trailing
   push always follows the last write, so the final state always lands. */
/* MEASURED, THEN RAISED. At 4s a player walking steadily produces 900 uploads
   an hour, and an upload is not a small thing on this table: the save is a
   jsonb document that TOASTs past about 8KB (a 600-caught save measures 39KB),
   so every one rewrites the row and its out-of-line chunks, leaves a dead tuple
   for autovacuum, and fires a trigger that expands a 1,145-element array to
   recount the dex. 100 players walking is 25 of those a second.

   15s costs almost nothing in exchange. The local write is still every 400ms
   and it is the copy the next frame reads, so what this cadence actually
   decides is how much play is missing if the DEVICE is lost between now and the
   next flush - and `flushNow` on the way out (below) covers the ordinary way a
   session ends. */
const SYNC_MS = 15000;
/* A FAILED UPLOAD IS RETRIED, NOT DROPPED. The first version cleared `pending`
   before awaiting the push, so a failure threw the save away: the game only
   recovered because the next write repopulated it, which means stopping play
   right after a dropped request lost that session from the account for good.
   The payload goes back now, and the wait backs off so a flapping connection is
   not hammered - capped, because a save that is minutes stale is the thing this
   exists to avoid. */
const SYNC_MAX_MS = 60000;
let wait = SYNC_MS;
let pending = null;
let timer = null;
let inflight = false;
let report = () => {};

/* Told once, at boot, how to say a sync failed. Kept out of this module's
   business - it knows the write did not land, not what the top bar should say. */
export function onSyncTrouble(fn) {
  report = typeof fn === "function" ? fn : () => {};
}

/* LEAVING IS THE COMMONEST WAY A SESSION ENDS, and nothing was listening for
   it - so up to a whole coalescing window of play only ever existed on the
   device it was played on. Registered once, on the first mirror, because that
   is the first moment there is a `push` to call.

   BOTH EVENTS, because they cover different exits. `visibilitychange` to
   hidden is the reliable one: switching tab or app fires it while the page is
   still fully alive, which is when a request can actually be made, and it is
   what a phone does before it backgrounds a browser. `pagehide` is the
   best-effort one for a closed tab, where the request may or may not survive -
   it costs nothing to try, and the local copy is untouched either way. */
let leaving = false;

export function mirror(raw, push) {
  pending = raw;
  if (!leaving && globalThis.addEventListener) {
    leaving = true;
    const out = () => { if (document?.visibilityState !== "visible") flushNow(push); };
    globalThis.addEventListener("visibilitychange", out);
    globalThis.addEventListener("pagehide", () => flushNow(push));
  }
  if (timer || inflight) return;
  timer = setTimeout(() => flush(push), wait);
}

async function flush(push) {
  timer = null;
  if (pending == null) return;
  const raw = pending;
  pending = null;
  inflight = true;
  let ok = false;
  let beaten = false;
  try {
    const got = await push(raw);
    ok = got?.ok !== false;
    beaten = got?.why === "taken";
    report(ok ? null : (got.why ?? "offline"));
  } catch {
    report("offline");
  } finally {
    inflight = false;
    if (ok) {
      wait = SYNC_MS;
    } else if (beaten) {
      /* ANOTHER SESSION OWNS THE SAVE, so retrying is not slow, it is wrong:
         every attempt would be refused by the same claim, and the payload it is
         holding is from a game the account has already moved on from. Drop it
         and stop. The engine stops writing too - see `stale === "taken"`. */
      pending = null;
    } else if (pending == null) {
      /* Put it back - but only if nothing newer arrived while it was in the
         air, because a newer save already contains everything this one did. */
      pending = raw;
      wait = Math.min(wait * 2, SYNC_MAX_MS);
    }
    if (pending != null && !timer) timer = setTimeout(() => flush(push), wait);
  }
}

/* Everything outstanding, now - for logging out, where the next thing that
   happens is the save being unreachable. Reports whether it landed, so the
   caller can decide whether leaving is safe; the local copy is untouched
   either way, so the worst case is the account being one session behind. */
export async function flushNow(push) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (pending == null) return { ok: true };
  const raw = pending;
  pending = null;
  try {
    const got = await push(raw);
    /* IT REPORTS, AND IT DID NOT. This runs on the two paths where a session
       ENDS - logging out, and the tab going away - so a failure here is the
       last chance to say the account is behind, and it was the one write in
       the module that said nothing at all.

       "taken" is dropped rather than kept: every retry would be refused by the
       same claim, and the payload belongs to a game the account has already
       moved past. Everything else goes back, because everything else is a
       connection that may come back. */
    const ok = got?.ok !== false;
    report(ok ? null : (got?.why ?? "offline"));
    if (!ok && got?.why !== "taken") pending = raw;
    return { ok };
  } catch {
    pending = raw;
    report("offline");
    return { ok: false };
  }
}

/* WHICHEVER HAS WALKED FURTHER WINS, and that is the whole merge.

   Two devices, one account: at login there can be a local save and a remote one
   and no way to ask a player which they meant. `steps` is the only counter in
   the game that cannot go down - it is incremented once per tile and never
   reset - so more steps is strictly more play, and taking the larger can only
   ever discard the shorter session. A timestamp would be wrong here: a clock
   that is slow, or a tab left open for a day, both beat a real afternoon.

   Ties go to REMOTE, because a tie means the same save and the remote one is
   the account's own record. */
export function newer(localRaw, remoteRaw) {
  const steps = (raw) => {
    if (!raw) return -1;
    try { return Number(JSON.parse(raw).steps) || 0; } catch { return -1; }
  };
  return steps(localRaw) > steps(remoteRaw) ? localRaw : (remoteRaw ?? localRaw);
}
