/* THE WALKING PARTY, EDITED (docs/cosmetics.md): the three slots, each with
   a way out, over the Trade Center's picker - the League's team editor's
   shape, so a full party is changed the way a full team is. Opened from the
   strip's + or edit button, and from a full party in the Dex. Lazy: the
   picker stays out of the main bundle. */
import { useEffect, useMemo } from "react";
import Picker, { keyOf } from "./trade/Picker.jsx";
import Sprite from "./Sprite.jsx";
import { useDismiss, useModalLock } from "./modal.js";
import { PARTY_MAX, PARTNER_LEVEL, MASTERED_BOND, followSheet, partnerRule, isMastered } from "../game/cosmetics.js";
import { variantOf } from "../game/items.js";
import { speciesById } from "../game/biomes.js";
import { label } from "../game/map.js";
import { perkName, fieldText, heartsOf, HEARTS } from "../game/abilities.js";

export default function PartyPick({ engine, box, party, research, onClose }) {
  useModalLock();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const all = useMemo(() => box.filter((m) => followSheet(m.species) != null).map((m) => ({ ...m, tier: variantOf(m) })), [box]);
  /* Only what may join is offered (the engine refuses the rest). `free` is the
     lone first partner, open while nothing is researched to PARTNER_LEVEL. */
  const rule = useMemo(() => partnerRule({ box, party, research }), [box, party, research]);
  const free = rule.starter && party.length <= 1;
  const mons = useMemo(() => all.filter((m) => free || rule.can(m)), [all, free, rule]);
  const waiting = free ? 0 : new Set(all.filter((m) => !rule.can(m)).map((m) => m.species)).size;
  const byKey = useMemo(() => new Map(mons.map((m) => [keyOf(m), m])), [mons]);
  const members = party.map((uid) => mons.find((m) => m.uid === uid)).filter(Boolean);
  const set = (keys) => engine.setParty(keys.map((k) => byKey.get(k)?.uid).filter((u) => u != null));
  const slots = Array.from({ length: PARTY_MAX }, (_, i) => members[i] ?? null);

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="varcard partypick" role="dialog" aria-modal="true" aria-label="Walking party" onClick={(e) => e.stopPropagation()}>
        <div className="set-top">
          <h3>Walking party</h3>
          <span className="set-mail">Up to {PARTY_MAX}. The one walking lends its ability.</span>
          <button type="button" className="set-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="vr-body">
          {(free || waiting > 0) && (
            <p className="pp-note">
              {free ? `Your first partner is free. The rest join at research Lv ${PARTNER_LEVEL}.`
                : `${waiting} more of your species join at research Lv ${PARTNER_LEVEL}.`}
            </p>
          )}
          <ol className="pp-slots">
            {slots.map((m, i) => (
              <li key={m ? m.uid : `empty${i}`} className={m ? "" : "empty"}>
                {m ? (
                  <>
                    <Sprite id={m.species} variant={m.tier} alt="" eager />
                    <b>{label(speciesById(m.species))}</b>
                    <small>{perkName(m)}{fieldText(m) ? `: ${fieldText(m)}` : ""}</small>
                    {isMastered(m.species, research) && (
                      <em className="pp-master">★ Mastered · friendship ×{MASTERED_BOND}</em>
                    )}
                    <span className="pp-hearts" aria-label={`Friendship ${heartsOf(m.walked)} of ${HEARTS.length}`}>
                      {HEARTS.map((_, i) => <i key={i} className={i < heartsOf(m.walked) ? "on" : ""} />)}
                    </span>
                    <button type="button" aria-label={`Take ${label(speciesById(m.species))} out of the party`}
                      onClick={() => engine.setParty(party.filter((u) => u !== m.uid))}>Remove</button>
                  </>
                ) : (
                  <span>Empty - pick one below</span>
                )}
              </li>
            ))}
          </ol>
          <Picker mons={mons} picked={members.map(keyOf)} max={free ? 1 : PARTY_MAX} onChange={set} prefer="high" sort="level" tray={false}
            empty="Catch a Pokémon first - your party walks with you from the Box." />
        </div>
      </div>
    </div>
  );
}
