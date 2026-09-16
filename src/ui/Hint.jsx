/* A TIP YOU CANNOT WALK PAST.

   These were a bar under the top bar, in the flow, on the theory that a tip
   should never cover the thing it describes. That was wrong about what a tip is
   FOR: one line of guidance that a new player scrolls past is a line nobody
   read, and the whole point of teaching in context is that it lands at the
   moment it makes sense. So it is a dialog - the same shape every mobile app
   uses for exactly this, and the same shape `Confirm` already uses here, so it
   arrives as a thing this app does rather than a new kind of surface.

   It takes the modal lock, which is what makes it unmissable: `App` bails on
   `modalOpen()`, so the arrow keys stop walking the trainer while it is up.
   Without that the dialog would sit there while somebody walked out from under
   it, which is the bar again with more pixels.

   ONE BUTTON, and it is not a choice. There is nothing to cancel - the tip has
   already been banked by the time it is on screen - so a second button would be
   two ways to say the same thing. Enter and Escape both close it, because both
   are what a hand does to a box with one button in it. */

import { useEffect, useRef } from "react";
import { useModalLock } from "./modal.js";

export default function Hint({ text, onClose }) {
  const go = useRef(null);

  useModalLock();

  useEffect(() => {
    // Focus the only control, so Enter works without aiming at anything.
    go.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="hintwrap" onClick={onClose}>
      <div
        className="hintbox"
        role="alertdialog"
        aria-modal="true"
        aria-label="Tip"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="hint-tag">TIP</span>
        <p>{text}</p>
        <button ref={go} type="button" className="hint-go" onClick={onClose}>
          GOT IT
        </button>
      </div>
    </div>
  );
}
