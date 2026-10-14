/* ONE CARD, drawn the same everywhere: the binder, the Card Dex, the opening,
   the inspect view and the Dex sheet. Its FINISH follows the real card: a
   reverse holo shines everywhere but the art window, a holo rare only inside
   it, and a hit across the whole card (`.cd-foil`, styles.css; the window was
   measured off the card faces: 6.6% in, 9.6% down, 84.5% x 38%). */
import { useEffect, useState } from "react";
import { RARITY, cardId } from "../../game/cards.js";
import { cardUrl, loadPrices } from "./load.js";

export function RarityMark({ rarity }) {
  return <i className={`cd-rar r-${rarity}`} aria-label={RARITY[rarity].name}>{RARITY[rarity].icon}</i>;
}

export const VARIANT_NAME = { n: "Normal", h: "Holo", r: "Reverse holo" };

/* REAL-LIFE VALUE (2026-10-15, asked for): TCGplayer's market price, a
   snapshot dated PRICED_AT. Display only - it buys nothing here. Null until
   the chunk arrives, so a price never holds a card up. */
export function usePrices() {
  const [p, setP] = useState(null);
  useEffect(() => { let on = true; loadPrices().then((m) => on && setP(m)); return () => { on = false; }; }, []);
  return p;
}
const PRINTING = { n: 0, h: 1, r: 2 };
// A printing's price in cents, 0 when it has none.
export const priceOf = (prices, setId, localId, v) => prices?.PRICES[setId]?.[localId]?.[PRINTING[v]] ?? 0;
export const usd = (cents) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/* What a set's held copies are worth (every copy counts - a spare is a real
   card) and its dearest held printing. `sets` is setIds, or all priced. */
export function worthOf(prices, cards, setIds = Object.keys(prices?.PRICES ?? {})) {
  let total = 0, top = null;
  for (const s of setIds) {
    for (const [id, p] of Object.entries(prices?.PRICES[s] ?? {})) {
      const row = cards[cardId(s, id)];
      if (!row) continue;
      for (const v of "nhr") {
        if (!row[v] || !p[PRINTING[v]]) continue;
        total += row[v] * p[PRINTING[v]];
        if (!top || p[PRINTING[v]] > top.cents) top = { setId: s, localId: id, v, cents: p[PRINTING[v]] };
      }
    }
  }
  return { total, top };
}
export function PriceNote({ prices }) {
  return prices && <small className="cd-price-note">TCGplayer market price, {prices.PRICED_AT} · real life, not in the game</small>;
}

/* `card` is a set row; `variant` the copy shown (a holo rare and a reverse
   holo of the same card wear different finishes). `still` drops the sweep -
   a binder page of twelve does not need twelve moving lights. */
export default function CardFace({ setId, card, variant, still = false, lazy = false, className = "" }) {
  return (
    <span className={`cd-card r-${card[3]} v-${variant}${still ? " still" : ""} ${className}`}>
      <img src={cardUrl(setId, card[0])} alt={card[1]} loading={lazy ? "lazy" : undefined} draggable="false" />
      <span className="cd-foil" aria-hidden="true" />
    </span>
  );
}
