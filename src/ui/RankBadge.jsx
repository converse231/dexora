/* A RANKED STANDING IN ONE LINE (docs/ranked.md): the rank's medal and its
   words - Beginner in words only, Legend with its rating. Outside the
   League's folder because a trainer's profile (the Trade Center) shows it
   too, and nothing may import that folder statically. */
import { useState } from "react";
import { rankOf, TOP_RANK } from "../game/ranked.js";

/* THE MEDAL, for both ladders: `set` is "battle" (docs/ranked.md *Art*) or
   "dex" (README *Pokédex*), and the emblem is `ranks/{set}/{id}.png`, built
   from the drawn originals by `npm run ranks` (192px, ~7KB). A missing file
   falls back to a disc in the rank's own `color`, and is remembered for the
   session, so a list of a hundred rows asks once. `label` names it where it
   stands alone (a season badge); beside its words it is silent. Decoded off
   the main thread, as every emblem is small and many may arrive at once. */
const asset = (path) => new URL(path, document.baseURI).href;
const missing = new Set();
export function RankMedal({ set, id, color, label = null }) {
  const art = `ranks/${set}/${id}.png`;
  const [gone, setGone] = useState(() => missing.has(art));
  if (!gone) {
    return <img className="rk-medal art" src={asset(art)} alt={label ?? ""} decoding="async" draggable="false"
      onError={() => { missing.add(art); setGone(true); }} />;
  }
  return <span className="rk-medal" style={{ "--mc": color }}
    {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })} />;
}

export default function RankBadge({ rating, games, withRating = false, className = "" }) {
  const r = rankOf(rating, games);
  return (
    <span className={`rk-badge rk-${r.id} ${className}`.trim()}>
      {r.id !== "beginner" && <RankMedal set="battle" id={r.id} color={r.color} />}
      <b>{r.name}{r.division ? ` ${r.division}` : ""}</b>
      {r.id === "beginner" ? <i>{r.left} to place</i>
        : (withRating || r.id === TOP_RANK) && <i>{rating.toLocaleString("en-US")}</i>}
    </span>
  );
}
