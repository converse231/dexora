/* A FINISHED GENERATION'S REWARD, CLAIMED (asked for, 2026-10-03): the map's
   claim button opens this, the press decides and SAVES everything first
   (`engine.claimDex`, like a card pack), and then the set that was rolled
   comes in on the weekly roulette's own strip - the box was a choice once; a
   roll is the suspense. One reel in the game, `Reel.jsx`: this was a logo
   flicking in place, which read as a loading spinner next to it. */
import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import Reel, { CELLS, WIN_AT } from "./Reel.jsx";
import { CARD_SETS } from "../data/cards/index.js";
import { WRAPPERS } from "../data/cards/art.js";
import { REGION_NAME } from "../game/biomes.js";
import { DEX_CHARM } from "../game/medals.js";
import { packUrl, logoUrl } from "./cards/load.js";

// Every prize here is a box of a set, so every cell is one - the roulette's
// pack art, falling back to the logo for a set with no wrapper drawn yet.
const art = (set) => (WRAPPERS[set]?.[0] ? packUrl(set, WRAPPERS[set][0]) : logoUrl(set));
const filler = () => CARD_SETS[Math.floor(Math.random() * CARD_SETS.length)].id;

export default function DexClaim({ gen, onClaim, onCards, onClose }) {
  useModalLock();
  const [won, setWon] = useState(null);     // what claimDex answered
  const [cells, setCells] = useState(null); // the strip, once there is a prize
  const [done, setDone] = useState(false);
  const region = REGION_NAME[gen] ?? "";

  const claim = () => {
    const r = onClaim();
    if (!r) { onClose(); return; }
    const next = Array.from({ length: CELLS }, filler);
    next[WIN_AT] = r.set;
    setCells(next);
    setWon(r);
  };

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === "Escape" && (!won || done)) { ev.preventDefault(); onClose(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const prize = CARD_SETS.find((s) => s.id === won?.set);
  return (
    <div className="sheet" {...useDismiss(() => { if (!won || done) onClose(); })}>
      <div className={`confirm dx-claim${won ? " rolling" : ""}${done ? " done" : ""}`} role="dialog" aria-modal="true"
        aria-label={`${region} Pokédex reward`} onClick={(e) => e.stopPropagation()}>
        <span className="dc-kicker">Pokédex complete</span>
        <h3 className="cf-title">{region.toUpperCase()} COMPLETE</h3>
        {!won ? (
          <>
            <p className="dc-lede">Every {region} Pokémon, caught by you. Claim your reward:</p>
            <ul className="dc-list">
              <li><b>A booster box</b> of a random set - roll for it</li>
              <li><b>¥20,000</b> and a <b>Master Ball</b></li>
              <li>The title <b>{region} Dex Master</b></li>
              <li><b>Pokédex Charm</b>: {region}&rsquo;s rare forms {DEX_CHARM}&times; as likely</li>
            </ul>
            <div className="cf-actions">
              <button type="button" className="cf-yes buy" autoFocus onClick={claim}>Claim and roll</button>
            </div>
          </>
        ) : (
          <>
            <Reel rolling={!done} cells={cells} onDone={() => setDone(true)}>
              {cells.map((id, i) => (
                <li key={i} className={`rl-cell pack${done && i === WIN_AT ? " win" : ""}`}>
                  <img className="rl-pack" src={art(id)} alt="" draggable="false" />
                  <span>{CARD_SETS.find((s) => s.id === id)?.name ?? id}</span>
                </li>
              ))}
            </Reel>
            {done ? (
              <>
                <p className="dc-won"><b>{prize?.name}</b> · {won.packs} packs</p>
                <ul className="dc-list">
                  {won.medal && <li><b>¥{won.money.toLocaleString("en-US")}</b> and a <b>Master Ball</b></li>}
                  {won.medal && <li>Title: <b>{region} Dex Master</b></li>}
                  {won.medal && <li>{region}&rsquo;s rare forms now <b>{DEX_CHARM}&times;</b> as likely</li>}
                </ul>
                <div className="cf-actions">
                  <button type="button" className="cf-yes buy" autoFocus onClick={onCards}>Open the packs</button>
                  <button type="button" className="cf-no" onClick={onClose}>Later</button>
                </div>
              </>
            ) : <p className="rl-hint">Tap to stop</p>}
          </>
        )}
      </div>
    </div>
  );
}
