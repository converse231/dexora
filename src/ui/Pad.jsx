/* The touch controls, and they are a GBA rather than a row of arrows.

   The old pad was four arrows centred under the map: it could walk and it could
   do nothing else, so every other action on a phone meant reaching up into the
   rail with the hand that was holding the device. Reported as wanting A/B and
   the bag down here, which is the right instinct - the reason a GBA puts the
   d-pad and the face buttons in opposite bottom corners is that those are where
   two thumbs already are.

   So: directions LEFT, actions RIGHT, nothing in the middle, and the whole strip
   spans the full width so both clusters sit at the edges of the screen rather
   than in the middle of it. A is low and right of B, which is the GBA's own
   diagonal and not decoration - it is what stops a thumb rolling off one onto
   the other.

   CONTEXT, NOT MORE BUTTONS. A and B mean different things in front of a Pokemon
   than out on the map, exactly as they do on the handheld this is copying, so
   the pad stays four face buttons instead of growing a row per situation. Every
   one maps to a key that already existed - this adds no action the keyboard did
   not have, which is what keeps the two from drifting. */

import { BALLS, bestRod, canRun, holding } from "../game/items.js";

/* Press-and-hold, not click. A direction and the dash button are both held, and
   `onPointerUp`/`Leave`/`Cancel` all have to release or a thumb that slides off
   a button leaves the trainer walking into a wall forever. `preventDefault` on
   down stops the browser turning a long press into a selection or a scroll.

   DELIBERATELY NO `setPointerCapture`. Capturing would keep a thumb that slid
   off the button still steering, which sounds like an improvement and is not:
   while a pointer is captured the spec routes boundary events at the capturing
   element, so whether `pointerleave` fires at all is exactly the thing that
   varies between engines - and the failure mode is a trainer who never stops
   walking. Without it the three handlers are unambiguous and it is what the
   four-arrow pad did correctly for a year. */
function hold(press, release) {
  return {
    onPointerDown: (ev) => { ev.preventDefault(); press(); },
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
  };
}

// A plain tap. Same `preventDefault`, but nothing to let go of.
function tap(run) {
  return { onPointerDown: (ev) => { ev.preventDefault(); run(); } };
}

const DIRS = [
  { dir: "up", glyph: "▲", label: "Walk up" },
  { dir: "left", glyph: "◀", label: "Walk left" },
  { dir: "down", glyph: "▼", label: "Walk down" },
  { dir: "right", glyph: "▶", label: "Walk right" },
];

export default function Pad({ engine, state, enc, level, onBag, bagOpen }) {
  if (!engine) return null;

  const bag = state?.bag;
  /* MID-ANIMATION EVERYTHING IS SKIP, which is what the keyboard already does:
     any key during a throw calls `skip()`. One button that says so beats four
     that quietly do the same thing. */
  const busy = enc && ["throw", "suck", "drop", "wait", "shake"].includes(enc.phase);
  const facing = enc?.phase === "idle";

  // The ball a bare A throws: cheapest you actually hold, as Space does.
  const ball = BALLS.find((b) => (bag?.[b.id] ?? 0) > 0) ?? null;
  const rod = bestRod(bag);
  const runnable = !state?.biking && canRun(level, bag);
  const biked = holding(bag, "bicycle");

  /* A and B, per context. `act` is what the button does, `label` is what it
     says, and `sub` is the small word under it - a face button with a bare
     letter on it is only legible to somebody who already knows the console. */
  const A = busy
    ? { label: "A", sub: "SKIP", act: tap(() => engine.skip()) }
    : facing
      ? {
          label: "A", sub: "THROW", ball: ball?.id,
          act: tap(() => ball && engine.throwBall(ball.id)),
          off: !ball,
        }
      : {
          label: "A", sub: "FISH",
          act: tap(() => engine.fish()),
          off: !rod,
        };

  const B = facing
    ? { label: "B", sub: "RUN", act: tap(() => engine.flee()) }
    : busy
      ? { label: "B", sub: "SKIP", act: tap(() => engine.skip()) }
      : {
          label: "B", sub: "DASH",
          /* HELD, not toggled - this is Shift, and the GBA's B is held too.
             A toggle would leave the trainer sprinting after the thumb left. */
          act: hold(() => engine.setRunning(true), () => engine.setRunning(false)),
          off: !runnable,
        };

  return (
    <div className="pad" role="group" aria-label="Touch controls">
      <div className="pad-dir">
        {DIRS.map(({ dir, glyph, label }) => (
          <button
            key={dir}
            type="button"
            className={`pad-d pad-${dir}`}
            aria-label={label}
            {...hold(() => engine.press(dir), () => engine.release(dir))}
          >
            {glyph}
          </button>
        ))}
        {/* The dish a real d-pad's arms meet in. Not a button - it is there so
            the four arms read as one control instead of four keys. */}
        <span className="pad-hub" aria-hidden="true" />
      </div>

      <div className="pad-act">
        <div className="pad-mini">
          {biked && (
            <button
              type="button"
              className={`pad-s${state?.biking ? " on" : ""}`}
              aria-label={state?.biking ? "Get off the bicycle" : "Ride the bicycle"}
              disabled={!!enc}
              {...tap(() => engine.toggleBike())}
            >
              <img src="items/bicycle.png" alt="" />
              <i>BIKE</i>
            </button>
          )}
          {/* The bag is the rail that is already there, not a second inventory -
              in an encounter it is the berries, on the map the field items, and
              it knows which. One button, and it says which way it will go. */}
          <button
            type="button"
            className={`pad-s${bagOpen ? " on" : ""}`}
            aria-label={bagOpen ? "Close the bag" : "Open the bag"}
            aria-expanded={bagOpen}
            {...tap(onBag)}
          >
            <img src="items/poke-ball.png" alt="" />
            <i>BAG</i>
          </button>
        </div>

        <div className="pad-face">
          <button
            type="button"
            className="pad-b"
            aria-label={`${B.sub} (B)`}
            disabled={B.off}
            {...B.act}
          >
            <b>{B.label}</b>
            <i>{B.sub}</i>
          </button>
          <button
            type="button"
            className="pad-a"
            aria-label={`${A.sub} (A)`}
            disabled={A.off}
            {...A.act}
          >
            {A.ball
              ? <img src={`items/${A.ball}.png`} alt="" />
              : <b>{A.label}</b>}
            <i>{A.sub}</i>
          </button>
        </div>
      </div>
    </div>
  );
}
