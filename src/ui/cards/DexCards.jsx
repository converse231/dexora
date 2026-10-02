/* YOUR CARDS OF ONE POKEMON, on its Dex sheet (docs/cards.md): the cards you
   hold whose species - or Mega form - is this entry. The sets load lazily
   through `load.js`, so the sheet carries no card data until it is opened. */
import { useEffect, useState } from "react";
import { CARD_SETS } from "../../data/cards/index.js";
import { cardId, copiesOf } from "../../game/cards.js";
import CardFace from "./Card.jsx";
import { loadSet } from "./load.js";

export default function DexCards({ id, cards, onOpen }) {
  const [sets, setSets] = useState([]);
  useEffect(() => {
    let live = true;
    Promise.all(CARD_SETS.map((s) => loadSet(s.id))).then((all) => live && setSets(all.filter(Boolean)));
    return () => { live = false; };
  }, []);
  const mine = sets.flatMap((s) => s.CARDS.filter((c) => c[5].includes(id))
    .map((c) => ({ s: s.SET.id, c, row: cards[cardId(s.SET.id, c[0])] })));
  const held = mine.filter((x) => x.row);
  if (!sets.length) return <p className="ev-quiet">…</p>;
  return (
    <div className="dx-cards">
      {held.length ? (
        <div className="cd-chase-row">
          {held.map(({ s, c, row }) => (
            <span key={`${s}-${c[0]}`} className="cd-chase-card got">
              <CardFace setId={s} card={c} variant={["h", "r", "n"].find((v) => row[v]) ?? "n"} still lazy />
              <span>×{copiesOf(row)}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="ev-quiet">{mine.length ? `None yet - ${mine.length} card${mine.length === 1 ? "" : "s"} of it in the packs.` : "No card of it in the shipped sets."}</p>
      )}
      {mine.length > 0 && <button type="button" className="lg-go quiet" onClick={onOpen}>Open Cards</button>}
    </div>
  );
}
