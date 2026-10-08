/* WHO IS LOOKING AT THIS? Three answers, one place, because the Dex grid and
   the Box list had two copies of the first one and needed the other two.

   A tier's layers loop for ever by design - that is what a rare form IS here.
   The cost is that two hundred of them tick whether or not anybody can see
   them, and neither `content-visibility: auto` nor windowing stops an
   animation's clock. Measured on a 4x throttled phone, scrolling a 400-entry
   Box: 39fps as it was, 60fps with only the loops switched off. The masks, the
   blend modes and the sprite filters were each tried on their own and none of
   them mattered.

   Nothing visible changes. A loop you can see runs exactly as it did. */
import { useEffect, useRef } from "react";

/* The whole list is off the screen - on a phone the Dex sits below the game. */
export function useOffscreenPause(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") return undefined;
    const io = new IntersectionObserver(([e]) => el.classList.toggle("offscreen", !e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

/* One ROW of a long list is off the screen. `key` re-observes when the rows
   change; the margin is a screenful, so a loop is already running by the time
   its row arrives. */
export function usePauseOffscreenRows(ref, key) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") return undefined;
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) e.target.classList.toggle("offscreen", !e.isIntersecting); },
      { root: el, rootMargin: "100% 0px" },
    );
    for (const row of el.children) io.observe(row);
    return () => io.disconnect();
  }, [ref, key]);
}

/* TRIED AND REVERTED: pausing the loops WHILE THE LIST SCROLLS. Nobody can
   read a 4.8s sweep during a flick, so it looked free - and measured on a
   continuous flick (scrollTop moved every frame for four seconds, which is the
   only harness that actually exercises it) it was a LOSS: the Dex ran 19fps
   with it and 27fps without, the Box 32 against 38. Switching `animation` on a
   `*` subtree restyles every descendant at the start of the gesture, and that
   costs more than the loops it saves. The win above is real because an
   observer fires once per row, not once per scroll. */
