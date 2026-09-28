/* A RANKED STANDING IN ONE LINE (docs/ranked.md): the rank's medal and its
   words - Beginner in words only, Legend with its rating. Outside the
   League's folder because a trainer's profile (the Trade Center) shows it
   too, and nothing may import that folder statically. */
import { rankOf, TOP_RANK } from "../game/ranked.js";

/* THE MEDAL: a disc in the career's colour, drawn in CSS so it costs no
   request, until the emblems under docs/ranked.md *Art* are drawn - then it
   becomes `<img src="ranks/{id}.png">`, here and nowhere else. `label` names
   it where it stands alone (a season badge); beside its words it is silent. */
export function RankMedal({ id, label = null }) {
  return <span className={`rk-medal rk-${id}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })} />;
}

export default function RankBadge({ rating, games, withRating = false, className = "" }) {
  const r = rankOf(rating, games);
  return (
    <span className={`rk-badge rk-${r.id} ${className}`.trim()}>
      {r.id !== "beginner" && <RankMedal id={r.id} />}
      <b>{r.name}{r.division ? ` ${r.division}` : ""}</b>
      {r.id === "beginner" ? <i>{r.left} to place</i>
        : (withRating || r.id === TOP_RANK) && <i>{rating.toLocaleString("en-US")}</i>}
    </span>
  );
}
