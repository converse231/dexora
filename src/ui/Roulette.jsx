/* THE ROULETTE (docs/checkin.md): a horizontal strip of prizes under a
   marker, CS2's case opening - it races, slows, and settles on the prize.
   The prize is decided and SAVED by `engine.spinRoulette` before the strip
   moves; the strip is dressed around it. A tap or Enter lands it at once,
   reduced motion lands it at once. Lazy: only a spin loads it. */
import { useEffect, useMemo, useRef, useState } from "react";
import Sprite from "./Sprite.jsx";
import Icon from "./Icon.jsx";
import { useDismiss, useModalLock } from "./modal.js";
import { CARD_SETS } from "../data/cards/index.js";
import { WRAPPERS } from "../data/cards/art.js";
import { packUrl, logoUrl } from "./cards/load.js";
import { ROULETTE, ROULETTE_PACKS } from "../game/checkin.js";
import { speciesById } from "../game/biomes.js";
import { label } from "../game/map.js";

const CELL = 132;            // a card and its gap, px (matches .rl-cell)
const CELLS = 56;
const WIN_AT = 49;           // the prize sits here, near the end of the strip
const SPIN_MS = 7000;
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const art = (set) => (WRAPPERS[set]?.[0] ? packUrl(set, WRAPPERS[set][0]) : logoUrl(set));
const setName = (id) => CARD_SETS.find((s) => s.id === id)?.name ?? id;

// A filler cell, drawn from the same fifteen slots the roll uses.
function filler(golds) {
  const slot = Math.floor(Math.random() * (ROULETTE.pack + ROULETTE.gold));
  return slot < ROULETTE.pack
    ? { kind: "pack", set: CARD_SETS[Math.floor(Math.random() * CARD_SETS.length)].id }
    : { kind: "gold", species: golds[Math.floor(Math.random() * golds.length)] };
}

function Cell({ c, win }) {
  return (
    <li className={`rl-cell ${c.kind}${win ? " win" : ""}`}>
      {c.kind === "pack"
        ? <img className="rl-pack" src={art(c.set)} alt="" draggable="false" />
        : <Sprite id={c.species} variant="gold" alt="" eager />}
      <span>{c.kind === "pack" ? setName(c.set) : `Gold ${label(speciesById(c.species))}`}</span>
    </li>
  );
}

export default function Roulette({ spins, onSpin, onCards, onBox, onClose }) {
  useModalLock();
  const [prize, setPrize] = useState(null);
  const [phase, setPhase] = useState("ready");      // ready -> rolling -> won
  const [left, setLeft] = useState(spins);
  const strip = useRef(null);
  const view = useRef(null);
  const timer = useRef(0);
  const golds = useMemo(() => [1, 4, 7, 25, 133, 143, 149, 248, 445, 635, 448, 658, 887, 6, 94, 130], []);
  const [cells, setCells] = useState(() => Array.from({ length: CELLS }, () => filler(golds)));

  const land = () => {
    clearTimeout(timer.current);
    const s = strip.current;
    if (s) { s.style.transition = "none"; s.style.transform = `translateX(${target.current}px)`; }
    setPhase("won");
  };
  const target = useRef(0);
  const spin = () => {
    const p = onSpin();
    if (!p) return;
    setLeft((n) => n - 1);
    setPrize(p);
    const next = Array.from({ length: CELLS }, () => filler(golds));
    next[WIN_AT] = p;
    setCells(next);
    setPhase("rolling");
  };
  // Once the new strip is in the DOM: from the start, ease to the prize - off its centre by a little, as CS2 does.
  useEffect(() => {
    if (phase !== "rolling") return undefined;
    const s = strip.current, v = view.current;
    if (!s || !v) return undefined;
    const jitter = (Math.random() - 0.5) * (CELL * 0.6);
    target.current = Math.round(v.clientWidth / 2 - (WIN_AT * CELL + CELL / 2) + jitter);
    s.style.transition = "none";
    s.style.transform = "translateX(0px)";
    if (still()) { land(); return undefined; }
    void s.offsetWidth;                                 // commit the start before the move
    s.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.12, .72, .14, 1)`;
    s.style.transform = `translateX(${target.current}px)`;
    timer.current = setTimeout(() => setPhase("won"), SPIN_MS + 80);
    return () => clearTimeout(timer.current);
  }, [phase, cells]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && phase !== "rolling") { e.preventDefault(); onClose(); }
      else if ((e.key === "Enter" || e.key === " ") && phase === "rolling") { e.preventDefault(); land(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const again = () => { setPrize(null); setPhase("ready"); };
  return (
    <div className="sheet" {...useDismiss(() => { if (phase !== "rolling") onClose(); })}>
      <div className={`rl-card ${phase}`} role="dialog" aria-modal="true" aria-label="Weekly roulette" onClick={(e) => e.stopPropagation()}>
        <div className="rl-head">
          <span className="ci-kicker">Weekly roulette</span>
          <h3>{phase === "won" ? "You won!" : "Spin for a prize"}</h3>
          {phase !== "rolling" && <button type="button" className="set-x" aria-label="Close" onClick={onClose}>✕</button>}
        </div>
        <div className="rl-view" ref={view} onClick={() => phase === "rolling" && land()}>
          <ol className="rl-strip" ref={strip}>
            {cells.map((c, i) => <Cell key={i} c={c} win={phase === "won" && i === WIN_AT} />)}
          </ol>
          <i className="rl-marker" aria-hidden="true" />
        </div>
        {phase === "won" && prize ? (
          <div className="rl-won" role="status">
            {prize.kind === "pack" ? (
              <>
                <img src={art(prize.set)} alt="" />
                <div><b>{prize.n} {setName(prize.set)} packs</b><span>Waiting in Cards, earned and stamped.</span></div>
                <button type="button" className="ci-go" onClick={onCards}>Open them</button>
              </>
            ) : (
              <>
                <Sprite id={prize.species} variant="gold" alt="" eager />
                <div><b>Gold {label(speciesById(prize.species))}</b><span>A gift for your Box - the rarest colour there is.</span></div>
                <button type="button" className="ci-go" onClick={onBox}>See it in the Box</button>
              </>
            )}
          </div>
        ) : (
          <div className="rl-odds">
            <span><i className="rl-dot pack" />Card packs ({ROULETTE_PACKS} of a set, every set as likely) · {Math.round(100 * ROULETTE.pack / (ROULETTE.pack + ROULETTE.gold))}%</span>
            <span><i className="rl-dot gold" />Gold Pokémon · {Math.round(100 * ROULETTE.gold / (ROULETTE.pack + ROULETTE.gold))}%</span>
          </div>
        )}
        {phase === "ready" && (
          <button type="button" className="ci-go" autoFocus disabled={left < 1} onClick={spin}>
            <Icon n="gift" size={18} /> Spin{left > 1 ? ` (${left} banked)` : ""}
          </button>
        )}
        {phase === "rolling" && <p className="rl-hint">Tap to stop</p>}
        {phase === "won" && left > 0 && <button type="button" className="ci-go quiet" onClick={again}>Spin again ({left} left)</button>}
      </div>
    </div>
  );
}
