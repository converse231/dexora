/* A FINISHED GENERATION'S REWARD, CLAIMED (asked for, 2026-10-03): the map's
   claim button opens this, the press decides and SAVES everything first
   (`engine.claimDex`, like a card pack), and then a reel of the set logos
   runs down to the set that was rolled - the box was a choice once; a roll
   is the suspense. A tap on the reel lands it at once, and reduced motion
   skips it. */
import { useEffect, useRef, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import { CARD_SETS } from "../data/cards/index.js";
import { REGION_NAME } from "../game/biomes.js";
import { DEX_CHARM } from "../game/medals.js";
import { logoUrl } from "./cards/load.js";

// The reel's beats: quick, then slowing - each a little longer than the last.
const BEATS = (() => {
  const out = [];
  for (let d = 55; d < 520; d *= 1.12) out.push(Math.round(d));
  return out;
})();
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function DexClaim({ gen, onClaim, onCards, onClose }) {
  useModalLock();
  const [won, setWon] = useState(null);     // what claimDex answered
  const [at, setAt] = useState(0);          // the logo showing
  const [step, setStep] = useState(0);      // beats played
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  const region = REGION_NAME[gen] ?? "";
  const n = CARD_SETS.length;

  // THE REEL: BEATS.length steps, timed so the last lands on the won set.
  useEffect(() => {
    if (!won || done) return undefined;
    if (step >= BEATS.length) { setDone(true); return undefined; }
    timer.current = setTimeout(() => {
      setAt((a) => (a + 1) % n);
      setStep((s) => s + 1);
    }, BEATS[step]);
    return () => clearTimeout(timer.current);
  }, [won, step, done, n]);

  const claim = () => {
    const r = onClaim();
    if (!r) { onClose(); return; }
    const target = CARD_SETS.findIndex((s) => s.id === r.set);
    setWon(r);
    if (still()) { setAt(target); setDone(true); return; }
    setAt(((target - BEATS.length) % n + n) % n);
  };
  const land = () => { if (won && !done) { clearTimeout(timer.current); setAt(CARD_SETS.findIndex((s) => s.id === won.set)); setDone(true); } };

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === "Escape" && (!won || done)) { ev.preventDefault(); onClose(); }
      else if ((ev.key === "Enter" || ev.key === " ") && won && !done) { ev.preventDefault(); land(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const set = CARD_SETS[at];
  const prize = CARD_SETS.find((s) => s.id === won?.set);
  return (
    <div className="sheet" {...useDismiss(() => { if (!won || done) onClose(); })}>
      <div className={`confirm dx-claim${done ? " done" : ""}`} role="dialog" aria-modal="true"
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
            <button type="button" className={`dc-reel${done ? " landed" : ""}`} onClick={land}
              aria-label={done ? prize?.name : "Rolling - tap to stop"} aria-live="polite">
              <img key={done ? "won" : step} src={logoUrl(set.id)} alt={done ? prize?.name : ""} />
            </button>
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
            ) : <p className="dc-lede">Rolling…</p>}
          </>
        )}
      </div>
    </div>
  );
}
