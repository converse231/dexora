/* ONE CARD, drawn the same everywhere: the binder, the Card Dex, the opening,
   the inspect view and the Dex sheet. Its FINISH follows the real card: a
   reverse holo shines everywhere but the art window, a holo rare only inside
   it, and a hit across the whole card (`.cd-foil`, styles.css; the window was
   measured off the card faces: 6.6% in, 9.6% down, 84.5% x 38%). */
import { RARITY } from "../../game/cards.js";
import { cardUrl } from "./load.js";

export function RarityMark({ rarity }) {
  return <i className={`cd-rar r-${rarity}`} aria-label={RARITY[rarity].name}>{RARITY[rarity].icon}</i>;
}

export const VARIANT_NAME = { n: "Normal", h: "Holo", r: "Reverse holo" };

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
