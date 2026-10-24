/* THE ARENA'S CARDS (game/cardperks.js): up to three of the cards you hold,
   equipped as passive perks for a match against the CPU or the Ladder.
   `useEquipped` turns the save's ids into perks (loading only their sets).
   `DeckStrip` is the lobby's header button: the three sockets, small.
   `CardPerkPick` is a deck builder in the fighter select's own shape (asked
   for, 2026-10-24: "not overwhelming, gamified") - three sockets across the
   top, a spotlight on the card under the cursor with what it does, and a grid
   of card faces alone, filtered by Chase, Gold, your team and the lever. */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CardFace from "../../cards/Card.jsx";
import { loadSet } from "../../cards/load.js";
import { cardPerk, rootOf, ARENA_CARDS } from "../../../game/cardperks.js";
import { useModalLock } from "../../modal.js";
import Icon from "../../Icon.jsx";

const setOf = (id) => id.replace(/-[^-]+$/, "");
const held = (row) => Object.values(row ?? {}).some((n) => n > 0);
const rank = (p, fits) => (p.chase ? 3 : p.gold ? 2 : 1) * 1000 + (fits ? 100 : 0) + p.k * 100;
// The six levers, in words a player picks by.
const LEVER = { dmg: "Damage", regen: "Healing", cd: "Cooldown", guard: "Guard", ult: "ULTI", status: "Status" };
const variantOf = (row) => ["h", "r", "n"].find((v) => row?.[v] > 0) ?? "n";

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

/* The equipped cards you still hold, as { id, set, card, perk, v }. */
export function useEquipped(ids, owned) {
  const mine = useMemo(() => (ids ?? []).filter((id) => held(owned?.[id])).slice(0, ARENA_CARDS), [ids, owned]);
  const sets = useSets(mine);
  return useMemo(() => mine.map((id) => {
    const card = rowOf(sets, id), set = setOf(id);
    const perk = card && cardPerk(set, card);
    return perk ? { id, set, card, perk, v: variantOf(owned?.[id]) } : null;
  }).filter(Boolean), [mine, sets, owned]);
}

/* THE LOBBY'S CARD STRIP: three small sockets in the header, the way in. */
export function DeckStrip({ equipped, onOpen }) {
  return (
    <button type="button" className="ag-deck" onClick={onOpen} aria-label={`Arena cards, ${equipped.length} of ${ARENA_CARDS} equipped`}
      data-tip={equipped.length ? equipped.map((e) => e.perk.title).join(" · ") : "Equip up to three cards as perks"}>
      <span className="ag-deck-fan" aria-hidden="true">
        {Array.from({ length: ARENA_CARDS }, (_, k) => {
          const e = equipped[k];
          return e ? <span key={e.id} className={`ag-deck-card${e.perk.chase ? " chase" : e.perk.gold ? " gold" : ""}`}><CardFace setId={e.set} card={e.card} variant={e.v} still lazy /></span>
            : <span key={k} className="ag-deck-card empty"><Icon n="plus" size={12} /></span>;
        })}
      </span>
      <span className="ag-deck-text"><b>{equipped.length}/{ARENA_CARDS}</b><i>Cards</i></span>
    </button>
  );
}

export function CardPerkPick({ owned, equipped, team = [], onSave, onClose }) {
  useModalLock();
  const [pick, setPick] = useState(() => equipped.map((e) => e.id));
  const ids = useMemo(() => Object.keys(owned ?? {}).filter((id) => held(owned[id])), [owned]);
  const sets = useSets(ids);
  const roots = useMemo(() => new Set(team.map(rootOf)), [team]);
  const tiles = useMemo(() => ids.map((id) => {
    const card = rowOf(sets, id), perk = card && cardPerk(setOf(id), card);
    return perk ? { id, set: setOf(id), card, perk, v: variantOf(owned[id]), fits: roots.has(perk.line) } : null;
  }).filter(Boolean).sort((a, b) => rank(b.perk, b.fits) - rank(a.perk, a.fits)), [ids, sets, owned, roots]);
  const [show, setShow] = useState("all");      // all, chase, gold, team, or a lever
  const [q, setQ] = useState("");
  const shown = useMemo(() => tiles.filter((t) => (show === "all" || (show === "chase" && t.perk.chase) || (show === "gold" && t.perk.gold && !t.perk.chase)
    || (show === "team" && t.fits) || t.perk.family === show) && (!q || t.card[1].toLowerCase().includes(q.toLowerCase()))), [tiles, show, q]);
  const [cur, setCur] = useState(null);
  const focus = shown.find((t) => t.id === cur) ?? shown[0] ?? null;
  const [slam, setSlam] = useState(-1);
  const close = () => onClose();
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); onClose(); } };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => { if (slam >= 0) { const t = setTimeout(() => setSlam(-1), 450); return () => clearTimeout(t); } }, [slam]);
  const toggle = (id) => setPick((p) => {
    if (p.includes(id)) return p.filter((x) => x !== id);
    if (p.length >= ARENA_CARDS) return p;
    setSlam(p.length);
    return [...p, id];
  });
  const byId = (id) => tiles.find((t) => t.id === id) ?? equipped.find((e) => e.id === id);
  const counts = useMemo(() => ({
    chase: tiles.filter((t) => t.perk.chase).length, gold: tiles.filter((t) => t.perk.gold && !t.perk.chase).length, team: tiles.filter((t) => t.fits).length,
  }), [tiles]);
  const loading = ids.length > 0 && !Object.keys(sets).length;
  const chips = [["all", "All"], ["chase", `Chase ${counts.chase}`], ["gold", `Gold ${counts.gold}`], ["team", `Your team ${counts.team}`],
    ...Object.entries(LEVER)];

  return createPortal(
    <div className="fs cp-deck" role="dialog" aria-modal="true" aria-label="Equip your cards">
      <header className="fs-top">
        <div className="fs-title"><b>Equip your cards</b><span>{pick.length}/{ARENA_CARDS} · vs CPU and Ladder</span></div>
        <ol className="fs-slots">
          {Array.from({ length: ARENA_CARDS }, (_, k) => {
            const t = pick[k] && byId(pick[k]);
            return (
              <li key={k} className={`fs-slot cp-socket${t ? " full" : ""}${slam === k ? " slam" : ""}${t?.perk.chase ? " chase" : ""}`}>
                <em>{`Card ${k + 1}`}</em>
                {t ? (
                  <button type="button" onClick={() => toggle(t.id)} aria-label={`Take ${t.card[1]} off`}>
                    <span className="cp-mini"><CardFace setId={t.set} card={t.card} variant={t.v} still /></span>
                    <b>{t.perk.title}</b><span>{t.perk.says[0].replace("Your team: ", "")}</span>
                  </button>
                ) : <span className="fs-empty">Empty</span>}
              </li>
            );
          })}
        </ol>
        <button type="button" className="fs-x" aria-label="Close" onClick={close}>✕</button>
      </header>

      <div className="fs-main">
        <aside className="fs-spot cp-spot" aria-live="polite">
          {focus ? (
            <>
              <div className={`cp-big${focus.perk.chase ? " chase" : focus.perk.gold ? " gold" : ""}`}>
                <CardFace setId={focus.set} card={focus.card} variant={focus.v} still />
              </div>
              <div className="fs-name">
                <h2>{focus.perk.title}</h2>
                <span>{focus.card[1]}</span>
              </div>
              <div className="fs-tags">
                {focus.perk.chase && <em className="fs-role cp-tag chase">Chase card</em>}
                {focus.perk.gold && !focus.perk.chase && <em className="fs-role cp-tag gold">Gold</em>}
                <em className={`fs-role cp-tag l-${focus.perk.family}`}>{LEVER[focus.perk.family]}</em>
                {focus.fits && <em className="fs-role cp-tag fit">Your team</em>}
              </div>
              <ul className="cp-says">{focus.perk.says.map((s) => <li key={s}>{s}</li>)}</ul>
              <button type="button" className={`fs-pick${pick.includes(focus.id) ? " out" : ""}`} onClick={() => toggle(focus.id)}
                disabled={!pick.includes(focus.id) && pick.length >= ARENA_CARDS}>
                {pick.includes(focus.id) ? "Take off" : pick.length >= ARENA_CARDS ? "Three equipped" : "Equip"}
              </button>
            </>
          ) : <p className="fs-none">{!ids.length ? "No cards yet - open a pack in Cards." : loading ? "Loading your cards…"
            : "None of these carries a perk - Pokémon cards above the Double rare only."}</p>}
        </aside>

        <section className="fs-roster">
          <div className="fs-filters">
            <input type="search" placeholder="Find a card" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a card" />
            <div className="fs-types cp-chips" role="group" aria-label="Show">
              {chips.map(([k, w]) => (
                <button key={k} type="button" className={`${LEVER[k] ? `l-${k}` : k}${show === k ? " on" : ""}`} onClick={() => setShow(k)}>{w}</button>
              ))}
            </div>
          </div>
          <div className="fs-grid cp-grid" role="listbox" aria-label="Your cards">
            {shown.map((t) => {
              const at = pick.indexOf(t.id);
              return (
                <button key={t.id} type="button" role="option" aria-selected={at >= 0}
                  className={`fs-cell cp-cell${focus?.id === t.id ? " cur" : ""}${at >= 0 ? " picked" : ""}${t.perk.chase ? " chase" : t.perk.gold ? " gold" : ""}`}
                  onMouseEnter={() => setCur(t.id)} onClick={() => { if (focus?.id !== t.id) setCur(t.id); else toggle(t.id); }}
                  aria-label={`${t.perk.title}: ${t.card[1]}`}>
                  <CardFace setId={t.set} card={t.card} variant={t.v} still lazy />
                  {at >= 0 && <em>{at + 1}</em>}
                  {t.fits && <i className="cp-fit" aria-hidden="true"><Icon n="check" size={10} /></i>}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="fs-foot">
        <button type="button" className="lg-go quiet" onClick={() => setPick([])}>Clear</button>
        <button type="button" className="lg-go fs-ready" onClick={() => onSave(pick)}>Ready</button>
      </footer>
    </div>,
    document.body,
  );
}
