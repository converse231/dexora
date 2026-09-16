/* WHAT TO SHOW BEFORE THE GAME, and nothing else.

   Three questions in order, each one only asked while its answer is missing:
   is there a session, is there a trainer, and has the save been brought down
   from the account. The game itself knows about none of it - `App` is mounted
   once, at the end, with a save already in place - and that is deliberate: the
   engine closes over the map rows at construction, so a save arriving later
   cannot be applied to a running engine. Boot exists to make sure it never
   arrives later.

   LOCAL MODE SKIPS STRAIGHT PAST THE ACCOUNT. With no credentials configured
   `CLOUD` is false, there is no session to want, and the only question left is
   the trainer. The game is then exactly what it was before any of this: one
   save, this browser. */

import { useCallback, useEffect, useRef, useState } from "react";
import App from "./App.jsx";
import { Account, Trainer } from "./ui/Gate.jsx";
import {
  CLOUD, restore, signIn, signUp, signOut, onAuth, pull, push,
  getProfile, createProfile, renameTrainer, deleteAccount, email as accountEmail,
} from "./net/cloud.js";
import {
  SAVE_KEY, OWNER_KEY, read, write, drop, newer, onSyncTrouble, flushNow,
} from "./game/store.js";

/* THE ACCOUNT OWNS THE SAVE; THE BROWSER IS A CACHE OF IT.

   Signed in, the database is the record. localStorage still holds a copy and
   the game still writes there first - it writes on every step, so a round trip
   in the middle of the walk cycle is not on the table - but it is a cache, not
   a peer, and when the two disagree the account wins.

   The exception is the one case where local is not stale but AHEAD: playing
   offline, where the writes are real and simply have not been uploaded yet.
   `newer` settles that by step count, which cannot go down.

   And a cache has an owner. Without one, `newer(local, null)` hands a brand-new
   account whatever was already in the browser - reported as signing up and
   landing straight in the game with the trainer question skipped, and the worse
   version is signing up on somebody else's machine and inheriting their dex.
   An UNOWNED save is still adopted: that is genuine offline progress from
   before there were accounts. One owned by a different account is not. */
async function settle(uid) {
  /* ONLY A CACHE THIS ACCOUNT WROTE COUNTS. This read `!owner || owner === uid`
     - an UNOWNED save treated as yours - which was meant to rescue somebody who
     played offline and then signed up. What it actually did was hand every
     account whatever the browser happened to be holding, and the deployed build
     is full of localStorage from before there were accounts at all: logging in
     on it produced a dex nobody had earned, and no amount of clearing the
     database fixed it, because the data was never in the database.

     Signed in, the server is the only source. The one thing local may still win
     is being AHEAD of it - offline play whose uploads have not landed - and
     that is settled by step count, which cannot go down. Somebody who really
     did play as a guest and wants to keep it has EXPORT on the YOU panel; a
     silent adoption is the wrong way to offer that, because it cannot tell the
     difference between your game and a stranger's. */
  const owner = read(OWNER_KEY);
  const local = owner === uid ? read(SAVE_KEY) : null;
  const remote = await pull();

  const keep = newer(local, remote);
  if (keep !== local) {
    if (keep) write(SAVE_KEY, keep); else drop(SAVE_KEY);
  }
  if (uid) write(OWNER_KEY, uid);
  return keep;
}

const fieldOf = (raw, key) => {
  if (!raw) return null;
  try { return JSON.parse(raw)[key] ?? null; } catch { return null; }
};

export default function Boot() {
  // "wait" until we know; then "account", "trainer" or "play".
  const [phase, setPhase] = useState("wait");
  const [busy, setBusy] = useState(false);
  /* Bumped when the save underneath is replaced, so `App` remounts and builds
     a new engine around it rather than trying to adopt one mid-flight. */
  const [gen, setGen] = useState(0);
  // The trainer's name, off the profile row. Shown in game; null in local mode.
  const [name, setName] = useState(null);
  const [whoError, setWhoError] = useState(null);
  // The live engine, so a sync failure has somewhere to be reported to.
  const engineRef = useRef(null);

  /* WHAT IS STILL MISSING DECIDES THE SCREEN. A profile is the account's
     (name and trainer); a `char` on the save is what the game actually draws
     from. Signed in, the profile is the authority and the save follows it - so
     a player who reinstalls, or clears their browser, is not asked again. */
  const decide = useCallback(async (session) => {
    const uid = session?.user?.id ?? null;
    let raw = await settle(uid);

    if (CLOUD && uid) {
      const prof = await getProfile();
      if (!prof) { setPhase("who"); return; }
      setName(prof.username);
      // The save is the copy the renderer reads; keep it in step with the row.
      if (fieldOf(raw, "char") !== prof.char) {
        const next = JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), char: prof.char });
        write(SAVE_KEY, next);
        raw = next;
      }
      setPhase("play");
      return;
    }

    // Local mode: no profile to have, so the trainer is the only question.
    setPhase(fieldOf(raw, "char") ? "play" : "trainer");
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const session = await restore();
      if (!live) return;
      if (CLOUD && !session) { setPhase("account"); return; }
      await decide(session);
    })();

    /* Signing out in another tab, or a refresh token finally expiring, both
       land here - so the game returns to the gate rather than carrying on and
       failing every sync from then on. */
    const off = onAuth((session) => {
      if (!live) return;
      if (!session) { setPhase("account"); setGen((n) => n + 1); }
    });
    return () => { live = false; off(); };
  }, [decide]);

  /* A FAILED UPLOAD HAS TO REACH THE SCREEN. This was wired to a no-op - the
     reporting channel built and then thrown away - so a save that never made it
     to the account looked exactly like one that did. The engine owns the slot
     the top bar reads, so it is handed over as soon as there is an engine; the
     ref is because Boot mounts App rather than being inside it. */
  useEffect(() => {
    onSyncTrouble((why) => engineRef.current?.syncTrouble?.(why));
    return () => onSyncTrouble(null);
  }, []);

  const afterAuth = async (got) => {
    if (!got.ok || got.pending) return got;
    setBusy(true);
    await decide(await restore());
    setGen((n) => n + 1);
    setBusy(false);
    return got;
  };

  /* LOGGING OUT CLEARS THE BROWSER'S COPY, and the order matters: everything
     outstanding goes up FIRST, because the token is about to stop working, and
     only then is the cache dropped. Leaving it behind would hand the next
     person at this machine somebody else's dex - and the account has it. */
  const out = async () => {
    setBusy(true);
    const sent = await flushNow(push);
    await signOut();
    drop(SAVE_KEY);
    drop(OWNER_KEY);
    setBusy(false);
    setName(null);
    setPhase("account");
    setGen((n) => n + 1);
    return sent;
  };

  if (phase === "wait") {
    return (
      <div className="gate">
        <div className="gate-card gate-wait" role="status">
          <span className="title">Dexora</span>
          <p>Loading your Pokédex…</p>
        </div>
      </div>
    );
  }

  if (phase === "account") {
    return (
      <Account
        offline={!CLOUD}
        onSignUp={async (a, p) => afterAuth(await signUp(a, p))}
        onSignIn={async (a, p) => afterAuth(await signIn(a, p))}
      />
    );
  }

  /* SIGNED IN: name and trainer, written to the profile row first. The row is
     the record - the save's `char` is a copy of it - so if the insert fails
     (a taken name, a dropped connection) nothing local has moved and the
     screen simply says why. */
  if (phase === "who") {
    return (
      <Trainer
        askName
        busy={busy}
        error={whoError}
        onPick={async (id, username) => {
          setBusy(true);
          setWhoError(null);
          const got = await createProfile(username, id);
          if (!got.ok) { setWhoError(got.error); setBusy(false); return; }
          setName(username);
          const raw = read(SAVE_KEY);
          let next;
          try { next = JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), char: id }); }
          catch { next = JSON.stringify({ char: id }); }
          write(SAVE_KEY, next);
          setBusy(false);
          setGen((n) => n + 1);
          setPhase("play");
        }}
      />
    );
  }

  if (phase === "trainer") {
    return (
      <Trainer
        busy={busy}
        onPick={(id) => {
          /* WRITTEN BEFORE THE ENGINE EXISTS, straight into the save the engine
             is about to read. Going through `setChar` would need an engine, and
             the engine is what this is choosing for. */
          const raw = read(SAVE_KEY);
          let next;
          try {
            next = JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), char: id });
          } catch {
            next = JSON.stringify({ char: id });
          }
          write(SAVE_KEY, next);
          setGen((n) => n + 1);
          setPhase("play");
        }}
      />
    );
  }

  return (
    <App
      key={gen}
      onLogOut={CLOUD ? out : null}
      trainerName={name}
      /* Everything the YOU panel needs to manage the account, assembled here
         because this is the only component that knows there IS one. */
      account={CLOUD ? {
        name,
        email: accountEmail(),
        onRename: async (next) => {
          const got = await renameTrainer(next);
          if (got.ok) setName(next);
          return got;
        },
        /* DELETING TAKES THE BROWSER'S COPY WITH IT. The row is gone, so a
           cache of it is a dex belonging to nobody - and leaving it behind
           would let the next sign-up on this machine adopt it. */
        onDelete: async () => {
          const got = await deleteAccount();
          if (!got.ok) return got;
          drop(SAVE_KEY);
          drop(OWNER_KEY);
          setName(null);
          setPhase("account");
          setGen((n) => n + 1);
          return got;
        },
      } : null}
      onEngine={(e) => { engineRef.current = e; }}
    />
  );
}
