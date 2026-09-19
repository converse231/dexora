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
import { nameProblem, NAME_MAX, ageProblem, MIN_AGE } from "../game/name.js";
import { TrainerArt } from "./Sprite.jsx";

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

export function Account({ onSignUp, onSignIn, onForgot = null, offline, notice = "" }) {
  const [mode, setMode] = useState("in");        // "in" | "up" | "lost"
  const [addr, setAddr] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  // The reset mail has gone. Separate from `sent`, which is confirmation.
  const [mailed, setMailed] = useState(false);
  const first = useRef(null);

  const up = mode === "up";
  const lost = mode === "lost";

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

  /* ASKING FOR A RESET IS ITS OWN FORM, not the login form with the password
     hidden: the only field it needs is the address, and leaving a disabled
     password box on screen makes it look like the old one is still wanted. */
  if (lost) {
    return (
      <Shell
        step="STEP 1 OF 2"
        title={mailed ? "Check your email" : "Forgotten password"}
        /* "CHECK YOUR SPAM" IS NOT FILLER HERE. Until custom SMTP is
           configured this mail goes out through Supabase's own sender, which
           has no delivery guarantee and lands in spam often enough that the
           honest reading of a silent inbox is "the feature is broken". A new
           domain has no sending reputation either, so the line stays useful
           for a while after that. */
        blurb={mailed
          ? `If ${addr} has an account, a link to set a new password is on its way — check your spam folder if it has not arrived in a few minutes. It works once and expires in an hour.`
          : "We will email you a link to set a new one. Your Pokédex is untouched."}
        foot={
          <button type="button" className="gate-link" onClick={() => { setMode("in"); setMailed(false); }}>
            Back to log in
          </button>
        }
      >
        {!mailed && (
          <form
            className="gate-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              if (!addr.trim()) { setNote("Your email, please."); return; }
              setBusy(true);
              setNote("");
              const got = await onForgot(addr.trim());
              setBusy(false);
              /* SUCCEEDS WHETHER OR NOT THE ACCOUNT EXISTS. Saying "no such
                 email" would turn this box into a way to ask which addresses
                 have accounts here. */
              if (got.ok) setMailed(true); else setNote(got.error);
            }}
          >
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
            <p className="gate-note" aria-live="polite">{note}</p>
            <button className="gate-go" type="submit" disabled={busy}>
              {busy ? "\u2026" : "SEND THE LINK"}
            </button>
          </form>
        )}
      </Shell>
    );
  }

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
        <>
          <button
            type="button"
            className="gate-link"
            onClick={() => setMode(up ? "in" : "up")}
          >
            {up ? "I already have an account" : "I need an account"}
          </button>
          {/* Only where it means something. On the sign-up form there is no
              password to have forgotten. */}
          {!up && onForgot && (
            <button type="button" className="gate-link" onClick={() => { setMode("lost"); setNote(""); }}>
              I have forgotten my password
            </button>
          )}
        </>
      }
    >
      {/* WHY YOU ARE BACK HERE. Being bounced to the login screen with no
          reason is the same screen as having simply arrived at it, and the two
          need different things from the player. */}
      {notice && <p className="gate-warn" role="alert">{notice}</p>}

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

/* NAME AND TRAINER TOGETHER, because they are one question - who are you -
   and splitting them would make a two-field form into two screens. The rules
   themselves live in `game/name.js`, with the other pure rules. */
export function Trainer({ onPick, busy, askName = false, error = null, onOut = null }) {
  const [pick, setPick] = useState(null);
  const [name, setName] = useState("");
  const [born, setBorn] = useState("");
  const [touched, setTouched] = useState(false);

  /* THE NAME FIRST, THEN THE DATE, and only ever one line showing. Two live
     validation messages on a three-field card is a wall of red that stops
     saying which thing to fix. */
  const problem = askName ? (nameProblem(name) ?? ageProblem(born)) : null;
  // Only nag once they have typed something, or once they have tried to submit.
  const shown = error ?? (touched ? problem : null);
  const ready = pick && !problem;

  const go = () => {
    setTouched(true);
    if (!ready) return;
    onPick(pick, name.trim(), born || null);
  };

  return (
    <Shell
      step="STEP 2 OF 2"
      title={askName ? "Who are you?" : "Are you a boy, or a girl?"}
      blurb={askName
        ? "Your name is how other trainers will see you. Nothing else here is."
        : "It only changes who you see walking. You can start either way."}
      /* A WAY OUT OF EVERY SIGNED-IN SCREEN. This one is reached with a session
         already in hand, so anything that goes wrong with it - a name that will
         not save, an account that no longer exists - otherwise leaves somebody
         on a card whose only control is to try the thing that just failed. */
      foot={onOut && (
        <button type="button" className="gate-link" onClick={onOut}>
          Use a different account
        </button>
      )}
    >
      {askName && (
        <label className="gate-field gate-name">
          <span>TRAINER NAME</span>
          <input
            type="text"
            name="username"
            autoComplete="nickname"
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }}
            placeholder="Ash"
            aria-invalid={Boolean(shown)}
          />
        </label>
      )}

      {/* A NATIVE DATE INPUT, not three selects. It is one control, it gets the
          platform's own picker on a phone, and it is the only one that already
          knows how many days February has. `max` is today so the widget itself
          refuses a future date - `ageProblem` still checks, because a typed
          date bypasses the picker entirely. */}
      {askName && (
        <label className="gate-field gate-born">
          <span>DATE OF BIRTH</span>
          <input
            type="date"
            name="bday"
            autoComplete="bday"
            value={born}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBorn(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(shown)}
          />
          <i className="gate-why">
            {MIN_AGE}+ only. We use it for the age check and to wish you a happy
            birthday — it is never shown to other trainers.
          </i>
        </label>
      )}

      <div className="gate-chars" role="radiogroup" aria-label="Trainer">
        {CHARS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={pick === id}
            className={`gate-char${pick === id ? " on" : ""}`}
            onClick={() => setPick(id)}
          >
            <TrainerArt char={id} />
            <i>{label}</i>
          </button>
        ))}
      </div>

      {/* Holds its line either way, so the button does not jump when the first
          thing goes wrong. */}
      <p className="gate-note" aria-live="polite">{shown}</p>

      <button className="gate-go" type="button" disabled={busy} onClick={go}>
        {/* SAYS WHAT IS MISSING. "NAME AND TRAINER" read as a heading,
            not a control. It stays pressable either way - pressing is how
            you find out, and the note above carries the detail. */}
        {busy ? "\u2026"
          : ready ? "START"
            : askName && nameProblem(name) ? "ENTER A NAME"
              : askName && ageProblem(born) ? "ENTER YOUR DATE OF BIRTH"
                : "PICK A TRAINER"}
      </button>

      {/* AGAINST THE BUTTON THAT ACCEPTS THEM. A tick-box in a footer is a
          thing people click without reading; a line under the only button on
          the card is where the agreement actually happens, and it is the moment
          `terms_at` records. */}
      {askName && (
        <p className="gate-terms">
          Starting means you are {MIN_AGE} or over and happy for us to keep your
          Pokédex on your account. It is a fan project, not for sale, and you can
          delete the account and everything in it at any time from Settings.
        </p>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------ the two edges */

/* WE CANNOT REACH YOUR ACCOUNT, and until this existed that case started the
   game instead. `pull` could not tell "no save yet" from "the request failed",
   so a reachable-but-broken backend - a free project asleep, a dropped
   connection at exactly the wrong second - looked like a brand new player, and
   the first upload four seconds later wrote an empty save over a real dex.

   That is fixed in `pull` and in `push`, which refuses to upload anything until
   a read has succeeded. This is the other half: with nothing cached on this
   device there is no game to show, so say so and offer the only useful action
   rather than dealing a fresh save that will confuse somebody who has a
   collection. */
export function Trouble({ onRetry, onOut, busy }) {
  return (
    <Shell
      title="Cannot reach your account"
      blurb="Your Pokédex is safe — this device just could not read it. Nothing has been changed or overwritten."
      foot={onOut && (
        <button type="button" className="gate-link" onClick={onOut}>
          Use a different account
        </button>
      )}
    >
      <p className="gate-warn" role="alert">
        If this keeps happening, the account server may be asleep or your
        connection may be down. Waiting a moment and retrying usually does it.
      </p>
      <button className="gate-go" type="button" disabled={busy} onClick={onRetry}>
        {busy ? "\u2026" : "TRY AGAIN"}
      </button>
    </Shell>
  );
}

/* ARRIVING FROM A RESET LINK. The link signs you in, which is exactly the trap:
   treated as an ordinary session it would drop somebody into the game with the
   password they cannot remember still on the account, and the next device would
   lock them out again. `PASSWORD_RECOVERY` is the event that says otherwise and
   this is the screen it leads to - see Boot. */
export function NewPassword({ onSet, busy }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [note, setNote] = useState("");
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);

  return (
    <Shell
      title="Choose a new password"
      blurb="This is the last step. Your Pokédex, your name and your box are exactly where you left them."
    >
      <form
        className="gate-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          if (pw.length < 6) { setNote("Passwords need at least six characters."); return; }
          /* TYPED TWICE, because there is no old password to fall back on if
             this one has a typo in it - the next thing that happens is being
             logged out with a password nobody knows. */
          if (pw !== again) { setNote("Those two do not match."); return; }
          setNote("");
          const got = await onSet(pw);
          if (!got.ok) setNote(got.error);
        }}
      >
        <label className="gate-field">
          <span>NEW PASSWORD</span>
          <input
            ref={first} type="password" name="password" autoComplete="new-password"
            required minLength={6} value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="six characters or more"
          />
        </label>
        <label className="gate-field">
          <span>AGAIN</span>
          <input
            type="password" name="password2" autoComplete="new-password"
            required value={again} onChange={(e) => setAgain(e.target.value)}
          />
        </label>
        <p className="gate-note" aria-live="polite">{note}</p>
        <button className="gate-go" type="submit" disabled={busy}>
          {busy ? "\u2026" : "SET IT AND PLAY"}
        </button>
      </form>
    </Shell>
  );
}
