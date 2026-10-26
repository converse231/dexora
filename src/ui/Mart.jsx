/* THE POKÉ MART (2026-10-26): every shelf the game sells from, reached from
   every tab - the wallet's chips (a page's head on a touch screen, the top
   bar on a desktop) open it at the shelf that fits. One shop for one
   currency: the rail's Shop is the same shelves (Shop.jsx `Sections`), the
   Card Shop is a link, since a pack is a product page of its own. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sections, SHELVES } from "./Shop.jsx";
import { Wallet, useWallet } from "./wallet.jsx";
import { useModalLock, useDismiss } from "./modal.js";
import Icon from "./Icon.jsx";

export default function Mart({ shelf = "catching", bag, level, onCards, onClose }) {
  useModalLock();
  const { engine, money, candy, stats } = useWallet();
  const [tab, setTab] = useState(SHELVES.some(([k]) => k === shelf) ? shelf : "catching");
  const body = useRef(null);
  useEffect(() => { body.current?.scrollTo(0, 0); }, [tab]);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);
  return createPortal(
    <div className="sheet mart-sheet" {...useDismiss(onClose)}>
      <section className="mart" role="dialog" aria-modal="true" aria-label="Poké Mart">
        <header className="mart-head">
          <span className="ph-mark" aria-hidden="true"><Icon n="shop" size={20} /></span>
          <h3>Poké Mart</h3>
          <Wallet className="mart-wallet" />
          <button type="button" className="cd-x mart-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <nav className="mart-tabs" role="tablist" aria-label="Shelves">
          {SHELVES.map(([k, name, ic]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              <Icon n={ic} size={16} /><span>{name}</span>
            </button>
          ))}
          <button type="button" className="mart-link" onClick={onCards}>
            <Icon n="cards" size={16} /><span>Cards</span><Icon n="chev" size={14} />
          </button>
        </nav>
        <div className="mart-body shopscroll" ref={body}>
          <Sections only={tab} money={money} bag={bag} level={level} stats={stats} candy={candy}
            onBuy={(id, n) => engine?.buy(id, n)} onBuyCandy={(n) => engine?.buyCandy(n)} />
        </div>
      </section>
    </div>,
    document.body,
  );
}
