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

import { useCallback, useEffect, useState } from "react";
import App from "./App.jsx";
import { Account, Trainer } from "./ui/Gate.jsx";
import {
  CLOUD, restore, signIn, signUp, signOut, onAuth, pull, push,
} from "./net/cloud.js";
import { SAVE_KEY, read, write, newer, onSyncTrouble, flushNow } from "./game/store.js";

/* The save the engine will read, after the account has had its say. Returns
   whether there is one at all, which is what decides the trainer question. */
async function settle() {
  const local = read(SAVE_KEY);
  const remote = await pull();
  const keep = newer(local, remote);
  // Only write when it actually differs, so a normal load does not churn.
  if (keep && keep !== local) write(SAVE_KEY, keep);
  return keep;
}

const charOf = (raw) => {
  if (!raw) return null;
  try { return JSON.parse(raw).char ?? null; } catch { return null; }
};

export default function Boot() {
  // "wait" until we know; then "account", "trainer" or "play".
  const [phase, setPhase] = useState("wait");
  const [busy, setBusy] = useState(false);
  /* Bumped when the save underneath is replaced, so `App` remounts and builds
     a new engine around it rather than trying to adopt one mid-flight. */
  const [gen, setGen] = useState(0);

  const decide = useCallback(async () => {
    const raw = await settle();
    setPhase(charOf(raw) ? "play" : "trainer");
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const session = await restore();
      if (!live) return;
      if (CLOUD && !session) { setPhase("account"); return; }
      await decide();
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

  // A failed upload says the same thing a failed local write does.
  useEffect(() => {
    onSyncTrouble(() => {});
    return () => onSyncTrouble(null);
  }, []);

  const afterAuth = async (got) => {
    if (!got.ok || got.pending) return got;
    setBusy(true);
    await decide();
    setGen((n) => n + 1);
    setBusy(false);
    return got;
  };

  const out = async () => {
    setBusy(true);
    await flushNow(push);          // everything outstanding, before the token goes
    await signOut();
    setBusy(false);
    setPhase("account");
    setGen((n) => n + 1);
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

  return <App key={gen} onLogOut={CLOUD ? out : null} />;
}
