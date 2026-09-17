/* THE BAG, ON A TOUCH SCREEN.

   The rail down the left edge is a good readout on a desktop and a bad one on
   a phone: it is permanently in front of the map, it covers the third of the
   screen a Pokémon stands in, and its tiles are sized for a mouse. On the
   narrowest screen in the game it was spending the most space to show the
   thing you look at least.

   So on a coarse pointer the rail is gone and this is what replaces it — a
   sheet that is not there until you ask for it, from the BAG key on the pad or
   by holding A in front of a Pokémon. Same contents, same rules: it calls
   `carriedBalls` and `usefulItems`, which is the whole reason those live in
   `items.js` rather than being written out twice.

   TWO VIEWS, ONE SHEET. `all` is the bag - balls and whatever is useful right
   now. `balls` is what holding A opens, because that gesture has one question
   and a row of berries under the answer is noise at the moment you are
   choosing a ball. Nothing else differs, so there is one component.

   THE BALLS SCROLL SIDEWAYS AND SNAP. Eleven of them do not fit across a phone
   and stacking them makes the sheet tall enough to cover the Pokémon it is
   about - which is what the rail was doing. A horizontal scroller IS a swipe on
   a touch screen with no gesture code at all, and `scroll-snap` is what stops
   it coming to rest half on a tile. */

import { useEffect, useRef, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import { carriedBalls, usefulItems, liveMult, forSale, berryRoom } from "../game/items.js";
import { ItemIcon } from "./Sprite.jsx";

export default function Bag({
  bag, enc, field, view = "all", onThrow, onUseField, onUseBerry, onClose,
}) {
  /* The same lock every other overlay takes. Without it the arrow keys walk
     the trainer underneath an open sheet - and on a tablet with a keyboard
     that is exactly the person who would hit it. */
  useModalLock();

  const balls = carriedBalls(bag);
  const useful = view === "all" ? usefulItems(bag, enc) : [];
  const fed = enc?.berries ?? null;
  const live = Boolean(onThrow);

  /* The pop, kept from the rail and kept for the same reason: a field item's
     feedback used to be a chip in the far corner and a berry's a line of text,
     so on a fast tap neither read as "that worked" and the honest failure is
     feeding a second one. A COUNTER rather than a flag, because a flag that is
     already true cannot say "again" and re-feeding the same berry is the case
     that needs to. */
  const [pop, setPop] = useState({ id: null, n: 0 });
  const use = (item) => {
    const ok = enc ? onUseBerry?.(item.id) : onUseField?.(item.id);
    // Only when the engine actually spent one. A Razz at its cap is refused,
    // and an animation for something that did not happen is a lie about state.
    if (ok !== false) setPop((p) => ({ id: item.id, n: p.n + 1 }));
  };

  const card = useRef(null);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);

  /* Which family slot a field item would land in, so one already running says
     so rather than looking like an ordinary unused stack. */
  const running = (item) => field?.[item.family]?.id === item.id;

  return (
    <div className="bagsheet" {...useDismiss(onClose)}>
      <div
        className="bag-card"
        role="dialog"
        aria-modal="true"
        aria-label="Bag"
        ref={card}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bag-grip" aria-hidden="true" />

        <div className="bag-head">
          <h3>{view === "balls" ? "Throw which?" : "Bag"}</h3>
          <button className="bag-x" onClick={onClose} aria-label="Close the bag">✕</button>
        </div>

        <ul className="bag-row" aria-label="Balls">
          {balls.map((ball) => {
            const owned = bag?.[ball.id] ?? 0;
            /* What this ball is worth against THIS Pokémon, from the same
               function the engine rolls with - so the number on the tile is
               the number that gets used. No encounter, no condition. */
            const now = liveMult(ball, enc);
            const boosted = !!ball.bonus && now > ball.mult;
            const earned = !forSale(ball);
            const Tag = live ? "button" : "div";
            return (
              <li key={ball.id}>
                <Tag
                  className={`bag-tile${earned ? " master" : ""}${boosted ? " boosted" : ""}`}
                  {...(live
                    ? {
                        type: "button",
                        disabled: !owned,
                        "aria-label": `Throw a ${ball.name}`,
                        /* Throwing closes it. The next thing on screen is the
                           ball in the air and the sheet would be covering it -
                           and there is no second throw to make until that one
                           has landed. */
                        onClick: () => { onThrow(ball.id); onClose(); },
                      }
                    : {})}
                >
                  <img src={`items/${ball.id}.png`} alt="" />
                  <span className="bag-name">{ball.name.replace(" Ball", "")}</span>
                  {/* Only while it is actually earning it: a row of ×1.0s
                      buries the one that says "this one, now". */}
                  {boosted && <b className="bag-boost">×{now.toFixed(1)}</b>}
                  <em>{owned}</em>
                </Tag>
              </li>
            );
          })}
        </ul>

        {/* A second strip, and only when there is something in it. An empty
            rule with nothing under it reads as a thing that failed to load. */}
        {useful.length > 0 && (
          <ul className="bag-row bag-kit" aria-label={enc ? "Berries" : "Field items"}>
            {useful.map((item) => {
              const owned = bag?.[item.id] ?? 0;
              const on = enc ? fed?.[item.effect]?.id === item.id : running(item);
              const deep = on && enc ? (fed[item.effect].stage ?? 1) : 0;
              // The same answer `useBerry` refuses on, so the tile and the
              // engine cannot disagree about a wasted berry.
              const room = enc ? berryRoom(fed, item.id) : true;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`bag-tile${on ? " on" : ""}${!room ? " full" : ""}`}
                    aria-label={item.name}
                    onClick={() => use(item)}
                    /* In an encounter these are live only while a throw is
                       available: feeding something mid-flight would change the
                       odds of a roll that has already happened. */
                    disabled={enc ? (!onThrow || !room) : false}
                  >
                    <ItemIcon item={item} />
                    <span className="bag-name">{item.name}</span>
                    {deep > 1 && <b className="bag-boost">×{deep}</b>}
                    <em>{owned}</em>
                    {pop.id === item.id && (
                      <i className="bag-pop" key={pop.n} aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {view === "all" && useful.length === 0 && (
          <p className="bag-none">
            {enc
              ? "No berries. They are in the SHOP — a Razz makes a catch likelier, a Nanab stops it running."
              : "No field items. Repels, flutes and honey are in the SHOP."}
          </p>
        )}
      </div>
    </div>
  );
}
