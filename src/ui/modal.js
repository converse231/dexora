/* Is any dialog on screen?

   The map keeps its own keyboard listener on window, so while React renders a
   confirm dialog over the game the arrow keys still walked the player - you
   could stroll into a wild encounter with a sell confirmation sitting on top of
   it, and then have two dialogs fighting over the same Enter key.

   A counter rather than a boolean, because a dialog can open while another is
   still unmounting and React does not promise the order. */

import { useEffect } from "react";

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
