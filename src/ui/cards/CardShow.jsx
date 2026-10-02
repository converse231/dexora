/* THE CARDS ON A TRAINER CARD (docs/cards.md, phase 4): what the server kept
   of the save's `cardShowcase` - only cards the stored save holds, in that
   printing (db/trading.sql, `card_showcase`). The sets load lazily. */
import { useEffect, useState } from "react";
import CardFace from "./Card.jsx";
import { loadSet } from "./load.js";

const setOf = (id) => id.replace(/-[^-]+$/, "");

export default function CardShow({ list, self }) {
  const [sets, setSets] = useState({});
  const ids = [...new Set(list.map((c) => setOf(c.id)))].join(",");
  useEffect(() => {
    let live = true;
    for (const s of ids ? ids.split(",") : []) loadSet(s).then((m) => live && m && setSets((o) => ({ ...o, [s]: m })));
    return () => { live = false; };
  }, [ids]);
  if (!list.length) {
    return <p className="ev-quiet">{self ? "Open any card in Cards and choose Show on trainer card." : "No cards shown yet."}</p>;
  }
  return (
    <div className="cd-chase-row tp-cards">
      {list.map((c) => {
        const s = sets[setOf(c.id)];
        const row = s?.CARDS.find((r) => `${s.SET.id}-${r[0]}` === c.id);
        return row ? (
          <span key={`${c.id}:${c.v}`} className="cd-chase-card got"><CardFace setId={s.SET.id} card={row} variant={c.v} still lazy /></span>
        ) : <span key={`${c.id}:${c.v}`} className="cd-chase-card" aria-hidden="true" />;
      })}
    </div>
  );
}
