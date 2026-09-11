/* A confirm step for anything that spends money or gives up a Pokémon.

   Selling and buying are the two irreversible things in the game, so both go
   through here. It shows the arithmetic rather than just asking - what leaves,
   what arrives, and what you are left holding - because the useful question is
   never "are you sure" but "what will this cost me". */

import { useEffect } from "react";
import { useModalLock } from "./modal.js";

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
  confirmLabel = "CONFIRM",
  tone = "",
  onConfirm,
  onCancel,
}) {
  // Stops the map walking under the dialog while it is open.
  useModalLock();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

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
                <span>{row.label}</span>
                {row.sub && <em>{row.sub}</em>}
              </li>
            ))}
          </ul>
        )}

        {note && <p className="cf-note">{note}</p>}

        <div className="cf-actions">
          <button className={`cf-yes ${tone}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
          <button className="cf-no" onClick={onCancel}>
            CANCEL
          </button>
        </div>
        <p className="cf-keys">ENTER to confirm · ESC to cancel</p>
      </div>
    </div>
  );
}
