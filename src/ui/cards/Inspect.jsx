/* A CARD, LOOKED AT (docs/cards.md, the card view): the large image, its
   finish under the pointer (a drag on a phone, a slow sweep otherwise - never
   the motion sensors), what it is, who drew it, your copies, and the two
   things you can do with it: dust a spare, craft a missing copy. */
import { useEffect, useRef, useState } from "react";
import { RARITY, cardId, copiesOf, sparesOf, dustOf, craftCost, canCraft, showKey, CARD_SHOW } from "../../game/cards.js";
import { useModalLock, useDismiss } from "../modal.js";
import { RarityMark, VARIANT_NAME } from "./Card.jsx";
import { cardUrl, hiUrl } from "./load.js";

const CAT = { P: "Pokémon", T: "Trainer", E: "Energy" };

export default function Inspect({ set, localId, cards, dust, dex, showcase = [], onShow, onDust, onCraft, onSpecies, onClose }) {
  useModalLock();
  const dismiss = useDismiss(onClose);
  const card = set.CARDS.find((c) => c[0] === localId);
  const row = cards[cardId(set.SET.id, localId)];
  // Your best copy first - a foil over a plain one - and any printing on a tap.
  const [view, setView] = useState(() => ["h", "r", "n"].find((v) => row?.[v] && card[4].includes(v)) ?? card[4][0]);
  const shown = view;
  const [hi, setHi] = useState(false);
  const face = useRef(null);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);

  // The finish under the pointer: two custom properties, no React render.
  const move = (e) => {
    const el = face.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.style.setProperty("--mx", x.toFixed(3));
    el.style.setProperty("--my", y.toFixed(3));
    el.classList.add("held");
  };
  const leave = () => face.current?.classList.remove("held");

  return (
    <div className="sheet cd-inspect" {...dismiss}>
      <div className="confirm cd-inspect-card" role="dialog" aria-modal="true" aria-label={card[1]} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cd-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="cd-inspect-art">
          <span ref={face} className={`cd-card big live r-${card[3]} v-${shown}${row ? "" : " missing"}`}
            onPointerMove={move} onPointerLeave={leave} onPointerUp={leave}>
            <img src={hi ? hiUrl(set, localId) : cardUrl(set.SET.id, localId)} alt={card[1]} draggable="false"
              onLoad={() => setHi(true)} onError={() => setHi(false)} />
            <span className="cd-foil" aria-hidden="true" />
            <span className="cd-glare" aria-hidden="true" />
          </span>
        </div>
        <div className="cd-inspect-body">
          <h3>{card[1]}</h3>
          <p className="cd-sub">{set.SET.name} · {localId}/{set.SET.official} · {CAT[card[2]]}</p>
          <p className="cd-kind"><RarityMark rarity={card[3]} /> {RARITY[card[3]].name}</p>
          <p className="cd-sub">Illustrated by {card[6] || "an unknown illustrator"} · data and image: TCGdex</p>
          {row?.earned && <p className="cd-sub">✦ {row.earned.length} earned cop{row.earned.length === 1 ? "y" : "ies"}</p>}

          <ul className="cd-copies">
            {card[4].split("").map((v) => {
              const have = row?.[v] ?? 0, spare = sparesOf(row, v), cost = craftCost(card[3], v);
              return (
                <li key={v}>
                  <button type="button" className={`cd-vname${v === shown ? " on" : ""}`} aria-pressed={v === shown}
                    onClick={() => setView(v)}>{VARIANT_NAME[v]}</button>
                  <b>×{have}</b>
                  {spare > 0 && (
                    <button type="button" className="lg-go quiet" onClick={() => onDust(v)}>
                      Dust a spare · +{dustOf(card[3], v)}
                    </button>
                  )}
                  {canCraft(card[3]) ? (
                    <button type="button" className={`lg-go${have ? " quiet" : ""}`} disabled={dust < cost} onClick={() => onCraft(v)}>
                      Craft · {cost.toLocaleString()} dust
                    </button>
                  ) : <span className="cd-packonly">Packs only</span>}
                </li>
              );
            })}
          </ul>
          <p className="cd-sub">You have {dust.toLocaleString()} Card Dust · {copiesOf(row)} cop{copiesOf(row) === 1 ? "y" : "ies"} of this card</p>
          <div className="cd-actions">
            {/* YOUR TRAINER CARD shows up to CARD_SHOW cards, the printing shown here. */}
            {row?.[shown] && onShow && (showcase.includes(showKey(cardId(set.SET.id, localId), shown)) ? (
              <button type="button" className="lg-go quiet" onClick={() => onShow(shown, false)}>On your trainer card ✓</button>
            ) : (
              <button type="button" className="lg-go quiet" disabled={showcase.length >= CARD_SHOW} onClick={() => onShow(shown, true)}>
                Show on trainer card{showcase.length >= CARD_SHOW ? " (full)" : ""}
              </button>
            ))}
            {card[5].length > 0 && (
              <button type="button" className="lg-go quiet" onClick={() => onSpecies(card[5][0])}>Open in the Pokédex</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
