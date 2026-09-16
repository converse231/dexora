/* THE TWO SCREENS BEFORE THE GAME: an account, then who you are.

   They share a shell because they are the same moment - the game has not
   started yet and the whole window is one card - and because two cards built
   separately drift apart in exactly the way a player notices: a different
   width, a heading half a size off, a button that sits four pixels lower.

   THE CHARACTER QUESTION IS NOT A SETTING. It was a pair of tiles on the YOU
   panel, which is where a setting goes, and it is not one: the handhelds ask it
   once, before you have a save, in the same breath as your name. Asked here it
   is part of becoming a trainer; asked in a menu it is a costume change. So it
   moved, and the panel lost its copy - one question, one place. */

import { useEffect, useRef, useState } from "react";

/* Both trainers, in the order `build_player` stacks them into player.png. The
   tile draws the real down-facing walk frame out of that same strip, so what is
   chosen here is literally what walks. */
const CHARS = [
  ["red", "Boy"],
  ["leaf", "Girl"],
];

function Shell({ step, title, blurb, children, foot }) {
  return (
    <div className="gate">
      <div className="gate-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="gate-brand">
          <span className="title">Dexora</span>
          <span className="gate-step">{step}</span>
        </div>
        <h1 className="gate-title">{title}</h1>
        {blurb && <p className="gate-blurb">{blurb}</p>}
        {children}
        {foot && <div className="gate-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- the account */

export function Account({ onSignUp, onSignIn, offline }) {
  const [mode, setMode] = useState("in");        // "in" | "up"
  const [addr, setAddr] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const first = useRef(null);

  const up = mode === "up";

  // The first field takes focus, and the note clears when the mode flips so a
  // login error cannot sit over the sign-up form explaining nothing.
  useEffect(() => {
    first.current?.focus();
    setNote("");
  }, [mode]);

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    /* CHECKED HERE AS WELL AS BY THE BROWSER. `required` and `type=email` stop
       most of it, but a form submitted by Enter in a browser that disagrees
       about what an address looks like should still get a line rather than a
       round trip. */
    if (!addr.trim() || !pw) {
      setNote("Both fields, please.");
      return;
    }
    if (up && pw.length < 6) {
      setNote("Passwords need at least six characters.");
      return;
    }
    setBusy(true);
    setNote("");
    const got = up ? await onSignUp(addr.trim(), pw) : await onSignIn(addr.trim(), pw);
    setBusy(false);
    if (got.ok && got.pending) {
      // The account exists and is waiting on a click in an inbox. That is not
      // an error and must not read as one.
      setSent(true);
      return;
    }
    if (!got.ok) setNote(got.error);
    // On success the app swaps this screen out; there is nothing to do here.
  };

  if (sent) {
    return (
      <Shell
        step="STEP 1 OF 2"
        title="Check your email"
        blurb={`A confirmation went to ${addr}. Open it, then come back and log in.`}
        foot={
          <button type="button" className="gate-link" onClick={() => { setSent(false); setMode("in"); }}>
            Back to log in
          </button>
        }
      />
    );
  }

  return (
    <Shell
      step="STEP 1 OF 2"
      title={up ? "Make an account" : "Welcome back"}
      blurb={up
        ? "Your Pokédex lives on the account, so it follows you to any device."
        : "Log in and your Pokédex comes with you."}
      foot={
        <button
          type="button"
          className="gate-link"
          onClick={() => setMode(up ? "in" : "up")}
        >
          {up ? "I already have an account" : "I need an account"}
        </button>
      }
    >
      {offline && (
        <p className="gate-warn" role="alert">
          No account server is configured, so this build saves to this browser
          only.
        </p>
      )}

      <form className="gate-form" onSubmit={submit} noValidate={false}>
        <label className="gate-field">
          <span>EMAIL</span>
          <input
            ref={first}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="gate-field">
          <span>PASSWORD</span>
          <input
            type="password"
            name="password"
            /* The right token either way: it tells a password manager whether
               to offer a saved one or to generate a new one. */
            autoComplete={up ? "new-password" : "current-password"}
            required
            minLength={up ? 6 : undefined}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={up ? "six characters or more" : ""}
          />
        </label>

        {/* `aria-live` rather than `role="alert"`: this replaces itself on every
            attempt, and an alert re-announces the whole form each time. */}
        <p className="gate-note" aria-live="polite">{note}</p>

        <button className="gate-go" type="submit" disabled={busy}>
          {busy ? "…" : up ? "CREATE ACCOUNT" : "LOG IN"}
        </button>
      </form>
    </Shell>
  );
}

/* ------------------------------------------------------------- the trainer */

export function Trainer({ onPick, busy }) {
  const [pick, setPick] = useState(null);

  return (
    <Shell
      step="STEP 2 OF 2"
      title="Are you a boy, or a girl?"
      blurb="It only changes who you see walking. You can start either way."
    >
      <div className="gate-chars" role="radiogroup" aria-label="Trainer">
        {CHARS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={pick === id}
            className={`gate-char${pick === id ? " on" : ""}`}
            onClick={() => setPick(id)}
          >
            <span className={`gate-art ch-${id}`} aria-hidden="true" />
            <i>{name}</i>
          </button>
        ))}
      </div>

      <button
        className="gate-go"
        type="button"
        disabled={!pick || busy}
        onClick={() => onPick(pick)}
      >
        {busy ? "…" : pick ? "START" : "PICK ONE"}
      </button>
    </Shell>
  );
}
