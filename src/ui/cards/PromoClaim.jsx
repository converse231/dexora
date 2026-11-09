/* A PONCHO'S PROMO CARD, CLAIMED (asked for, 2026-11-09: "a claim dialog so
   players won't miss it"). The card is filed at the catch (engine `grantPromo`)
   and waits in the save's `promoNew` until this dialog has been seen, so a
   reload never loses the moment: face down with Claim, then turned over with
   See card, which opens the Cards page on it. Closing claims too - the card is
   already yours. Lazy, through App's `lazyPage`: it names load.js. */
import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "../modal.js";
import { cardUrl, backUrl } from "./load.js";
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";

export const splitCard = (card) => [card.slice(0, card.lastIndexOf("-")), card.slice(card.lastIndexOf("-") + 1)];

export default function PromoClaim({ card, look, onClaim, onSee, onClose }) {
  useModalLock();
  const [open, setOpen] = useState(false);
  const [setId, localId] = splitCard(card);
  const name = speciesById(look) ? label(speciesById(look)) : "your poncho";
  const close = () => { if (!open) onClaim(); onClose(); };
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  });
  const claim = () => { setOpen(true); onClaim(); };

  return (
    <div className="sheet" {...useDismiss(close)}>
      <div className="confirm pc" role="dialog" aria-modal="true" aria-labelledby="pc-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cd-x" onClick={close} aria-label="Close">✕</button>
        <span className="pc-kicker">Promo card</span>
        <h3 id="pc-title">{open ? "It's yours!" : "You earned a real promo card"}</h3>
        <p>{open ? `${name}'s card is in your collection.` : `Catching ${name} earned the card it's printed on.`}</p>
        <div className={`pc-card${open ? " open" : ""}`}>
          <img className="pc-back" src={backUrl()} alt="" draggable="false" />
          <img className="pc-front" src={cardUrl(setId, localId)} alt={open ? `${name} promo card` : ""} draggable="false" />
        </div>
        <div className="pc-go">
          {open ? (
            <>
              <button type="button" className="ci-go" onClick={() => onSee(setId, localId)}>See card</button>
              <button type="button" className="ci-go quiet" onClick={onClose}>Done</button>
            </>
          ) : <button type="button" className="ci-go" autoFocus onClick={claim}>Claim</button>}
        </div>
      </div>
    </div>
  );
}
