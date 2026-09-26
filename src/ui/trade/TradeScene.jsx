/* THE TRADE SCENE (docs/trading.md): the moment Pokemon change hands.

   Your Pokemon fold into their balls, ONE BALL PER POKEMON each way - a
   three-for-one sends three and brings one back - riding a glowing link cable
   from either end, crossing in a burst, and what comes to you opens on your
   side with its tier's own effect. The balls leave a beat apart and fan out
   so a bundle reads as a bundle; the stagger is squeezed so the last one
   still lands before the reveal (REVEAL_AT). Every moving part animates
   `transform` and `opacity` only, so it stays smooth on a phone. A tap (or
   Enter) skips to the reveal; reduced motion shows the reveal and nothing
   travels.

   `trade` is one entry of the inbox's `recent`: {kind, partner, gave, got}. */
import { useEffect, useState } from "react";
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { useModalLock } from "../modal.js";
import Sprite from "../Sprite.jsx";
import Mark from "../Marks.jsx";

const KIND = { surprise: "SURPRISE TRADE", direct: "TRADE", board: "TRADE BOARD" };
const REVEAL_AT = 3300;       // matches `ts-*` keyframes in styles.css
// Seconds between balls: at most 0.14, and never more than 0.5 across a side.
const stagger = (n) => (n > 1 ? Math.min(0.14, 0.5 / (n - 1)) : 0);

function Balls({ n, dir }) {
  const step = stagger(n);
  return Array.from({ length: n }, (_, i) => (
    <img key={i} className={`ts-ball ${dir}`} src="items/poke-ball.png" alt=""
      style={{ "--d": `${(0.7 + i * step).toFixed(2)}s`, "--y": `${((i - (n - 1) / 2) * 12).toFixed(1)}px` }} />
  ));
}

export default function TradeScene({ trade, onDone }) {
  useModalLock();
  const [done, setDone] = useState(false);
  const gave = (trade.gave ?? []).filter((m) => speciesById(m.species));
  const got = (trade.got ?? []).filter((m) => speciesById(m.species));

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

  if (!got.length) return null;
  const lead = got[0], leadSp = speciesById(lead.species);
  const name = (m) => label(speciesById(m.species));
  const and = (list) => (list.length > 1 ? `${name(list[0])} and ${list.length - 1} more` : name(list[0]));
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
          {gave[0] && (
            <span className="ts-gave">
              <Sprite id={gave[0].species} variant={gave[0].tier} fx />
              {gave.length > 1 && <b className="ts-more">+{gave.length - 1}</b>}
            </span>
          )}
          <Balls n={Math.max(1, gave.length)} dir="out" />
          <Balls n={got.length} dir="in" />
          <span className="ts-burst" />
        </div>
        {got.length === 1 ? (
          <div className="ts-got">
            <span className="ts-flash" aria-hidden="true" />
            <Sprite id={leadSp.id} variant={lead.tier} fx alt={label(leadSp)} />
          </div>
        ) : (
          <div className="ts-got many">
            <span className="ts-flash" aria-hidden="true" />
            {got.map((m, i) => (
              <span key={m.mid ?? i} className="ts-one">
                <Sprite id={m.species} variant={m.tier} fx alt={name(m)} />
                {m.tier && <span className="tp-tier"><Mark tier={m.tier} size={11} /></span>}
                {m.alpha && <span className="tp-alpha"><Mark tier="alpha" size={10} /></span>}
              </span>
            ))}
          </div>
        )}
        <p className="ts-caption">
          {got.length === 1 && lead.tier && <span className="ts-tier"><Mark tier={lead.tier} size={14} />{lead.tier.toUpperCase()}</span>}
          {got.length === 1 && lead.alpha && <span className="ts-tier alpha"><Mark tier="alpha" size={14} />ALPHA</span>}
          <b>{and(got)}</b> arrived from {trade.partner}!
          {gave.length > 0 && <i>You sent {and(gave)}.</i>}
          {got.length > 1 && <i>They are all in your Box.</i>}
        </p>
        <button type="button" className="ev-go ts-ok" onClick={(e) => { e.stopPropagation(); onDone(); }}>
          Nice!
        </button>
      </div>
    </div>
  );
}
