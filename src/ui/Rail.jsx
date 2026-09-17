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

import { useEffect, useState } from "react";
import Dex from "./Dex.jsx";
import Box from "./Box.jsx";
import Shop from "./Shop.jsx";
import Travel from "./Travel.jsx";
import Trainer from "./Trainer.jsx";
import { evoNext, variantOf } from "../game/items.js";
import { speciesById } from "../game/biomes.js";
import { label } from "../game/map.js";
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
/* The badge on the BOX tab: how many rows could evolve right now.

   Counted per species AND variant, and over each row's BEST, because that is
   what the Box itself does - a badge that says 3 over a panel showing 2 is
   worse than no badge. `evoNext` picks the nearest branch, so an Eevee with one
   stone counts once rather than three times. */
function readyToEvolve(box, bag) {
  if (!box?.length) return 0;
  const best = new Map();
  for (const mon of box) {
    const key = `${mon.species}:${variantOf(mon) ?? ""}`;
    const held = best.get(key);
    if (!held || mon.level > held.level) best.set(key, mon);
  }
  let n = 0;
  for (const mon of best.values()) if (evoNext(mon, bag)?.ready) n++;
  return n;
}

export default function Rail({
  state, caught, level, busy,
  onSelect, onSell, onConvert, onLevelUp, onBuy, onBuyCandy, onEvolve,
  onTravel, onSpend, save, account, jumpTo, onJumped,
}) {
  const [tab, setTab] = useState("dex");

  /* Arriving from the Dex's "See in Box". The tab lives here, so the switch
     does too; the Box takes the NAME as a search seed and clears the id. */
  useEffect(() => { if (jumpTo) setTab("box"); }, [jumpTo]);
  const seed = jumpTo ? label(speciesById(jumpTo)) : "";

  /* THE QUEST MOVED TO THE TOP BAR and took its badge with it. It used to live
     on this tab behind a `!`, which is a fine place to read it and a bad place
     to find it - reported as "I am not sure where to see the missions". Two
     places to claim from would have been two sources for one number. */

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
              <em data-tip={id === "you" ? "points to spend" : "ready to evolve"}>
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
          level={level}
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
          findSeed={seed}
          onSeedUsed={onJumped}
          onSell={onSell}
          onConvert={onConvert}
          onLevelUp={onLevelUp}
          onEvolve={onEvolve}
          candy={state?.candy ?? 0}
        />
      )}
      {tab === "shop" && (
        <Shop money={state?.money ?? 0} bag={bag} level={level}
              stats={state?.stats} onBuy={onBuy}
              candy={state?.candy ?? 0} onBuyCandy={onBuyCandy} />
      )}
      {tab === "map" && (
        <Travel areaId={state?.areaId} level={level} busy={busy} onTravel={onTravel} />
      )}
      {tab === "you" && (
        <>
          <Trainer
            stats={state?.stats}
            level={level}
            bag={bag}
            onSpend={onSpend}
            save={save}
            account={account}
          />
        </>
      )}
    </div>
  );
}
