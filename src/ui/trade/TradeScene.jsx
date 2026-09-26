/* THE TRADE SCENE (docs/trading.md): the moment a Pokemon changes hands.

   Your Pokemon folds into its ball, two balls ride a glowing link cable from
   either end, cross in a burst, and the one coming to you opens on your side
   with its tier's own effect. Every moving part animates `transform` and
   `opacity` only, so it stays smooth on a phone. A tap (or Enter) skips to
   the reveal; reduced motion shows the reveal and nothing travels.

   `trade` is one entry of the inbox's `recent`: {kind, partner, gave, got}. */
import { useEffect, useState } from "react";
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { useModalLock } from "../modal.js";
import Sprite from "../Sprite.jsx";
import Mark from "../Marks.jsx";

const KIND = { surprise: "SURPRISE TRADE", direct: "TRADE", board: "TRADE BOARD" };
const REVEAL_AT = 3300;       // matches `ts-*` keyframes in styles.css

export default function TradeScene({ trade, onDone }) {
  useModalLock();
  const [done, setDone] = useState(false);
  const gave = trade.gave?.[0], got = trade.got?.[0];
  const gaveSp = gave && speciesById(gave.species), gotSp = got && speciesById(got.species);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), REVEAL_AT);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Enter" && e.key !== "Escape" && e.key !== " ") return;
      e.preventDefault();
      if (done) onDone(); else setDone(true);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [done, onDone]);

  if (!gotSp) return null;
  const more = (trade.got?.length ?? 1) - 1;
  return (
    <div className={`ts${done ? " done" : ""}`} role="dialog" aria-modal="true"
      aria-label={`${KIND[trade.kind] ?? "Trade"} with ${trade.partner}`}
      onClick={() => (done ? onDone() : setDone(true))}>
      <div className="ts-stage">
        <p className="ts-title">{KIND[trade.kind] ?? "TRADE"} · {trade.partner}</p>
        <div className="ts-lane" aria-hidden="true">
          <span className="ts-cable"><i /></span>
          <span className="ts-end you">YOU</span>
          <span className="ts-end them">{trade.partner}</span>
          {gaveSp && <span className="ts-gave"><Sprite id={gaveSp.id} variant={gave.tier} /></span>}
          <img className="ts-ball out" src="items/poke-ball.png" alt="" />
          <img className="ts-ball in" src="items/poke-ball.png" alt="" />
          <span className="ts-burst" />
        </div>
        <div className="ts-got">
          <span className="ts-flash" aria-hidden="true" />
          <Sprite id={gotSp.id} variant={got.tier} fx alt={label(gotSp)} />
        </div>
        <p className="ts-caption">
          {got.tier && <span className="ts-tier"><Mark tier={got.tier} size={14} />{got.tier.toUpperCase()}</span>}
          {got.alpha && <span className="ts-tier alpha"><Mark tier="alpha" size={14} />ALPHA</span>}
          <b>{label(gotSp)}</b> arrived from {trade.partner}!
          {gaveSp && <i>You sent {label(gaveSp)}.</i>}
          {more > 0 && <i>And {more} more - they are in your Box.</i>}
        </p>
        <button type="button" className="ev-go ts-ok" onClick={(e) => { e.stopPropagation(); onDone(); }}>
          Nice!
        </button>
      </div>
    </div>
  );
}
