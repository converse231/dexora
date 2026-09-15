/* The full-screen encounter.

   The engine decided the outcome the instant the ball left the hand; this only
   plays it back. The beats - arc, absorb, drop, settle, then N slow wobbles -
   are stretched deliberately: the waiting is the tension. The number of wobbles
   is a readout of how close the losing roll came, so three shakes then a
   break-out really was a near miss. Click anywhere to skip to the result. */

import { BALLS } from "../game/items.js";
import { label } from "../game/map.js";
import {
  speciesById, sizeOf, sizeTag, measured, isLegendary,
} from "../game/biomes.js";
import { berryById, artOf } from "../game/items.js";
import Types from "./Types.jsx";
import Gen from "./Gen.jsx";
import Sprite, { spriteUrl } from "./Sprite.jsx";
import Mark from "./Marks.jsx";

  /* THE EVOLUTION CARD IS GONE, and "confusing" was the kind half of it.

     It showed the level of the best one you already OWN, on a screen whose
     nameplate shows the level of the one in front of you - two `Lv` numbers
     about two different individuals, a hand's width apart. That is what got
     reported, and removing it is the right answer for a reason one step
     behind that: **under candy the throw no longer decides it.**

     The card was built for the feed, where catching one more of the species
     genuinely moved the bar - "9/16 caught" was a number the throw was
     about. Candy is fungible, so this Growlithe is two candy toward
     anything and has no special relationship with the Growlithe in your box
     at all. The card did not just read oddly, it implied a link that no
     longer exists.

     Nothing is lost with it. The stone it sometimes named belongs where you
     act on it, which is the Box; the odds per ball are on the rail; and the
     one level that DOES matter here is still on the nameplate, because a
     wild evolved form arrives grown and a Lv 34 Venusaur is thirty candy of
     progress you did not have to pay for. */
/* THE BERRY, ON SCREEN, WHERE THE POKEMON IS.

   A line of text in the box under the scene was the only sign a berry had been
   eaten, and the box is also where every other message goes - so on a fast
   click it did not read as "that worked", and the honest failure is feeding a
   second one because you are not sure the first landed.

   Keyed on `enc.ate`, which the engine bumps on every feed. That is what makes
   a SECOND berry replay it: remounting is the only way to restart a CSS
   animation, and a boolean that is already true cannot say "again". */
function Eating({ enc }) {
  const berry = enc.berry && berryById(enc.berry.id);
  if (!berry || !enc.ate) return null;
  return (
    <img
      key={enc.ate}
      className="berry-toss"
      src={`items/${artOf(berry)}.png`}
      alt=""
      aria-hidden="true"
    />
  );
}

function Size({ enc }) {
  const sp = speciesById(enc.speciesId);
  if (!sp?.height) return null;
  const size = sizeOf(enc);
  const { m, kg } = measured(sp, size);
  const tag = sizeTag(size);
  return (
    <span className={`np-size${tag ? ` np-${tag.toLowerCase()}` : ""}`}>
      {tag && <b>{tag}</b>}
      {m.toFixed(2)} m · {kg.toFixed(1)} kg
    </span>
  );
}

export default function Encounter({ enc, bag, onFlee, onSkip }) {
  const { phase } = enc;

  const animating = ["throw", "suck", "drop", "wait", "shake"].includes(phase);
  /* The ball stays on screen for the break-out now. It used to vanish the
     instant one failed, because there was nothing to show - a static PNG
     cannot burst open. The sheet has seven frames of exactly that, so the
     Pokemon coming back out of a ball that is visibly throwing it out is a
     thing the player can watch rather than infer from a line of text. */
  const showBall = animating || phase === "caught" || phase === "broke";
  const monCaptured = ["suck", "drop", "wait", "shake", "caught"].includes(phase);
  const monGone = phase === "fled" || phase === "ran";
  /* IS THE POKEMON STILL STANDING THERE? Every tier's effect layer was gated
     on `!monGone` alone, which is only true once it has FLED - so from the
     moment the ball opened, a Holo's foil band went on sweeping, an Astral's
     star field went on twinkling and the sparks went on popping over an empty
     patch of grass while the creature itself was inside the ball. The sprite
     shrinks away under `mon-absorb`; the effects are its siblings, so nothing
     took them with it.
     Holo was the one anybody noticed because a moving rainbow is hard to miss,
     but all four did it. */
  const monHere = !monCaptured && !monGone;
  const idle = phase === "idle";
  const outOfBalls = BALLS.every((b) => !(bag?.[b.id] > 0));

  return (
    /* The ground you are standing on, and the light you are standing in.
       `enc.areaId` was already on the encounter for the Dusk Ball, so this
       needed no new state - only for the scene to stop assuming grass.

       It goes on `.battle`, NOT on `.battle-field`: the sky and the ground are
       SIBLINGS of the field, not children of it, and a custom property only
       inherits downwards. Set one tier lower and every area drew the default.

       The url is ABSOLUTE for the reason `spriteUrl` is: a relative one inside
       a custom property resolves against the stylesheet that reads it, not the
       element that sets it, and would 404 into a blank floor. */
    <div
      className={`battle ${phase}`}
      data-area={enc.areaId ?? "meadow"}
      /* ON THE SAME ELEMENT AS `data-area`, because the phase OVERRIDES the
         area's sky and a custom property only inherits downwards - set one
         level lower and `.battle-sky`, which is a sibling of the field rather
         than a child of it, would never see it. That is the exact mistake the
         area colours made once. */
      data-phase={enc.phaseId ?? "day"}
      style={{
        "--ground": `url(${new URL(
          `battle/${enc.areaId ?? "ground"}.png`, document.baseURI).href})`,
      }}
      onClick={animating ? onSkip : undefined}
      data-tip={animating ? "Click to skip" : undefined}
      role="dialog"
      aria-label={`Wild ${enc.name} encounter`}
    >
      <div className="battle-sky" />
      <div className="battle-ground" />

      <div className="battle-field">
        <div className="mon-slot">
          {/* Dust kicked up where it lands when it first appears. */}
          <span className="land-ring" aria-hidden="true" />
          {/* In the slot, so it arcs to where the Pokémon actually is. */}
          <Eating enc={enc} />

          <div className={`mon-shadow${monCaptured ? " hidden" : ""}`} />
          {/* Both of the big tiers put something BEHIND the sprite - an
              Astral's aura, an Origin's seal - so each reads as something the
              creature is standing in rather than a layer over its art. */}
          {enc.astral && monHere && <span className="astral-aura" aria-hidden="true" />}
          {enc.origin && monHere && <span className="origin-seal" aria-hidden="true" />}

          <Sprite
            id={enc.speciesId}
            variant={enc.variant}
            className={`mon${monCaptured ? " captured" : ""}${monGone ? " gone" : ""}`}
            alt={enc.name}
          />

          {/* The tell, not just the artwork. A shiny Pidgey and an ordinary one
              differ by a few pixels of hue, which is not something to notice
              while deciding what to throw. */}
          {enc.shiny && monHere && (
            <span className="shiny-spark" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
          )}
          {/* HOLO: the finish, travelling. The artwork underneath is
              untouched - that is the tier - so the only thing that moves is a
              band of light clipped to the creature's own outline. Masked to
              `--art` for the same reason the Astral sky is: unmasked, a
              rainbow rectangle slides across the grass behind it. */}
          {enc.holo && monHere && (
            <span
              className="holo-foil"
              style={{ "--art": `url(${spriteUrl(enc.speciesId)})` }}
              aria-hidden="true"
            />
          )}

          {/* The sky inside it, clipped to its own outline. */}
          {enc.astral && monHere && (
            <span
              className="astral-sky"
              style={{ "--art": `url(${spriteUrl(enc.speciesId)})` }}
              aria-hidden="true"
            />
          )}
          {enc.astral && monHere && (
            <span className="astral-fx" aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i />
            </span>
          )}

          {/* ORIGIN: restored rather than revealed. The particles fall INWARD
              and the sprite forms out from its own centre, which is why the
              silhouette and the gleam are masked to `--art` - the sprite's own
              outline - instead of being rectangles laid over it. */}
          {enc.origin && monHere && (
            <span
              className="origin-fx"
              style={{ "--art": `url(${spriteUrl(enc.speciesId, "origin")})` }}
              aria-hidden="true"
            >
              <b className="origin-ghost" />
              <b className="origin-gleam" />
              <i /><i /><i /><i /><i /><i /><i /><i />
              <u /><u /><u />
            </span>
          )}

          {showBall && (
            <div className={`ball-slot ${phase}`}>
              {/* A 32-frame strip, stepped by CSS - not an <img> of a ball any
                  more. `items/throw/<id>.png` is 64x2048, one frame per 64px,
                  and each phase steps its own range of it. See
                  tools/build_balls.py for the layout and who drew it.

                  `background-image` in an inline style resolves against the
                  DOCUMENT, unlike a url() inside a custom property, which
                  resolves against the stylesheet that reads it and cost this
                  project the whole Origin reveal for a while. This one is
                  safe, and the render harness watches for the 404 either way. */}
              <div
                /* Remounting per shake restarts the frame run. */
                key={phase === "shake" ? `shake-${enc.shakesDone}` : "ball"}
                className={`ball ${phase}`}
                style={{ backgroundImage: `url(items/throw/${enc.ball}.png)` }}
                aria-hidden="true"
              />
            </div>
          )}

          {phase === "caught" && enc.isNew && (
            <div className="shout" role="status">
              {enc.isNew && (
                <>
                  <b>NEW ENTRY</b>
                  <span>#{String(enc.speciesId).padStart(3, "0")} {enc.name}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="nameplate">
        {/* A FACT ABOUT THE SPECIES, not something you earned, so it sits with
            the name rather than in the row of tier marks - a badge that cannot
            be collected next to four that can would read as a fifth tier. */}
        {isLegendary(enc.speciesId) && (
          <Mark tier="legendary" size={16} className="np-legend" />
        )}
        <span className="np-name">{enc.name}</span>
        <span className="np-lv">Lv {enc.level}</span>
        {/* HOW BIG THIS ONE IS. `species.js` has carried height and weight
            since the first fetch and nothing read them; this is what reads
            them, scaled by this individual's own roll - so two Rattata are
            0.28m and 0.39m rather than both being "a Rattata". The XS/XL tag
            appears on about one in eight, because a tag on every Pokémon is a
            tag nobody reads. */}
        <Size enc={enc} />
        <Types of={enc.types} className="np-types" />
        <Gen id={enc.speciesId} className="np-gen" />
        {/* Already in the dex. The one thing you want to know before deciding
            what to spend on this, and the games say it the same way: the ball
            beside the name means registered. `enc.known` is snapshotted when
            the encounter starts - see startEncounter - so it cannot appear
            mid-catch on a species you are registering right now. */}
        {/* The drawn badge carries the tier now - the word beside it was saying
            the same thing twice, and at a glance the icon is the faster read. */}
        {enc.variant && (
          <span className={`np-tier np-${enc.variant}`}>
            <Mark tier={enc.variant} size={16} />
            {enc.variant.toUpperCase()}
          </span>
        )}
        {/* Just the ball. The word was redundant the moment the icon was there
            - a Poke Ball beside a name has meant "registered" since 1996, and
            the tooltip and the label carry it for anyone it does not. */}
        {enc.known && (
          <span className="np-caught" data-tip="Already in the Pokédex">
            <img src="items/poke-ball.png" alt="Already caught" />
          </span>
        )}
      </div>

      {/* Message and RUN share one row. The balls left this box for the rail
          down the left edge - see BallRail - which is most of why the battle
          scene is taller now: five buttons were taking a quarter of it. */}
      <div className="textbox">
        <p className="tb-msg">{enc.msg || " "}</p>
        {idle ? (
          <button className="runbtn" type="button" onClick={onFlee}>
            <span>RUN</span>
            <kbd>R</kbd>
          </button>
        ) : (
          <div className="tb-hint">{animating ? "CLICK TO SKIP" : " "}</div>
        )}
        {idle && outOfBalls && (
          <p className="tb-warn">Out of balls — sell spares in the BOX tab.</p>
        )}
      </div>
    </div>
  );
}
