/* A confirm step for anything that spends money or gives up a Pokémon.

   Selling and buying are the two irreversible things in the game, so both go
   through here. It shows the arithmetic rather than just asking - what leaves,
   what arrives, and what you are left holding - because the useful question is
   never "are you sure" but "what will this cost me". */

import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";

import Sprite from "./Sprite.jsx";

export default function Confirm({
  title,
  lines = [],
  /* An itemised list of what the action will actually touch. `lines` answers
     "how many"; this answers "which ones", and for a sale those are different
     questions - "Sold 8 x Pidgey" is a number you have to trust, where a list
     of levels is one you can check. Optional, because most dialogs here are
     about a single named thing and a manifest of one is noise. */
  manifest = [],
  /* PICKING, and it is what turned this from a receipt into a control.

     A sweep is one button over the whole box, and the manifest was a read-only
     list of what it was about to take - which is fine until the list contains
     something you would never give up. Reported with a screenshot of two Latios
     queued for Rare Candy: the dialog was doing exactly what it said, and what
     it said was the problem.

     A row carries `uids` to become pickable, and `off: true` to arrive
     unticked. Confirm owns which are dropped because the set is thrown away
     when the dialog closes - nothing outside it has a use for a half-made
     decision - and hands the surviving uids to `onConfirm`.

     `recount` is how the arithmetic stays honest while you tick: the totals at
     the top and the number on the button are FUNCTIONS of what is still
     selected, not strings built once. A receipt that does not move while you
     change what you are buying is worse than no receipt. */
  recount = null,
  note,
  /* TYPE IT TO MEAN IT. For the one or two actions where "are you sure" is not
     enough - deleting an account takes the dex, the profile and the save with
     it and there is no undo anywhere. Pass the word that has to be typed; the
     confirm button stays disabled until it matches. Everything else leaves this
     unset and keeps a plain two-button dialog. */
  typeToConfirm = null,
  confirmLabel = "CONFIRM",
  tone = "",
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState("");
  /* Keyed on `row.key`, not on an index: the manifest is rebuilt whenever the
     box changes underneath and an index would move a tick onto a different
     species. Seeded from the rows that ask to arrive off. */
  const pickable = manifest.some((r) => r.uids);
  const [dropped, setDropped] = useState(
    () => new Set(manifest.filter((r) => r.off).map((r) => r.key)));
  const kept = manifest.filter((r) => r.uids && !dropped.has(r.key));
  const keptUids = kept.flatMap((r) => r.uids);
  const live = pickable && recount ? recount(keptUids) : null;
  const rows = live?.lines ?? lines;
  const label = live?.confirmLabel ?? confirmLabel;
  const toggle = (key) => setDropped((was) => {
    const next = new Set(was);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const allOn = () => setDropped(new Set());
  const allOff = () => setDropped(new Set(manifest.map((r) => r.key)));
  /* Case- and space-insensitive: this is a speed bump against a mis-click, not
     a password. Demanding exact case would only teach people to paste it. */
  const armed = (!typeToConfirm
    || typed.trim().toLowerCase() === String(typeToConfirm).trim().toLowerCase())
    /* Untick everything and there is no action left to confirm. The button
       says so rather than running a sweep over nothing and reporting "+0". */
    && (!pickable || keptUids.length > 0);

  // Stops the map walking under the dialog while it is open.
  useModalLock();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        /* GATED THE SAME WAY THE BUTTON IS. Enter went straight through, which
           would have made the typed confirmation decorative: a stray Return
           with the dialog open deletes the account the field was guarding. */
        if (armed) onConfirm(pickable ? keptUids : undefined);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
    //  in the deps, or Enter fires the selection as it was when the
    // dialog opened - which is the one moment it is guaranteed to be wrong.
  }, [onConfirm, onCancel, armed, pickable, keptUids.join(",")]);

  return (
    <div className="sheet" {...useDismiss(onCancel)}>
      <div
        className="confirm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="cf-title">{title}</h3>

        {rows.length > 0 && (
          <dl className="cf-lines">
            {rows.map(([key, value]) => (
              <div className="cf-line" key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* ALL or NONE, because the default is neither. Legendaries arrive
            unticked, so "I did mean everything" would otherwise cost one click
            per legendary in the box - and the opposite, picking one line out of
            forty, is the same walk the other way. */}
        {pickable && (
          <div className="cf-pickall">
            <span>{keptUids.length} of {manifest.reduce((n, r) => n + (r.uids?.length ?? 0), 0)} selected</span>
            <button type="button" onClick={allOn}>ALL</button>
            <button type="button" onClick={allOff}>NONE</button>
          </div>
        )}

        {manifest.length > 0 && (
          <ul className={`cf-manifest${pickable ? " pick" : ""}`}>
            {manifest.map((row) => {
              const on = row.uids && !dropped.has(row.key);
              /* THE ROW SITS INSIDE ITS `li`, because only an `li` may be a
                 child of a `ul` - a `label` there is invalid and the
                 `.cf-manifest li` rules stop matching, which takes the layout
                 with them. The `li` is the list item; `.cf-row` is the thing
                 you click. */
              const Tag = row.uids ? "label" : "div";
              return (
              <li key={row.key}>
              <Tag className="cf-row">
                {/* A REAL CHECKBOX INSIDE A REAL LABEL. The whole row is the
                    hit target that way, with no click handler and no
                    `aria-label` to keep in step - the label's own text is the
                    accessible name, which is exactly the thing being ticked. */}
                {row.uids && (
                  <input
                    type="checkbox"
                    className="cf-tick"
                    checked={on}
                    onChange={() => toggle(row.key)}
                  />
                )}
                {/* The picture is the point of the list. A name is something
                    you read and check; a sprite is something you recognise
                    before you have finished reading, which is what you want
                    from the last screen before an action with no undo.
                    `aria-hidden`, because the label beside it already says
                    which Pokemon this is. */}
                {row.icon && (
                  <Sprite
                    id={row.icon.id}
                    variant={row.icon.variant ?? null}
                    className="cf-pic"
                    alt=""
                  />
                )}
                <span>{row.label}</span>
                {/* WHY IT ARRIVED UNTICKED, said on the row rather than only in
                    the note underneath. A default you cannot see the reason for
                    reads as the dialog having lost your place. */}
                {row.why && <b className="cf-why">{row.why}</b>}
                {row.sub && <em>{row.sub}</em>}
              </Tag>
              </li>
              );
            })}
          </ul>
        )}

        {note && <p className="cf-note">{note}</p>}

        {typeToConfirm && (
          <label className="cf-type">
            <span>Type <b>{typeToConfirm}</b> to confirm</span>
            <input
              type="text"
              value={typed}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={`Type ${typeToConfirm} to confirm`}
            />
          </label>
        )}

        <div className="cf-actions">
          <button
            className={`cf-yes ${tone}`}
            onClick={() => onConfirm(pickable ? keptUids : undefined)}
            disabled={!armed}
            /* Focus the confirm button only when it can actually be used -
               autofocusing a disabled control puts focus nowhere, and when
               there is a word to type that field is where a hand should land. */
            autoFocus={!typeToConfirm}
          >
            {label}
          </button>
          <button className="cf-no" onClick={onCancel}>
            CANCEL
          </button>
        </div>
        <p className="cf-keys">
          {armed ? "ENTER to confirm · ESC to cancel" : "ESC to cancel"}
        </p>
      </div>
    </div>
  );
}
