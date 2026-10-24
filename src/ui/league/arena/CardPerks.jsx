/* THE ARENA'S CARDS (game/cardperks.js): up to three of the cards you hold,
   equipped as passive perks for a match against the CPU or the Ladder.
   `useEquipped` turns the save's ids into perks (loading only their sets);
   `CardPerkPick` lists every card you hold that carries one - chase cards,
   then gold, then the strongest - each with what it does. */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CardFace from "../../cards/Card.jsx";
import { loadSet } from "../../cards/load.js";
import { cardPerk, ARENA_CARDS } from "../../../game/cardperks.js";
import { useModalLock } from "../../modal.js";

const setOf = (id) => id.replace(/-[^-]+$/, "");
const held = (row) => Object.values(row ?? {}).some((n) => n > 0);
const rank = (p) => (p.chase ? 3 : p.gold ? 2 : 1) * 100 + p.k * 100;

// The sets a list of card ids names, loaded once each.
function useSets(ids) {
  const [sets, setSets] = useState({});
  const key = [...new Set(ids.map(setOf))].sort().join(",");
  useEffect(() => {
    let live = true;
    for (const s of key ? key.split(",") : []) loadSet(s).then((m) => live && m && setSets((o) => ({ ...o, [s]: m })));
    return () => { live = false; };
  }, [key]);
  return sets;
}
const rowOf = (sets, id) => sets[setOf(id)]?.CARDS.find((c) => `${setOf(id)}-${c[0]}` === id) ?? null;

/* The equipped cards you still hold, as { id, set, card, perk }. */
export function useEquipped(ids, owned) {
  const mine = useMemo(() => (ids ?? []).filter((id) => held(owned?.[id])).slice(0, ARENA_CARDS), [ids, owned]);
  const sets = useSets(mine);
  return useMemo(() => mine.map((id) => {
    const card = rowOf(sets, id), set = setOf(id);
    const perk = card && cardPerk(set, card);
    return perk ? { id, set, card, perk } : null;
  }).filter(Boolean), [mine, sets]);
}

export function CardPerkPick({ owned, equipped, onSave, onClose }) {
  useModalLock();
  const [pick, setPick] = useState(() => equipped.map((e) => e.id));
  const ids = useMemo(() => Object.keys(owned ?? {}).filter((id) => held(owned[id])), [owned]);
  const sets = useSets(ids);
  const tiles = useMemo(() => ids.map((id) => {
    const card = rowOf(sets, id), perk = card && cardPerk(setOf(id), card);
    return perk ? { id, set: setOf(id), card, perk, v: ["h", "r", "n"].find((v) => owned[id]?.[v] > 0) } : null;
  }).filter(Boolean).sort((a, b) => rank(b.perk) - rank(a.perk)), [ids, sets, owned]);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  const toggle = (id) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < ARENA_CARDS ? [...p, id] : p));
  const loading = ids.length && !Object.keys(sets).length;
  return createPortal(
    <div className="cp" role="dialog" aria-modal="true" aria-label="Arena cards">
      <header className="cp-top">
        <div><b>Arena cards</b><span>{pick.length}/{ARENA_CARDS} equipped · against the CPU and the Ladder, never online</span></div>
        <button type="button" className="fs-x" aria-label="Close" onClick={onClose}>✕</button>
      </header>
      <p className="cp-rule">A Pokémon card above the Double rare is a small perk for your whole team, and counts double for its own Pokémon's line. Gold cards add a golden rule; each set's chase card has a signature of its own Pokémon.</p>
      {!ids.length ? <p className="cp-none">No cards yet - open a pack in Cards.</p>
        : loading ? <p className="cp-none">Loading your cards…</p>
          : !tiles.length ? <p className="cp-none">None of your cards carries a perk yet - Pokémon cards above the Double rare only.</p> : (
            <ul className="cp-grid">
              {tiles.map((t) => {
                const on = pick.includes(t.id);
                return (
                  <li key={t.id}>
                    <button type="button" className={`cp-tile${on ? " on" : ""}${t.perk.chase ? " chase" : t.perk.gold ? " gold" : ""}`} aria-pressed={on}
                      disabled={!on && pick.length >= ARENA_CARDS} onClick={() => toggle(t.id)}>
                      <CardFace setId={t.set} card={t.card} variant={t.v} still lazy />
                      <b>{t.perk.title}</b>
                      <ul>{t.perk.says.map((s) => <li key={s}>{s}</li>)}</ul>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      <footer className="fs-foot">
        <button type="button" className="lg-go quiet" onClick={() => setPick([])}>Clear</button>
        <button type="button" className="lg-go fs-ready" onClick={() => onSave(pick)}>Equip</button>
      </footer>
    </div>,
    document.body,
  );
}
