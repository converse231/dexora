/* EVERYTHING ABOUT THE PERSON, IN ONE PLACE.

   These controls were on the YOU panel, wedged under the stat rows, and that
   was the wrong room for them twice over: YOU is about what a trainer has
   EARNED - points, ranks, key items - and the panel is a column in a rail that
   scrolls, so "delete my account forever" sat one flick below "spend a point".
   A setting is not a reward, and an irreversible action does not belong in a
   scroller you flick past.

   So it is a dialog off the top bar, where the name it edits is already shown,
   and it takes the modal lock - the arrow keys must not walk the trainer while
   somebody is typing a new password into a field.

   ONE WRITER FOR THE PROFILE. Name, character and birthday all go through
   `onProfile(patch)`, which is one `update` on one row; three functions would
   be three copies of the same error mapping and the third is where it stops
   matching. The password is separate because it is not a profile column - it
   lives in `auth.users` and changing it takes the old one first. */

import { useEffect, useState } from "react";
import { useModalLock } from "./modal.js";
import Confirm from "./Confirm.jsx";
import Note from "./Note.jsx";
import { nameProblem, NAME_MAX, ageProblem } from "../game/name.js";

/* The same two, in the same order as the gate's - `build_player` stacks them
   into player.png this way and the tile draws the real walk frame, so what is
   picked here is literally what walks. */
const CHARS = [["red", "Boy"], ["leaf", "Girl"]];

/* A section that owns its own "saving" and "what happened" state, because
   three forms sharing one note is three forms that can contradict each other -
   rename succeeds, the note says so, and then the birthday fails silently. */
function Field({ title, why, children }) {
  return (
    <section className="set-row">
      <h4>{title}</h4>
      {why && <p className="set-why">{why}</p>}
      {children}
    </section>
  );
}

export default function Settings({ account, onClose }) {
  useModalLock();

  const [name, setName] = useState(account.name ?? "");
  const [born, setBorn] = useState(account.birthdate ?? "");
  const [pick, setPick] = useState(account.char ?? "red");

  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");

  const [nameNote, setNameNote] = useState("");
  const [bornNote, setBornNote] = useState("");
  const [pwNote, setPwNote] = useState("");
  const [busy, setBusy] = useState("");
  const [killing, setKilling] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  /* THE CHARACTER SAVES ON THE CLICK, with no button of its own. It is the one
     setting here that is instantly visible and instantly reversible - the
     trainer on the map changes under the dialog - so a SAVE step would be
     ceremony around something you can simply undo by clicking the other one. */
  const choose = async (id) => {
    if (id === pick || busy) return;
    const was = pick;
    setPick(id);                           // optimistic: the map redraws now
    setBusy("char");
    const got = await account.onProfile({ char: id });
    setBusy("");
    if (!got.ok) setPick(was);             // and back, if the row refused it
  };

  return (
    <div className="sheet" onClick={onClose}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="set-head">
          <h3>Settings</h3>
          <span className="set-mail">{account.email}</span>
          <button className="set-x" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="set-body">
          <Field
            title="Trainer name"
            why="How other trainers see you. Changing it does not touch your Pokédex."
          >
            <form
              className="set-line"
              onSubmit={async (e) => {
                e.preventDefault();
                const problem = nameProblem(name);
                if (problem) { setNameNote(problem); return; }
                if (name.trim() === account.name) { setNameNote("That is already your name."); return; }
                setBusy("name"); setNameNote("");
                const got = await account.onProfile({ username: name.trim() });
                setBusy("");
                setNameNote(got.ok ? `You are ${name.trim()} now.` : got.error);
              }}
            >
              <input
                className="set-in"
                type="text"
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                aria-label="Trainer name"
              />
              <button className="set-go" type="submit" disabled={busy === "name"}>
                {busy === "name" ? "…" : "RENAME"}
              </button>
            </form>
            <Note>{nameNote}</Note>
          </Field>

          <Field title="Your trainer" why="Only changes who you see walking.">
            <div className="set-chars" role="radiogroup" aria-label="Trainer">
              {CHARS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={pick === id}
                  className={`gate-char${pick === id ? " on" : ""}`}
                  onClick={() => choose(id)}
                >
                  <span className={`gate-art ch-${id}`} aria-hidden="true" />
                  <i>{label}</i>
                </button>
              ))}
            </div>
          </Field>

          <Field
            title="Date of birth"
            why="Used for the age check and to wish you a happy birthday. Never shown to other trainers."
          >
            <form
              className="set-line"
              onSubmit={async (e) => {
                e.preventDefault();
                const problem = ageProblem(born);
                if (problem) { setBornNote(problem); return; }
                setBusy("born"); setBornNote("");
                const got = await account.onProfile({ birthdate: born });
                setBusy("");
                setBornNote(got.ok ? "Saved." : got.error);
              }}
            >
              <input
                className="set-in"
                type="date"
                value={born}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBorn(e.target.value)}
                aria-label="Date of birth"
              />
              <button className="set-go" type="submit" disabled={busy === "born"}>
                {busy === "born" ? "…" : "SAVE"}
              </button>
            </form>
            <Note>{bornNote}</Note>
          </Field>

          {/* THE EMAIL IS SHOWN AND NOT EDITABLE, deliberately. Changing it is a
              two-mail confirmation dance - the old address has to approve and
              the new one has to verify - and half-building that is how an
              account ends up pointing at an inbox nobody owns. It is also the
              only handle on the account if the password goes, so it is the last
              thing to make easy to change by accident. */}
          <Field
            title="Password"
            why="Your current one first — so a borrowed laptop with this tab open is not a stolen account."
          >
            <form
              className="set-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (pw.length < 6) { setPwNote("Passwords need at least six characters."); return; }
                if (pw !== again) { setPwNote("Those two do not match."); return; }
                if (pw === cur) { setPwNote("That is the password you already have."); return; }
                setBusy("pw"); setPwNote("");
                const got = await account.onPassword(cur, pw);
                setBusy("");
                if (!got.ok) { setPwNote(got.error); return; }
                setCur(""); setPw(""); setAgain("");
                setPwNote("Changed. Use the new one next time you log in.");
              }}
            >
              <input
                className="set-in" type="password" autoComplete="current-password"
                placeholder="Current password" value={cur}
                onChange={(e) => setCur(e.target.value)} aria-label="Current password"
              />
              <input
                className="set-in" type="password" autoComplete="new-password"
                placeholder="New password" value={pw} minLength={6}
                onChange={(e) => setPw(e.target.value)} aria-label="New password"
              />
              <input
                className="set-in" type="password" autoComplete="new-password"
                placeholder="New password again" value={again}
                onChange={(e) => setAgain(e.target.value)} aria-label="New password again"
              />
              <button className="set-go wide" type="submit" disabled={busy === "pw"}>
                {busy === "pw" ? "…" : "CHANGE PASSWORD"}
              </button>
            </form>
            <Note>{pwNote}</Note>
          </Field>

          <Field
            title="Delete account"
            why="Your Pokédex, your box and your name all go. It cannot be undone, and the name becomes free for someone else."
          >
            <button className="set-go kill" onClick={() => setKilling(true)}>
              DELETE MY ACCOUNT
            </button>
          </Field>
        </div>
      </div>

      {killing && (
        <Confirm
          title="Delete your account?"
          tone="warn"
          lines={[
            ["Trainer", account.name],
            ["Email", account.email],
            ["Pokédex", `${account.caught} caught`],
          ]}
          note="Everything goes: your Pokédex, your box, your name. There is no undo and no copy kept. Export your save from the YOU tab first if you want one."
          typeToConfirm={account.name}
          confirmLabel="DELETE FOREVER"
          onCancel={() => setKilling(false)}
          onConfirm={async () => {
            setKilling(false);
            await account.onDelete();
          }}
        />
      )}
    </div>
  );
}
