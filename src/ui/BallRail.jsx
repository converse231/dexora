/* The ball rail.

   Balls used to be a row of tiles inside the encounter's textbox, which got two
   things wrong at once. The row ate a quarter of the battle screen for five
   buttons, and out on the map you had no idea how many balls you were carrying
   until something was already standing in front of you - which is one moment
   too late, because whether to keep walking is the decision the count belongs
   to.

   So it is one rail floating down the left edge, up the whole time. On the map
   it is a readout; in an encounter the same tiles in the same place become the
   throw buttons, so the thing you were already watching is the thing you press.
   The left edge is chosen because it is the one strip that is empty in both
   states - walking, and mid-battle with the Pokémon centred and the nameplate
   in the top-left corner.

   It collapses to a tab when the map matters more than the count. */

import { useState } from "react";
import {
  BALLS, liveMult, forSale, berryRoom, carriedBalls, usefulItems, ballOrder,
} from "../game/items.js";
import { GUARANTEED } from "../catch.js";
import { ItemIcon } from "./Sprite.jsx";

export default function BallRail({
  bag, enc, field, onThrow, onUseField, onUseBerry, open, onToggle, pinned,
  order = [], onPromote = null,
}) {
  /* THE OTHER HALF OF THE BAG, and it is the same rail because it is the same
     question at two different moments - see `usefulItems`, which the touch
     sheet asks as well so the two cannot answer differently. */
  const useful = usefulItems(bag, enc);
  // One slot per effect, so several can be in play at once.
  const fed = enc?.berries ?? null;
  // Which family slot each field item would land in, so a running one can say
  // so rather than looking like an ordinary unused stack.
  const busy = (item) => field?.[item.family]?.id === item.id;

  /* USING SOMETHING HAS TO LOOK LIKE USING SOMETHING. A field item's only
     feedback was a chip appearing in the far corner of the screen and a berry's
     was a line of text - so on a fast click neither read as "that worked", and
     the honest failure mode is a player feeding a second one because they are
     not sure the first landed. The tile pops.

     A COUNTER, NOT A FLAG: a flag that is already true cannot say "again", and
     re-feeding the same berry is exactly the case that needs to. It keys the
     popped element, so React remounts it and the animation restarts. */
  const [pop, setPop] = useState({ id: null, n: 0 });
  const use = (item) => {
    const ok = enc ? onUseBerry?.(item.id) : onUseField?.(item.id);
    /* Only when the engine actually spent one. A Razz at its cap is refused
       and must not pop - an animation that plays when nothing happened is
       worse than no animation, because it is a lie about state. */
    if (ok !== false) setPop((p) => ({ id: item.id, n: p.n + 1 }));
  };
  /* THE KEYS ARE READ OFF THE ARRANGED LIST, NOT OFF WHAT IS ON SCREEN, so
     hiding a ball you have run out of never shifts anybody else's - which is
     the invariant this was already keeping against `BALLS`. What changed is
     whose list it is: `ballOrder` is the player's, and the same call in
     App.jsx is what the number keys index into, so the chip cannot advertise
     a key that throws something else. */
  const arranged = ballOrder(order);
  const carried = carriedBalls(bag)
    .slice()
    .sort((a, b) => arranged.indexOf(a) - arranged.indexOf(b));
  const total = BALLS.reduce((n, b) => n + (bag?.[b.id] ?? 0), 0);
  const live = Boolean(onThrow);

  /* An encounter pins it open: the balls are the whole decision, and hiding
     them is the one thing nobody wants there. Pinned covers the throw and the
     result too, not just the moment you are choosing - live goes false the
     instant the ball leaves your hand, and collapsing the rail mid-throw would
     be the screen twitching at you. While pinned the tab is a heading, not a
     button, so there is no control that looks like it should work and does
     not. */
  const expanded = open || pinned;
  const Tab = pinned ? "div" : "button";

  return (
    /* AND THE WRAP STOPS WHERE THE TEXTBOX STARTS. `pinned` already means "an
       encounter is up", which is exactly when there is a textbox to clear -
       so the flag is here rather than a second one threaded from App. */
    <div className={`ballwrap${pinned ? " fighting" : ""}`}>
      <div
        className={`ballrail${expanded ? "" : " shut"}${live ? " live" : ""}` +
                   `${pinned ? " pinned" : ""}`}
      >
        <Tab
          className="br-tab"
          {...(pinned
            ? { "aria-hidden": true }
            : {
                type: "button",
                onClick: onToggle,
                "aria-expanded": expanded,
                "aria-label": expanded ? "Hide the ball rail" : "Show the ball rail",
                /* A KEY IN A SPREAD, not an attribute - which is why the
                   sweep that converted every `title=` in the app missed this
                   one. It already carries its own `aria-label`. */
                "data-tip": expanded
                  ? "Hide the balls"
                  : `${total} balls in the bag — click to show`,
              })}
        >
          {/* The total stays in both states. Dropping it when open made the
              tab a lone chevron, and the panel then changed width as well as
              height on every toggle - which is the opposite of smooth. Open, it
              reads as the heading over the breakdown. */}
          <img src="items/poke-ball.png" alt="" />
          <em>{total}</em>
          {!pinned && (
            <span className="br-chev" aria-hidden="true">{expanded ? "‹" : "›"}</span>
          )}
        </Tab>

        {/* Always mounted, so opening and closing can be animated: the height
            is transitioned by CSS, which needs both states in the DOM. Closed,
            it is inert, so the buttons inside are not tabbable. */}
        <div className="br-wrap" {...(expanded ? {} : { inert: "" })}>
          <ul className="br-list">
            {carried.map((ball) => {
              const owned = bag?.[ball.id] ?? 0;
              const key = arranged.indexOf(ball) + 1;
              /* What this ball is worth against THIS Pokemon, from the same
                 function the engine rolls with. Off the map there is no
                 encounter, so it falls back to the base and the hint carries
                 the rest. */
              const now = liveMult(ball, enc);
              const boosted = !!ball.bonus && now > ball.mult;
              const odds =
                ball.mult >= 100 ? "never fails" : `×${now.toFixed(1)} odds`;
              /* `forSale` rather than `hideWhenEmpty`: the purple treasure
                 styling belongs to the one ball money cannot buy, and four
                 more balls now share the hidden-until-owned flag. */
              const earned = !forSale(ball);
              const Tag = live ? "button" : "div";
              return (
                <li key={ball.id}>
                  <Tag
                    className={`br-ball${earned ? " master" : ""}` +
                               `${boosted ? " boosted" : ""}`}
                    data-tip={`${ball.name} — ${odds}` +
                           `${ball.hint ? ` ${ball.hint}` : ""}` +
                           `${live ? `  (key ${key})` : ""}`}
                    {...(live
                      ? { type: "button", disabled: !owned, onClick: () => onThrow(ball.id) }
                      : {})}
                  >
                    <img src={`items/${ball.id}.png`} alt={ball.name} />
                    {/* The multiplier, but only while it is actually earning
                        it. A situational ball whose condition is not met says
                        nothing rather than "×1.0", because the useful signal
                        is "this one, now" and a row of ×1.0s buries it. */}
                    {boosted && <b className="br-boost">×{now.toFixed(1)}</b>}
                    <em>{owned}</em>
                  </Tag>
                  {/* THE KEY CHIP IS THE CONTROL, and it is a SIBLING of the
                      row rather than inside it: the row is already a button
                      that throws, and a button nested in a button is neither
                      valid nor reachable. Pressing it moves this ball to slot
                      1 - which is key 1 AND what a bare throw uses, so one
                      gesture answers "put this on another key" and "make the
                      A button throw this", which were asked as two things and
                      are one. Promoting is the only move offered because it
                      is enough: everything else keeps its relative order, so
                      repeated presses reach any arrangement. */}
                  {/* NO CHIP ON A BALL THAT CANNOT FAIL. `defaultBall`
                      refuses to hand one to a bare throw, so a chip offering
                      it slot 1 would promise something slot 1 does not do.
                      It still throws on its own key. */}
                  {live && (onPromote && ball.mult < GUARANTEED ? (
                    <button
                      type="button"
                      className={`br-key${key === 1 ? " first" : ""}`}
                      aria-label={key === 1
                        ? `${ball.name} is already on key 1`
                        : `Move ${ball.name} to key 1`}
                      data-tip={key === 1
                        ? "Key 1 — what A and Space throw"
                        : `Put ${ball.name} on key 1`}
                      onClick={() => onPromote(ball.id)}
                    >
                      {key}
                    </button>
                  ) : <kbd>{key}</kbd>)}
                </li>
              );
            })}
          </ul>

          {/* A second strip under the balls, and only when there is something
              in it. An empty rule with nothing beneath it reads as a thing
              that failed to load. */}
          {useful.length > 0 && (
            <ul className="br-list br-kit">
              {useful.map((item) => {
                const owned = bag?.[item.id] ?? 0;
                const on = enc ? fed?.[item.effect]?.id === item.id : busy(item);
                // How many of this berry are already in it, and whether another
                // would do anything - the tile greys on the same answer
                // `useBerry` refuses on, so the two cannot disagree.
                const deep = on && enc ? (fed[item.effect].stage ?? 1) : 0;
                const room = enc ? berryRoom(fed, item.id) : true;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`br-ball br-item${on ? " on" : ""}`
                        + `${!room ? " full" : ""}`}
                      /* Its icon is decorative (alt=""), so without this the
                         button has no accessible name at all - `data-tip` is a
                         visual, where the native `title` it replaced was also
                         a label. Anything icon-only needs one back. */
                      aria-label={item.name}
                      data-tip={`${item.name} — ${item.blurb}` +
                             `${deep ? `  (${deep} eaten)` : on ? "  (running)" : ""}` +
                             `${!room ? " — it will not eat another" : ""}`}
                      onClick={() => use(item)}
                      /* During an encounter the berries are live only while a
                         throw is available: feeding something mid-flight would
                         change the odds of a roll that has already happened. */
                      disabled={enc ? (!onThrow || !room) : false}
                    >
                      <ItemIcon item={item} />
                      {/* How deep it is, not how many you hold - that is the
                          number below. A single one says nothing extra. */}
                      {deep > 1 && <b className="br-boost">×{deep}</b>}
                      <em>{owned}</em>
                      {pop.id === item.id && (
                        <i className="br-pop" key={pop.n} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
