/* The banner that drops in when something is worth stopping for.

   Levelling and filling a Pokédex milestone used to be a line of small text
   inside whatever screen happened to be open, which meant the two moments the
   game is actually built around went by unnoticed. This owns them instead, so
   they land the same way wherever you are - mid-encounter, mid-evolution, or
   walking - and the screens underneath no longer have to mention them.

   It sits above every other overlay and dismisses itself; nothing waits on it. */

import { useEffect } from "react";
// Level rewards include key items, not only balls, so this has to look
// across everything the game can name.
import { itemById } from "../game/items.js";

const HOLD = 3200;
const KIND = {
  level: "LEVEL UP",
  dex: "POKÉDEX",
  medal: "MEDAL",
  /* These name the TELL, never the odds. Two of them used to quote a number -
     "ONE IN A THOUSAND" and "ONE IN FOUR THOUSAND" - and both were wrong the
     day the whole ladder was divided by 4/3, silently, in the one place the
     player reads a rare tier's description out loud. A banner that describes
     what the thing IS cannot go stale when a constant moves, and these now
     match the FORMS strip word for word. */
  shiny: "AN ALTERNATE PALETTE",
  origin: "AS IT WAS FIRST DRAWN",
  holo: "PRESSED IN FOIL",
  astral: "MADE OF STARLIGHT",
  steps: "ON FOOT",
};
const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export default function Cheer({ cheer, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, HOLD);
    return () => clearTimeout(t);
    // Keyed on the title so a second cheer restarts the clock rather than
    // inheriting the tail of the first one's.
  }, [cheer.title, onDone]);

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
