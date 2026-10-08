/* THE CS2 STRIP, shared: fillers racing left under a marker, easing onto the
   prize - which is decided and SAVED before anything moves, so the strip only
   dresses a result. The weekly roulette (docs/checkin.md) and a finished
   generation's booster box (DexClaim) both roll on it; a tap, Enter or Space
   lands it at once, and reduced motion lands it at once.

   The caller owns the cells and draws them; this owns only the motion, so the
   two reels can never drift apart. */
import { useEffect, useRef } from "react";

export const CELL = 132;            // a card and its gap, px (matches .rl-cell)
export const CELLS = 56;
export const WIN_AT = 49;           // the prize sits here, near the end of the strip
const SPIN_MS = 7000;
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Reel({ rolling, cells, onDone, children }) {
  const strip = useRef(null);
  const view = useRef(null);
  const timer = useRef(0);
  const target = useRef(0);

  const land = () => {
    clearTimeout(timer.current);
    const s = strip.current;
    if (s) { s.style.transition = "none"; s.style.transform = `translateX(${target.current}px)`; }
    onDone();
  };

  // Once the new strip is in the DOM: from the start, ease to the prize - off
  // its centre by a little, as CS2 does. `cells` is a dep because a fresh
  // strip must start over, not carry the last spin's transform.
  useEffect(() => {
    if (!rolling) return undefined;
    const s = strip.current, v = view.current;
    if (!s || !v) return undefined;
    const jitter = (Math.random() - 0.5) * (CELL * 0.6);
    target.current = Math.round(v.clientWidth / 2 - (WIN_AT * CELL + CELL / 2) + jitter);
    s.style.transition = "none";
    s.style.transform = "translateX(0px)";
    if (still()) { land(); return undefined; }
    void s.offsetWidth;                                 // commit the start before the move
    s.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.12, .72, .14, 1)`;
    s.style.transform = `translateX(${target.current}px)`;
    timer.current = setTimeout(onDone, SPIN_MS + 80);
    return () => clearTimeout(timer.current);
  }, [rolling, cells]);

  // No dep array: `land` closes over the caller's fresh `onDone`. Escape stays
  // the dialog's, which is why only these two keys are taken here.
  useEffect(() => {
    if (!rolling) return undefined;
    const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); land(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  return (
    <div className="rl-view" ref={view} onClick={() => rolling && land()}>
      <ol className="rl-strip" ref={strip}>{children}</ol>
      <i className="rl-marker" aria-hidden="true" />
    </div>
  );
}
