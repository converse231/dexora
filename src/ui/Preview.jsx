/* A CLOSER LOOK at one Box row: the art big enough to appreciate, and what the
   row has no room for - its base stats. Every action that SPENDS a Pokemon
   stays on the row, so there is one place to sell or evolve one; the one
   control here is a look - Walk with me (docs/cosmetics.md). */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { speciesById, sizeTag } from "../game/biomes.js";
import { label } from "../game/map.js";
import Sprite from "./Sprite.jsx";
import Types from "./Types.jsx";
import Mark from "./Marks.jsx";
import { useDismiss, useModalLock } from "./modal.js";
import { perksOf } from "../game/perks.js";
import { followSheet } from "../game/cosmetics.js";

const STATS = ["HP", "Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed"];
// The highest base stat any Pokemon has, so a bar is comparable across species.
const STAT_MAX = 255;

export default function Preview({ group, buddy = null, onBuddy, onClose }) {
  useModalLock();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const sp = speciesById(group.species);
  const size = sizeTag(group.hero.size);
  const total = sp.stats.reduce((a, b) => a + b, 0);
  // A traded one's story: whose it first was, and how many hands since.
  const traded = group.mons.find((m) => m.traded);
  // The one walking with you, if it is in this row; otherwise the row's own.
  const walking = group.mons.some((m) => m.uid === buddy);
  const canWalk = onBuddy && followSheet(group.species) != null;
  /* ON THE BODY, as Confirm is: the Box lives in the rail, a size container,
     and a fixed layer inside one is laid out and stacked inside it - the
     ball rail drew over the preview's bottom buttons (2026-10-06). */
  return createPortal(
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="preview" role="dialog" aria-modal="true" aria-label={label(sp)}
        onClick={(e) => e.stopPropagation()}>
        <div className="pv-art">
          <span className={`pv-tint t-${sp.types[0]}`} aria-hidden="true" />
          <Sprite id={group.species} variant={group.variant} fx alt={label(sp)} />
        </div>
        <div className="pv-head">
          {sp.id < 10000 && <span className="pv-no">#{String(sp.id).padStart(3, "0")}</span>}
          <h3>{label(sp)}</h3>
          <span className="pv-genus">{sp.genus}</span>
          <div className="pv-chips">
            {group.variant && (
              <span className={`bx-vtag ${group.variant}`}>
                <Mark tier={group.variant} size={11} />{group.variant.toUpperCase()}
              </span>
            )}
            {group.alpha && <span className="bx-vtag bx-alpha"><Mark tier="alpha" size={11} />ALPHA</span>}
            <span>Lv {group.hero.level}</span>
            {size && <span>{size}</span>}
            <span>&times;{group.count} owned</span>
            {traded && (
              <span className="pv-traded" data-tip={`Traded ${traded.traded} time${traded.traded > 1 ? "s" : ""}`}>
                OT {traded.ot ?? "?"} · traded {traded.traded}&times;
              </span>
            )}
          </div>
          <Types of={sp.types} />
          {/* What its form and alpha do in a League battle (perks.js). */}
          {perksOf(group.variant, group.alpha).map((p) => (
            <span className="pv-perk" key={p.says}>League perk: {p.says}</span>
          ))}
        </div>
        <dl className="pv-stats">
          {STATS.map((name, i) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                <b>{sp.stats[i]}</b>
                <i style={{ "--f": sp.stats[i] / STAT_MAX }} />
              </dd>
            </div>
          ))}
          <div className="pv-total"><dt>Total</dt><dd><b>{total}</b></dd></div>
        </dl>
        {canWalk && (
          <button type="button" className={`pv-walk${walking ? " on" : ""}`} aria-pressed={walking}
            onClick={() => onBuddy(walking ? null : group.hero.uid)}>
            {walking ? "Walking with you · Back to its ball" : "Walk with me"}
          </button>
        )}
        <button type="button" className="sheet-close" onClick={onClose}>CLOSE</button>
      </div>
    </div>,
    document.body,
  );
}
