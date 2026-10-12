/* PICKING THE CARDS ON YOUR TRAINER CARD, from the card itself (asked for,
   2026-10-12): the section said "open any card in Cards and choose Show on
   trainer card", and an empty one had no way in from where you were looking.
   Every printing you hold, rarest first; a tap adds or removes, in order, up
   to CARD_SHOW. The Trade Center saves the pick through the engine's
   `showCard` and reloads the card once the save has landed - the server
   draws only what the STORED save holds. */
import { useEffect, useMemo, useState } from "react";
import CardFace from "./Card.jsx";
import { loadSet } from "./load.js";
import { CARD_SHOW, rungOf, showKey } from "../../game/cards.js";

const setOf = (id) => id.replace(/-[^-]+$/, "");

export default function CardShowEdit({ owned, shown, busy, onSave, onCancel }) {
  const [pick, setPick] = useState(() => [...shown]);
  const [sets, setSets] = useState({});
  const ids = useMemo(() => [...new Set(Object.keys(owned).map(setOf))].join(","), [owned]);
  useEffect(() => {
    let live = true;
    for (const s of ids ? ids.split(",") : []) loadSet(s).then((m) => live && m && setSets((o) => ({ ...o, [s]: m })));
    return () => { live = false; };
  }, [ids]);
  const tiles = useMemo(() => Object.entries(owned).flatMap(([id, row]) => {
    const s = sets[setOf(id)];
    const card = s?.CARDS.find((c) => `${s.SET.id}-${c[0]}` === id);
    return card ? ["h", "r", "n"].filter((v) => row?.[v] > 0).map((v) => ({ key: showKey(id, v), v, s, card })) : [];
  }).sort((a, b) => rungOf(b.card[3]) - rungOf(a.card[3]) || (a.v === "n") - (b.v === "n")), [owned, sets]);
  const toggle = (k) => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < CARD_SHOW ? [...p, k] : p));
  const loading = ids && !tiles.length;

  return (
    <div className="tc-edit">
      <section className="ev-card">
        <header className="ev-banner">
          <h4>Cards</h4><span className="tp-count">{pick.length}/{CARD_SHOW}</span>
        </header>
        <p className="ev-quiet">Pick up to {CARD_SHOW} of the cards you hold - rarest first. Tap again to take one off.</p>
        {!ids ? <p className="ev-quiet">No cards yet - open a pack in Cards.</p>
          : loading ? <p className="ev-quiet">Loading your cards…</p> : (
          <div className="cse-grid">
            {tiles.map(({ key, v, s, card }) => {
              const at = pick.indexOf(key);
              return (
                <button key={key} type="button" className={`cse-tile${at >= 0 ? " on" : ""}`} aria-pressed={at >= 0}
                  disabled={at < 0 && pick.length >= CARD_SHOW} onClick={() => toggle(key)}
                  aria-label={`${card[1]}${v === "h" ? ", holo" : v === "r" ? ", reverse holo" : ""}`}>
                  <CardFace setId={s.SET.id} card={card} variant={v} still lazy />
                  {at >= 0 && <b aria-hidden="true">{at + 1}</b>}
                </button>
              );
            })}
          </div>
        )}
      </section>
      <div className="tp-actions tc-dock">
        <button type="button" className="ev-go" disabled={busy} onClick={() => onSave(pick)}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="tp-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
