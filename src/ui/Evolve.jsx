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
import { speciesById } from "../game/biomes.js";
import { label } from "../game/map.js";
import { evoCycleFrames, SCALE_MAX } from "../game/evocycle.js";
import { spriteUrl, VariantFx } from "./Sprite.jsx";

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

  /* A STRIP IN AN `<img>` IS EIGHT CREATURES IN A COLUMN.

     `Sprite.jsx` says that in as many words, and this file did it anyway:
     `art()` hands `spriteUrl(id, "showdown")` to a plain `<img>`, and a
     Showdown sprite is a single PNG holding eight frames stacked. So a
     Showdown evolution played out with all eight on screen at once, squashed
     into a 30cqw box by `object-fit: contain` - which reads as one enormous
     wrong-looking Pokemon rather than as the strip it is.

     This is the fault this file already carries a warning about, one turn on:
     a second copy of `FOLDER` once made an Astral evolution play in ordinary
     art. There the duplicate got the PATH wrong; here the path is right and
     the ELEMENT is wrong. **Never re-derive how a tier is drawn** - the only
     thing that knows a Showdown is a background rather than a picture is
     `Sprite.jsx`, so the span is built the way it builds one.

     The refs are untouched by the swap: they set `style.transform` and
     nothing else, which a span takes exactly as an image does. */
  const Mon = ({ innerRef, id, className }) =>
    evo.variant === "showdown" ? (
      <span
        ref={innerRef}
        className={`sprite-showdown ${className}`}
        style={{ "--strip": `url(${art(id)})` }}
        aria-hidden="true"
      />
    ) : (
      <img ref={innerRef} className={className} src={art(id)} alt="" />
    );
  // The filter half. Empty for a tier that has its own artwork, which is why
  // the missing half was invisible for as long as it was.
  const tier = evo.variant ? `sprite-${evo.variant}` : "";
  const [phase, setPhase] = useState("intro");
  const preRef = useRef(null);
  const postRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  /* A ref rather than state: the loop below reads it every frame and a state
     change would restart the effect and the animation with it. */
  const skipRef = useRef(false);

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

      /* SKIP. The catch animation has had one for a long time and this did
         not, and the two sit in the same place in the loop - you are watching
         a thing you already know the result of. Checked before the step rather
         than inside it, so it lands on whatever phase is on screen.

         It jumps to the END of the cycle rather than cancelling: `paint()` has
         to run the last pair or the two sprites hold whatever scale the flash
         caught them at, and the reveal opens on a half-grown Pokemon. */
      if (skipRef.current) {
        paint(CYCLE.length - 1);
        setPhase("reveal");
        cancelAnimationFrame(raf);
        return;
      }

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

  /* One key, two meanings, decided by where you are: during the animation it
     skips to the result, on the result it closes. Same as the encounter, which
     is the point - a player should not have to learn two rules for "I have seen
     enough". */
  useEffect(() => {
    const onKey = (e) => {
      if (![" ", "Enter", "Escape"].includes(e.key)) return;
      e.preventDefault();
      if (phase === "reveal") doneRef.current();
      else skipRef.current = true;
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [phase]);

  const before = speciesById(evo.from);
  const after = speciesById(evo.to);

  return (
    <div
      className={`evo evo-${phase}`}
      role="dialog"
      aria-live="polite"
      aria-label={`${label(before)} is evolving`}
      onClick={phase === "reveal" ? onDone : () => { skipRef.current = true; }}
      data-tip={phase === "reveal" ? undefined : "Click to skip"}
    >
      <div className="evo-bg" />
      <div className="evo-rings" />

      <div className="evo-stage">
        {/* Both sprites stay mounted: the cycle is a scale swap between two
            silhouettes, so unmounting either would break the tug-of-war. */}
        <Mon innerRef={preRef} id={evo.from}
             className={`evo-mon evo-pre ${tier}`.trim()} />
        <Mon innerRef={postRef} id={evo.to}
             className={`evo-mon evo-post ${tier}`.trim()} />

        {/* The tier's own treatment, on the REVEAL only.

            Not during the cycle: the whole point of that phase is a white
            silhouette, and a foil band travelling over a white shape is a
            rainbow with no creature in it. This is the frame the player is
            actually looking at when they find out what they got, and it was
            the frame where the animation stopped. */}
        {phase === "reveal" && (
          <span className="evo-fx" aria-hidden="true">
            <VariantFx id={evo.to} variant={evo.variant} />
          </span>
        )}

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
