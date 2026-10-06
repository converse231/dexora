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

import { useEffect, useMemo, useState } from "react";
import Dex from "./Dex.jsx";
import Box from "./Box.jsx";
import Shop from "./Shop.jsx";
import Travel from "./Travel.jsx";
import Icon from "./Icon.jsx";
import { evoNext, variantOf } from "../game/items.js";
import { speciesById } from "../game/biomes.js";
import { label } from "../game/map.js";

/* The apps wear the Rotom line icons (Icon.jsx), which take `currentColor`:
   pale on the app you are in, faint on the rest, from one drawing. */
const TABS = ["dex", "box", "shop", "map", "events"];

/* How many species could evolve this second. NOT cheap enough to do every
   render, which is what the comment here used to claim: it is a pass over the
   whole box to find each row's best, then an `evoNext` graph walk per distinct
   (species, variant), and `App` re-renders on every STEP. The same wrong claim
   the Box's own grouping memo was making, in the file one level up. Memoised
   at the call site. Doing it here rather than in Box is what lets the tab say
   so. */
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

/* THE ROTOM PANEL (2026-10-01): five apps - the Dex, Box, Shop, Map and the
   Events board, which moved in from the ☰ menu; the old YOU tab moved out to
   the You page. App owns which app is up (`tab`), so the HUD's event cards and
   the Dex's "See in Box" can open the right one. On a phone the panel is a
   sheet over the game (`open`, the pad's ROTOM key); on a desktop it is
   docked beside the map and `open` means nothing. */
export default function Rail({
  tab = "dex", onTab, open = false, onClose, events = null,
  state, caught, level, busy,
  onSelect, onRank, onSell, onConvert, onLevelUp, onBuy, onBuyCandy, onEvolve, onParty,
  onTravel, jumpTo, onJumped, outbreakArea,
}) {
  const setTab = onTab;
  /* A VISITED TAB STAYS MOUNTED, HIDDEN. Every switch used to tear the panel
     down and build it again - the Dex's 1,300 tiles each time, the Box's rows
     each time - which on a phone was seconds per tap. Now the first visit
     builds it and later ones only show it; it also keeps each panel's filters
     and scroll where you left them. Hidden is `display: none`: no layout, no
     paint, no running animations. */
  const [seen, setSeen] = useState(() => new Set(["dex"]));
  useEffect(() => {
    setSeen((s) => (s.has(tab) ? s : new Set(s).add(tab)));
  }, [tab]);
  const pane = (id, el) => (seen.has(id) || tab === id
    ? <div key={id} className="rail-pane" hidden={tab !== id}>{el}</div> : null);

  /* Arriving from the Dex's "See in Box". The tab lives here, so the switch
     does too; the Box takes the NAME as a search seed and clears the id. */
  useEffect(() => { if (jumpTo) setTab("box"); }, [jumpTo, setTab]);
  const seed = jumpTo ? label(speciesById(jumpTo)) : "";

  /* THE QUEST MOVED TO THE TOP BAR and took its badge with it. It used to live
     on this tab behind a `!`, which is a fine place to read it and a bad place
     to find it - reported as "I am not sure where to see the missions". Two
     places to claim from would have been two sources for one number. */

  const box = state?.box ?? [];
  const bag = state?.bag ?? {};
  /* Only what is actionable, so a badge always clears once you have dealt with
     it. Everything else a tab could say about itself is already on its panel. */
  /* `colRev`, not `rev`: the collection is the only thing that can change
     either of these, and `rev` bumps on every step. See engine.js. */
  const badges = useMemo(() => ({
    box: readyToEvolve(box, bag) || null,
  }), [box, bag, state?.colRev]);

  return (
    <>
    {open && <div className="rail-scrim" onClick={onClose} aria-hidden="true" />}
    <div className={`rail${open ? " open" : ""}`} aria-label="Rotom">
      <span className="rail-grip" aria-hidden="true" />
      <button type="button" className="rail-x" onClick={onClose} aria-label="Close Rotom">✕</button>
      <div className="tabs">
        {TABS.map((id) => (
          <button
            key={id}
            className={`tab${tab === id ? " on" : ""}${badges[id] ? " urgent" : ""}`}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            <span className="tab-glyph" aria-hidden="true"><Icon n={id} size={22} /></span>
            <span className="tab-name">{id[0].toUpperCase() + id.slice(1)}</span>
            {badges[id] ? (
              <em data-tip="ready to evolve">
                {badges[id]}
              </em>
            ) : null}
          </button>
        ))}
      </div>

      {pane("dex", (
        <Dex
          dex={state?.dex}
          /* The whole state, not one prop per tier. Those arrays are already
             keyed by tier name on the state object, so three props that had to
             grow to four every time a tier lands were three chances to miss
             one - the Dex reads `tiers[t]` off the list instead. */
          tiers={state}
          caught={caught}
          level={level}
          /* Not `rev`: that bumps every step and this panel is 1,215 cells.
             See `colRev` in engine.js. */
          colRev={state?.colRev}
          onSelect={onSelect}
          onRank={onRank}
        />
      ))}
      {pane("box", (
        <Box
          box={box}
          bag={bag}
          dex={state?.dex}
          colRev={state?.colRev}
          defense={state?.defense}
          stats={state?.stats}
          busy={busy}
          findSeed={seed}
          onSeedUsed={onJumped}
          onSell={onSell}
          onConvert={onConvert}
          onLevelUp={onLevelUp}
          onEvolve={onEvolve}
          party={state?.party}
          onParty={onParty}
          candy={state?.candy ?? 0}
        />
      ))}
      {pane("shop", (
        <Shop money={state?.money ?? 0} bag={bag} level={level}
              stats={state?.stats} onBuy={onBuy}
              candy={state?.candy ?? 0} onBuyCandy={onBuyCandy} />
      ))}
      {pane("map", (
        <Travel areaId={state?.areaId} level={level} busy={busy} onTravel={onTravel}
          outbreakArea={outbreakArea} />
      ))}
      {pane("events", events)}
    </div>
    </>
  );
}
