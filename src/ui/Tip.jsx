/* ONE TOOLTIP FOR THE WHOLE APP, driven by an attribute rather than a wrapper.

   `title` is the browser's own and it is the wrong shape here for three
   reasons: it takes about a second to appear, it cannot be styled at all, and
   the thing it is most often explaining is text that has been CLIPPED — which
   is how the shop shipped rows whose description was cut off with the rest of
   it behind a tooltip nobody waits for.

   A `<Tip>` wrapper component was the other option and it loses on the case
   that matters most here: the shop and the rail are inside `overflow: hidden`
   scrollers, so a bubble rendered next to its trigger is clipped by the
   trigger's own container. This one renders ONCE at the app root and is
   `position: fixed`, so nothing can clip it — and converting a call site is
   `title=` → `data-tip=`, a one-word change with no layout consequence at all.

   **Anything that was only labelled by its `title` needs an `aria-label`.**
   A native title is an accessible name for free; `data-tip` is not, so an
   icon-only control that loses one has to be given one back. Controls with
   visible text already have theirs. */

import { useEffect, useState } from "react";

// Long enough not to flash while the pointer crosses a row of tiles, short
// enough to feel like the app answering rather than the browser giving up.
const DELAY = 120;
const EDGE = 8;        // keep this far from the viewport on every side
const HALF = 130;      // half the widest the bubble is allowed to be

export default function Tip() {
  const [tip, setTip] = useState(null);

  useEffect(() => {
    let timer = null;
    const drop = () => {
      clearTimeout(timer);
      timer = null;
      setTip(null);
    };

    const show = (ev) => {
      const el = ev.target?.closest?.("[data-tip]");
      const text = el?.getAttribute("data-tip");
      if (!el || !text) return drop();
      clearTimeout(timer);
      /* Measured when the timer fires, not when the pointer arrived: a rail
         that is still animating open would otherwise be measured mid-slide and
         the bubble would point at where the tile used to be. */
      timer = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTip({
          text,
          x: Math.min(Math.max(r.left + r.width / 2, HALF + EDGE),
                      innerWidth - HALF - EDGE),
          /* Above by default, below when there is no room — the top of the
             screen is where the nameplate and the top bar live, and a bubble
             half off the screen is worse than one on the other side. */
          above: r.top > 64,
          y: r.top > 64 ? r.top - 8 : r.bottom + 8,
        });
      }, DELAY);
    };

    /* `pointerover` rather than `mouseover` so a touch that lands on a tile
       shows the same thing, and `focusin` so the keyboard gets it too — which
       is most of what the native title was quietly doing for us. */
    addEventListener("pointerover", show);
    addEventListener("focusin", show);
    addEventListener("pointerdown", drop);
    addEventListener("focusout", drop);
    // A tip is anchored to a rectangle, so anything that moves one hides it.
    addEventListener("scroll", drop, true);
    addEventListener("blur", drop);
    const esc = (ev) => { if (ev.key === "Escape") drop(); };
    addEventListener("keydown", esc);

    return () => {
      clearTimeout(timer);
      removeEventListener("pointerover", show);
      removeEventListener("focusin", show);
      removeEventListener("pointerdown", drop);
      removeEventListener("focusout", drop);
      removeEventListener("scroll", drop, true);
      removeEventListener("blur", drop);
      removeEventListener("keydown", esc);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      className={`tip${tip.above ? "" : " below"}`}
      style={{ left: `${tip.x}px`, top: `${tip.y}px` }}
      role="tooltip"
      aria-hidden="true"
    >
      {tip.text}
    </div>
  );
}
