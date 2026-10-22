/* A STREAK DAY'S CARD PACKS (checkin.js `streakPacks`): one reel spin per
   lot of ten, each landing on the set that lot is. The sets are decided and
   SAVED by `engine.checkIn` before this opens - the reel only shows them -
   and it favours the sets you are furthest from finishing (`lotSets`). A
   hundred packs is ten spins, so the spins are quick and Skip lands them
   all. Lazy: only a pack day loads it. */
import { useEffect, useMemo, useState } from "react";
import Reel, { CELLS, WIN_AT } from "./Reel.jsx";
import Icon from "./Icon.jsx";
import { useDismiss, useModalLock } from "./modal.js";
import { CARD_SETS } from "../data/cards/index.js";
import { WRAPPERS } from "../data/cards/art.js";
import { packUrl, logoUrl } from "./cards/load.js";
import { LOT } from "../game/checkin.js";

const art = (set) => (WRAPPERS[set]?.[0] ? packUrl(set, WRAPPERS[set][0]) : logoUrl(set));
const setName = (id) => CARD_SETS.find((s) => s.id === id)?.name ?? id;
const SPIN = 2600;

export default function StreakPacks({ streak, lots, onCards, onClose }) {
  useModalLock();
  const [at, setAt] = useState(0);              // the lot spinning now
  const [rolling, setRolling] = useState(true);
  const done = at >= lots.length;
  // Fillers from the sets this reward could have landed on.
  const pool = useMemo(() => [...new Set(lots)].concat(CARD_SETS.slice(0, 8).map((s) => s.id)), [lots]);
  const cells = useMemo(() => {
    if (done) return [];
    const next = Array.from({ length: CELLS }, () => pool[Math.floor(Math.random() * pool.length)]);
    next[WIN_AT] = lots[at];
    return next;
  }, [at, done, lots, pool]);
  const landed = () => {
    setRolling(false);
    setTimeout(() => { setAt((n) => n + 1); setRolling(true); }, 650);
  };
  const skip = () => setAt(lots.length);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); if (done) onClose(); else skip(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  // The lots as they land, a set and how many of its packs.
  const won = useMemo(() => {
    const out = new Map();
    for (const id of lots.slice(0, Math.min(at, lots.length))) out.set(id, (out.get(id) ?? 0) + LOT);
    return [...out];
  }, [at, lots]);

  return (
    <div className="sheet" {...useDismiss(() => { if (done) onClose(); })}>
      <div className={`rl-card sp-card${done ? " won" : ""}`} role="dialog" aria-modal="true" aria-label={`Day ${streak} streak reward`} onClick={(e) => e.stopPropagation()}>
        <div className="rl-head">
          <span className="ci-kicker"><Icon n="flame" size={14} /> Day {streak} streak reward</span>
          <h3>{lots.length * LOT} card packs</h3>
          {done && <button type="button" className="set-x" aria-label="Close" onClick={onClose}>✕</button>}
        </div>
        {!done && (
          <>
            <Reel key={at} rolling={rolling} cells={cells} ms={SPIN} onDone={landed}>
              {cells.map((id, i) => (
                <li key={i} className={`rl-cell pack${!rolling && i === WIN_AT ? " win" : ""}`}>
                  <img className="rl-pack" src={art(id)} alt="" draggable="false" />
                  <span>{setName(id)}</span>
                </li>
              ))}
            </Reel>
            <p className="rl-hint">Lot {at + 1} of {lots.length} · {LOT} packs · the reel favours sets you're furthest from finishing</p>
          </>
        )}
        {won.length > 0 && (
          <ul className="sp-won" aria-label="Your packs">
            {won.map(([id, n]) => (
              <li key={id}><img src={art(id)} alt="" /><span><b>{n} packs</b>{setName(id)}</span></li>
            ))}
          </ul>
        )}
        {done ? (
          <div className="sp-go">
            <button type="button" className="ci-go" autoFocus onClick={onCards}>Open them in Cards</button>
            <button type="button" className="ci-go quiet" onClick={onClose}>Later</button>
          </div>
        ) : lots.length > 1 && (
          <button type="button" className="ci-go quiet" onClick={skip}>Skip to the results</button>
        )}
      </div>
    </div>
  );
}
