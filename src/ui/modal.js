/* Is any dialog on screen?

   The map keeps its own keyboard listener on window, so while React renders a
   confirm dialog over the game the arrow keys still walked the player - you
   could stroll into a wild encounter with a sell confirmation sitting on top of
   it, and then have two dialogs fighting over the same Enter key.

   A counter rather than a boolean, because a dialog can open while another is
   still unmounting and React does not promise the order. */

import { useEffect, useRef } from "react";

let depth = 0;

export const modalOpen = () => depth > 0;

export function useModalLock() {
  useEffect(() => {
    depth++;
    return () => {
      depth--;
    };
  }, []);
}

/* CLICKING AWAY MEANS A CLICK THAT ALSO STARTED AWAY, and `onClick={onClose}`
   on the scrim does not mean that.

   Measured, not guessed: a real touch tap on the pad's BAG key opens the sheet
   on `pointerdown`, the sheet mounts under a thumb that is still down, and the
   `touchEnd` that follows hit-tests to the scrim that has just appeared there.
   Driven over CDP the sequence reads `view = all` then `view = null, closes =
   1` - the bag opening and shutting on one tap, reported as "it goes down
   immediately". Holding A does the same thing one beat later: the picker opens
   from a timer mid-press and the release dismisses it.

   This file already records the sibling of it - a tip opening mid-stride and
   its scrim swallowing the `pointerup` the d-pad was waiting for - so the
   general shape is known here: A SCRIM THAT APPEARS UNDER A LIVE POINTER
   INHERITS THE REST OF THAT GESTURE.

   The same guard fixes a second bug nobody had reported yet. A drag that
   starts INSIDE the card and ends outside it - swiping the ball strip and
   drifting off, or selecting text in a form and releasing past the edge -
   fires its click on the nearest common ancestor, which is the scrim, and
   closed the dialog. In Settings that threw away whatever had been typed.

   `from` starts false, which is the whole fix for the first case: a gesture
   this scrim did not see begin is not a gesture to close on. */
export function useDismiss(onClose) {
  const from = useRef(false);
  return {
    onPointerDown: (e) => { from.current = e.target === e.currentTarget; },
    onClick: (e) => { if (from.current && e.target === e.currentTarget) onClose(); },
  };
}
