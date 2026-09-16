/* A confirm step for anything that spends money or gives up a Pokémon.

   Selling and buying are the two irreversible things in the game, so both go
   through here. It shows the arithmetic rather than just asking - what leaves,
   what arrives, and what you are left holding - because the useful question is
   never "are you sure" but "what will this cost me". */

import { useEffect, useState } from "react";
import { useModalLock } from "./modal.js";

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
  /* Case- and space-insensitive: this is a speed bump against a mis-click, not
     a password. Demanding exact case would only teach people to paste it. */
  const armed = !typeToConfirm
    || typed.trim().toLowerCase() === String(typeToConfirm).trim().toLowerCase();

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
        if (armed) onConfirm();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel, armed]);

  return (
    <div className="sheet" onClick={onCancel}>
      <div
        className="confirm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="cf-title">{title}</h3>

        {lines.length > 0 && (
          <dl className="cf-lines">
            {lines.map(([key, value]) => (
              <div className="cf-line" key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {manifest.length > 0 && (
          <ul className="cf-manifest">
            {manifest.map((row) => (
              <li key={row.key}>
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
                {row.sub && <em>{row.sub}</em>}
              </li>
            ))}
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
            onClick={onConfirm}
            disabled={!armed}
            /* Focus the confirm button only when it can actually be used -
               autofocusing a disabled control puts focus nowhere, and when
               there is a word to type that field is where a hand should land. */
            autoFocus={!typeToConfirm}
          >
            {confirmLabel}
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
