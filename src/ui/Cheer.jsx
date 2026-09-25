/* The banner that drops in when something is worth stopping for.

   Levelling and filling a Pokédex milestone used to be a line of small text
   inside whatever screen happened to be open, which meant the two moments the
   game is actually built around went by unnoticed. This owns them instead, so
   they land the same way wherever you are - mid-encounter, mid-evolution, or
   walking - and the screens underneath no longer have to mention them.

   It sits above every other overlay and dismisses itself; nothing waits on it. */

import { useEffect, useRef } from "react";
// Level rewards include key items, not only balls, so this has to look
// across everything the game can name.
import { itemById } from "../game/items.js";
import { TIER_TELL } from "../game/biomes.js";

const HOLD = 3200;
/* THE TIER ROWS ARE DERIVED, and they were four hand-written ones. Vivid,
   Noir, Glitched and Showdown all fell through to the `?? "POKEDEX"` below -
   so catching the rarest thing in the game raised a banner with the word for
   "you filled a dex slot" over it, and nothing anywhere failed. Exactly the
   drift `TIERS` exists to stop, in a file that was not asking it.

   `TIER_TELL` is the one table now, shared with the Dex sheet's FORMS strip,
   so the banner and the strip cannot describe a tier differently and a ninth
   tier arrives here for free. Upper-cased for the chip rather than stored
   twice in two cases. */
const KIND = {
  level: "LEVEL UP",
  dex: "POKÉDEX",
  medal: "MEDAL",
  steps: "ON FOOT",
  research: "RESEARCH",
  alpha: "ALPHA",
  rift: "SPACE-TIME RIFT",
  ...Object.fromEntries(
    Object.entries(TIER_TELL).map(([t, tell]) => [t, tell.toUpperCase()]),
  ),
};
const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export default function Cheer({ cheer, onDone }) {
  /* KEYED ON THE CHEER ITSELF, NEVER ON `onDone`. App passes a fresh arrow
     every render and every step renders, so a clock keyed on it restarted on
     each step: walking held a banner up forever, an encounter hid it, and
     every flee brought "50,000 STEPS" back with its sparks. The object is
     also what tells two cheers with the same title apart. */
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), HOLD);
    return () => clearTimeout(t);
  }, [cheer]);

  const items = Object.entries(cheer.items ?? {});

  return (
    <div className={`cheer cheer-${cheer.kind}`} role="status" onClick={onDone}>
      <div className="cheer-burst" aria-hidden="true">
        {SPARKS.map((i) => (
          <span key={i} style={{ "--i": i }} />
        ))}
      </div>

      <div className="cheer-card">
        <span className="cheer-kind">{KIND[cheer.kind] ?? "POKÉDEX"}</span>
        <strong className="cheer-title">{cheer.title}</strong>
        {cheer.sub && <span className="cheer-sub">{cheer.sub}</span>}

        {/* Money reads before the balls, because it is one number and they are
            a row of icons - and a medal that pays both should not bury the
            larger half of itself at the end. */}
        {cheer.money > 0 && <span className="cheer-cash">+¥{cheer.money.toLocaleString()}</span>}

        {items.length > 0 && (
          <span className="cheer-items">
            {items.map(([id, n]) => (
              <span key={id}>
                <img src={`items/${id}.png`} alt="" />+{n} {itemById(id)?.name ?? id}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
