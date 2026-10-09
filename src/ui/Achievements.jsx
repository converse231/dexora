/* ACHIEVEMENTS (achievements.js): a page off You, like your trainer card - it
   replaces You at the page layer and its Back brings You back. Every number
   is derived from the save, so it opens on what an old save already did.

   A row is one ladder: its steps as pips (claimed, due, to come), the number
   against the next step, and either CLAIM or what the next step pays. Marked
   done, never drawn - no art (your call, 2026-10-10). The Pokedex's own
   medals sit last as counts: they pay on the catch, so there is nothing to
   claim, only to see. */
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { useModalLock } from "./modal.js";
import { ACHIEVEMENTS, GROUPS, standing, payOf, dueCount } from "../game/achievements.js";
import { MEDALS } from "../game/medals.js";
import { itemById } from "../game/items.js";

const MEDAL_KINDS = [["line", "Evolution lines"], ["type", "Every Pokémon of a type"], ["biome", "Every Pokémon of a map"],
  ["gen", "Regional Pokédexes"], ["dex", "The whole Pokédex"]];

const n = (v) => v.toLocaleString();
const payLine = (p) => [
  p.money && `¥${n(p.money)}`,
  ...Object.entries(p.items).map(([id, k]) => `${k}× ${itemById(id)?.name ?? id}`),
  p.pack && "a card pack",
].filter(Boolean).join(" · ");

function Row({ a, s, onClaim }) {
  const st = standing(a, s);
  const next = a.steps[st.claimed + st.due];
  const from = a.steps[st.claimed + st.due - 1] ?? 0;
  const frac = next ? Math.min(1, (st.value - from) / (next - from)) : 1;
  return (
    <li className={`ach-row${st.done ? " done" : ""}`}>
      <span className="ach-text">
        <b>{a.name}</b>
        <small>{a.sub}</small>
        <span className="ach-pips" aria-label={`${st.claimed + st.due} of ${a.steps.length} steps`}>
          {a.steps.map((at, k) => (
            <i key={at} className={k < st.claimed ? "got" : k < st.claimed + st.due ? "due" : ""}
               data-tip={n(at)} />
          ))}
        </span>
      </span>
      <span className="ach-side">
        {st.due > 0 ? (
          <button type="button" className="ach-claim" onClick={() => onClaim([a.id])}
                  data-tip={a.steps.slice(st.claimed, st.claimed + st.due).map((_, k) => payLine(payOf(a, st.claimed + k))).join(" + ")}>
            Claim{st.due > 1 ? ` ×${st.due}` : ""}
          </button>
        ) : st.done ? (
          <span className="ach-done"><Icon n="check" size={14} /> {n(st.value)}</span>
        ) : (
          <>
            <span className="ach-num">{n(st.value)} / {n(next)}</span>
            <span className="ach-bar"><i style={{ transform: `scaleX(${frac})` }} /></span>
            <small className="ach-pay">{payLine(payOf(a, st.claimed))}</small>
          </>
        )}
      </span>
    </li>
  );
}

export default function Achievements({ engine, state, onClose }) {
  useModalLock();
  const [got, setGot] = useState(null);
  useEffect(() => {
    if (!got) return undefined;
    const t = setTimeout(() => setGot(null), 4000);
    return () => clearTimeout(t);
  }, [got]);
  useEffect(() => {
    const key = (ev) => { if (ev.key === "Escape") onClose(); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);

  const claim = (ids) => { const r = engine.claimAchievements(ids); if (r) setGot(r); };
  const due = dueCount(state);
  const steps = ACHIEVEMENTS.reduce((k, a) => k + a.steps.length, 0);
  const claimed = ACHIEVEMENTS.reduce((k, a) => k + standing(a, state).claimed, 0);
  const medals = state.medals ?? [];

  return (
    <div className="tc-page evcard sub" role="dialog" aria-modal="true" aria-label="Achievements">
      <header className="tc-head">
        <div className="tc-bar">
          <button type="button" className="tc-home" onClick={onClose} aria-label="Back to You">
            <span aria-hidden="true">‹</span> Back
          </button>
          <div className="tc-titles">
            <h3>Achievements</h3>
            <span>{claimed} of {steps} steps{due ? ` · ${due} to claim` : ""}</span>
          </div>
          {due > 0 && <button type="button" className="ach-all" onClick={() => claim(null)}>Claim all</button>}
        </div>
      </header>
      <main className="tc-main ach-main">
        {got && (
          <p className="ach-got" role="status">
            Claimed {got.steps} step{got.steps === 1 ? "" : "s"}: {payLine({ ...got, pack: false })}
            {got.packs ? ` · ${got.packs} card pack${got.packs === 1 ? "" : "s"}` : ""}
          </p>
        )}
        {GROUPS.map(([g, title]) => {
          const list = ACHIEVEMENTS.filter((a) => a.group === g);
          const done = list.filter((a) => standing(a, state).done).length;
          return (
            <section key={g} className="ev-card">
              <header className="ev-banner"><h4>{title}</h4><span className="tp-count">{done} / {list.length}</span></header>
              <ul className="ach-list">{list.map((a) => <Row key={a.id} a={a} s={state} onClaim={claim} />)}</ul>
            </section>
          );
        })}
        <section className="ev-card">
          <header className="ev-banner"><h4>Pokédex medals</h4><span className="tp-count">paid as you catch</span></header>
          <ul className="ach-list">
            {MEDAL_KINDS.map(([kind, name]) => {
              const all = MEDALS.filter((m) => m.kind === kind);
              const have = all.filter((m) => medals.includes(m.id)).length;
              return (
                <li key={kind} className={`ach-row${have === all.length ? " done" : ""}`}>
                  <span className="ach-text"><b>{name}</b></span>
                  <span className="ach-side">
                    <span className="ach-num">{n(have)} / {n(all.length)}</span>
                    <span className="ach-bar"><i style={{ transform: `scaleX(${have / all.length})` }} /></span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
