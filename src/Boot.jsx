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
import { Account, Trainer, Trouble, NewPassword } from "./ui/Gate.jsx";
import {
  CLOUD, restore, signIn, signUp, signOut, onAuth, pull, push, claim,
  getProfile, createProfile, updateProfile, deleteAccount, email as accountEmail,
  changePassword, requestReset, setPassword,
} from "./net/cloud.js";
import {
  SAVE_KEY, OWNER_KEY, BACKUP_KEY, BROKEN_KEY, OTHER_KEY, PARKED_KEY,
  read, write, drop, onSyncTrouble, flushNow, settle, scoped,
} from "./game/store.js";

/* THE ACCOUNT OWNS THE SAVE; THE BROWSER IS A CACHE OF IT.

   Signed in, the database is the record. localStorage still holds a copy and
   the game still writes there first - it writes on every step, so a round trip
   in the middle of the walk cycle is not on the table - but it is a cache, not
   a peer, and when the two disagree the account wins, except where the cache is
   AHEAD because offline play has not uploaded yet.

   The merge itself is `settle` in store.js. It lived here, beside the screens,
   and that is exactly why nothing could test it: it needs a server, and the
   suite could only grep its source. It takes `pull` as an argument now, so a
   fake server is all a test needs. */

/* ARRIVING FROM A RESET LINK, read before anything can clean it away.
   `detectSessionInUrl` consumes the fragment and rewrites the address bar
   inside the client's own async start-up, so by the time an effect runs there
   is nothing left to look at. The auth event is the backstop below; this is
   the half that cannot lose a race. */
const RECOVERY = typeof location !== "undefined"
  && /type=recovery/.test(`${location.hash}${location.search}`);

const fieldOf = (raw, key) => {
  if (!raw) return null;
  try { return JSON.parse(raw)[key] ?? null; } catch { return null; }
};

export default function Boot() {
  // "wait" until we know; then "account", "reset", "who", "trainer",
  // "down" or "play".
  const [phase, setPhase] = useState("wait");
  const [busy, setBusy] = useState(false);
  /* Bumped when the save underneath is replaced, so `App` remounts and builds
     a new engine around it rather than trying to adopt one mid-flight. */
  const [gen, setGen] = useState(0);
  // The trainer's name, off the profile row. Shown in game; null in local mode.
  const [name, setName] = useState(null);
  /* The rest of the profile row, for the settings screen to edit. Held here
     rather than re-fetched when the dialog opens: it is three small fields
     that were already read at boot, and a second read is a second answer. */
  const [profile, setProfile] = useState(null);
  const [whoError, setWhoError] = useState(null);
  // Why the account screen is showing, when it is showing for a reason.
  const [gateNote, setGateNote] = useState("");
  // The live engine, so a sync failure has somewhere to be reported to.
  const engineRef = useRef(null);

  /* WHAT IS STILL MISSING DECIDES THE SCREEN. A profile is the account's
     (name and trainer); a `char` on the save is what the game actually draws
     from. Signed in, the profile is the authority and the save follows it - so
     a player who reinstalls, or clears their browser, is not asked again. */
  const decide = useCallback(async (session) => {
    const uid = session?.user?.id ?? null;
    const got = await settle(uid, pull);
    let raw = got.raw;

    if (CLOUD && uid) {
      /* COULD NOT READ THE ACCOUNT. With a cache from this same account there
         is a game to play and offline play is a feature, so play it - nothing
         will be uploaded until a read succeeds. With no cache there is simply
         nothing to show, and dealing a fresh save to somebody who has a dex is
         the worst of the available answers. */
      if (!got.ok) { setPhase(raw ? "play" : "down"); return; }

      /* TAKE THE SAVE. From here this tab is the writer and any older session
         on any other device stops being able to upload - see `save_game`. */
      await claim();

      const prof = await getProfile();
      if (!prof.ok) { setPhase("down"); return; }
      if (!prof.profile) { setPhase("who"); return; }
      setName(prof.profile.username);
      setProfile(prof.profile);
      // The save is the copy the renderer reads; keep it in step with the row.
      if (fieldOf(raw, "char") !== prof.profile.char) {
        const next = JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), char: prof.profile.char });
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
      /* AWAITED FIRST, DELIBERATELY. A reset link signs you in, and `restore`
         is what waits for the client to finish consuming the fragment - so by
         here there is a session for `setPassword` to use, and the screen does
         not have to guess whether the link has landed yet. */
      if (CLOUD && session && RECOVERY) { setPhase("reset"); return; }
      if (CLOUD && !session) { setPhase("account"); return; }
      await decide(session);
    })();

    /* Signing out in another tab, or a refresh token finally expiring, both
       land here - so the game returns to the gate rather than carrying on and
       failing every sync from then on. */
    const off = onAuth((session, evt) => {
      if (!live) return;
      /* The backstop for the URL read above: if the event beats the boot
         effect, this catches it. Either way the destination is the same. */
      if (evt === "PASSWORD_RECOVERY") { setPhase("reset"); return; }
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

  /* LOGGING OUT CLEARS THE BROWSER'S COPY - BUT ONLY ONCE THE ACCOUNT HAS IT.

     Everything outstanding goes up first, because the token is about to stop
     working, and the cache was then dropped WHETHER OR NOT IT HAD. Log out on a
     train, or in the ten seconds after catching something, and `flushNow` came
     back failed and the only copy of that play was deleted a line later - under
     a dialog promising "your game stays on your account".

     So the drop is gated on the upload. When it did not land, the save stays
     with its OWNER: the next login by the same account adopts it and `newer`
     keeps it if it is ahead, and anybody else logging in here is refused it by
     the ownership rule, so leaving it is not handing a stranger a dex.

     And the engine saves FIRST. Its writes are debounced by 400ms, so the last
     thing you did before pressing LOG OUT was not in `pending` yet - it was in
     a timer the unmount was about to cancel. */
  const out = async (why = "") => {
    setGateNote(typeof why === "string" ? why : "");
    setBusy(true);
    /* Then STOPPED, because the game is still running under the spinner and
       anything it wrote after this would land back in a cache being cleared. */
    engineRef.current?.saveNow?.();
    engineRef.current?.destroy?.();
    const sent = await flushNow(push);
    await signOut();
    if (sent.ok) {
      drop(SAVE_KEY);
      drop(OWNER_KEY);
    } else if (!why) {
      setGateNote("Your latest play had not reached your account yet. It is "
        + "kept on this browser and will upload when you log back in here.");
    }
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
          {/* A BALL THAT WOBBLES, the catch's own shake on a loop: something
              moving says "working" where a sentence alone read as "stuck". */}
          <span className="load-ball" aria-hidden="true">
            <img src="items/poke-ball.png" alt="" />
          </span>
          <p>
            Loading your Pokédex
            <span className="load-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
          </p>
        </div>
      </div>
    );
  }

  if (phase === "account") {
    return (
      <Account
        offline={!CLOUD}
        notice={gateNote}
        onSignUp={async (a, p) => afterAuth(await signUp(a, p))}
        onSignIn={async (a, p) => afterAuth(await signIn(a, p))}
        onForgot={requestReset}
      />
    );
  }

  /* A NEW PASSWORD, THEN STRAIGHT INTO THE GAME. The link already signed them
     in, so there is nothing to log in to afterwards - sending them back to the
     login screen to type the password they set four seconds ago would be
     asking a question that has just been answered. */
  if (phase === "reset") {
    return (
      <NewPassword
        busy={busy}
        onSet={async (pw) => {
          setBusy(true);
          const got = await setPassword(pw);
          if (!got.ok) { setBusy(false); return got; }
          /* The fragment is gone by now, but the flag read at module load is
             not - a reload would land back here. Sending the URL back to the
             bare origin is what makes this a one-time screen. */
          try { history.replaceState(null, "", location.pathname); } catch { /* fine */ }
          await decide(await restore());
          setGen((n) => n + 1);
          setBusy(false);
          return got;
        }}
      />
    );
  }

  /* NOTHING READ, NOTHING CACHED. Deliberately not a fresh game: see `settle`. */
  if (phase === "down") {
    return (
      <Trouble
        busy={busy}
        onOut={out}
        onRetry={async () => {
          setBusy(true);
          await decide(await restore());
          setBusy(false);
        }}
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
        onOut={out}
        onPick={async (id, username, birthdate) => {
          setBusy(true);
          setWhoError(null);
          const got = await createProfile(username, id, birthdate);
          /* `gone` is a session that has outlived its own user - a token for a
             deleted account. There is nothing to retry: every attempt dies on
             the same foreign key, so the screen hands back the only thing that
             can work, which is a new sign-in, and says why. */
          if (got.gone) { await out(got.error); return; }
          if (!got.ok) { setWhoError(got.error); setBusy(false); return; }
          setName(username);
          setProfile({ username, char: id, birthdate });
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
        char: profile?.char ?? "red",
        birthdate: profile?.birthdate ?? "",
        /* ONE WRITER FOR THE WHOLE ROW, and the local mirror of it moves in the
           same step. `char` is the one field two things hold: the profile row
           is the record and the save carries a copy for the renderer, so the
           engine is told as well - `setChar` is live, which is why changing
           your trainer redraws the map underneath the dialog instead of
           waiting for a reload. */
        onProfile: async (patch) => {
          const got = await updateProfile(patch);
          if (!got.ok) return got;
          if (patch.username) setName(patch.username);
          if (patch.char) engineRef.current?.setChar?.(patch.char);
          setProfile((was) => ({ ...(was ?? {}), ...patch }));
          return got;
        },
        onPassword: changePassword,
        /* DELETING TAKES THE BROWSER'S COPY WITH IT. The row is gone, so a
           cache of it is a dex belonging to nobody - and leaving it behind
           would let the next sign-up on this machine adopt it. Every copy
           kept under the account's id goes too: "delete my account" is a
           promise about the data, and a backup is the data. */
        onDelete: async () => {
          const uid = read(OWNER_KEY);
          const got = await deleteAccount();
          if (!got.ok) return got;
          engineRef.current?.destroy?.();
          if (uid) {
            for (const k of [BACKUP_KEY, BROKEN_KEY, OTHER_KEY, PARKED_KEY]) drop(scoped(k, uid));
          }
          drop(SAVE_KEY);
          drop(OWNER_KEY);
          setName(null);
          setProfile(null);
          setPhase("account");
          setGen((n) => n + 1);
          return got;
        },
      } : null}
      onEngine={(e) => { engineRef.current = e; }}
    />
  );
}
