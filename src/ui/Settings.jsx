/* EVERYTHING ABOUT THE PERSON, IN ONE PLACE.

   These controls were on the YOU panel, wedged under the stat rows, and that
   was the wrong room twice over: YOU is about what a trainer has EARNED -
   points, ranks, key items - and the panel is a column in a rail that scrolls,
   so "delete my account forever" sat one flick below "spend a point". A setting
   is not a reward, and an action with no undo does not belong in a scroller you
   flick past. So it is a dialog off the top bar, where the name it edits is
   already shown, and it takes the modal lock - the arrow keys must not walk the
   trainer while somebody is typing a new password into a field.

   ONE GRID, LABEL LEFT AND CONTROL RIGHT. It was a stack of sections - a
   heading, a sentence explaining it, then the control, five times over - which
   is three lines of vertical space before each input and a dialog twice the
   height of a phone. Putting the label beside its control instead of above it
   removes a line per setting, and the labels then form a column you can read
   down, which a stack of headings never was.

   THE PROSE IS WHAT MADE IT TALL, and most of it was explaining things that do
   not need explaining: two trainer sprites are not clearer for a sentence
   underneath them, and neither is a box with your name already in it. Two
   hints survive, and only because they answer a question the control cannot:
   why a game is asking for a date of birth, and why changing a password wants
   the old one. A hint that only repeats its label is noise that costs a line.

   AN ACCORDION WAS TRIED AND REJECTED. It was more compact still - four rows
   and nothing else until you clicked - but a settings dialog you have to
   open twice to see what is in it is not easier to understand, it is smaller.

   ONE WRITER FOR THE PROFILE. Name, character and birthday all go through
   `onProfile(patch)`, which is one `update` on one row; three functions would
   be three copies of the same error mapping and the third is where it stops
   matching. The password is separate because it is not a profile column - it
   lives in `auth.users` and changing it takes the old one first. */

import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import Confirm from "./Confirm.jsx";
import Note from "./Note.jsx";
import { nameProblem, NAME_MAX, ageProblem } from "../game/name.js";

/* The same two, in the same order as the gate's - `build_player` stacks them
   into player.png this way and the tile draws the real walk frame, so what is
   picked here is literally what walks. */
const CHARS = [["red", "Boy"], ["leaf", "Girl"]];

export default function Settings({ account, onClose }) {
  useModalLock();

  const [name, setName] = useState(account.name ?? "");
  const [born, setBorn] = useState(account.birthdate ?? "");
  const [pick, setPick] = useState(account.char ?? "red");

  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");

  /* A NOTE PER ROW, because every row is on screen at once. One shared line
     would report a rename under a birthday that had quietly failed, and it
     would sit wherever the last success happened to leave it. */
  const [said, setSaid] = useState({});
  const [busy, setBusy] = useState("");
  const [killing, setKilling] = useState(false);

  const tell = (row, line) => setSaid((was) => ({ ...was, [row]: line }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  /* THE CHARACTER SAVES ON THE CLICK. It is instantly visible and instantly
     reversible - the trainer on the map changes behind the dialog - so a SAVE
     button beside it would be ceremony around something you undo by clicking
     the other one. */
  const choose = async (id) => {
    if (id === pick || busy) return;
    const was = pick;
    setPick(id);                           // optimistic: the map redraws now
    setBusy("char");
    const got = await account.onProfile({ char: id });
    setBusy("");
    if (!got.ok) { setPick(was); tell("char", got.error); }
  };

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="set-top">
          {/* The trainer you are playing, which is what every row below is
              about - and it updates the moment the picker is used, so the
              choice has somewhere to land. */}
          <span className="set-face">
            <span className={`gate-art ch-${pick}`} aria-hidden="true" />
          </span>
          <h3>{account.name || "Settings"}</h3>
          <span className="set-mail" title={account.email}>{account.email}</span>
          <button className="set-x" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="set-body">
          <form
            className="set-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const problem = nameProblem(name);
              if (problem) { tell("name", problem); return; }
              if (name.trim() === account.name) { tell("name", "That is already your name."); return; }
              setBusy("name"); tell("name", "");
              const got = await account.onProfile({ username: name.trim() });
              setBusy("");
              tell("name", got.ok ? `You are ${name.trim()} now.` : got.error);
            }}
          >
            <label className="set-label" htmlFor="set-name">Name</label>
            <div className="set-ctl">
              <input
                id="set-name" className="set-in" type="text" value={name} maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="set-go" type="submit" disabled={busy === "name"}>
                {busy === "name" ? "…" : "SAVE"}
              </button>
            </div>
            <Note>{said.name}</Note>
          </form>

          <div className="set-row">
            <span className="set-label" id="set-char-l">Trainer</span>
            <div className="set-ctl" role="radiogroup" aria-labelledby="set-char-l">
              {CHARS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={pick === id}
                  aria-label={label}
                  data-tip={label}
                  className={`set-char${pick === id ? " on" : ""}`}
                  onClick={() => choose(id)}
                >
                  <span className={`gate-art ch-${id}`} aria-hidden="true" />
                  <em>{label}</em>
                </button>
              ))}
            </div>
            <Note>{said.char}</Note>
          </div>

          <form
            className="set-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const problem = ageProblem(born);
              if (problem) { tell("born", problem); return; }
              setBusy("born"); tell("born", "");
              const got = await account.onProfile({ birthdate: born });
              setBusy("");
              tell("born", got.ok ? "Saved." : got.error);
            }}
          >
            <label className="set-label" htmlFor="set-born">Birthday</label>
            <div className="set-ctl">
              <input
                id="set-born" className="set-in" type="date" value={born}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBorn(e.target.value)}
              />
              <button className="set-go" type="submit" disabled={busy === "born"}>
                {busy === "born" ? "…" : "SAVE"}
              </button>
            </div>
            {/* One of the two hints that survived: a game asking for a date of
                birth owes an answer to "why", and the control cannot give it. */}
            <p className="set-hint">Age check and birthday wishes. Never shown to other trainers.</p>
            <Note>{said.born}</Note>
          </form>

          <form
            className="set-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pw.length < 6) { tell("pw", "Passwords need at least six characters."); return; }
              if (pw !== again) { tell("pw", "Those two do not match."); return; }
              if (pw === cur) { tell("pw", "That is the password you already have."); return; }
              setBusy("pw"); tell("pw", "");
              const got = await account.onPassword(cur, pw);
              setBusy("");
              if (!got.ok) { tell("pw", got.error); return; }
              setCur(""); setPw(""); setAgain("");
              tell("pw", "Changed. Use the new one next time you log in.");
            }}
          >
            <label className="set-label" htmlFor="set-cur">Password</label>
            <div className="set-ctl set-wrap">
              <input
                id="set-cur" className="set-in" type="password" autoComplete="current-password"
                placeholder="Current" value={cur} onChange={(e) => setCur(e.target.value)}
              />
              <input
                className="set-in" type="password" autoComplete="new-password" minLength={6}
                placeholder="New" value={pw} onChange={(e) => setPw(e.target.value)}
                aria-label="New password"
              />
              <input
                className="set-in" type="password" autoComplete="new-password"
                placeholder="Repeat" value={again} onChange={(e) => setAgain(e.target.value)}
                aria-label="Repeat new password"
              />
              <button className="set-go" type="submit" disabled={busy === "pw"}>
                {busy === "pw" ? "…" : "CHANGE"}
              </button>
            </div>
            {/* The other one. Nothing about three password boxes explains why
                the first is wanted, and "we do not trust your open tab" is the
                kind of reason worth saying out loud. */}
            <p className="set-hint">The current one first, so an open tab on a borrowed laptop is not a stolen account.</p>
            <Note>{said.pw}</Note>
          </form>

          {/* QUIET, AND LAST. It was a full-width red button, which gave the
              rarest action in the dialog the loudest thing in it. The weight
              belongs on the confirmation, which asks for the name to be
              typed. */}
          <div className="set-foot">
            <button className="set-kill" onClick={() => setKilling(true)}>
              Delete my account
            </button>
          </div>
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
