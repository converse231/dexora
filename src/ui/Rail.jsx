/* The side panel and its tabs.

   Five tabs in a narrow rail, so each is a glyph over a short label rather than
   a word on its own line.

   A badge means one thing: **there is something in here you can act on**. It
   used to carry plain counts as well - 22 on the Dex, 48 on the Box - and a
   number in a coloured pill at the corner of a tab is the universal shape of an
   unread notification, so they read as alerts that never cleared no matter what
   you did. Those counts are on the panels and in the top bar already. What is
   left only ever appears when pressing the tab would achieve something: a
   Pokémon ready to evolve, a stat point unspent. */

import { useState } from "react";
import Dex from "./Dex.jsx";
import Box from "./Box.jsx";
import Shop from "./Shop.jsx";
import Travel from "./Travel.jsx";
import Trainer from "./Trainer.jsx";
import { evolutionsOf, evolveState } from "../game/items.js";
import { freePoints } from "../game/trainer.js";

/* Drawn icons, not glyphs. They were unicode characters - a grid, a ball, a
   yen sign - picked to be distinct at 15px, which they were, but they were
   also five different typefaces' idea of a shape in a UI that is otherwise
   pixel art all the way down.

   They are MASKS, not pictures: `public/icons/<id>.png` is alpha only and the
   stylesheet fills it with `currentColor`. That is not decoration either - a
   tab is pale with dark text when idle and dark green with pale text when it
   is the one you are on, so a fixed-colour icon is invisible in one of those
   two states. Tinting solves both at once and costs nothing.

   See tools/build_icons.py for how they are normalised. */
const TABS = ["dex", "box", "shop", "map", "you"];

/* How many species could evolve this second. Cheap enough to do every render -
   it is one pass over the box, and only species that actually evolve are
   costed. Doing it here rather than in Box is what lets the tab say so. */
function readyToEvolve(box, bag) {
  if (!box?.length) return 0;
  const seen = new Set();
  let n = 0;
  for (const mon of box) {
    if (seen.has(mon.species)) continue;
    seen.add(mon.species);
    for (const row of evolutionsOf(mon.species)) {
      if (evolveState(box, bag, row).ready) { n++; break; }
    }
  }
  return n;
}

export default function Rail({
  state, caught, level, busy,
  onSelect, onSell, onBuy, onEvolve, onTravel, onSpend, onBike, save,
}) {
  const [tab, setTab] = useState("dex");

  const box = state?.box ?? [];
  const bag = state?.bag ?? {};
  /* Only what is actionable, so a badge always clears once you have dealt with
     it. Everything else a tab could say about itself is already on its panel. */
  const badges = {
    box: readyToEvolve(box, bag) || null,
    you: freePoints(state?.stats, level) || null,
  };

  return (
    <div className="rail">
      <div className="tabs">
        {TABS.map((id) => (
          <button
            key={id}
            className={`tab${tab === id ? " on" : ""}${badges[id] ? " urgent" : ""}`}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            <span
              className="tab-glyph"
              aria-hidden="true"
              /* Absolute, and that is load-bearing: a relative `url()` inside
                 a custom property resolves against the STYLESHEET that reads
                 it, not the element that sets it. `icons/dex.png` would be
                 fetched from /src/ under the dev server and /assets/ in a
                 build, and a mask that 404s masks nothing - the icon would
                 simply be a coloured square. This cost the project the whole
                 Origin reveal once already. */
              style={{ "--icon": `url(${new URL(`icons/${id}.png`, document.baseURI).href})` }}
            />
            <span className="tab-name">{id.toUpperCase()}</span>
            {badges[id] ? (
              <em title={id === "you" ? "points to spend" : "ready to evolve"}>
                {badges[id]}
              </em>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "dex" && (
        <Dex
          dex={state?.dex}
          /* The whole state, not one prop per tier. Those arrays are already
             keyed by tier name on the state object, so three props that had to
             grow to four every time a tier lands were three chances to miss
             one - the Dex reads `tiers[t]` off the list instead. */
          tiers={state}
          caught={caught}
          onSelect={onSelect}
        />
      )}
      {tab === "box" && (
        <Box
          box={box}
          bag={bag}
          dex={state?.dex}
          rev={state?.rev}
          stats={state?.stats}
          busy={busy}
          onSell={onSell}
          onEvolve={onEvolve}
        />
      )}
      {tab === "shop" && (
        <Shop money={state?.money ?? 0} bag={bag} level={level}
              stats={state?.stats} onBuy={onBuy} />
      )}
      {tab === "map" && (
        <Travel areaId={state?.areaId} busy={busy} onTravel={onTravel} />
      )}
      {tab === "you" && (
        <Trainer
          stats={state?.stats}
          level={level}
          bag={bag}
          biking={!!state?.biking}
          onSpend={onSpend}
          onBike={onBike}
          save={save}
        />
      )}
    </div>
  );
}
