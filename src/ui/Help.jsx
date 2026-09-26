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
import { RUN_LEVEL, SURF_LEVEL } from "../game/items.js";
import { ALPHA_CHANCE } from "../game/biomes.js";
import { OUTBREAK_SIZE, OUTBREAK_LIFT, RIFT_STEPS } from "../game/events.js";
import { RESEARCH_MAX, RESEARCH_LIFT, STAR_COST } from "../game/research.js";
import { LIMITS } from "../game/trade.js";

/* A key, then what it does. Written as data rather than markup because the two
   lists want identical rows and a second copy of the row is how one of them
   ends up with a different font. */
const KEYS = [
  [["↑", "↓", "←", "→"], "Walk. WASD does the same."],
  [["SHIFT"], `Hold to run. Needs the Running Shoes, at Lv ${RUN_LEVEL}.`],
  [["F"], "Cast a rod at the water's edge."],
  [["C"], `Ride out onto water or lava. Needs Surf, at Lv ${SURF_LEVEL}.`],
  [["SPACE"], "Throw the cheapest ball you are carrying."],
  [["1", "…", "9"], "Throw that ball in particular."],
  [["R"], "Run from a Pokémon. Escape does it too."],
];

const TOUCH = [
  [["✛"], "Walk."],
  [["B"], "Hold to dash."],
  [["A"], "Throw a ball, cast a rod, or ride out onto lava."],
  [["A", "HOLD"], "Pick which ball to throw."],
  [["BAG"], "Berries in a battle, repels and honey on the map."],
  [["SURF"], "The prompt at a shoreline rides out onto the water."],
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
          {/* THE FOUR THINGS THAT HAPPEN TO THE WORLD, and nowhere else says
              them: a system nobody is told about reads as a bug the first time
              it fires. Every number is the live constant, never typed - two
              strings on the rare-forms page once quoted odds that had moved. */}
          <h4>Out in the world</h4>
          <ul className="vr-notes">
            <li>
              <b>Mass outbreaks.</b> Once a day one map is overrun by one
              species for {OUTBREAK_SIZE} encounters, and its rare forms are{" "}
              {OUTBREAK_LIFT}&times; as likely. The map list marks which.
            </li>
            <li>
              <b>Research.</b> Every species has a level up to {RESEARCH_MAX}:
              catch {STAR_COST} ordinary ones, one at night, a tiny or a huge
              one, one with the first ball and one rare form, feed it a berry
              and evolve it if it can. Evolving into a species counts as owning
              one, and an evolved form skips the night, first-ball and berry
              tasks. Each level pays. Finish every task (an alpha is a bonus) and
              you can star it: give up {STAR_COST} ordinary ones and its rare
              forms are {RESEARCH_LIFT}&times; as likely for good. A legendary's
              research is catching one, feeding it, landing the first ball and
              raising one to Lv 100; its star spends a spare, never the last.
            </li>
            <li>
              <b>Alphas.</b> About one Pokémon in {Math.round(1 / ALPHA_CHANCE)} is
              an alpha: far bigger, harder to catch, and it never runs. It pays
              Rare Candy when caught and can never be sold.
            </li>
            <li>
              <b>Rifts.</b> Stay on one map long enough and it tears. For{" "}
              {RIFT_STEPS} steps rarer Pokémon come out and things turn up
              underfoot. Leaving the map closes it.
            </li>
          </ul>
          {/* TRADING, for somebody who opened the menu to find out how. The
              limits are the live constants; docs/trading.md has the why. */}
          <h4>Trading</h4>
          <ul className="vr-notes">
            <li>
              <b>The Trade Center</b> is in the menu once you are signed in.
              Find trainers by name, add friends with a friend code, and put
              up to {LIMITS.SHELF} Pokémon up for trade on your card.
            </li>
            <li>
              <b>Offers.</b> Ask for anything on another trainer&rsquo;s card
              and offer some of yours; nothing moves until they accept. What
              you offer is held until then - it cannot be sold or evolved.
            </li>
            <li>
              <b>With friends:</b> Surprise Trade swaps one for one without
              either of you knowing what comes back, and the Trade Board lists
              &ldquo;this for that&rdquo;, which a friend can complete in one
              tap. A Pokédex entry&rsquo;s <i>On the Board</i> searches it.
            </li>
            <li>
              <b>What counts.</b> You can trade anything except the last of a
              species, up to {LIMITS.TRADES_PER_DAY} trades a day. A traded
              Pokémon fills your Pokédex and its research, but medals,
              milestones and rare-form marks are for ones you caught.
            </li>
            <li>
              <b>Block or report</b> from any trainer&rsquo;s profile. A block
              works both ways: neither of you can find, friend or trade with
              the other.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
