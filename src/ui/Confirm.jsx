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
