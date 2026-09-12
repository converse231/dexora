/* The evolution scene, ported beat for beat from the GBA.

   pret/pokefirered puts the effect in CycleEvolutionMonSprite, and it is not a
   cross-fade or a morph. Both sprites have every entry of their palette
   overwritten with RGB_WHITE, so all the way through you are looking at two
   hard-edged white silhouettes; what alternates them is a scale tug-of-war,
   one growing to full size as the other shrinks to a dot. The arithmetic of
   that lives in game/evocycle.js, which yields 60 swaps over 406 frames -
   24 frames for the first, 2 for the last. Nothing here eases anything: the
   acceleration is the algorithm's.

   The state change already happened in the engine before this mounted. Nothing
   here can fail into a half-evolved Pokémon; it is pure theatre. */

import { useEffect, useRef, useState } from "react";
import { SPECIES } from "../data/species.js";
import { label } from "../game/map.js";
import { evoCycleFrames, SCALE_MAX } from "../game/evocycle.js";
import { spriteUrl } from "./Sprite.jsx";

const FRAME = 1000 / 60; // the GBA's frame, which every number below counts in
const CYCLE = evoCycleFrames();

// Held beats either side of the cycle, in frames.
const INTRO = 96;
const WHITEN = 18;
const FLASH = 10;

const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/* Both halves of the scene wear the tier the hero was carrying, and that takes
   BOTH halves of what a tier is.

   This shipped with only one of them. The scene kept its own copy of `FOLDER`
   and picked the sprite from it - which is right for Shiny and Origin, the two
   tiers with their own artwork, and does nothing at all for **Holo and Astral,
   which have no folder**. Those two are the ordinary sprite plus a CSS filter,
   so an Astral evolution played out entirely in ordinary art: you watched a
   normal Pokemon become a normal Pokemon and then found an Astral in the box.
   Exactly the failure CLAUDE.md records for shiny, reintroduced by a second
   copy of a constant that only got fixed in the first copy.

   `spriteUrl` is the one that knows, so the copy is gone. Still not <Sprite>,
   because the animation holds refs to these two elements. */
export default function Evolve({ evo, onDone }) {
  const art = (id) => spriteUrl(id, evo.variant);
  // The filter half. Empty for a tier that has its own artwork, which is why
  // the missing half was invisible for as long as it was.
  const tier = evo.variant ? `sprite-${evo.variant}` : "";
  const [phase, setPhase] = useState("intro");
  const preRef = useRef(null);
  const postRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const paint = (i) => {
      const [pre, post] = CYCLE[Math.min(i, CYCLE.length - 1)];
      if (preRef.current)
        preRef.current.style.transform = `scale(${pre / SCALE_MAX})`;
      if (postRef.current)
        postRef.current.style.transform = `scale(${post / SCALE_MAX})`;
    };
    paint(0);

    /* Stepped at a fixed 60Hz off the rAF clock rather than once per rendered
       frame - otherwise the whole scene runs at double speed on a 144Hz panel. */
    let raf = 0;
    let at = "intro";
    let frame = 0;
    let cycleAt = 0;
    let last = performance.now();
    let owed = 0;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      owed = Math.min(owed + (now - last), FRAME * 6); // don't catch up a tab switch
      last = now;

      while (owed >= FRAME) {
        owed -= FRAME;
        frame++;

        if (at === "intro") {
          if (frame >= INTRO) { at = "whiten"; frame = 0; setPhase("whiten"); }
        } else if (at === "whiten") {
          if (frame >= WHITEN) { at = "cycle"; frame = 0; setPhase("cycle"); }
        } else if (at === "cycle") {
          paint(cycleAt++);
          if (cycleAt >= CYCLE.length) { at = "flash"; frame = 0; setPhase("flash"); }
        } else if (at === "flash" && frame >= FLASH) {
          setPhase("reveal");
          cancelAnimationFrame(raf);
          return;
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [evo.from, evo.to]);

  /* Only the final beat is dismissible: skipping the flashes would skip the one
     thing this screen exists to show. */
  useEffect(() => {
    if (phase !== "reveal") return;
    const onKey = (e) => {
      if ([" ", "Enter", "Escape"].includes(e.key)) {
        e.preventDefault();
        doneRef.current();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [phase]);

  const before = SPECIES[evo.from - 1];
  const after = SPECIES[evo.to - 1];

  return (
    <div
      className={`evo evo-${phase}`}
      role="dialog"
      aria-live="polite"
      aria-label={`${label(before)} is evolving`}
      onClick={phase === "reveal" ? onDone : undefined}
    >
      <div className="evo-bg" />
      <div className="evo-rings" />

      <div className="evo-stage">
        {/* Both sprites stay mounted: the cycle is a scale swap between two
            silhouettes, so unmounting either would break the tug-of-war. */}
        <img
          ref={preRef}
          className={`evo-mon evo-pre ${tier}`.trim()}
          src={art(evo.from)}
          alt=""
        />
        <img
          ref={postRef}
          className={`evo-mon evo-post ${tier}`.trim()}
          src={art(evo.to)}
          alt=""
        />

        {phase === "reveal" &&
          SPARKS.map((i) => (
            <span key={i} className="evo-spark" style={{ "--i": i }} />
          ))}
      </div>

      <div className="evo-box">
        {phase === "reveal" ? (
          <>
            <p className="evo-msg">
              Congratulations! Your {label(before).toUpperCase()} evolved into{" "}
              <b>{label(after).toUpperCase()}</b>!
            </p>
            <p className="evo-sub">
              <span>Lv {evo.level} · fed {evo.cost} × {label(before)}</span>
              {evo.isNew && <span className="evo-new">NEW ENTRY +¥100</span>}
            </p>
            <button className="evo-go" onClick={onDone} autoFocus>
              CONTINUE <kbd>ENTER</kbd>
            </button>
          </>
        ) : (
          <p className="evo-msg">
            What?
            <br />
            {label(before).toUpperCase()} is evolving!
          </p>
        )}
      </div>

      {/* The one bright frame at the climax, before the colour comes back. */}
      <div className="evo-white" />
    </div>
  );
}
