/* THE CARDS ON A TRAINER CARD (docs/cards.md, phase 4): what the server kept
   of the save's `cardShowcase` - only cards the stored save holds, in that
   printing (db/trading.sql, `card_showcase`). The sets load lazily. A card
   OPENS (asked for, 2026-10-15) into a big view of it - tilt, finish, what it
   is, and its real-life price - on yours and on anybody's card. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CardFace, { RarityMark, VARIANT_NAME, usePrices, priceOf, PriceInfo, Money } from "./Card.jsx";
import { loadSet, cardUrl, hiUrl } from "./load.js";
import { RARITY } from "../../game/cards.js";
import { useModalLock, useDismiss } from "../modal.js";

/* ONE SHOWN CARD, LOOKED AT: read-only - it may be another trainer's. PORTALLED
   to the body: the Trade Center's main area isolates, and a sheet inside it
   sat under the pinned header. */
function Zoom({ set, row, v, onClose }) {
  useModalLock();
  const prices = usePrices();
  const [hi, setHi] = useState(false);
  const face = useRef(null);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);
  const move = (e) => {
    const el = face.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)).toFixed(3));
    el.style.setProperty("--my", Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)).toFixed(3));
    el.classList.add("held");
  };
  const price = priceOf(prices, set.SET.id, row[0], v);
  return createPortal(
    <div className="sheet cd-inspect" {...useDismiss(onClose)}>
      <div className="confirm cd-inspect-card cs-zoom" role="dialog" aria-modal="true" aria-label={row[1]} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cd-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="cd-inspect-art">
          <span ref={face} className={`cd-card big live r-${row[3]} v-${v}`}
            onPointerMove={move} onPointerLeave={() => face.current?.classList.remove("held")}>
            <img src={hi ? hiUrl(set, row[0]) : cardUrl(set.SET.id, row[0])} alt={row[1]} draggable="false"
              onLoad={() => setHi(true)} onError={() => setHi(false)} />
            <span className="cd-foil" aria-hidden="true" />
            <span className="cd-glare" aria-hidden="true" />
          </span>
        </div>
        <div className="cd-inspect-body">
          <h3>{row[1]}</h3>
          <p className="cd-sub">{set.SET.name} · {row[0]}/{set.SET.official}</p>
          <p className="cd-kind"><RarityMark rarity={row[3]} /> {RARITY[row[3]].name} · {VARIANT_NAME[v]}</p>
          {prices && price > 0 && (
            <section className="cd-price" aria-label="Real-life price">
              <span className="cd-price-top"><b>Raw</b>{VARIANT_NAME[v]}<PriceInfo prices={prices} /></span>
              <Money cents={price} className="cd-price-big" />
            </section>
          )}
          <p className="cd-sub">Illustrated by {row[6] || "an unknown illustrator"} · data and image: TCGdex</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const setOf = (id) => id.replace(/-[^-]+$/, "");

export default function CardShow({ list, self, onAdd = null }) {
  const [sets, setSets] = useState({});
  const [open, setOpen] = useState(null);       // { s, row, v } being looked at
  const ids = [...new Set(list.map((c) => setOf(c.id)))].join(",");
  useEffect(() => {
    let live = true;
    for (const s of ids ? ids.split(",") : []) loadSet(s).then((m) => live && m && setSets((o) => ({ ...o, [s]: m })));
    return () => { live = false; };
  }, [ids]);
  if (!list.length) {
    // YOUR empty section is a way in, like the Showcase's empty slots.
    if (onAdd) {
      return (
        <button type="button" className="cse-add" onClick={onAdd}>
          <span aria-hidden="true">+</span>Pick cards to show
        </button>
      );
    }
    return <p className="ev-quiet">{self ? "Open any card in Cards and choose Show on trainer card." : "No cards shown yet."}</p>;
  }
  return (
    <div className="cd-chase-row tp-cards">
      {list.map((c) => {
        const s = sets[setOf(c.id)];
        const row = s?.CARDS.find((r) => `${s.SET.id}-${r[0]}` === c.id);
        return row ? (
          <button key={`${c.id}:${c.v}`} type="button" className="cd-chase-card got cs-open" onClick={() => setOpen({ s, row, v: c.v })}
            aria-label={`${row[1]}, ${RARITY[row[3]].name}, ${VARIANT_NAME[c.v]} - look closer`}>
            <CardFace setId={s.SET.id} card={row} variant={c.v} still lazy />
          </button>
        ) : <span key={`${c.id}:${c.v}`} className="cd-chase-card" aria-hidden="true" />;
      })}
      {open && <Zoom set={open.s} row={open.row} v={open.v} onClose={() => setOpen(null)} />}
    </div>
  );
}
