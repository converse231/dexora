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
import { DEX_RANKS } from "../game/medals.js";
import { TEAM_MAX, REMATCH_SHARE, REMATCH_CAP_STEP } from "../game/league.js";
import { PACK_PRICE, PACK_SIZE, PITY, CRAFT_X, MILESTONES, STREAK_PACK } from "../game/cards.js";

/* A key, then what it does. Written as data rather than markup because the two
   lists want identical rows and a second copy of the row is how one of them
   ends up with a different font. */
const KEYS = [
  [["↑", "↓", "←", "→"], "Walk. WASD does the same."],
  [["SHIFT"], `Hold to run. Needs the Running Shoes, at Lv ${RUN_LEVEL}.`],
  [["F"], "Cast a rod at the water's edge."],
  [["C"], `At the water: surf (Lv ${SURF_LEVEL}) or fish - it asks when you could do either.`],
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
  [["ROTOM"], "The Dex, Box, Shop, Map and Events, over the game."],
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
          {/* The Pokédex rank's steps are live, read off DEX_RANKS. */}
          <p className="hp-note">
            Your Pokédex rank grows with the species you have caught:{" "}
            {DEX_RANKS.map((r) => `${r.name}${r.at ? ` (${r.at})` : ""}`).join(", ")}.
            It shows on the Dex tab and on your trainer card.
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
              research is catching one, feeding it, winning a League battle
              with one and raising one to Lv 100; its star spends a spare,
              never the last.
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
              <b>Trade</b> is a tab of its own once you are signed in.
              Find trainers by name, add friends with a friend code, and put
              up to {LIMITS.SHELF} Pokémon up for trade on your card.
            </li>
            <li>
              <b>Offers.</b> Up to {LIMITS.MAX_SIDE} of yours for up to{" "}
              {LIMITS.MAX_SIDE} of theirs; nothing moves until they accept,
              and they can counter. A Pokémon in an offer can&rsquo;t be sold
              or evolved - but it can be in several offers at once, and the
              first accepted takes it.
            </li>
            <li>
              <b>Friends</b> can browse each other&rsquo;s Pokédex and ask for
              any spare, not just what is up for trade. Surprise Trade swaps
              one for one blind, and the Trade Board lists bundles - several
              of yours for one you want - that a friend completes in one tap.
              The Board&rsquo;s search finds any species, even one you have
              never seen.
            </li>
            <li>
              <b>What counts.</b> You always keep the last of each species -
              counted over the whole offer. Up to {LIMITS.TRADES_PER_DAY}{" "}
              trades a day. A traded Pokémon fills your Pokédex and its
              research, but medals, milestones and rare-form marks are for
              ones you caught.
            </li>
            <li>
              <b>Block or report</b> from any trainer&rsquo;s profile. A block
              works both ways: neither of you can find, friend or trade with
              the other.
            </li>
          </ul>
          {/* CARDS (docs/cards.md). Every number is cards.js's live constant. */}
          <h4>Cards</h4>
          <ul className="vr-notes">
            <li>
              <b>Packs</b> are in the Cards tab: {PACK_SIZE} real Pokémon TCG cards for ¥{PACK_PRICE.toLocaleString()},
              about every second pack holding a hit. Every first gym badge gives one too, and its cards carry the
              badge&rsquo;s stamp; a region&rsquo;s Champion gives a whole box, and every {STREAK_PACK}th day of
              a daily-quest streak a pack. A box or bundle is the cheapest way to buy, and Open all opens every
              pack you hold at once.
            </li>
            <li>
              <b>Guaranteed.</b> A Double rare or better comes at least every {PITY.hit.hard} packs, a Special
              illustration rare by {PITY.special.hard}, a Mega Hyper Rare by {PITY.mega.hard} - the Packs tab shows
              how close each is.
            </li>
            <li>
              <b>Dust.</b> Spare copies become Card Dust; a missing card crafts for {CRAFT_X} spares&rsquo; worth -
              except Special illustration rares and Mega Hyper Rares, which come from packs only.
              You always keep one of each, and earned copies stay. Owning a quarter, half, three quarters and all
              of a set pays dust too ({MILESTONES.map(([, d]) => d.toLocaleString()).join(" / ")}).
            </li>
            <li>
              <b>Just for collecting.</b> Cards change nothing in the wild or in battle - no catch, spawn or stat.
            </li>
          </ul>
          {/* THE LEAGUE. The order and the pay are league.js's, which the
              engine enforces; the numbers are its live constants. */}
          <h4>Pokémon League</h4>
          <ul className="vr-notes">
            <li>
              <b>The League</b> is under Battles. Each region&rsquo;s gyms open
              one at a time, in their games&rsquo; order, and inside a gym you
              beat its trainers one by one before its leader will battle you.
              All of a region&rsquo;s badges open its Elite Four, one at a time,
              then its Champion. Beating everyone in a region opens the next.
            </li>
            <li>
              <b>Hard mode.</b> A cleared region opens its hard mode: its leaders,
              Elite Four and Champion again, at Lv 100 on their strongest teams. Each
              try costs an entry fee that a win gives back; each first win gives that
              trainer&rsquo;s signature Pokémon, and a region&rsquo;s whole hard run a
              Master Ball and a Region Charm for rarer finds.
            </li>
            <li>
              <b>Shop and Move Tutor.</b> The League page sells battle items and
              teaches moves: any move a Pokémon&rsquo;s line learns by its level.
            </li>
            <li>
              <b>Your team.</b> Up to {TEAM_MAX} Pokémon in every battle, each at
              or under the battle&rsquo;s level cap; a
              legendary&rsquo;s cap is lower, the stronger it is. A Pokémon in a
              trade offer stays home. Battles give no EXP - raise your team with
              Rare Candy.
            </li>
            <li>
              <b>Prizes.</b> A first win pays a prize, and a leader&rsquo;s first
              win its badge. A leader, Elite Four member or Champion can be
              fought again: a rematch pays up to {Math.round(REMATCH_SHARE * 100)}%
              of the prize, refilling as you walk, and each rematch win raises
              their cap by {REMATCH_CAP_STEP} levels. Losing costs nothing.
            </li>
            <li>
              <b>In battle</b>, keys 1-4 pick a move, S changes Pokémon, B opens
              the Bag, Space or Enter hurries the text, and Escape offers to
              forfeit. Potions, Full Heals and Revives come from the Shop&rsquo;s
              Battle shelf; using one takes your turn.
            </li>
            <li>
              <b>Ranked</b> is the first tab on the League page. Set up to three
              defense teams: everyone is Lv 100 there with the same IVs, one of
              each species (a Mega or a regional form counts as its species),
              and no items. Friends can practice against your teams - blind,
              and nothing is saved.
            </li>
            <li>
              <b>Ranked battles</b>: find a battle and the server picks a trainer
              near your rating and one of their defense teams - or a League
              Elite Four member or Champion rated to match when nobody is - and
              referees every turn. You have 60 seconds a turn before it is
              played for you; leave a battle for ten minutes and it counts as a
              loss. Close the page any time and resume from the Ranked tab.
            </li>
            <li>
              <b>The ladder</b>: your first 5 battles each month place you, then
              you climb from Challenger through Contender, Rival, Vanguard,
              Elite, Master and Champion to Sovereign. A win against a higher
              rating is worth more;
              once you reach a rank you keep it for the season. When your teams are battled you gain or lose a little
              too. Seasons are calendar months: the highest rank you reach
              stays on your card. Up to 20 ranked battles a day.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
