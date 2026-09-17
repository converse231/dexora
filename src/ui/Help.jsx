/* HOW TO PLAY, and it is here because it used to be underneath the map.

   There was a caption below the viewport - "ARROW KEYS OR WASD TO WALK ·
   ANYWHERE CAN SPAWN · RUN SHIFT" - which is three different kinds of sentence
   wearing one style. Two of them are controls, one is a rule about the world,
   and all three were pinned permanently to the middle of the screen to be read
   once and then looked past for the rest of the game. On a phone it was worse:
   it sat between the map and the d-pad, in the gap a thumb reaches for, using
   a line of the shortest screen in the game to explain a keyboard nobody there
   has.

   So the controls moved into the menu, where a thing you consult belongs, and
   the rule about the world moved into `hints.js`, which already says it the
   first time somebody meets a Pokemon in the open. A reference nobody needs
   twice should be reachable, not resident.

   BOTH SETS ARE ALWAYS SHOWN. Gating the touch half on a coarse pointer would
   hide it from exactly the person most likely to be looking - a tablet with a
   keyboard attached reports itself as neither one thing nor the other - and
   the two lists together are shorter than most dialogs in this game. */

import { useEffect } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import { RUN_LEVEL } from "../game/items.js";

/* A key, then what it does. Written as data rather than markup because the two
   lists want identical rows and a second copy of the row is how one of them
   ends up with a different font. */
const KEYS = [
  [["↑", "↓", "←", "→"], "Walk. WASD does the same."],
  [["SHIFT"], `Hold to run. Needs the Running Shoes, at Lv ${RUN_LEVEL}.`],
  [["F"], "Cast a rod at the water's edge."],
  [["SPACE"], "Throw the cheapest ball you are carrying."],
  [["1", "…", "9"], "Throw that ball in particular."],
  [["R"], "Run from a Pokémon. Escape does it too."],
];

const TOUCH = [
  [["✛"], "Walk."],
  [["B"], "Hold to dash."],
  [["A"], "Throw a ball, or cast a rod out on the map."],
  [["A", "HOLD"], "Pick which ball to throw."],
  [["BAG"], "Berries in a battle, repels and honey on the map."],
];

function Rows({ of }) {
  return (
    <dl className="hp-list">
      {of.map(([keys, what]) => (
        <div className="hp-row" key={what}>
          <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
          <dd>{what}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Help({ onClose }) {
  useModalLock();

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div
        className="helpcard"
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="set-top">
          <h3>How to play</h3>
          <span className="set-mail">Walk, meet, throw, evolve</span>
          <button className="set-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="hp-body">
          <h4>Keyboard</h4>
          <Rows of={KEYS} />
          <h4>Touch</h4>
          <Rows of={TOUCH} />
          {/* The one line of the old caption that was not a control. It is also
              the first contextual hint, so somebody who never opens this still
              gets told - this is the copy for somebody who came looking. */}
          <p className="hp-note">
            Every tile you can walk on can spawn a Pokémon — there is no special
            grass. Rarer ones live in the later areas, and a few only appear
            once your trainer level has opened their generation.
          </p>
        </div>
      </div>
    </div>
  );
}
