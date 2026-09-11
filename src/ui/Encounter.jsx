/* The full-screen encounter.

   The engine decided the outcome the instant the ball left the hand; this only
   plays it back. The beats - arc, absorb, drop, settle, then N slow wobbles -
   are stretched deliberately: the waiting is the tension. The number of wobbles
   is a readout of how close the losing roll came, so three shakes then a
   break-out really was a near miss. Click anywhere to skip to the result. */

import { BALLS, evolutionsOf, evolveState, itemById } from "../game/items.js";
import { SPECIES } from "../data/species.js";
import { label } from "../game/map.js";
import Types from "./Types.jsx";
import Gen from "./Gen.jsx";
import Sprite, { spriteUrl } from "./Sprite.jsx";
import Mark from "./Marks.jsx";

export default function Encounter({ enc, bag, box, onFlee, onSkip }) {
  const { phase } = enc;

  /* How close this species is to evolving, worked out from the box you are
     already carrying. Standing in front of a Rattata is exactly the moment the
     count matters - it decides whether this one is the one you spend an Ultra
     Ball on - and until now you had to leave the encounter to find out. */
  const progress = (() => {
    const rows = evolutionsOf(enc.speciesId);
    if (!rows.length || !box) return null;
    const states = rows.map((row) => ({ row, ...evolveState(box, bag, row) }));
    const ready = states.find((st) => st.ready);
    if (ready) return { ready: true, ...ready };
    // The nearest branch is the honest one to show against.
    return states.reduce((a, b) => (b.cost < a.cost ? b : a));
  })();

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
      style={{
        "--ground": `url(${new URL(
          `battle/${enc.areaId ?? "ground"}.png`, document.baseURI).href})`,
      }}
      onClick={animating ? onSkip : undefined}
      title={animating ? "Click to skip" : undefined}
      role="dialog"
      aria-label={`Wild ${enc.name} encounter`}
    >
      <div className="battle-sky" />
      <div className="battle-ground" />

      <div className="battle-field">
        <div className="mon-slot">
          {/* Dust kicked up where it lands when it first appears. */}
          <span className="land-ring" aria-hidden="true" />

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
        <span className="np-name">{enc.name}</span>
        <span className="np-lv">Lv {enc.level}</span>
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
          <span className="np-caught" title="Already in the Pokédex">
            <img src="items/poke-ball.png" alt="Already caught" />
          </span>
        )}
      </div>

      {/* Its own card opposite the nameplate, because this is the number the
          throw decides on and a grey line under the name was easy to miss. Only
          while you are choosing: the catch banner claims this corner afterwards. */}
      {idle && progress && (
        <div className={`evocard${progress.ready ? " on" : ""}`}>
          <span className="ec-label">
            {progress.ready ? "READY" : "EVOLUTION"}
          </span>
          <span className="ec-line">
            <strong className="ec-count">
              {progress.have}<span>/{progress.cost}</span>
            </strong>
            <span className="ec-sub">
              {progress.stone && !progress.hasStone
                ? itemById(progress.stone)?.name
                : label(SPECIES[progress.row.to - 1])}
            </span>
          </span>
        </div>
      )}

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
