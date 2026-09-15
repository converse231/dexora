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

import { BALLS, BERRIES, FIELD, liveMult, forSale } from "../game/items.js";
import { ItemIcon } from "./Sprite.jsx";

export default function BallRail({
  bag, enc, field, onThrow, onUseField, onUseBerry, open, onToggle, pinned,
}) {
  /* THE OTHER HALF OF THE BAG, and it is the same rail because it is the same
     question at two different moments. Out on the map the useful stack is the
     field items - is a repel worth starting before I cross this. In front of a
     Pokemon it is the berries, and the field items are no longer a decision
     you can act on. So the strip swaps rather than growing: one row of things
     you can press right now, never a row of things you cannot.

     Owned-only, like the situational balls above them. Eleven greyed-out tiles
     is not an inventory readout, it is a shop you cannot buy from. */
  const useful = (enc ? BERRIES : FIELD).filter((i) => (bag?.[i.id] ?? 0) > 0);
  const fed = enc?.berry ?? null;
  // Which family slot each field item would land in, so a running one can say
  // so rather than looking like an ordinary unused stack.
  const busy = (item) => field?.[item.family]?.id === item.id;
  /* A ball you have never owned stays hidden - the Master Ball always did, and
     the four situational ones joined it, because seven tiles of zeroes is not a
     bag readout. The hotkey is read off BALLS rather than off what is on
     screen, so hiding one never shifts anybody else's. */
  const carried = BALLS.filter((b) => !b.hideWhenEmpty || (bag?.[b.id] ?? 0) > 0);
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
    <div className="ballwrap">
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
                title: expanded
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
              const key = BALLS.indexOf(ball) + 1;
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
                    title={`${ball.name} — ${odds}` +
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
                    {live && <kbd>{key}</kbd>}
                  </Tag>
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
                const on = enc ? fed === item.id : busy(item);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`br-ball br-item${on ? " on" : ""}`}
                      title={`${item.name} — ${item.blurb}` +
                             `${on ? "  (running)" : ""}`}
                      onClick={() => (enc ? onUseBerry?.(item.id) : onUseField?.(item.id))}
                      /* During an encounter the berries are live only while a
                         throw is available: feeding something mid-flight would
                         change the odds of a roll that has already happened. */
                      disabled={enc ? !onThrow : false}
                    >
                      <ItemIcon item={item} />
                      <em>{owned}</em>
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
